/**
 * bootstrapDatabase — shared wiring for the two server entries (HTTP and WS).
 *
 * Both `src/index.ts` (Fastify) and `src/realtime/serve.ts` (Colyseus) need
 * the same database resources: applied migrations, an initialised MikroORM,
 * the player repo + transaction runner, and the farm room lease repo. This
 * module is the single owner of that lifecycle so the entries cannot drift
 * (per the G2 plan: "HTTP 与 WS 使用独立入口，共享领域服务与数据库配置").
 *
 * Migration mutual exclusion is handled inside `applyPendingMigrations`
 * (PostgreSQL advisory lock) so both entries can boot concurrently against
 * a fresh database.
 */

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { MikroORM } from '@mikro-orm/core';
import { buildMainDbOptions } from './db/mikro-orm.config.js';
import { applyPendingMigrations } from './db/migrator.js';
import { MikroORMPlayerRepo } from './repositories/MikroORMPlayerRepo.js';
import { RoomLeaseRepo } from './repositories/room-lease-repo.js';
import { makeMikroOrmTransactionRunner } from './repositories/transaction.js';
import { ConfigError, type ServerConfig } from './config.js';
import { logger } from './obs/logger.js';

export interface ServerBootstrap {
  config: ServerConfig;
  orm: MikroORM;
  dbRepo: MikroORMPlayerRepo;
  tx: ReturnType<typeof makeMikroOrmTransactionRunner>;
  leases: RoomLeaseRepo;
  /** Unique id of this process; pairs with the lease's instance_id for fencing. */
  instanceId: string;
  /** Release every DB resource this bootstrap owns. Idempotent. */
  close(): Promise<void>;
}

export async function bootstrapDatabase(config: ServerConfig): Promise<ServerBootstrap> {
  if (!config.mainDbUrl) {
    // Rooms and leases are meaningless without the authoritative store —
    // fail closed instead of silently booting in-memory (G2 plan).
    throw new ConfigError('MAIN_DB_URL is required for the WS entry (no in-memory realtime mode).');
  }

  const { applied, skipped } = await applyPendingMigrations(config.mainDbUrl);
  if (applied.length > 0) {
    logger.info({ applied }, 'applied pending migrations');
  } else {
    logger.info({ skippedCount: skipped.length }, 'database schema up to date');
  }

  const orm = await MikroORM.init(buildMainDbOptions(config.mainDbUrl));
  const tx = makeMikroOrmTransactionRunner(orm);
  const dbRepo = new MikroORMPlayerRepo(tx);

  // Small dedicated pool: lease statements are short single-row operations,
  // one per room lifecycle event (acquire/renew/release) plus the per-command
  // assertCurrent, which runs on the command's own MikroORM connection.
  const leasePool = new Pool({ connectionString: config.mainDbUrl, max: 4 });
  const leases = new RoomLeaseRepo(leasePool, config.leaseTtlMs);
  const instanceId = randomUUID();

  let closed = false;
  return {
    config,
    orm,
    dbRepo,
    tx,
    leases,
    instanceId,
    close: async () => {
      if (closed) return;
      closed = true;
      try {
        await leasePool.end();
      } catch (err) {
        logger.warn({ err }, 'lease pool close failed');
      }
      try {
        await orm.close(true);
      } catch (err) {
        logger.warn({ err }, 'ORM close failed');
      }
    },
  };
}
