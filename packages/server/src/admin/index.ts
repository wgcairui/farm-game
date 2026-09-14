/**
 * Admin sub-module boundary — entry point for `buildApp`.
 *
 * v2 path (ADR-0006 + `docs/admin-integration.md` v2): one MikroORM,
 * one PostgreSQL database, admin schema + business schema sharing the
 * same connection so admin writes that mutate business tables + audit
 * rows commit atomically (D49). Admin ops surface is `/admin-ops/*`
 * wired through `registerOpsRoutes()` in `ops-routes.ts`.
 *
 * File layout under `src/admin/`:
 *   - `index.ts`           — this file; `mountAdmin()` boundary
 *   - `auth.ts`            — VerifiedAdminAuth type guard (Stage C)
 *   - `audit.ts`           — withAdminAudit(em, entry, work) helper (D49)
 *   - `rate-limit.ts`      — independent rate-limit buckets (login / global)
 *   - `ops-routes.ts`      — 8 /admin-ops/* routes
 *
 * Behaviour:
 *   - `ENABLE_ADMIN=0`: `/admin/healthz` returns `{enabled:false}`
 *     (admin-disabled integration test covers this); admin ops surface
 *     is NOT mounted, so the auth/ORM/Redis deps aren't required.
 *   - `ENABLE_ADMIN=1`: `registerOpsRoutes(app, opsDeps)` runs.
 */

import type { FastifyInstance } from 'fastify';
import { registerOpsRoutes, type OpsRouteDeps } from './ops-routes.js';
import { registerAdminRateLimit } from './rate-limit.js';

/**
 * The deps shape passed into `mountAdmin`. When `enableAdmin=false`
 * the full `OpsRouteDeps` are optional; when `enableAdmin=true` they
 * are required (and the function throws `AdminConfigError` if any
 * of `config` / `orm` / `adminRepo` / `leases` is missing).
 *
 * The two legacy fields (`adminDbUrl`, `sessionSecret`) are kept
 * readonly for backwards compat with the Stage A call site; both are
 * ignored at runtime per ADR-0006 D44 (no second DB; admin uses the
 * same MikroORM connection as the business side).
 */
export interface AdminDeps {
  adminDbUrl?: string;
  sessionSecret?: string;
  config?: OpsRouteDeps['config'];
  orm?: OpsRouteDeps['orm'];
  adminRepo?: OpsRouteDeps['adminRepo'];
  leases?: OpsRouteDeps['leases'];
  publishDrain?: OpsRouteDeps['publishDrain'];
}

/**
 * Thrown by `mountAdmin` when `ENABLE_ADMIN=1` but the caller didn't
 * supply the production-shape deps. Fail closed rather than silently
 * serving half-configured admin ops.
 */
export class AdminConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AdminConfigError';
  }
}

/**
 * Production-mount the admin ops surface.
 */
export async function mountAdmin(
  app: FastifyInstance,
  deps: AdminDeps,
  enableAdmin: boolean,
): Promise<void> {
  if (!enableAdmin) {
    app.get('/admin/healthz', async () => ({ ok: true, enabled: false }));
    app.get('/admin', async (_req, reply) => reply.code(404).send({ ok: false }));
    return;
  }

  if (!deps.config || !deps.orm || !deps.adminRepo || !deps.leases) {
    throw new AdminConfigError(
      'ENABLE_ADMIN=1 but admin deps are missing: config, orm, adminRepo, leases are all required. ' +
      'Wire via bootstrapDatabase() → mountAdmin().',
    );
  }

  await registerAdminRateLimit(app);
  await registerOpsRoutes(app, {
    config: deps.config,
    orm: deps.orm,
    adminRepo: deps.adminRepo,
    leases: deps.leases,
    publishDrain: deps.publishDrain,
  });
}

// Re-exports so callers importing from this module get the full type
// surface without needing to know about ops-routes.ts / auth.ts.
export type { OpsRouteDeps } from './ops-routes.js';
export { isVerifiedAdminAuth } from './auth.js';
