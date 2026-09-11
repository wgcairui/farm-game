/**
 * Main business DB — MikroORM configuration.
 *
 * Per ADR-0003 D30: this is the only ORM connection used by gameplay code
 * (HTTP routes and — eventually — Colyseus rooms in G2). The Colyseus/admin
 * subsystem has its own connection (`adminDbUrl`) and must not be wired
 * here.
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
    entities: [PlayerEntity, AuthIdentityEntity, PlotEntity, OperationReceiptEntity],
    debug: process.env.NODE_ENV !== 'production',
  });
}