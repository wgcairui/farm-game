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
  createDefaultPlayerSave,
  ErrorCode,
  PROTOCOL_VERSION,
  toIdentitySummary,
  type ApiResponse,
  type AuthBindRequest,
  type AuthIdentity,
  type AuthIdentitySummary,
  type LoginResponse,
  type OAuthLoginRequest,
  type PlayerSave,
  type WeChatLoginRequest,
} from '@farm-game/shared';
import {
  ensurePlayer,
  generatePlayerId,
  IdentityAlreadyBoundError,
} from './repo.js';
import type { PlayerRepo } from '../repositories/player-repo.js';
import { isVerifiedAuth } from './jwt.js';

const MOCK_CODE_PREFIX = 'mock_';

interface AuthRoutesDeps {
  repo: PlayerRepo;
  /**
   * Optional PostgreSQL-backed repo. When provided, `/auth/wechat`,
   * `/auth/oauth` and `/auth/bind` write to Postgres (so the player
   * created by login is visible to subsequent `/farm/*` commands).
   * When omitted, all routes fall back to `repo` (the in-memory test repo).
   */
  dbRepo?: PlayerRepo;
}

/**
 * Construct a fresh PlayerSave for a brand-new login. Seeds 6 unlocked
 * plots and 200 gold (ADR-0002 D9). `initialIdentity` is the public
 * summary of the identity that triggered the create — populating it
 * keeps the first /player/info response self-contained.
 */
function makeFreshSave(playerId: string, identity: Pick<AuthIdentity, 'provider'>): PlayerSave {
  return createDefaultPlayerSave({
    playerId,
    initialIdentity: toIdentitySummary({
      provider: identity.provider,
      subject: '',
      boundAt: Date.now(),
    }),
  });
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
  const writeRepo = deps.dbRepo ?? deps.repo;
  app.post<{ Body: WeChatLoginRequest; Reply: ApiResponse<LoginResponse> }>(
    '/auth/wechat',
    { schema: { body: wechatBodySchema } },
    async (req, reply): Promise<ApiResponse<LoginResponse>> => {
      const { code, guestPlayerId } = req.body;

      if (code.startsWith(MOCK_CODE_PREFIX)) {
        if (!app.config.enableMockAuth) {
          reply.code(403);
          return { ok: false, code: ErrorCode.WECHAT_CODE_INVALID, message: 'mock login disabled' };
        }
      } else if (app.config.env === 'production') {
        // T1 (G0 close): non-mock `code` values are not yet verified against
        // `api.weixin.qq.com/sns/jscode2session`. Production refuses them
        // rather than silently minting a subject from the raw string —
        // accepting an unverified code would let any caller impersonate an
        // arbitrary WeChat user (M1 / ADR-0001 §4 fail-closed). Real
        // verification is wired in G1.5; until then dev/test continue to
        // accept non-mock codes through the same `mock_<first16>` fallback
        // used by OAuth.
        reply.code(403);
        return {
          ok: false,
          code: ErrorCode.WECHAT_CODE_INVALID,
          message: 'real wechat login not yet wired; use mock_ codes in non-production',
        };
      } else {
        app.log.warn({ codePrefix: code.slice(0, 4) }, 'wechat code accepted in stub mode (non-mock, non-production)');
      }

      const subject = code.startsWith(MOCK_CODE_PREFIX) ? code : `mock_${code.slice(0, 16)}`;
      const identity: Pick<AuthIdentity, 'provider' | 'subject'> = {
        provider: AuthProvider.WeChatMini,
        subject,
      };

      const player = await ensurePlayer(writeRepo, identity, (id) => makeFreshSave(id, identity));
      void guestPlayerId; // Phase 2: implement the real merge flow.

      const issued = await issueToken(app, player);
      return { ok: true, data: { token: issued.token, player, auth: issued.auth, serverNow: Date.now(), revision: player.revision } };
    },
  );

  app.post<{ Body: OAuthLoginRequest; Reply: ApiResponse<LoginResponse> }>(
    '/auth/oauth',
    { schema: { body: oauthBodySchema } },
    async (req, reply): Promise<ApiResponse<LoginResponse>> => {
      const { provider, idToken } = req.body;
      const isMock = idToken.startsWith(MOCK_CODE_PREFIX);

      if (isMock) {
        if (!app.config.enableMockAuth) {
          reply.code(403);
          return { ok: false, code: ErrorCode.OAUTH_PROVIDER_INVALID, message: 'mock login disabled' };
        }
      } else if (app.config.env === 'production') {
        // T1: refuse non-mock idTokens in production. Apple/Google id_token
        // signature verification lands in G1.5; until then accepting the raw
        // string would let any caller impersonate any Apple/Google subject.
        reply.code(403);
        return {
          ok: false,
          code: ErrorCode.OAUTH_PROVIDER_INVALID,
          message: 'real oauth verification not yet wired; use mock_ codes in non-production',
        };
      } else {
        app.log.warn({ provider }, 'oauth idToken accepted in stub mode (non-mock, non-production)');
      }

      const subject = isMock ? idToken : `mock_${provider}_${idToken.slice(0, 16)}`;
      const identity: Pick<AuthIdentity, 'provider' | 'subject'> = { provider, subject };
      const player = await ensurePlayer(writeRepo, identity, (id) => makeFreshSave(id, identity));
      const issued = await issueToken(app, player);
      return { ok: true, data: { token: issued.token, player, auth: issued.auth, serverNow: Date.now(), revision: player.revision } };
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
      const player = await writeRepo.findByPlayerId(auth.sub);
      if (!player) {
        reply.code(404);
        return { ok: false, code: ErrorCode.NOT_AUTHENTICATED, message: 'player not found' };
      }

      const { provider, token, tenantId } = req.body;
      const isMock = token.startsWith(MOCK_CODE_PREFIX);
      if (isMock) {
        if (!app.config.enableMockAuth) {
          reply.code(403);
          return { ok: false, code: ErrorCode.OAUTH_PROVIDER_INVALID, message: 'mock bind disabled' };
        }
      } else if (app.config.env === 'production') {
        reply.code(403);
        return {
          ok: false,
          code: ErrorCode.OAUTH_PROVIDER_INVALID,
          message: 'real oauth verification not yet wired; use mock_ codes in non-production',
        };
      } else {
        app.log.warn({ provider }, 'bind token accepted in stub mode (non-mock, non-production)');
      }
      const subject = isMock ? token : `mock_${provider}_${token.slice(0, 16)}`;

      try {
        await writeRepo.addIdentity(player.playerId, { provider, subject, tenantId, boundAt: Date.now() });
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
      const updated = await writeRepo.findByPlayerId(player.playerId);
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
      const identities = await writeRepo.findIdentities(req.user.sub);
      return { ok: true, data: { identities } };
    },
  );

  app.get('/auth/_meta', async () => ({
    ok: true,
    data: { protocolVersion: PROTOCOL_VERSION, serverNow: Date.now() },
  }));
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
