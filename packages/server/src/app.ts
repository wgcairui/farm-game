/**
 * buildApp — wire Fastify + JWT + business routes + admin boundary.
 *
 * Per ADR-0001 §3/§4/§6:
 *  - JWT plugin is configured with `iss`/`aud` so tokens carry those standard claims.
 *  - Standard `exp` is set via the `expiresIn` option at sign time and validated by
 *    the plugin at every `jwtVerify()`; we never carry a custom `expiresAt` claim.
 *  - A pre-handler `authenticate` decorator centralises the verify+exp-error mapping.
 *  - A preParsing hook rejects mismatched `x-protocol-version` with HTTP 426.
 *  - The default host is 127.0.0.1 (see `loadConfig`); binding to 0.0.0.0 logs a warning.
 *
 * Per ADR-0006 D46/D50:
 *  - A SECOND @fastify/jwt instance is registered under namespace `admin`
 *    with `jwtSecretAdmin` and its own short TTL (default 2h, range 1-4h).
 *    A business token cannot satisfy the admin namespace's `jwtVerify()`
 *    because the secrets differ and `iss`/`aud` also overlap on purpose
 *    (so a stolen business JWT cannot be replayed as admin).
 *  - `app.authenticateAdmin` mirrors the business `authenticate` decorator
 *    and returns the `{sub: adminUserId, role}` payload as the verified user.
 *    Stage D's `/admin-ops/*` routes chain this decorator for all writes.
 */

import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import {
  ErrorCode,
  PROTOCOL_VERSION_MAJOR,
  type ApiResponse,
} from '@farm-game/shared';
import type { MikroORM } from '@mikro-orm/core';
import { authRoutes } from './auth/routes.js';
import { playerRoutes } from './player/routes.js';
import { cropRoutes } from './crop/routes.js';
import { farmRoutes } from './farm/routes.js';
import { InMemoryPlayerRepo } from './auth/repo.js';
import type { PlayerRepo } from './repositories/player-repo.js';
import { MikroORMPlayerRepo } from './repositories/MikroORMPlayerRepo.js';
import { makeMikroOrmTransactionRunner } from './repositories/transaction.js';
import { isVerifiedAuth, type VerifiedAuth } from './auth/jwt.js';
import { isVerifiedAdminAuth, type VerifiedAdminAuth } from './admin/auth.js';
import { mountAdmin } from './admin/index.js';
import type { AdminRepo } from './repositories/admin-repo.js';
import type { RoomLeaseRepo } from './repositories/room-lease-repo.js';
import type { ServerConfig } from './config.js';
import { logger } from './obs/logger.js';

export interface BuildAppOptions {
  config: ServerConfig;
  /**
   * Override repo for tests. Defaults to InMemoryPlayerRepo. For production,
   * `index.ts` boots a MikroORM and passes a `MikroORMPlayerRepo` here.
   */
  repo?: PlayerRepo;
  /**
   * Optional ORM handle — when present, the app schedules a graceful
   * disconnect via `app.addHook('onClose', ...)`. The MikroORM player repo
   * is constructed from the same ORM by the caller; `app` does not own it.
   */
  orm?: MikroORM;
  /**
   * Stage D: admin sub-module deps. Required when `config.enableAdmin`
   * is true. Omitted otherwise (and the test suite continues to work
   * because the admin-disabled branch of `mountAdmin` needs none of
   * these).
   */
  adminRepo?: AdminRepo;
  leases?: RoomLeaseRepo;
  publishDrain?: (instanceId: string) => Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: ServerConfig;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { identities: import('@farm-game/shared').AuthIdentityRef[] };
    user: VerifiedAuth;
  }
}

/** Payload shape for admin namespace tokens. */
export interface AdminJwtPayload {
  sub: string;       // admin user id (numeric string from BIGSERIAL)
  role: string;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config, repo = new InMemoryPlayerRepo(), orm, adminRepo, leases, publishDrain } = opts;

  const app = Fastify({
    // pino v10's `Logger<never, boolean>` generic doesn't structurally match
    // Fastify v5's `FastifyBaseLogger`. Cast at the boundary so the rest of
    // the code uses precise Fastify types instead of `any` (ADR-0001 §D4).
    loggerInstance: logger as unknown as import('fastify').FastifyBaseLogger,
  });

  if (config.env === 'test') {
    // Silence per-request access logs to keep test output readable.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).disableRequestLogging = true;
  }

  app.decorate('config', config);

  // 0. Error envelope — translate Fastify default errors into ApiResponse shape
  //    (ADR-0001 §D8: every response is either a typed `data` envelope or an
  //    `ErrResponse` with `code` + `message`).
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      logger.error({ err }, 'unhandled error');
      reply.code(500);
      reply.send({ ok: false, code: ErrorCode.INTERNAL, message: 'internal error' } satisfies ApiResponse<never>);
      return;
    }
    const validation = err.validation;
    const code = status === 401
      ? ErrorCode.NOT_AUTHENTICATED
      : status === 403
        ? ErrorCode.WECHAT_CODE_INVALID
        : ErrorCode.BAD_REQUEST;
    reply.code(status);
    reply.send({
      ok: false,
      code,
      message: err.message || 'bad request',
      detail: validation ? { validation } : undefined,
    } satisfies ApiResponse<never>);
  });

  // 0a. CORS — browser / H5 clients only.
  //
  // WeChat mini-program `wx.request` does not consult CORS, so production
  // gameplay traffic is unaffected. This gate exists for browser-side debug
  // tooling (e.g. the eventual admin panel, local Swagger UI). Policy:
  //   - CORS_ORIGIN set (comma-separated)  → exact allow-list
  //   - CORS_ORIGIN unset & non-production → reflect any origin (dev convenience)
  //   - CORS_ORIGIN unset & production     → origin: false (fail closed)
  //
  // Production MUST set CORS_ORIGIN explicitly; a silent "*" with Bearer
  // tokens would be a footgun if a future web client is wired up. Methods
  // are restricted to GET/POST and credentials are off (auth uses Bearer
  // headers, not cookies — see ADR-0001 §3).
  const corsOriginRaw = process.env.CORS_ORIGIN;
  const corsOrigin = corsOriginRaw === undefined || corsOriginRaw === ''
    ? (config.env === 'production' ? false : true)
    : corsOriginRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  await app.register(fastifyCors, {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: false,
  });

  // 1. Protocol version gate (preParsing). Runs before the body is parsed.
  app.addHook('onRequest', async (req, reply) => {
    if (shouldBypassProtocolCheck(req.url)) return;
    const header = req.headers['x-protocol-version'];
    if (typeof header !== 'string') return; // backwards-compat: clients that don't send it pass through; /healthz always passes
    const major = parseProtocolMajor(header);
    if (major !== null && major !== PROTOCOL_VERSION_MAJOR) {
      const body: ApiResponse<never> = {
        ok: false,
        code: ErrorCode.PROTOCOL_VERSION_MISMATCH,
        message: `client major=${major} server major=${PROTOCOL_VERSION_MAJOR}`,
      };
      reply.code(426).send(body);
    }
  });

  // 2. JWT plugin with iss/aud so every issued token carries them.
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: { iss: config.jwtIssuer, aud: config.jwtAudience },
    verify: { allowedIss: config.jwtIssuer, allowedAud: config.jwtAudience },
  });

  // 2a. Admin JWT namespace — second @fastify/jwt registration with its
  //     own secret and TTL. `namespace: 'admin'` produces:
  //       - `app.jwt.admin.sign(payload)` / `.verify(token)` (server-side)
  //       - `req.adminJwtVerify()` request-side helper
  //       - `req.adminUser` holds the decoded payload after verify
  //     Setting `decoratorName: 'adminUser'` is critical so the verified
  //     payload does NOT collide with `req.user` (the business namespace's
  //     default), which would let a leaked business token shadow admin
  //     state if both verified on the same request.
  await app.register(fastifyJwt, {
    secret: config.jwtSecretAdmin,
    namespace: 'admin',
    decoratorName: 'adminUser',
    sign: {
      iss: config.jwtIssuer,
      aud: config.jwtAudience,
      expiresIn: config.jwtTtlSecAdmin,
    },
    verify: { allowedIss: config.jwtIssuer, allowedAud: config.jwtAudience },
  });

  // 3. Authenticate decorator — maps FAST_JWT_EXPIRED → 1102 TOKEN_EXPIRED,
  //    other verify failures → 1101 INVALID_TOKEN. Returns a sentinel after
  //    sending the reply so Fastify does not double-send or run the handler.
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch (err) {
      const code = (err as { code?: string }).code;
      reply.code(401);
      const payload: ApiResponse<never> = code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED'
        ? { ok: false, code: ErrorCode.TOKEN_EXPIRED, message: 'token expired' }
        : { ok: false, code: ErrorCode.INVALID_TOKEN, message: 'invalid token' };
      reply.send(payload);
      return reply;
    }
    if (!isVerifiedAuth(req.user)) {
      reply.code(401);
      reply.send({
        ok: false,
        code: ErrorCode.INVALID_TOKEN,
        message: 'token missing sub/identities',
      } satisfies ApiResponse<never>);
      return reply;
    }
    return undefined;
  });

  // 3a. AuthenticateAdmin decorator — same error mapping as `authenticate`
  //     but verifies against the `admin` JWT namespace. A token signed with
  //     `jwtSecret` (business) will fail here because the namespaces use
  //     different secrets, so a stolen business JWT cannot be replayed
  //     against `/admin-ops/*` (ADR-0006 D46).
  app.decorate('authenticateAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      // @fastify/jwt v10 namespaced registration exposes the verify helper
      // as `req.<namespace>JwtVerify()` — not `req.jwtVerify({ namespace })`
      // which does not exist. After verify, the decoded payload lands on
      // `req.adminUser` (because we set decoratorName: 'adminUser' above).
      const reqAny = req as unknown as { adminJwtVerify: () => Promise<void>; adminUser?: unknown };
      await reqAny.adminJwtVerify();
    } catch (err) {
      const code = (err as { code?: string }).code;
      reply.code(401);
      const payload: ApiResponse<never> = code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED'
        ? { ok: false, code: ErrorCode.TOKEN_EXPIRED, message: 'admin token expired' }
        : { ok: false, code: ErrorCode.NOT_AUTHENTICATED, message: 'invalid admin token' };
      reply.send(payload);
      return reply;
    }
    const adminUser = (req as unknown as { adminUser?: unknown }).adminUser;
    if (!isVerifiedAdminAuth(adminUser)) {
      reply.code(401);
      reply.send({
        ok: false,
        code: ErrorCode.NOT_AUTHENTICATED,
        message: 'admin token missing sub/role',
      } satisfies ApiResponse<never>);
      return reply;
    }
    return undefined;
  });

  // 4. /healthz — open, returns protocol version.
  app.get('/healthz', async () => ({
    ok: true,
    uptime: Math.round(process.uptime()),
    protocolVersion: (await import('@farm-game/shared')).PROTOCOL_VERSION,
  }));

  // 5. Business routes.
  const dbRepo = orm ? new MikroORMPlayerRepo(makeMikroOrmTransactionRunner(orm)) : undefined;
  const tx = orm ? makeMikroOrmTransactionRunner(orm) : undefined;
  await authRoutes(app, { repo, dbRepo });
  await cropRoutes(app);
  await playerRoutes(app, { repo, dbRepo });
  await farmRoutes(app, { repo, dbRepo, tx });

  // 6. Admin boundary.
  await mountAdmin(
    app,
    {
      // legacy fields kept for backwards compat with the Stage A call
      // signature; both are ignored at runtime per ADR-0006 D44.
      adminDbUrl: config.adminDbUrl ?? '',
      sessionSecret: config.sessionSecret,
      // Stage D: when ENABLE_ADMIN=1 these are required; absent deps
      // cause mountAdmin to throw AdminConfigError (fail closed).
      config, orm, adminRepo, leases, publishDrain,
    },
    config.enableAdmin,
  );

  // 7. Optional ORM lifecycle — release DB connections on graceful close.
  if (orm) {
    app.addHook('onClose', async () => {
      try {
        await orm.close(true);
      } catch (err) {
        logger.warn({ err }, 'ORM close failed');
      }
    });
  }

  return app;
}

function shouldBypassProtocolCheck(url: string): boolean {
  // Probes (LB health checks, admin health probe) must succeed even when the
  // client does not send `x-protocol-version`; auth/login routes do NOT bypass
  // — a 426 on login is the correct behaviour when a future major-bumped
  // client tries to talk to an older server (ADR-0001 §6).
  return url === '/healthz' || url.startsWith('/admin');
}

function parseProtocolMajor(header: string): number | null {
  const m = /^(\d+)\./.exec(header.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
