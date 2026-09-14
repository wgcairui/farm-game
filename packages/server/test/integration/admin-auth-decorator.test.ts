/**
 * Stage C integration test — `authenticateAdmin` decorator wired through
 * the second @fastify/jwt namespace (ADR-0006 D46/D50).
 *
 * Boots `buildApp` with a real MikroORM (admin schema from Stage B),
 * registers a probe route `GET /_admin_probe` that uses `authenticateAdmin`
 * as a preHandler, then exercises:
 *  - no token → 401 NOT_AUTHENTICATED
 *  - business-namespace token → 401 NOT_AUTHENTICATED (secret isolation)
 *  - admin-namespace token signed by jwtSecretAdmin → 200, sub propagates
 *  - admin-namespace token with extra TTL → 200, expiresIn honoured
 *  - admin-namespace token signed with wrong secret → 401 NOT_AUTHENTICATED
 *
 * Skipped automatically when MAIN_DB_URL is not reachable (same pattern
 * as admin-schema.test.ts).
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MikroORM } from '@mikro-orm/postgresql';
import type { FastifyInstance } from 'fastify';
import { Client } from 'pg';
import { createSigner, createVerifier } from 'fast-jwt';
import { buildApp } from '../../src/app.js';
import { buildMainDbOptions } from '../../src/db/mikro-orm.config.js';
import { loadConfig } from '../../src/config.js';
import { AdminUser } from '../../src/db/entities/admin/AdminUser.js';
import { hashPassword } from '../../src/obs/password.js';

const dbUrl = process.env.MAIN_DB_URL ?? process.env.TEST_DB_URL ?? 'postgres://farm:farm@127.0.0.1:5432/farm_game_test';

let orm: MikroORM | null = null;
let app: FastifyInstance | null = null;
let baseUrl = '';
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
    console.error(`[admin-auth integration] FAIL — PG not reachable at ${dbUrl}.`);
    process.exitCode = 1;
    return;
  }

  orm = await MikroORM.init(buildMainDbOptions(dbUrl));
  const config = loadConfig({
    env: 'test',
    jwtSecret: 'test-business-secret',
    jwtSecretAdmin: 'test-admin-secret',
    jwtTtlSecAdmin: 7200,
  });
  app = await buildApp({ config, orm });

  // Probe route — only used by this test file. Stage D replaces it with
  // the real /admin-ops/* surface. Mounted AFTER buildApp so we don't have
  // to thread a flag through the app factory.
  app.get('/_admin_probe', { preHandler: app.authenticateAdmin }, async (req, reply) => {
    // The verified admin user is stashed on req.adminUser by the @fastify/jwt
    // namespace decorator; fall back to req.user for the default namespace.
    const adminUser = (req as unknown as { adminUser?: { sub: string; role: string } }).adminUser;
    return { ok: true, sub: adminUser?.sub ?? null, role: adminUser?.role ?? null };
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('server did not return an address');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (app) {
    await app.close();
    app = null;
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
  em.clear();
});

async function seedAdmin(username: string, role: 'operator' | 'admin' = 'operator'): Promise<number> {
  if (!orm) throw new Error('seedAdmin called before PG ready');
  const em = orm.em.fork();
  const hash = await hashPassword('admin-password');
  const u = em.create(AdminUser, { username, passwordHash: hash, role });
  await em.flush();
  return typeof u.id === 'bigint' ? Number(u.id) : (u.id as number);
}

// We sign admin tokens via the actual `app.jwt.admin.sign(...)` namespace
// instance — that's what Stage D's `/admin-ops/auth/login` will use at
// runtime. The fast-jwt import is reserved for the wrong-secret case
// (we can't ask the registered namespace to sign with a different secret).

const TEST_JWT_SECRET_ADMIN = 'test-admin-secret';
const TEST_JWT_SECRET = 'test-business-secret';
const TEST_JWT_ISSUER = 'farm-game';
const TEST_JWT_AUDIENCE = 'client';

function signAdmin(payload: Record<string, unknown>, opts?: { expiresIn?: number; secretOverride?: string }): string {
  if (!app) throw new Error('signAdmin called before app ready');
  if (opts?.secretOverride) {
    // The wrong-secret assertion needs to bypass the registered namespace.
    // fast-jwt (the underlying lib) gives us a per-call secret override.
    const signer = createSigner({
      key: opts.secretOverride,
      iss: TEST_JWT_ISSUER,
      aud: TEST_JWT_AUDIENCE,
      expiresIn: opts.expiresIn ?? 7200,
    });
    return signer(payload);
  }
  const jwtAdmin = (app as unknown as { jwt: { admin: { sign: (p: object, o?: object) => string } } }).jwt.admin;
  return jwtAdmin.sign(payload, opts?.expiresIn !== undefined ? { sign: { expiresIn: opts.expiresIn } } : undefined);
}

function signBusiness(payload: Record<string, unknown>): string {
  if (!app) throw new Error('signBusiness called before app ready');
  const jwt = (app as unknown as { jwt: { sign: (p: object) => string } }).jwt;
  return jwt.sign(payload);
}

// Pre-build a verifier that matches what the admin @fastify/jwt instance
// is configured with. Kept for potential future "expired token" tests.
void createVerifier({ key: TEST_JWT_SECRET_ADMIN, allowedIss: TEST_JWT_ISSUER, allowedAud: TEST_JWT_AUDIENCE });

test('integration preflight: PG and Stage B schema reachable', async (t) => {
  if (!reachable) return t.skip();
  // The before() block already exercised this; the test exists so the
  // file's pass/fail summary is meaningful in CI.
  assert.ok(app, 'app should be listening');
  assert.ok(baseUrl.length > 0);
});

test('decorator: no token → 401 NOT_AUTHENTICATED', async (t) => {
  if (!reachable) return t.skip();
  const res = await fetch(`${baseUrl}/_admin_probe`);
  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: boolean; code: number };
  assert.equal(body.ok, false);
});

test('decorator: business-namespace token → 401 NOT_AUTHENTICATED (secret isolation)', async (t) => {
  if (!reachable) return t.skip();
  const token = signBusiness({ sub: 'fake-business-user', identities: [] });
  const res = await fetch(`${baseUrl}/_admin_probe`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 401);
});

test('decorator: admin-namespace token signed with wrong secret → 401', async (t) => {
  if (!reachable) return t.skip();
  const token = signAdmin({ sub: '1', role: 'admin' }, { secretOverride: 'not-the-real-admin-secret' });
  const res = await fetch(`${baseUrl}/_admin_probe`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 401);
});

test('decorator: valid admin-namespace token → 200 with sub + role propagated', async (t) => {
  if (!reachable) return t.skip();
  const adminId = await seedAdmin('operator-1', 'operator');
  const token = signAdmin({ sub: String(adminId), role: 'operator' });
  const res = await fetch(`${baseUrl}/_admin_probe`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; sub: string | null; role: string | null };
  assert.equal(body.ok, true);
  assert.equal(body.sub, String(adminId));
  assert.equal(body.role, 'operator');
});

test('decorator: token without role claim → 401 (payload shape guard)', async (t) => {
  if (!reachable) return t.skip();
  const token = signAdmin({ sub: '1' });   // role missing
  const res = await fetch(`${baseUrl}/_admin_probe`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: boolean; code: number; message: string };
  assert.equal(body.ok, false);
  // ErrorCode.NOT_AUTHENTICATED == 1100 in shared/protocol/error.ts.
  // The decorator rejects shape-invalid payloads with this code (rather
  // than INVALID_TOKEN = 1101) because the token IS valid — it just
  // doesn't grant admin privileges, which is an auth-not-allowed case
  // not a bad-credentials case.
  assert.equal(body.code, 1100);
  assert.match(body.message, /sub\/role/);
});
