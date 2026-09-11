/**
 * Security baseline tests for Phase 2 G0 (ADR-0001 §3/§4/§6).
 *
 * Covers:
 *  - Protocol major mismatch → HTTP 426 + PROTOCOL_VERSION_MISMATCH
 *  - Expired JWT → 401 + 1102 TOKEN_EXPIRED
 *  - Tampered JWT → 401 + 1101 INVALID_TOKEN
 *  - ConfigError in production when secrets equal defaults
 *  - ConfigError in production when ENABLE_MOCK_AUTH=1
 *  - AuthIdentity mapping in JWT (identities snapshot survives sign+verify)
 *  - Token cannot be replayed after binding identity to another player
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { ConfigError, loadConfig } from '../src/config.js';
import { ensurePlayer, InMemoryPlayerRepo } from '../src/auth/repo.js';
import { AuthProvider } from '@farm-game/shared';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let baseUrl: string;

before(async () => {
  process.env.NODE_ENV = 'test';
  const config = loadConfig({
    port: 0,
    jwtSecret: 'test-secret',
    jwtTtlSec: 1, // 1-second TTL so the expired-token test is fast
    enableAdmin: false,
    enableMockAuth: true,
  });
  app = await buildApp({ config });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`;
  else throw new Error('no address');
});

after(async () => { await app.close(); });

async function loginWeChat(code: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/wechat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; data: { token: string } };
  assert.equal(body.ok, true);
  return body.data.token;
}

test('Protocol major mismatch → 426 + PROTOCOL_VERSION_MISMATCH', async () => {
  const res = await fetch(`${baseUrl}/crop/configs`, {
    headers: { 'x-protocol-version': '99.0.0' },
  });
  assert.equal(res.status, 426);
  const body = (await res.json()) as { ok: boolean; code: number };
  assert.equal(body.ok, false);
  assert.equal(body.code, 1200);
});

test('Protocol same major → passes through to handler', async () => {
  const res = await fetch(`${baseUrl}/crop/configs`, {
    headers: { 'x-protocol-version': '1.0.0' },
  });
  assert.equal(res.status, 200);
});

test('Protocol header absent → passes through (backwards-compat with Phase 1)', async () => {
  const res = await fetch(`${baseUrl}/crop/configs`);
  assert.equal(res.status, 200);
});

test('Malformed protocol header → passes through (not 426)', async () => {
  const res = await fetch(`${baseUrl}/crop/configs`, {
    headers: { 'x-protocol-version': 'not-a-version' },
  });
  assert.equal(res.status, 200);
});

test('Expired JWT → 401 + 1102 TOKEN_EXPIRED', async () => {
  const token = await loginWeChat('mock_expiry_test');
  await new Promise((r) => setTimeout(r, 1500)); // ttl=1s + buffer
  const res = await fetch(`${baseUrl}/player/info`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: boolean; code: number };
  assert.equal(body.ok, false);
  assert.equal(body.code, 1102);
});

test('Tampered JWT signature → 401 + 1101 INVALID_TOKEN', async () => {
  const token = await loginWeChat('mock_tamper_test');
  const tampered = token.slice(0, -4) + 'AAAA';
  const res = await fetch(`${baseUrl}/player/info`, {
    headers: { authorization: `Bearer ${tampered}` },
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: boolean; code: number };
  assert.equal(body.ok, false);
  assert.equal(body.code, 1101);
});

test('AuthIdentity snapshot in JWT claims carries only the summary (no subject)', async () => {
  const token = await loginWeChat('mock_identities_test');
  const res = await fetch(`${baseUrl}/player/info`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    data: { playerId: string; identities: Array<Record<string, unknown>> };
  };
  assert.equal(body.ok, true);
  assert.equal(body.data.identities.length, 1);
  assert.equal(body.data.identities[0]?.provider, AuthProvider.WeChatMini);
  // Public summary intentionally strips the subject (ADR-0001 §1; H1).
  assert.equal('subject' in body.data.identities[0]!, false);
});

test('ConfigError in production when JWT_SECRET equals default', () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'dev-secret-change-me';
  process.env.JWT_SECRET_ADMIN = 'dev-admin-secret-change-me';
  process.env.SESSION_SECRET = 'dev-session-change-me';
  delete process.env.ENABLE_MOCK_AUTH;
  assert.throws(() => loadConfig(), /JWT_SECRET must be set explicitly/);
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = 'test';
});

test('ConfigError in production when ENABLE_MOCK_AUTH=1', () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'real-secret';
  process.env.JWT_SECRET_ADMIN = 'real-admin';
  process.env.SESSION_SECRET = 'real-session';
  process.env.ENABLE_MOCK_AUTH = '1';
  assert.throws(() => loadConfig(), /ENABLE_MOCK_AUTH=1 is forbidden in production/);
  delete process.env.ENABLE_MOCK_AUTH;
  delete process.env.JWT_SECRET;
  delete process.env.JWT_SECRET_ADMIN;
  delete process.env.SESSION_SECRET;
  process.env.NODE_ENV = 'test';
});

test('Identity rebinding to another player is rejected (IDENTITY_ALREADY_BOUND)', async () => {
  // Player A logs in with mock_code_A
  const tokenA = await loginWeChat('mock_rebind_A');
  const meA = await fetch(`${baseUrl}/player/info`, { headers: { authorization: `Bearer ${tokenA}` } });
  const playerA = ((await meA.json()) as { data: { playerId: string } }).data.playerId;

  // Player B logs in with a DIFFERENT code → different subject
  const tokenB = await loginWeChat('mock_rebind_B');

  // Player B tries to bind the same WeChat identity as Player A
  const bind = await fetch(`${baseUrl}/auth/bind`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ provider: AuthProvider.WeChatMini, token: 'mock_rebind_A' }),
  });
  assert.equal(bind.status, 409);
  const body = (await bind.json()) as { ok: boolean; code: number };
  assert.equal(body.code, 2003);

  // Player A still resolves to its own playerId (not replaced)
  const meAgain = await fetch(`${baseUrl}/player/info`, { headers: { authorization: `Bearer ${tokenA}` } });
  const playerAgain = ((await meAgain.json()) as { data: { playerId: string } }).data.playerId;
  assert.equal(playerAgain, playerA);
});

test('PlayerSave.identities never leaks provider subjects (H1)', async () => {
  // After login, /player/info identities must not contain `subject`.
  const token = await loginWeChat('mock_no_leak_test');
  const me = await fetch(`${baseUrl}/player/info`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await me.json()) as {
    data: { identities: Array<Record<string, unknown>> };
  };
  for (const id of body.data.identities) {
    assert.equal('subject' in id, false, 'public identity must not carry a subject');
  }
});

test('GET /auth/identities/me returns the owning subjects (H1 escape hatch)', async () => {
  const token = await loginWeChat('mock_subject_visible_to_owner');
  const me = await fetch(`${baseUrl}/auth/identities/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(me.status, 200);
  const body = (await me.json()) as {
    ok: boolean;
    data: { identities: Array<{ provider: string; subject: string }> };
  };
  assert.equal(body.ok, true);
  assert.equal(body.data.identities.length, 1);
  assert.equal(body.data.identities[0]?.provider, 'weChatMini');
  assert.equal(body.data.identities[0]?.subject, 'mock_subject_visible_to_owner');
});

test('Identity-index cleanup: removeIdentity lets the same identity be re-bound', async () => {
  // Direct repo test — there's no /auth/unbind route in G0, so we exercise
  // the index behaviour via the repo's own surface.
  const repo = new InMemoryPlayerRepo();
  const a = await ensurePlayer(repo, { provider: AuthProvider.IOS, subject: 'apple_xyz' });
  const b = await ensurePlayer(repo, { provider: AuthProvider.Android, subject: 'goog_abc' });
  assert.notEqual(a.playerId, b.playerId);

  // Remove the iOS identity from player A.
  await repo.removeIdentity(a.playerId, { provider: AuthProvider.IOS, subject: 'apple_xyz' });
  // Player A no longer resolves by iOS identity.
  const resolveA = await repo.findByIdentity({ provider: AuthProvider.IOS, subject: 'apple_xyz' });
  assert.equal(resolveA, null);

  // Player B can now bind that same iOS identity (would have thrown
  // IdentityAlreadyBoundError before the removal).
  await repo.addIdentity(b.playerId, { provider: AuthProvider.IOS, subject: 'apple_xyz', boundAt: Date.now() });
  const resolveAgain = await repo.findByIdentity({ provider: AuthProvider.IOS, subject: 'apple_xyz' });
  assert.equal(resolveAgain?.playerId, b.playerId);
});

test('ConfigError when JWT_TTL_SEC is non-numeric or non-positive (H6)', () => {
  process.env.NODE_ENV = 'test';
  for (const bad of ['abc', '-1', '0']) {
    process.env.JWT_TTL_SEC = bad;
    assert.throws(() => loadConfig(), /JWT_TTL_SEC must be a positive integer/, `ttl=${bad}`);
  }
  delete process.env.JWT_TTL_SEC;
});

test('ensurePlayer is idempotent on (provider, subject)', async () => {
  const repo = new InMemoryPlayerRepo();
  const identity = { provider: AuthProvider.IOS, subject: 'apple_subject_1' };
  const a = await ensurePlayer(repo, identity);
  const b = await ensurePlayer(repo, identity);
  assert.equal(a.playerId, b.playerId);
  assert.equal(await repo.size(), 1);
});
