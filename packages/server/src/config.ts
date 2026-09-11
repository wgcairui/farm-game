/**
 * Server config — single source of environment-variable parsing.
 *
 * Per ADR-0001 §4: production boot fails closed when secrets look like the
 * shipped defaults or when mock auth is enabled. Development/test boot tolerates
 * the defaults so contributors can `pnpm dev` without an .env file.
 *
 * No env reads outside this file.
 */

export interface ServerConfig {
  port: number;
  host: string;
  env: 'development' | 'production' | 'test';

  /** Realtime WS entry (Colyseus) — independent process from HTTP. */
  wsPort: number;
  wsHost: string;

  /**
   * Redis connection for the Colyseus matchmaker directory + presence across
   * WS processes. Null → single-process LocalDriver (development only;
   * production MUST set REDIS_URL — the WS entry refuses to boot without it).
   */
  redisUrl: string | null;

  /**
   * Farm room ownership lease (PostgreSQL-arbitrated). The lease must
   * outlive the renew interval with comfortable margin for GC pauses.
   */
  leaseTtlMs: number;
  leaseRenewMs: number;

  /** Main business database (MikroORM). Phase 1 unused; placeholder. */
  mainDbUrl: string | null;
  /** @colyseus/database connection. Phase 2 enabled. */
  adminDbUrl: string | null;

  /** JWT signing secret for business routes. */
  jwtSecret: string;
  /** JWT secret for @colyseus/admin panel. */
  jwtSecretAdmin: string;
  /** Session secret used by @colyseus/auth for cookie signing. */
  sessionSecret: string;
  /** JWT issuer (`iss` claim) and audience (`aud` claim). */
  jwtIssuer: string;
  jwtAudience: string;
  /** JWT TTL in seconds. */
  jwtTtlSec: number;

  /** ENABLE_ADMIN=1 mounts @colyseus/admin on the WS node. Default off. */
  enableAdmin: boolean;
  /** ENABLE_MOCK_AUTH=1 enables /auth/wechat mock path. Allowed only in dev/test. */
  enableMockAuth: boolean;
}

/** Default secrets — distinct from each other so accidental swap is detectable. */
const DEFAULT_JWT_SECRET = 'dev-secret-change-me';
const DEFAULT_JWT_SECRET_ADMIN = 'dev-admin-secret-change-me';
const DEFAULT_SESSION_SECRET = 'dev-session-change-me';

export class ConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ConfigError';
  }
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const env = (process.env.NODE_ENV ?? 'development') as ServerConfig['env'];
  const port = Number(process.env.PORT ?? '3000');
  const host = process.env.HOST ?? '127.0.0.1';

  const jwtSecret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  const jwtSecretAdmin = process.env.JWT_SECRET_ADMIN ?? DEFAULT_JWT_SECRET_ADMIN;
  const sessionSecret = process.env.SESSION_SECRET ?? DEFAULT_SESSION_SECRET;
  const jwtIssuer = process.env.JWT_ISSUER ?? 'farm-game';
  const jwtAudience = process.env.JWT_AUDIENCE ?? 'client';
  const jwtTtlSec = Number(process.env.JWT_TTL_SEC ?? String(7 * 24 * 3600));
  if (!Number.isFinite(jwtTtlSec) || jwtTtlSec <= 0) {
    throw new ConfigError(
      `JWT_TTL_SEC must be a positive integer (received ${process.env.JWT_TTL_SEC ?? '<unset>'}). Refusing to start.`,
    );
  }

  const enableAdmin = process.env.ENABLE_ADMIN === '1';
  const enableMockAuth = process.env.ENABLE_MOCK_AUTH === '1';

  // Realtime WS entry (G2 T2).
  const wsPort = Number(process.env.WS_PORT ?? '2567');
  const wsHost = process.env.WS_HOST ?? '127.0.0.1';
  const redisUrl = process.env.REDIS_URL || null;
  const leaseTtlMs = Number(process.env.LEASE_TTL_MS ?? '15000');
  const leaseRenewMs = Number(process.env.LEASE_RENEW_MS ?? '5000');
  if (!Number.isFinite(wsPort) || wsPort <= 0) {
    throw new ConfigError(`WS_PORT must be a positive integer (received ${process.env.WS_PORT ?? '<unset>'}).`);
  }
  if (!Number.isFinite(leaseTtlMs) || leaseTtlMs <= 0 || !Number.isFinite(leaseRenewMs) || leaseRenewMs <= 0) {
    throw new ConfigError(
      `LEASE_TTL_MS and LEASE_RENEW_MS must be positive integers (received ${process.env.LEASE_TTL_MS ?? '<unset>'} / ${process.env.LEASE_RENEW_MS ?? '<unset>'}).`,
    );
  }
  if (leaseRenewMs >= leaseTtlMs) {
    throw new ConfigError(
      `LEASE_RENEW_MS (${leaseRenewMs}) must be shorter than LEASE_TTL_MS (${leaseTtlMs}) or leases expire between renewals.`,
    );
  }

  // Fail-closed production validation (ADR-0001 §4).
  if (env === 'production') {
    const checks: Array<[string, string, string]> = [
      ['JWT_SECRET', jwtSecret, DEFAULT_JWT_SECRET],
      ['JWT_SECRET_ADMIN', jwtSecretAdmin, DEFAULT_JWT_SECRET_ADMIN],
      ['SESSION_SECRET', sessionSecret, DEFAULT_SESSION_SECRET],
    ];
    for (const [name, actual, fallback] of checks) {
      if (actual === fallback) {
        throw new ConfigError(
          `${name} must be set explicitly in production (received default). Refusing to start.`,
        );
      }
    }
    if (enableMockAuth) {
      throw new ConfigError(
        'ENABLE_MOCK_AUTH=1 is forbidden in production. Set ENABLE_MOCK_AUTH=0 or unset it.',
      );
    }
    if (enableAdmin && jwtSecretAdmin === jwtSecret) {
      throw new ConfigError(
        'JWT_SECRET_ADMIN must differ from JWT_SECRET in production (admin uses an isolated secret).',
      );
    }
    // Per ADR-0003 D30: production requires an explicit, non-default MAIN_DB_URL.
    // The dev default URL points at the local docker container; if it leaks
    // into production via env inheritance, the boot fails closed.
    if (process.env.MAIN_DB_URL === undefined || process.env.MAIN_DB_URL === '') {
      throw new ConfigError(
        'MAIN_DB_URL must be set explicitly in production (ADR-0003 D30). Refusing to start.',
      );
    }
  }

  // Dev/test permit defaults but warn on suspicious host binding.
  if (env !== 'test' && host === '0.0.0.0') {
    // eslint-disable-next-line no-console
    console.warn(`[config] HOST=0.0.0.0 exposes the server on all interfaces; restrict via HOST in production`);
  }

  // Production: the WS entry must share farm state across processes via
  // Redis — a LocalDriver deployment silently breaks matchmaking between
  // replicas (G2 plan: "Redis 启动不可达 → readiness 不通过，不回退").
  if (env === 'production' && !redisUrl) {
    throw new ConfigError('REDIS_URL must be set explicitly in production (multi-process WS matchmaking).');
  }

  return {
    port,
    host,
    env,
    wsPort,
    wsHost,
    redisUrl,
    leaseTtlMs,
    leaseRenewMs,
    mainDbUrl: process.env.MAIN_DB_URL ?? null,
    adminDbUrl: process.env.ADMIN_DB_URL ?? null,
    jwtSecret,
    jwtSecretAdmin,
    sessionSecret,
    jwtIssuer,
    jwtAudience,
    jwtTtlSec,
    enableAdmin,
    enableMockAuth,
    ...overrides,
  };
}
