/**
 * HTTP entry — single bootstrap called by `node dist/index.js` or tsx.
 *
 * Per ADR-0003 D30: when `MAIN_DB_URL` is set, the server boots a
 * MikroORM-backed player repo and applies pending migrations on startup
 * (idempotent; advisory-lock guarded so it can race the WS entry's boot).
 * When `MAIN_DB_URL` is unset, the server falls back to the in-memory repo
 * used by Phase 1 tests so contributors can `pnpm dev` without Docker.
 *
 * The realtime WS entry lives in `realtime/serve.ts` and shares the same
 * database wiring via `bootstrapDatabase`.
 *
 * Stage D (ADR-0006 D44/D46): when `ENABLE_ADMIN=1` and a real DB is
 * booted, we ALSO construct an `AdminRepo` and pass it + the lease
 * repo into `buildApp`. The gateway closes the loop: business + admin
 * share one ORM, one MikroORM instance, one connection pool — the
 * `withAdminAudit` helper in `src/admin/audit.ts` relies on this to
 * commit business mutations + admin_audit_log rows in one transaction.
 */

import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { bootstrapDatabase } from './bootstrap.js';
import { MikroORMAdminRepo } from './repositories/MikroORMAdminRepo.js';
import { logger } from './obs/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  let dbRepo: import('./bootstrap.js').ServerBootstrap['dbRepo'] | undefined;
  let orm: import('./bootstrap.js').ServerBootstrap['orm'] | undefined;
  let leases: import('./bootstrap.js').ServerBootstrap['leases'] | undefined;
  let closeBootstrap: (() => Promise<void>) | undefined;

  if (config.mainDbUrl) {
    const boot = await bootstrapDatabase(config);
    orm = boot.orm;
    dbRepo = boot.dbRepo;
    leases = boot.leases;
    closeBootstrap = boot.close;
  } else {
    logger.warn('MAIN_DB_URL is not set; booting with InMemoryPlayerRepo (development only)');
  }

  const adminRepo = orm ? new MikroORMAdminRepo(orm) : undefined;

  const app = await buildApp({
    config,
    repo: dbRepo,
    orm,
    adminRepo,
    leases,
    // publishDrain is intentionally left undefined here. Wiring it up
    // requires the WS process to subscribe to the `farm:drain` channel;
    // that's a follow-up tied to the WS entry's lifecycle (see
    // realtime/serve.ts). Stage D's drain route returns 503 in this
    // configuration, which is the safe behaviour — production deploy
    // wires the publisher in once the WS entry learns to honour it.
  });

  app.addHook('onClose', async () => {
    logger.info('server closing');
    if (closeBootstrap) await closeBootstrap();
  });

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(
      {
        port: config.port,
        env: config.env,
        admin: config.enableAdmin,
        db: dbRepo ? 'postgresql' : 'in-memory',
      },
      'farm-game-server listening',
    );
  } catch (err) {
    logger.fatal({ err }, 'listen failed');
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('bootstrap failed', err);
  process.exit(1);
});
