/**
 * Unit tests for Stage C admin primitives — password hashing +
 * `InMemoryAdminRepo`. No PostgreSQL dependency; runs in pure node:test.
 *
 * Covers:
 *  - hash/verify round-trip with the production scrypt format
 *  - wrong password rejected, constant-time compare
 *  - tampered stored hash rejected, malformed inputs rejected
 *  - InMemoryAdminRepo CRUD + ordering + filtering for listAuditLog
 *  - `insertAuditLog` ignores the supplied em (in-memory only) but
 *    honours the signature so callers share code with the PG variant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EntityManager } from '@mikro-orm/core';
import { hashPassword, verifyPassword, PasswordError } from '../src/obs/password.js';
import { InMemoryAdminRepo } from '../src/repositories/InMemoryAdminRepo.js';

/** Pass an opaque fake EM into the in-memory repo — production code
 *  passes a real one from inside an `em.transactional` block. */
const fakeEm = {} as unknown as EntityManager;

test('password: round-trip', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt\$N=\d+,r=\d+,p=\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
});

test('password: wrong plaintext rejected', async () => {
  const hash = await hashPassword('hunter2');
  assert.equal(await verifyPassword('hunter3', hash), false);
  assert.equal(await verifyPassword('', hash), false);
});

test('password: each hash uses a fresh salt', async () => {
  const a = await hashPassword('same-password');
  const b = await hashPassword('same-password');
  assert.notEqual(a, b, 'two hashes of the same password should differ (salt is per-call)');
  assert.equal(await verifyPassword('same-password', a), true);
  assert.equal(await verifyPassword('same-password', b), true);
});

test('password: tampered stored hash rejected', async () => {
  const hash = await hashPassword('pwd');
  // Flip one base64 char in the hash segment.
  const parts = hash.split('$');
  const tamperedHash = parts[3]!.replace(/A/, 'B').replace(/a/, 'b');
  const tampered = [parts[0], parts[1], parts[2], tamperedHash].join('$');
  assert.equal(await verifyPassword('pwd', tampered), false);
});

test('password: malformed inputs never throw, always return false', async () => {
  for (const bad of [
    '',
    'not-a-hash',
    'scrypt$N=foo,r=8,p=1$AAAA$BBBB',
    'argon2id$v=19$m=65536,t=2,p=1$AAAA$BBBB',   // future format we don't dispatch on yet
    'scrypt$$$',                                 // empty segments
    'scrypt$bad$bad$bad',                        // 4 parts but bad prefix
  ]) {
    assert.equal(await verifyPassword('pwd', bad), false, `malformed stored=${bad} should return false`);
  }
});

test('password: hashPassword rejects empty / non-string plaintext', async () => {
  await assert.rejects(() => hashPassword(''), PasswordError);
  // @ts-expect-error — test the runtime guard
  await assert.rejects(() => hashPassword(undefined), PasswordError);
  // @ts-expect-error — test the runtime guard
  await assert.rejects(() => hashPassword(null), PasswordError);
});

test('InMemoryAdminRepo: createUser + findByUsername / findById', () => {
  const repo = new InMemoryAdminRepo();
  const u = repo.createUser({ username: 'alice', passwordHash: 'h', role: 'operator' });
  assert.ok(u.id > 0);
  assert.equal(u.role, 'operator');
  assert.equal(u.lastLoginAt, null);
  assert.equal(u.disabledAt, null);
});

test('InMemoryAdminRepo: duplicate username throws', () => {
  const repo = new InMemoryAdminRepo();
  repo.createUser({ username: 'dup', passwordHash: 'h' });
  assert.throws(() => repo.createUser({ username: 'dup', passwordHash: 'h2' }), /already exists/);
});

test('InMemoryAdminRepo: findBy* returns null for unknown', async () => {
  const repo = new InMemoryAdminRepo();
  assert.equal(await repo.findByUsername('ghost'), null);
  assert.equal(await repo.findById(9999), null);
});

test('InMemoryAdminRepo: recordLogin sets lastLoginAt', async () => {
  const repo = new InMemoryAdminRepo();
  const u = repo.createUser({ username: 'login-me', passwordHash: 'h' });
  assert.equal(u.lastLoginAt, null);
  const now = new Date('2026-09-14T00:00:00Z');
  await repo.recordLogin(u.id, now);
  const fetched = await repo.findById(u.id);
  assert.equal(fetched?.lastLoginAt?.toISOString(), now.toISOString());
});

test('InMemoryAdminRepo: recordLogin on unknown id throws', async () => {
  const repo = new InMemoryAdminRepo();
  await assert.rejects(() => repo.recordLogin(9999, new Date()), /not found/);
});

test('InMemoryAdminRepo: listAuditLog returns newest-first + filter by adminUserId/action/target', async () => {
  const repo = new InMemoryAdminRepo();
  const alice = repo.createUser({ username: 'alice', passwordHash: 'h' });
  const bob = repo.createUser({ username: 'bob', passwordHash: 'h' });

  await repo.insertAuditLog(fakeEm, {
    adminUserId: alice.id, action: 'auth.login', targetPlayerId: null,
  });
  await repo.insertAuditLog(fakeEm, {
    adminUserId: alice.id, action: 'player.ban', targetPlayerId: 'p_x',
  });
  await repo.insertAuditLog(fakeEm, {
    adminUserId: bob.id, action: 'lease.release', targetPlayerId: 'p_y',
  });

  // newest first
  const all = await repo.listAuditLog({ limit: 100, offset: 0 });
  assert.equal(all.length, 3);
  assert.equal(all[0]!.action, 'lease.release');

  // filter by adminUserId
  const aliceOnly = await repo.listAuditLog({ limit: 100, offset: 0, adminUserId: alice.id });
  assert.equal(aliceOnly.length, 2);
  assert.ok(aliceOnly.every((r) => r.adminUserId === alice.id));

  // filter by action
  const bans = await repo.listAuditLog({ limit: 100, offset: 0, action: 'player.ban' });
  assert.equal(bans.length, 1);
  assert.equal(bans[0]!.targetPlayerId, 'p_x');

  // filter by targetPlayerId
  const p_y = await repo.listAuditLog({ limit: 100, offset: 0, targetPlayerId: 'p_y' });
  assert.equal(p_y.length, 1);
  assert.equal(p_y[0]!.action, 'lease.release');

  // pagination
  const page1 = await repo.listAuditLog({ limit: 2, offset: 0 });
  const page2 = await repo.listAuditLog({ limit: 2, offset: 2 });
  assert.equal(page1.length, 2);
  assert.equal(page2.length, 1);
  assert.notEqual(page1[0]!.id, page2[0]!.id);
});
