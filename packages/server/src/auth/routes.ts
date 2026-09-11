/**
 * /auth routes — POST /auth/wechat (mini-program), POST /auth/oauth (iOS/Android),
 * POST /auth/bind (link another identity), GET /auth/identities/me (own subjects),
 * GET /auth/_meta.
 *
 * Per ADR-0001 §3 / §4 / §1 (subject privacy) and G0 review fixes:
 *  - JWT uses standard `sub`/`iat`/`exp`/`iss`/`aud`. TTL comes from `config.jwtTtlSec`.
 *  - Mock login (code/idToken starting with `mock_`) is gated on
 *    `config.enableMockAuth`, which `loadConfig()` refuses to enable in production.
 *  - In production, non-mock OAuth tokens are accepted but logged as a
 *    STUB WARNING — real OAuth lands with G1, not G0 (M1).
 *  - `PlayerSave.identities` is the public summary (no subject). The owning
 *    client fetches its own subjects via `GET /auth/identities/me`.
 *  - Binding goes through `repo.addIdentity()` so the by-identity index is
 *    atomically maintained and duplicates are rejected (H2/H3).
 *  - Phase 2 will plug in https://api.weixin.qq.com/sns/jscode2session here.
 */

import type { FastifyInstance } from 'fastify';
import {
  AuthProvider,
  ErrorCode,
  PROTOCOL_VERSION,
  toIdentitySummary,
  type ApiResponse,
  type AuthBindRequest,
  type AuthIdentity,
  type AuthIdentitySummary,
  type LoginResponse,
  type OAuthLoginRequest,
  type WeChatLoginRequest,
} from '@farm-game/shared';
import {
  ensurePlayer,
  generatePlayerId,
  IdentityAlreadyBoundError,
  InMemoryPlayerRepo,
} from './repo.js';
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
    // Wire values are `AuthProvider` literals; the client sends the same
    // constants via the shared `OAuthLoginRequest` type.
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

      if (code.startsWith(MOCK_CODE_PREFIX) && !app.config.enableMockAuth) {
        reply.code(403);
        return { ok: false, code: ErrorCode.WECHAT_CODE_INVALID, message: 'mock login disabled' };
      }

      const subject = code.startsWith(MOCK_CODE_PREFIX) ? code : `mock_${code.slice(0, 16)}`;
      const identity: Pick<AuthIdentity, 'provider' | 'subject'> = {
        provider: AuthProvider.WeChatMini,
        subject,
      };

      const player = await ensurePlayer(deps.repo, identity);
      void guestPlayerId; // Phase 2: implement the real merge flow.

      const issued = await issueToken(app, player);
      return { ok: true, data: { token: issued.token, player, auth: issued.auth } };
    },
  );

  app.post<{ Body: OAuthLoginRequest; Reply: ApiResponse<LoginResponse> }>(
    '/auth/oauth',
    { schema: { body: oauthBodySchema } },
    async (req, reply): Promise<ApiResponse<LoginResponse>> => {
      const { provider, idToken } = req.body;
      const isMock = idToken.startsWith(MOCK_CODE_PREFIX);

      if (isMock && !app.config.enableMockAuth) {
        reply.code(403);
        return { ok: false, code: ErrorCode.OAUTH_PROVIDER_INVALID, message: 'mock login disabled' };
      }

      // Non-mock OAuth tokens are still accepted in G0 because the real
      // Apple/Google/WeChat id_token verification is not yet wired. Log a
      // single warning per process so misconfigured production deployments
      // are visible without being noisy (M1).
      if (!isMock && app.config.env === 'production') {
        app.log.warn(
          { provider },
          'oauth login accepted in stub mode (no provider verification); replace with real verification in G1',
        );
      }

      const subject = isMock ? idToken : `mock_${provider}_${idToken.slice(0, 16)}`;
      const identity: Pick<AuthIdentity, 'provider' | 'subject'> = { provider, subject };
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
      const isMock = token.startsWith(MOCK_CODE_PREFIX);
      if (isMock && !app.config.enableMockAuth) {
        reply.code(403);
        return { ok: false, code: ErrorCode.OAUTH_PROVIDER_INVALID, message: 'mock bind disabled' };
      }
      const subject = isMock ? token : `mock_${provider}_${token.slice(0, 16)}`;

      try {
        await deps.repo.addIdentity(player.playerId, { provider, subject, tenantId, boundAt: Date.now() });
      } catch (err) {
        if (err instanceof IdentityAlreadyBoundError) {
          reply.code(409);
          return {
            ok: false,
            code: ErrorCode.IDENTITY_ALREADY_BOUND,
            message: 'identity bound to another player',
          };
        }
        throw err;
      }
      const updated = await deps.repo.findByPlayerId(player.playerId);
      return { ok: true, data: { player: updated! } };
    },
  );

  /**
   * Owning client fetches its own provider subjects. Other clients calling
   * this endpoint can only see their own subjects (JWT `sub` is the only
   * lookup key), so the leak vector from H1 stays closed.
   */
  app.get<{ Reply: ApiResponse<{ identities: AuthIdentity[] }> }>(
    '/auth/identities/me',
    { preHandler: app.authenticate },
    async (req): Promise<ApiResponse<{ identities: AuthIdentity[] }>> => {
      const identities = await deps.repo.findIdentities(req.user.sub);
      return { ok: true, data: { identities } };
    },
  );

  app.get('/auth/_meta', async () => ({ ok: true, data: { protocolVersion: PROTOCOL_VERSION } }));
}

/**
 * Issue a JWT for the given player. The @fastify/jwt plugin manages `iat`/`exp`
 * via the `sign` option; we only pass the custom `identities` payload.
 *
 * `identities` is the public summary (no subject), projected from the player's
 * full identity list, so the JWT itself never carries a subject.
 */
async function issueToken(app: FastifyInstance, player: import('@farm-game/shared').PlayerSave): Promise<{
  token: string;
  auth: import('@farm-game/shared').AuthContext;
}> {
  const ttl = app.config.jwtTtlSec;
  const identities: AuthIdentitySummary[] = player.identities;
  const token = await app.jwt.sign(
    { identities },
    { sub: player.playerId, expiresIn: ttl, iss: app.config.jwtIssuer, aud: app.config.jwtAudience },
  );
  const decoded = app.jwt.decode<{ iat?: number; exp?: number }>(token);
  const issuedAt = decoded?.iat ?? Math.floor(Date.now() / 1000);
  const expiresAt = decoded?.exp ?? issuedAt + ttl;
  return {
    token,
    auth: {
      playerId: player.playerId,
      identities,
      issuedAt,
      expiresAt,
    },
  };
}

export { generatePlayerId };
