/**
 * Stage D integration test — `/admin-ops/*` routes against real PG.
 *
 * Verifies the headline Stage D invariants:
 *  1. auth/login validates credentials and returns a JWT.
 *  2. Authenticated admin can hit /admin-ops/healthz and other read routes.
 *  3. POST /admin-ops/players/:playerId/ban updates players.banned_at AND
 *     writes an admin.admin_audit_log row (D49 atomic).
 *  4. Cross-transaction rollback: a ban against a non-existent player
 *     throws inside withAdminAudit → neither the business UPDATE nor
 *     the audit INSERT persists (headline Stage D invariant).
 *  5. POST /admin-ops/leases/:ownerId/release expires a live lease
 *     AND writes an audit row.
 *  6. GET /admin-ops/audit-log returns the recorded entries newest-first.
 *
 * Skipped automatically when MAIN_DB_URL is not reachable.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { Client } from 'pg';

import { buildApp } from '../../src/app.js';
import { buildMainDbOptions } from '../../src/db/mikro-orm.config.js';
import { applyPendingMigrations } from '../../src/db/migrator.js';
import { loadConfig } from '../../src/config.js';
import { AdminUser } from '../../src/db/entities/admin/AdminUser.js';
import { AdminAuditLogEntity } from '../../src/db/entities/admin/AdminAuditLog.js';
import { Player } from '../../src/db/entities/Player.js';
import { AuthIdentity } from '../../src/db/entities/AuthIdentity.js';
import { MikroORMAdminRepo } from '../../src/repositories/MikroORMAdminRepo.js';
import { RoomLeaseRepo } from '../../src/repositories/room-lease-repo.js';
import { hashPassword } from '../../src/obs/password.js';

const dbUrl = process.env.MAIN_DB_URL ?? process.env.TEST_DB_URL ?? 'postgres://farm:farm@127.0.0.1:5432/farm_game_test';

let orm: MikroORM | null = null;
let leasePool: Pool | null = null;
let leases: RoomLeaseRepo | null = null;
let app: FastifyInstance | null = null;
let baseUrl = '';
let adminId = 0;
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
    console.error('[admin-ops integration] FAIL — PG not reachable at ' + dbUrl);
    process.exitCode = 1;
    return;
  }

  await applyPendingMigrations(dbUrl);
  orm = await MikroORM.init(buildMainDbOptions(dbUrl));
  leasePool = new Pool({ connectionString: dbUrl, max: 4 });
  leases = new RoomLeaseRepo(leasePool, 15000);

  const config = loadConfig({
    env: 'test',
    jwtSecret: 'test-business-secret',
    jwtSecretAdmin: 'test-admin-secret',
    jwtTtlSecAdmin: 7200,
    enableAdmin: true,
  });

  app = await buildApp({
    config,
    orm,
    adminRepo: new MikroORMAdminRepo(orm),
    leases,
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('server did not return an address');
  baseUrl = 'http://127.0.0.1:' + addr.port;
});

after(async () => {
  if (app) {
    await app.close();
    app = null;
  }
  if (leasePool) {
    await leasePool.end();
    leasePool = null;
  }
  if (orm) {
    await orm.close(true);
    orm = null;
  }
});

beforeEach(async () => {
  if (!reachable || !orm) return;
  const em = orm.em.fork();
  await em.execute('TRUNCATE TABLE admin.admin_audit_log, admin.admin_users RESTART IDENTITY CASCADE');
  await em.execute('TRUNCATE TABLE operation_receipts, plots, auth_identities, players, farm_room_leases RESTART IDENTITY CASCADE');
  em.clear();

  const hash = await hashPassword('admin-password');
  const admin = em.create(AdminUser, {
    username: 'admin-1',
    passwordHash: hash,
    role: 'admin',
  });
  await em.flush();
  adminId = typeof admin.id === 'bigint' ? Number(admin.id) : (admin.id as number);
});

async function login(): Promise<string> {
  const res = await fetch(baseUrl + '/admin-ops/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin-1', password: 'admin-password' }),
  });
  if (res.status !== 200) {
    const txt = await res.text();
    assert.fail('login should succeed, got ' + res.status + ': ' + txt);
  }
  const body = (await res.json()) as { ok: true; data: { token: string } };
  return body.data.token;
}

async function seedPlayer(opts: { playerId?: string } = {}): Promise<string> {
  if (!orm) throw new Error('seedPlayer before orm ready');
  const playerId = opts.playerId ?? randomUUID();
  // Explicit transactional: em.flush() alone is not enough under
  // MikroORM's implicitTransactions default — the route's UPDATE in a
  // separate transaction would see no row. Verified empirically.
  await orm.em.fork().transactional(async (em) => {
    em.create(Player, {
      playerId,
      nickname: 'test-nick',
      avatarUrl: null,
      gold: 100,
      gems: 0,
      level: 1,
      exp: 0,
      musicVolume: 0.7,
      sfxVolume: 1.0,
      notificationsEnabled: true,
      revision: 0,
      bannedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await em.flush();
    em.create(AuthIdentity, {
      playerId,
      provider: 'wechat',
      tenantId: '',
      subject: 'mock-' + playerId,
      boundAt: new Date(),
    });
    await em.flush();
  });
  return playerId;
}

async function seedLease(ownerId: string): Promise<void> {
  if (!leasePool) throw new Error('seedLease before pool ready');
  const client = await leasePool.connect();
  try {
    await client.query(
      'INSERT INTO farm_room_leases (owner_id, room_id, instance_id, epoch, expires_at) VALUES ($1, $2, $3, 1, now() + interval \'1 hour\')',
      [ownerId, 'room-x', 'instance-y'],
    );
  } finally {
    client.release();
  }
}

test('integration preflight: ENABLE_ADMIN=1 mounts /admin-ops/* surface', async (t) => {
  if (!reachable) return t.skip();
  const res = await fetch(baseUrl + '/admin-ops/healthz');
  // Without token, /admin-ops/* should still respond (401), proving
  // surface is mounted (vs ENABLE_ADMIN=0 which would 404 on the URL).
  assert.equal(res.status, 401);
});

test('login: good credentials -> 200 + admin JWT', async (t) => {
  if (!reachable) return t.skip();
  const token = await login();
  assert.equal(typeof token, 'string');
  assert.ok(token.split('.').length === 3, 'JWT has 3 segments');
});

test('login: wrong password -> 401 NOT_AUTHENTICATED', async (t) => {
  if (!reachable) return t.skip();
  const res = await fetch(baseUrl + '/admin-ops/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin-1', password: 'WRONG' }),
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: false; code: number };
  assert.equal(body.code, 1100);
});

test('healthz: valid admin token -> 200 with adminUserId propagated', async (t) => {
  if (!reachable) return t.skip();
  const token = await login();
  const res = await fetch(baseUrl + '/admin-ops/healthz', {
    headers: { authorization: 'Bearer ' + token },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: true; data: { enabled: boolean; adminUserId: string } };
  assert.equal(body.data.enabled, true);
  assert.equal(body.data.adminUserId, String(adminId));
});

test('players list: paginated + bannedAt surfaced', async (t) => {
  if (!reachable) return t.skip();
  await seedPlayer({ playerId: 'p-list-1' });
  await seedPlayer({ playerId: 'p-list-2' });
  const token = await login();
  const res = await fetch(baseUrl + '/admin-ops/players?limit=10', {
    headers: { authorization: 'Bearer ' + token },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: true; data: { total: number; items: Array<{ playerId: string; bannedAt: string | null }> } };
  assert.equal(body.data.total, 2);
  for (const item of body.data.items) {
    assert.equal(item.bannedAt, null);
  }
});

test('D49 atomic: ban a real player -> players.banned_at + audit row both persist', async (t) => {
  if (!reachable) return t.skip();
  const playerId = await seedPlayer({ playerId: 'p-ban-me' });
  const token = await login();
  const res = await fetch(baseUrl + '/admin-ops/players/' + playerId + '/ban', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ reason: 'integration test ban' }),
  });
  if (res.status !== 200) {
    const txt = await res.text();
    assert.fail('ban should succeed, got ' + res.status + ': ' + txt);
  }
  const banBody = (await res.json()) as { ok: true; data: { playerId: string; bannedAt: string } };
  assert.equal(banBody.data.playerId, playerId);
  assert.ok(banBody.data.bannedAt);

  // 1. Business side: players.banned_at non-null
  const em = orm!.em.fork();
  const player = await em.findOne(Player, { playerId });
  assert.ok(player, 'player still exists');
  assert.ok(player!.bannedAt, 'bannedAt must be set');
  const bannedMs = player!.bannedAt instanceof Date
    ? player!.bannedAt.getTime()
    : new Date(player!.bannedAt as unknown as string).getTime();
  assert.ok(Number.isFinite(bannedMs) && bannedMs <= Date.now() + 1000, 'bannedAt is a past timestamp');

  // 2. Audit side: exactly one row with action='player.ban'
  const audits = await em.find(AdminAuditLogEntity, { action: 'player.ban', targetPlayerId: playerId });
  assert.equal(audits.length, 1);
  // adminUserId is bigint from BIGSERIAL; compare as bigint.
  assert.equal(audits[0]!.adminUserId, BigInt(adminId));
  assert.equal(audits[0]!.payload.reason, 'integration test ban');
});

test('D49 cross-transaction rollback: ban non-existent player -> 404 + NO audit row', async (t) => {
  if (!reachable) return t.skip();
  const token = await login();
  const res = await fetch(baseUrl + '/admin-ops/players/p-does-not-exist/ban', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ reason: 'phantom' }),
  });
  assert.equal(res.status, 404);
  // Critical: zero audit rows for this attempted ban. If this fails,
  // withAdminAudit is committing the audit BEFORE the business write
  // fails — which violates D49.
  const em = orm!.em.fork();
  const audits = await em.find(AdminAuditLogEntity, { action: 'player.ban', targetPlayerId: 'p-does-not-exist' });
  assert.equal(audits.length, 0, 'audit row must NOT be written when business write fails');
});

test('lease release: live lease -> expires_at < now + audit row written', async (t) => {
  if (!reachable) return t.skip();
  const playerId = await seedPlayer({ playerId: 'p-lease-release' });
  await seedLease(playerId);
  const token = await login();
  const res = await fetch(baseUrl + '/admin-ops/leases/' + playerId + '/release', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token },
  });
  assert.equal(res.status, 200);
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  try {
    const r = await c.query<{ expires_at: Date }>(
      'SELECT expires_at FROM farm_room_leases WHERE owner_id = $1',
      [playerId],
    );
    assert.equal(r.rows.length, 1);
    assert.ok(new Date(r.rows[0]!.expires_at).getTime() < Date.now(), 'lease must be expired');
  } finally {
    await c.end();
  }
  const em = orm!.em.fork();
  const audits = await em.find(AdminAuditLogEntity, { action: 'lease.release', targetPlayerId: playerId });
  assert.equal(audits.length, 1);
});

test('audit-log list: returns ban + lease.release entries in newest-first order', async (t) => {
  if (!reachable) return t.skip();
  const playerId = await seedPlayer({ playerId: 'p-audit-list' });
  await seedLease(playerId);
  const token = await login();
  await fetch(baseUrl + '/admin-ops/players/' + playerId + '/ban', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  await fetch(baseUrl + '/admin-ops/leases/' + playerId + '/release', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token },
  });
  const res = await fetch(baseUrl + '/admin-ops/audit-log?limit=10', {
    headers: { authorization: 'Bearer ' + token },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: true; data: { items: Array<{ action: string }> } };
  assert.equal(body.data.items.length, 2);
  // Newest first
  assert.equal(body.data.items[0]!.action, 'lease.release');
  assert.equal(body.data.items[1]!.action, 'player.ban');
});

test('processes.drain: returns 503 when publisher not wired', async (t) => {
  if (!reachable) return t.skip();
  const token = await login();
  const res = await fetch(baseUrl + '/admin-ops/processes/instance-x/drain', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token },
  });
  assert.equal(res.status, 503);
});
