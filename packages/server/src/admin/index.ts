/**
 * @colyseus/admin sub-module — isolated boundary.
 *
 * Architecture rule (see docs/admin-integration.md):
 *   - Business code in packages/server/src/{auth,crop,player,farm,realtime}/**
 *     MUST NOT import from `drizzle-orm` or `@colyseus/database`.
 *   - Admin code in packages/server/src/admin/** MUST NOT import `@mikro-orm/core`.
 *   - The two ORMs share a Postgres cluster but live in different `database` names.
 *
 * Phase 1 status: NO drizzle connection is established. The function below returns
 * a no-op router when ENABLE_ADMIN=0; when ENABLE_ADMIN=1 it throws AdminConfigError
 * because Phase 1 deliberately skips the real mount (see plan §7).
 */

import type { FastifyInstance } from 'fastify';

export interface AdminDeps {
  adminDbUrl: string;
  jwtSecretAdmin: string;
  sessionSecret: string;
}

export class AdminConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AdminConfigError';
  }
}

/**
 * Mount @colyseus/admin on `app` at `/admin` and `/admin-api`.
 *
 * Phase 1: when `enableAdmin` is true but the admin sub-module is not yet wired,
 * this function throws AdminConfigError. The smoke test asserts this contract.
 *
 * Phase 2: implement Drizzle connection pool, schema migration, and admin({}) mount.
 */
export async function mountAdmin(app: FastifyInstance, deps: AdminDeps, enableAdmin: boolean): Promise<void> {
  // Reference `deps` to keep the parameter list stable for callers/tests even
  // though the Phase-1 implementation does not use them.
  void deps;

  if (!enableAdmin) {
    app.get('/admin/healthz', async () => ({ ok: true, enabled: false }));
    app.get('/admin', async (_req, reply) => reply.code(404).send({ ok: false }));
    return;
  }

  throw new AdminConfigError(
    'ENABLE_ADMIN=1 but admin sub-module is Phase 2. ' +
    'See docs/admin-integration.md for the planned implementation and migration order.',
  );
}
