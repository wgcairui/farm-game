/**
 * Migration library — applies the SQL files in `./sql/` to a PostgreSQL
 * database using the `pg` driver directly. Used by both the CLI runner
 * (`src/db/migrate.ts`) and the server bootstrap (`src/index.ts`) so a
 * freshly booted server applies pending migrations on startup.
 *
 * Why not MikroORM's Migrator:
 *   MikroORM 6 ships with Umzug + emittery, but the shipped
 *   emittery@0.13 dependency is missing its `maps.js` shim in our pnpm
 *   lockfile, causing `Cannot find module './maps.js'`. We don't need
 *   Umzug's per-migration history table for G1 — the schema is small
 *   (4 tables) and there is exactly one migration file. Tracking applied
 *   migrations via a `_schema_migrations` row lets us add more in the
 *   future.
 *
 * Per ADR-0003 D30: requires a real PostgreSQL URL; the bootstrap path
 * refuses to fall back to in-memory mode when the URL is provided.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = new URL('./sql/', import.meta.url).pathname;

export const APPLIED_TRACKING_DDL = `
  CREATE TABLE IF NOT EXISTS _schema_migrations (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

export interface SqlMigration {
  name: string;
  up: string;
  down: string;
}

export function loadMigrations(): SqlMigration[] {
  const dir = MIGRATIONS_DIR;
  const files = readdirSync(dir).filter((f) => f.endsWith('.up.sql')).sort();
  return files.map((upFile) => {
    const name = upFile.replace(/\.up\.sql$/, '');
    const downFile = upFile.replace(/\.up\.sql$/, '.down.sql');
    return {
      name,
      up: readFileSync(join(dir, upFile), 'utf8'),
      down: readFileSync(join(dir, downFile), 'utf8'),
    };
  });
}

export async function ensureTrackingTable(client: Client): Promise<void> {
  await client.query(APPLIED_TRACKING_DDL);
}

export async function appliedMigrations(client: Client): Promise<Set<string>> {
  const res = await client.query<{ name: string }>(
    'SELECT name FROM _schema_migrations ORDER BY id',
  );
  return new Set(res.rows.map((r) => r.name));
}

async function applyOne(client: Client, m: SqlMigration): Promise<void> {
  await client.query(m.up);
  await client.query(
    'INSERT INTO _schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
    [m.name],
  );
}

async function rollbackOne(client: Client, m: SqlMigration): Promise<void> {
  await client.query(m.down);
  await client.query('DELETE FROM _schema_migrations WHERE name = $1', [m.name]);
}

export interface ApplyResult {
  applied: string[];
  skipped: string[];
}

/**
 * Apply pending migrations against the given PostgreSQL URL.
 *
 * Idempotent — running it against an already-migrated database is a no-op.
 * Throws on the first migration that fails; subsequent migrations are NOT
 * attempted (the caller may re-run after fixing the cause).
 */
export async function applyPendingMigrations(dbUrl: string): Promise<ApplyResult> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await ensureTrackingTable(client);
    const migrations = loadMigrations();
    const done = await appliedMigrations(client);
    const applied: string[] = [];
    const skipped: string[] = [];
    for (const m of migrations) {
      if (done.has(m.name)) {
        skipped.push(m.name);
        continue;
      }
      await applyOne(client, m);
      applied.push(m.name);
    }
    return { applied, skipped };
  } finally {
    await client.end();
  }
}

/** Roll back the latest applied migration. Returns the rolled-back name, or null if none. */
export async function rollbackLastMigration(dbUrl: string): Promise<string | null> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await ensureTrackingTable(client);
    const done = await appliedMigrations(client);
    const migrations = loadMigrations();
    for (let i = migrations.length - 1; i >= 0; i -= 1) {
      const m = migrations[i]!;
      if (done.has(m.name)) {
        await rollbackOne(client, m);
        return m.name;
      }
    }
    return null;
  } finally {
    await client.end();
  }
}