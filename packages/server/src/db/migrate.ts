/**
 * Migration runner CLI — thin wrapper around `src/db/migrator.ts`.
 *
 * Usage:
 *   node --import tsx src/db/migrate.ts up
 *   node --import tsx src/db/migrate.ts down
 *
 * The server bootstrap (`src/index.ts`) calls `applyPendingMigrations()`
 * directly so a freshly booted server applies pending migrations on
 * startup — this CLI is the manual entry point for ops.
 *
 * Per ADR-0003 D30: requires MAIN_DB_URL or TEST_DB_URL to be set.
 */

import { applyPendingMigrations, rollbackLastMigration } from './migrator.js';

async function main(): Promise<number> {
  const cmd = (process.argv[2] ?? 'up').toLowerCase();
  const dbUrl = process.env.MAIN_DB_URL ?? process.env.TEST_DB_URL;
  if (!dbUrl) {
    // eslint-disable-next-line no-console
    console.error('MAIN_DB_URL (or TEST_DB_URL) is required.');
    return 2;
  }
  try {
    if (cmd === 'up') {
      const { applied, skipped } = await applyPendingMigrations(dbUrl);
      // eslint-disable-next-line no-console
      console.log(`applied: ${applied.length === 0 ? 'none (schema up to date)' : applied.join(', ')}`);
      // eslint-disable-next-line no-console
      console.log(`skipped: ${skipped.length === 0 ? 'none' : skipped.join(', ')}`);
      return 0;
    }
    if (cmd === 'down') {
      const name = await rollbackLastMigration(dbUrl);
      // eslint-disable-next-line no-console
      console.log(name ? `rolled back ${name}` : 'nothing to roll back');
      return 0;
    }
    // eslint-disable-next-line no-console
    console.error(`unknown subcommand: ${cmd}`);
    return 2;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('migrator failed', err);
    return 1;
  }
}

main().then((code) => process.exit(code));