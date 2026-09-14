/**
 * Stage B integration test — admin schema + entities.
 *
 * Verifies that:
 *  - 0003-admin-schema migration applies cleanly (creates `admin` schema +
 *    `admin.admin_users` + `admin.admin_audit_log` tables with the
 *    expected columns and indices).
 *  - `AdminUserEntity` + `AdminAuditLogEntity` round-trip through MikroORM
 *    using the same connection as the business entities (ADR-0006 D44).
 *  - Cross-schema referential integrity works: deleting a user with audit
 *    history fails (RESTRICT); deleting one without audit history succeeds.
 *
 * Skipped automatically when MAIN_DB_URL is not reachable (same pattern
 * as farm-flow.test.ts); process.exitCode = 1 on missing PG so a missing
 * container cannot be mistaken for a green run.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import { buildMainDbOptions } from '../../src/db/mikro-orm.config.js';
import { applyPendingMigrations } from '../../src/db/migrator.js';
import { AdminUserEntity } from '../../src/db/entities/admin/AdminUser.js';
import { AdminAuditLogEntity } from '../../src/db/entities/admin/AdminAuditLog.js';

const dbUrl = process.env.MAIN_DB_URL ?? process.env.TEST_DB_URL ?? 'postgres://farm:farm@127.0.0.1:5432/farm_game_test';

let orm: MikroORM | null = null;
let reachable = false;

async function ping(): Promise<boolean> {
  const c = new Client({ connectionString: dbUrl });
  try {
    await c.connect();
    await c.query('SELECT 1');
    await c.end();
    return true;
  } catch {
    try { await c.end(); } catch { /* ignore */ }
    return false;
  }
}

before(async () => {
  reachable = await ping();
  if (!reachable) {
    // eslint-disable-next-line no-console
    console.error(`[admin-schema integration] FAIL — PostgreSQL not reachable at ${dbUrl}. Start with \`pnpm db:up\`.`);
    process.exitCode = 1;
    return;
  }
  // Ensure 0003 is applied (idempotent — no-op if already migrated).
  await applyPendingMigrations(dbUrl);
  orm = await MikroORM.init(buildMainDbOptions(dbUrl));
});

after(async () => {
  if (orm) {
    await orm.close(true);
    orm = null;
  }
});

beforeEach(async () => {
  if (!reachable || !orm) return;
  // Truncate audit first because it REFERENCES admin_users; RESTART IDENTITY
  // keeps ids predictable across tests.
  const em = orm.em.fork();
  await em.execute('TRUNCATE TABLE admin.admin_audit_log, admin.admin_users RESTART IDENTITY CASCADE');
  em.clear();
});

test('migration: admin schema + tables exist with expected columns', async (t) => {
  if (!reachable || !orm) return t.skip();
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  try {
    const schemaRes = await c.query<{ schema_name: string }>(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'admin'",
    );
    assert.equal(schemaRes.rows.length, 1, 'admin schema should exist');

    const usersRes = await c.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'admin' AND table_name = 'admin_users'
        ORDER BY ordinal_position`,
    );
    const userCols = new Map(usersRes.rows.map((r) => [r.column_name, r.data_type]));
    assert.equal(userCols.get('id'), 'bigint');
    assert.equal(userCols.get('username'), 'character varying');
    assert.equal(userCols.get('password_hash'), 'text');
    assert.equal(userCols.get('role'), 'character varying');
    assert.ok(userCols.get('created_at'), 'created_at should exist');
    assert.ok(userCols.get('last_login_at'), 'last_login_at should exist');
    assert.ok(userCols.get('disabled_at'), 'disabled_at should exist');

    const auditRes = await c.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'admin' AND table_name = 'admin_audit_log'
        ORDER BY ordinal_position`,
    );
    const auditCols = new Set(auditRes.rows.map((r) => r.column_name));
    for (const col of ['id', 'admin_user_id', 'action', 'target_player_id', 'payload', 'ip', 'user_agent', 'created_at']) {
      assert.ok(auditCols.has(col), `admin_audit_log.${col} should exist`);
    }
  } finally {
    await c.end();
  }
});

test('round-trip: insert + read AdminUser', async (t) => {
  if (!reachable || !orm) return t.skip();
  const em = orm.em.fork();
  const user = em.create(AdminUserEntity, {
    username: 'tester',
    passwordHash: 'argon2id$placeholder',
    role: 'operator',
  });
  await em.flush();

  const fetched = await em.findOne(AdminUserEntity, { username: 'tester' });
  assert.ok(fetched, 'admin user should be returned');
  assert.equal(fetched.username, 'tester');
  assert.equal(fetched.role, 'operator');
  assert.equal(fetched.passwordHash, 'argon2id$placeholder');
  assert.ok(fetched.id > 0n, 'id should be assigned by BIGSERIAL');
  assert.ok(fetched.createdAt instanceof Date, 'createdAt should be a Date');
  assert.equal(fetched.lastLoginAt, null);
  assert.equal(fetched.disabledAt, null);
});

test('round-trip: insert AdminAuditLog referencing an admin user', async (t) => {
  if (!reachable || !orm) return t.skip();
  const em = orm.em.fork();
  const user = em.create(AdminUserEntity, {
    username: 'audit-actor',
    passwordHash: 'x',
    role: 'admin',
  });
  // Flush the user first so `user.id` is assigned by BIGSERIAL; without
  // this the audit's required `adminUserId` is `undefined` at validation
  // time and MikroORM rejects the create before the Unit of Work can
  // assign the parent's id.
  await em.flush();

  const audit = em.create(AdminAuditLogEntity, {
    adminUserId: user.id,
    action: 'auth.login',
    targetPlayerId: null,
    payload: { ip: '127.0.0.1' },
    ip: '127.0.0.1',
    userAgent: 'curl/8',
  });
  await em.flush();

  const fetched = await em.findOne(AdminAuditLogEntity, { id: audit.id });
  assert.ok(fetched, 'audit row should be returned');
  assert.equal(fetched.adminUserId, user.id);
  assert.equal(fetched.action, 'auth.login');
  assert.deepEqual(fetched.payload, { ip: '127.0.0.1' });
});

test('integrity: admin_users.username is UNIQUE', async (t) => {
  if (!reachable || !orm) return t.skip();
  const em = orm.em.fork();
  em.create(AdminUserEntity, { username: 'dup', passwordHash: 'x', role: 'operator' });
  await em.flush();
  em.clear();

  const em2 = orm.em.fork();
  em2.create(AdminUserEntity, { username: 'dup', passwordHash: 'y', role: 'operator' });
  await assert.rejects(em2.flush(), /duplicate key value|unique constraint/i);
});

test('integrity: deleting an admin user with audit history is blocked (RESTRICT)', async (t) => {
  if (!reachable || !orm) return t.skip();
  const em = orm.em.fork();
  const user = em.create(AdminUserEntity, { username: 'with-history', passwordHash: 'x', role: 'operator' });
  await em.flush();   // assign user.id so the audit can reference it
  em.create(AdminAuditLogEntity, { adminUserId: user.id, action: 'auth.login' });
  await em.flush();
  em.clear();

  const em2 = orm.em.fork();
  const fetched = await em2.findOne(AdminUserEntity, { username: 'with-history' });
  assert.ok(fetched);
  em2.remove(fetched);
  await assert.rejects(em2.flush(), /foreign key|violates/i);
});

test('integrity: deleting an admin user without audit history succeeds', async (t) => {
  if (!reachable || !orm) return t.skip();
  const em = orm.em.fork();
  const user = em.create(AdminUserEntity, { username: 'no-history', passwordHash: 'x', role: 'operator' });
  await em.flush();
  em.clear();

  const em2 = orm.em.fork();
  const fetched = await em2.findOne(AdminUserEntity, { username: 'no-history' });
  assert.ok(fetched);
  em2.remove(fetched);
  await em2.flush();   // should NOT throw

  const stillThere = await em2.findOne(AdminUserEntity, { username: 'no-history' });
  assert.equal(stillThere, null);
});
