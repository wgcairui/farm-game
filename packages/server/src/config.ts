/**
 * Server config — single source of environment-variable parsing.
 * No env reads outside this file. Defaults are dev-safe.
 */

export interface ServerConfig {
  port: number;
  host: string;
  env: 'development' | 'production' | 'test';

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

  /** ENABLE_ADMIN=1 mounts @colyseus/admin on the WS node. Default off. */
  enableAdmin: boolean;
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const env = (process.env.NODE_ENV ?? 'development') as ServerConfig['env'];
  const port = Number(process.env.PORT ?? '3000');
  const host = process.env.HOST ?? '0.0.0.0';

  return {
    port,
    host,
    env,
    mainDbUrl: process.env.MAIN_DB_URL ?? null,
    adminDbUrl: process.env.ADMIN_DB_URL ?? null,
    jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    jwtSecretAdmin: process.env.JWT_SECRET_ADMIN ?? 'dev-admin-secret-change-me',
    sessionSecret: process.env.SESSION_SECRET ?? 'dev-session-change-me',
    enableAdmin: process.env.ENABLE_ADMIN === '1',
    ...overrides,
  };
}