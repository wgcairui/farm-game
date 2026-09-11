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
 */

import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import {
  ErrorCode,
  PROTOCOL_VERSION_MAJOR,
  type ApiResponse,
} from '@farm-game/shared';
import { authRoutes } from './auth/routes.js';
import { playerRoutes } from './player/routes.js';
import { cropRoutes } from './crop/routes.js';
import { farmRoutes } from './farm/routes.js';
import { InMemoryPlayerRepo } from './auth/repo.js';
import { isVerifiedAuth, type VerifiedAuth } from './auth/jwt.js';
import { mountAdmin } from './admin/index.js';
import type { ServerConfig } from './config.js';
import { logger } from './obs/logger.js';

export interface BuildAppOptions {
  config: ServerConfig;
  /** Override repo for tests. */
  repo?: InMemoryPlayerRepo;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: ServerConfig;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { identities: import('@farm-game/shared').AuthIdentityRef[] };
    user: VerifiedAuth;
  }
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config, repo = new InMemoryPlayerRepo() } = opts;

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

  // 4. /healthz — open, returns protocol version.
  app.get('/healthz', async () => ({
    ok: true,
    uptime: Math.round(process.uptime()),
    protocolVersion: (await import('@farm-game/shared')).PROTOCOL_VERSION,
  }));

  // 5. Business routes.
  await authRoutes(app, { repo });
  await cropRoutes(app);
  await playerRoutes(app, { repo });
  await farmRoutes(app, { repo });

  // 6. Admin boundary.
  await mountAdmin(
    app,
    {
      adminDbUrl: config.adminDbUrl ?? '',
      jwtSecretAdmin: config.jwtSecretAdmin,
      sessionSecret: config.sessionSecret,
    },
    config.enableAdmin,
  );

  return app;
}

function shouldBypassProtocolCheck(url: string): boolean {
  // The probe path and admin health probe run before version negotiation; the
  // handshake (/auth/wechat, /auth/_meta) must run with or without a header so
  // we don't strand debug tooling. Per ADR §6 the major check still triggers
  // 426 when a header *is* present and mismatched.
  return url === '/healthz' || url === '/admin/healthz' || url.startsWith('/admin/');
}

function parseProtocolMajor(header: string): number | null {
  const m = /^(\d+)\./.exec(header.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
