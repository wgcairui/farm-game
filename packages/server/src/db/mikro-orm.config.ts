/**
 * Main business DB — MikroORM configuration.
 *
 * Per ADR-0003 D30 + ADR-0006 D44: this is the only ORM connection used by
 * the server. Business tables live in the `public` schema; admin tables
 * (admin_users / admin_audit_log) live in the `admin` schema of the same
 * database. Both schemas share one MikroORM instance so admin writes that
 * mutate business rows + audit_log rows commit atomically (D49).
 *
 * The migrator discovers migrations via the relative path passed to
 * `migrations.path`; the runtime barrel in `./migrations/index.ts` exports
 * each migration class.
 */

import { defineConfig, type Options } from '@mikro-orm/postgresql';
import { PlayerEntity } from './entities/Player.js';
import { AuthIdentityEntity } from './entities/AuthIdentity.js';
import { PlotEntity } from './entities/Plot.js';
import { OperationReceiptEntity } from './entities/OperationReceipt.js';
import { AdminUserEntity } from './entities/admin/AdminUser.js';
import { AdminAuditLogEntity } from './entities/admin/AdminAuditLog.js';

export function buildMainDbOptions(dbUrl: string): Options {
  // Migrations are NOT driven by MikroORM's Migrator: it pulls `umzug →
  // emittery@0.13` whose pnpm install is missing `maps.js`. Instead, the
  // server bootstrap (`src/index.ts`) and the CLI runner
  // (`src/db/migrate.ts`) call `applyPendingMigrations()` from
  // `./migrator.ts` directly, which reads `./sql/*.up.sql`. Entity
  // discovery still works against the existing tables.
  return defineConfig({
    clientUrl: dbUrl,
    pool: { min: 2, max: 15 },
    entities: [
      PlayerEntity,
      AuthIdentityEntity,
      PlotEntity,
      OperationReceiptEntity,
      AdminUserEntity,
      AdminAuditLogEntity,
    ],
    debug: process.env.NODE_ENV !== 'production',
  });
}