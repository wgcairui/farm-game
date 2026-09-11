/**
 * /auth routes — POST /auth/wechat (mini-program), POST /auth/oauth (iOS/Android),
 * POST /auth/bind (link another identity), GET /auth/_meta.
 *
 * Per ADR-0001 §3:
 *  - JWT uses standard `sub`/`iat`/`exp`/`iss`/`aud`. TTL comes from `config.jwtTtlSec`.
 *  - Mock login (provider=mock, code prefix) is gated on `config.enableMockAuth`,
 *    which loadConfig() refuses to enable in production.
 *  - The `code` field is exchanged for an internal AuthIdentity(subject);
 *    phase 2 plugs in https://api.weixin.qq.com/sns/jscode2session here.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthProvider,
  ErrorCode,
  PROTOCOL_VERSION,
  type ApiResponse,
  type AuthBindRequest,
  type LoginResponse,
  type OAuthLoginRequest,
  type WeChatLoginRequest,
} from '@farm-game/shared';
import { ensurePlayer, generatePlayerId, InMemoryPlayerRepo } from './repo.js';
import { isVerifiedAuth } from './jwt.js';

const MOCK_CODE_PREFIX = 'mock_';

interface AuthRoutesDeps {
  repo: InMemoryPlayerRepo;
}

const wechatBodySchema = {
  type: 'object',
  required: ['code'],
  additionalProperties: false,
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 256 },
    guestPlayerId: { type: 'string', minLength: 1, maxLength: 64 },
  },
} as const;

const oauthBodySchema = {
  type: 'object',
  required: ['provider', 'idToken'],
  additionalProperties: false,
  properties: {
    // Wire values are `AuthProvider` literals (server-side enums); the client
    // sends the same constants via the shared `OAuthLoginRequest` type.
    provider: { type: 'string', enum: ['weChatMini', 'ios', 'android', 'h5'] },
    idToken: { type: 'string', minLength: 1, maxLength: 4096 },
    deviceId: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

const bindBodySchema = {
  type: 'object',
  required: ['provider', 'token'],
  additionalProperties: false,
  properties: {
    provider: { type: 'string', enum: ['weChatMini', 'ios', 'android', 'h5'] },
    token: { type: 'string', minLength: 1, maxLength: 4096 },
    tenantId: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

export async function authRoutes(app: FastifyInstance, deps: AuthRoutesDeps): Promise<void> {
  app.post<{ Body: WeChatLoginRequest; Reply: ApiResponse<LoginResponse> }>(
    '/auth/wechat',
    { schema: { body: wechatBodySchema } },
    async (req, reply): Promise<ApiResponse<LoginResponse>> => {
      const { code, guestPlayerId } = req.body;
      const enableMock = app.config.enableMockAuth;

      // Mock branch is gated on explicit opt-in (ADR-0001 §4.2).
      if (code.startsWith(MOCK_CODE_PREFIX)) {
        if (!enableMock) {
          reply.code(403);
          return { ok: false, code: ErrorCode.WECHAT_CODE_INVALID, message: 'mock login disabled' };
        }
      }

      // Phase 1 stub: derive a deterministic subject from the code.
      // Phase 2 will call jscode2session here and emit a real WeChat openid.
      const subject = code.startsWith(MOCK_CODE_PREFIX) ? code : `mock_${code.slice(0, 16)}`;
      const identity = { provider: AuthProvider.WeChatMini, subject };

      let player = await ensurePlayer(deps.repo, identity);
      // guestPlayerId merge: if a guest session exists and is not yet bound to a
      // provider, transfer its identities onto the new player. Phase 2 implements
      // the real merge flow.
      void guestPlayerId;

      const { token, auth } = await issueToken(app, player);
      return { ok: true, data: { token, player, auth } };
    },
  );

  app.post<{ Body: OAuthLoginRequest; Reply: ApiResponse<LoginResponse> }>(
    '/auth/oauth',
    { schema: { body: oauthBodySchema } },
    async (req, reply): Promise<ApiResponse<LoginResponse>> => {
      // OAuthLoginRequest uses AuthProvider values directly; the request body is
      // validated by JSON Schema into this exact shape.
      const { provider, idToken } = req.body;
      const enableMock = app.config.enableMockAuth;

      if (idToken.startsWith(MOCK_CODE_PREFIX) && !enableMock) {
        reply.code(403);
        return { ok: false, code: ErrorCode.OAUTH_PROVIDER_INVALID, message: 'mock login disabled' };
      }

      const identity = { provider, subject: idToken };
      const player = await ensurePlayer(deps.repo, identity);
      const issued = await issueToken(app, player);
      return { ok: true, data: { token: issued.token, player, auth: issued.auth } };
    },
  );

  app.post<{ Body: AuthBindRequest; Reply: ApiResponse<{ player: import('@farm-game/shared').PlayerSave }> }>(
    '/auth/bind',
    { schema: { body: bindBodySchema }, preHandler: app.authenticate },
    async (req, reply): Promise<ApiResponse<{ player: import('@farm-game/shared').PlayerSave }>> => {
      const auth = req.user;
      if (!isVerifiedAuth(auth)) {
        reply.code(401);
        return { ok: false, code: ErrorCode.NOT_AUTHENTICATED, message: 'token missing identities' };
      }
      const player = await deps.repo.findByPlayerId(auth.sub);
      if (!player) {
        reply.code(404);
        return { ok: false, code: ErrorCode.NOT_AUTHENTICATED, message: 'player not found' };
      }

      const { provider, token, tenantId } = req.body;
      if (!app.config.enableMockAuth && token.startsWith(MOCK_CODE_PREFIX)) {
        reply.code(403);
        return { ok: false, code: ErrorCode.OAUTH_PROVIDER_INVALID, message: 'mock bind disabled' };
      }
      const subject = token.startsWith(MOCK_CODE_PREFIX) ? token : `mock_${provider}_${token.slice(0, 16)}`;

      const dup = await deps.repo.findByIdentity({ provider, subject, tenantId });
      if (dup && dup.playerId !== player.playerId) {
        reply.code(409);
        return { ok: false, code: ErrorCode.IDENTITY_ALREADY_BOUND, message: 'identity bound to another player' };
      }
      if (!player.identities.some((i) => i.provider === provider && i.subject === subject)) {
        player.identities.push({ provider, subject, boundAt: Date.now() });
        await deps.repo.upsert(player);
      }
      return { ok: true, data: { player } };
    },
  );

  app.get('/auth/_meta', async () => ({ ok: true, data: { protocolVersion: PROTOCOL_VERSION } }));
}

/**
 * Issue a JWT for the given player. The @fastify/jwt plugin manages `iat`/`exp`
 * via the `sign` option; we only pass the custom `identities` payload.
 */
async function issueToken(app: FastifyInstance, player: import('@farm-game/shared').PlayerSave): Promise<{
  token: string;
  auth: import('@farm-game/shared').AuthContext;
}> {
  const ttl = app.config.jwtTtlSec;
  const token = await app.jwt.sign(
    { identities: player.identities },
    { sub: player.playerId, expiresIn: ttl, iss: app.config.jwtIssuer, aud: app.config.jwtAudience },
  );
  const decoded = app.jwt.decode<{ iat?: number; exp?: number }>(token);
  const issuedAt = decoded?.iat ?? Math.floor(Date.now() / 1000);
  const expiresAt = decoded?.exp ?? issuedAt + ttl;
  return {
    token,
    auth: {
      playerId: player.playerId,
      identities: player.identities,
      issuedAt,
      expiresAt,
    },
  };
}

/**
 * Re-export for tests that need a known id without depending on crypto.randomUUID.
 */
export { generatePlayerId };
// Force-import type-only references for compiler.
export type _Unused = FastifyRequest | FastifyReply;
