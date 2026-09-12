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
   * WS processes. Null → single-process LocalDriver (development only).
   * Enforcement note: only the WS entry requires this in production — the
   * HTTP process never touches Redis.
   */
  redisUrl: string | null;

  /**
   * Farm room ownership lease (PostgreSQL-arbitrated). The lease must
   * outlive the renew interval with comfortable margin for GC pauses.
   * T4: renew failures are tolerated up to LEASE_RENEW_FAILURES_ALLOWED
   * consecutive misses, so the budget constraint is
   * `leaseRenewMs * LEASE_RENEW_FAILURES_ALLOWED < leaseTtlMs`.
   */
  leaseTtlMs: number;
  leaseRenewMs: number;

  /**
   * T4: how often the WS process polls `players.revision` for its active
   * farm rooms to detect out-of-band writes (HTTP entry, another device).
   * Detected changes are broadcast to the room's connections as a fresh
   * full snapshot. Latency budget: ≤ pollMs + one snapshot read.
   */
  refreshPollMs: number;

  /**
   * T4: reconnection seat TTL offered in `onDrop` (network drop / abnormal
   * close). While a seat is pending the room keeps its lease and keeps
   * serving the remaining connections; a reconnecting client re-enters
   * without re-running onAuth (the reconnection token is the capability)
   * and must pull a fresh snapshot via `farm_refresh`.
   */
  roomReconnectTtlSec: number;

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

/**
 * Consecutive lease-renew failures tolerated before a room stops serving.
 * The room keeps acting as authority while failures < N (writes stay fenced
 * by assertCurrent regardless); at N it disconnects and releases. The budget
 * `N * leaseRenewMs` must stay below the lease TTL, otherwise a partitioned
 * room could still be serving after its lease has expired and been taken
 * over — the fence would reject writes, but the room would be a zombie.
 */
export const LEASE_RENEW_FAILURES_ALLOWED = 2;

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

  // Realtime WS entry (G2 T2/T4).
  const wsPort = Number(process.env.WS_PORT ?? '2567');
  const wsHost = process.env.WS_HOST ?? '127.0.0.1';
  const redisUrl = process.env.REDIS_URL || null;
  const leaseTtlMs = Number(process.env.LEASE_TTL_MS ?? '15000');
  const leaseRenewMs = Number(process.env.LEASE_RENEW_MS ?? '5000');
  const refreshPollMs = Number(process.env.REFRESH_POLL_MS ?? '1000');
  const roomReconnectTtlSec = Number(process.env.ROOM_RECONNECT_TTL_SEC ?? '60');
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
  if (leaseRenewMs * LEASE_RENEW_FAILURES_ALLOWED >= leaseTtlMs) {
    throw new ConfigError(
      `LEASE_RENEW_MS (${leaseRenewMs}) × LEASE_RENEW_FAILURES_ALLOWED (${LEASE_RENEW_FAILURES_ALLOWED}) must stay below LEASE_TTL_MS (${leaseTtlMs}) — otherwise a partitioned room outlives its own lease.`,
    );
  }
  if (!Number.isFinite(refreshPollMs) || refreshPollMs < 50) {
    throw new ConfigError(
      `REFRESH_POLL_MS must be a number ≥ 50 (received ${process.env.REFRESH_POLL_MS ?? '<unset>'}).`,
    );
  }
  if (!Number.isFinite(roomReconnectTtlSec) || roomReconnectTtlSec <= 0 || roomReconnectTtlSec > 3600) {
    throw new ConfigError(
      `ROOM_RECONNECT_TTL_SEC must be a number in (0, 3600] (received ${process.env.ROOM_RECONNECT_TTL_SEC ?? '<unset>'}).`,
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

  // Note (T2 review #4): REDIS_URL production enforcement lives in the WS
  // entry (realtime/serve.ts), not here — the HTTP process never touches
  // Redis and must not be blocked by a WS-only constraint.

  return {
    port,
    host,
    env,
    wsPort,
    wsHost,
    redisUrl,
    leaseTtlMs,
    leaseRenewMs,
    refreshPollMs,
    roomReconnectTtlSec,
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
