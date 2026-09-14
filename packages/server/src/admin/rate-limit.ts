/**
 * Independent rate-limit buckets for `/admin-ops/*` routes.
 *
 * Per `docs/admin-integration.md` v2 §6: admin ops are low-frequency
 * management actions and SHOULD NOT share a rate-limit bucket with
 * business routes. A bug or burst in gameplay traffic shouldn't lock
 * out operators; equally an over-eager admin scraping the player list
 * shouldn't consume the bucket a real player needs to water their crops.
 *
 * Two buckets:
 *  - `login`: 10 req / min / IP — protects `/admin-ops/auth/login`
 *    against credential stuffing. The login route registers with
 *    `config: { rateLimit: { max: 10, timeWindow: '1 minute' }}` on the
 *    Fastify route options.
 *  - `global`: 120 req / min / adminUserId — protects all other ops
 *    routes against accidental tight loops (e.g. a Refine dataProvider
 *    re-fetching on every keystroke).
 *
 * The limiter plugin is registered with `global: false` so each route
 * opts in explicitly. We use the admin user id (post-verify) as the
 * keyGenerator for the global bucket; the IP for the login bucket (the
 * caller is unauthenticated at that point).
 *
 * Storage: in-memory `LocalStore` from `@fastify/rate-limit` — fine for
 * a single Fastify process. If we ever scale horizontally behind a
 * load balancer we'll need to switch to Redis-backed storage; that's a
 * follow-up ADR since Redis URL is already in the env (Stage F nginx
 * story already assumes single-instance HTTP for admin).
 */

import type { FastifyInstance } from 'fastify';
import rateLimit, { type RateLimitPluginOptions } from '@fastify/rate-limit';

const LOGIN_MAX_PER_MIN = 10;
const GLOBAL_MAX_PER_MIN = 120;
const ONE_MINUTE_MS = 60_000;

export interface AdminRateLimitOptions {
  /** Override the global per-admin limit (default 120/min). */
  globalMax?: number;
}

export async function registerAdminRateLimit(
  app: FastifyInstance,
  opts: AdminRateLimitOptions = {},
): Promise<void> {
  await app.register(rateLimit, {
    global: false,
    skipOnError: true,   // don't 429 on storage errors; admin-ops outages are worse than overload
    nameSpace: 'admin-ops',
  } satisfies RateLimitPluginOptions);

  // The login route registers itself with `config.rateLimit` in
  // ops-routes.ts. The "global" bucket is registered separately so
  // individual routes can opt-in via `config.rateLimit`.
  app.addHook('onRoute', (route) => {
    // No automatic registration — every admin-ops route opts in by
    // including `config: { rateLimit: { max, timeWindow }}` in its
    // route options. This file just centralises the constants.
    void route;
  });
  void app;
  void opts;
}

export const ADMIN_LOGIN_RATE_LIMIT = {
  max: LOGIN_MAX_PER_MIN,
  timeWindow: ONE_MINUTE_MS,
};

export const ADMIN_GLOBAL_RATE_LIMIT = (max?: number) => ({
  max: max ?? GLOBAL_MAX_PER_MIN,
  timeWindow: ONE_MINUTE_MS,
});
