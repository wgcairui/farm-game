/**
 * Bootstrap — single entry called by `node dist/index.js` or `tsx src/index.ts`.
 *
 * Per ADR-0003 D30: when `MAIN_DB_URL` is set, the server boots a
 * MikroORM-backed player repo and applies pending migrations on startup
 * (the migrator is idempotent — running it against an already-migrated DB
 * is a no-op). When `MAIN_DB_URL` is unset, the server falls back to the
 * in-memory repo used by Phase 1 tests so contributors can `pnpm dev`
 * without Docker.
 */

import { MikroORM } from '@mikro-orm/core';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { buildMainDbOptions } from './db/mikro-orm.config.js';
import { applyPendingMigrations } from './db/migrator.js';
import { MikroORMPlayerRepo } from './repositories/MikroORMPlayerRepo.js';
import { makeMikroOrmTransactionRunner } from './repositories/transaction.js';
import { logger } from './obs/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  let orm: MikroORM | undefined;
  let dbRepo: MikroORMPlayerRepo | undefined;

  if (config.mainDbUrl) {
    // Apply pending migrations FIRST (idempotent) so the schema exists before
    // MikroORM entity discovery tries to map tables. This replaces the broken
    // MikroORM Migrator path — the raw `pg` runner in db/migrator.ts handles
    // the SQL files in db/sql/.
    const { applied, skipped } = await applyPendingMigrations(config.mainDbUrl);
    if (applied.length > 0) {
      logger.info({ applied }, 'applied pending migrations');
    } else {
      logger.info({ skippedCount: skipped.length }, 'database schema up to date');
    }
    orm = await MikroORM.init(buildMainDbOptions(config.mainDbUrl));
    const tx = makeMikroOrmTransactionRunner(orm);
    dbRepo = new MikroORMPlayerRepo(tx);
  } else {
    logger.warn('MAIN_DB_URL is not set; booting with InMemoryPlayerRepo (development only)');
  }

  const app = await buildApp({ config, repo: dbRepo, orm });

  app.addHook('onClose', async () => {
    logger.info('server closing');
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