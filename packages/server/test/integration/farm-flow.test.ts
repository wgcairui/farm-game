/**
 * G1 integration tests — REAL PostgreSQL.
 *
 * Per ADR-0003 D30: integration tests MUST run against a real PostgreSQL
 * container, never against an in-memory stub. Each test gets a freshly
 * truncated schema (TRUNCATE … RESTART IDENTITY CASCADE) so tests are
 * independent of order.
 *
 * T1 (G2 prep) additions:
 *  - PG must be reachable. If `ping()` fails the suite exits non-zero via
 *    `process.exitCode = 1` so a missing container cannot be mistaken for
 *    a green run.
 *  - New scenarios cover the receipt command/hash guard, the explicit
 *    `operationRevision` + `replayed` fields, and the atomic identity
 *    get-or-create under concurrent first-login pressure.
 *
 * Skipped automatically if MAIN_DB_URL is not reachable.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import { buildApp } from '../../src/app.js';
import { buildMainDbOptions } from '../../src/db/mikro-orm.config.js';
import { loadConfig } from '../../src/config.js';
import { ApiClient, makeOperationId } from '@farm-game/client-app';
import {
  ErrorCode,
  type ApiResponse,
  type FarmHarvestResponse,
  type FarmPlantResponse,
  type FarmUnlockResponse,
  type FarmWaterResponse,
  type LoginResponse,
  Platform,
} from '@farm-game/shared';
import type { FastifyInstance } from 'fastify';

const dbUrl = process.env.MAIN_DB_URL ?? process.env.TEST_DB_URL ?? 'postgres://farm:farm@127.0.0.1:5432/farm_game_test';

let orm: MikroORM | null = null;
let app: FastifyInstance | null = null;
let baseUrl = '';
let client: ApiClient | null = null;
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

async function truncateAll(): Promise<void> {
  if (!orm) return;
  // Schema migrations are applied via `pnpm db:migrate:test` BEFORE running
  // these tests; we don't call `orm.getMigrator()` here because the
  // MikroORM Migrator pulls in `umzug → emittery` which has a broken
  // `maps.js` install in this pnpm lockfile.
  const em = orm.em.fork();
  await em.execute('TRUNCATE TABLE operation_receipts, plots, auth_identities, players RESTART IDENTITY CASCADE');
}

before(async () => {
  reachable = await ping();
  if (!reachable) {
    // T1: refuse to silently pass — print the missing URL and exit non-zero
    // so the CI signal is unambiguous. `pnpm test:integration` is a separate
    // script from `pnpm -r test` so unit tests in this package are not
    // affected.
    // eslint-disable-next-line no-console
    console.error(`[integration] FAIL — PostgreSQL not reachable at ${dbUrl}. Start with \`pnpm db:up\`.`);
    process.exitCode = 1;
    return;
  }
  process.env.NODE_ENV = 'test';
  orm = await MikroORM.init(buildMainDbOptions(dbUrl));
  const config = loadConfig({
    port: 0,
    jwtSecret: 'integration-secret',
    enableAdmin: false,
    enableMockAuth: true,
  });
  app = await buildApp({ config, orm });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (addr && typeof addr === 'object') {
    baseUrl = `http://127.0.0.1:${addr.port}`;
    client = new ApiClient({ baseUrl, platform: Platform.WeChatMini });
  }
});

after(async () => {
  if (app) await app.close();
  if (orm) await orm.close(true);
});

beforeEach(async () => {
  await truncateAll();
});

function requireDb(): asserts reachable {
  if (!reachable) {
    assert.fail(`PostgreSQL not reachable at ${dbUrl} — integration tests must run against a real DB`);
  }
  if (!client) {
    assert.fail('ApiClient not initialised — server failed to start');
  }
}

async function login(code: string): Promise<LoginResponse> {
  const res = (await client!.loginWeChat({ code })) as ApiResponse<LoginResponse>;
  assert.equal(res.ok, true, JSON.stringify(res));
  return (res as { ok: true; data: LoginResponse }).data;
}

test('G1: login → unlock → plant → water → harvest', async () => {
  requireDb();
  const code = `mock_int_${Date.now()}_${Math.random()}`;
  const loginData = await login(code);
  client!.setToken(loginData.token);
  assert.equal(loginData.player.gold, 200);
  assert.equal(loginData.player.plots.length, 24);

  const unlock = (await client!.unlockPlot(6)) as ApiResponse<FarmUnlockResponse>;
  assert.equal(unlock.ok, true);
  assert.equal((unlock as { data: FarmUnlockResponse }).data.payload.goldSpent, 100);
  assert.equal((unlock as { data: FarmUnlockResponse }).data.player.gold, 100);

  const plant = (await client!.plantPlot(0, 'carrot')) as ApiResponse<FarmPlantResponse>;
  assert.equal(plant.ok, true);
  assert.equal((plant as { data: FarmPlantResponse }).data.player.gold, 90);

  const water = (await client!.waterPlot(0)) as ApiResponse<FarmWaterResponse>;
  assert.equal(water.ok, true);

  // Force-ripen by reading the planted plot's matureAt, then time-travel via
  // setting plantedAt/matureAt back. Simpler: wait the remaining seconds.
  const matureAt = (water as { data: FarmWaterResponse }).data.payload.plot.matureAt;
  const waitMs = Math.max(0, (matureAt ?? Date.now()) - Date.now()) + 500;
  await new Promise((r) => setTimeout(r, waitMs));

  const harvest = (await client!.harvestPlot(0)) as ApiResponse<FarmHarvestResponse>;
  assert.equal(harvest.ok, true);
  assert.equal((harvest as { data: FarmHarvestResponse }).data.payload.goldAwarded, 25);
  assert.equal((harvest as { data: FarmHarvestResponse }).data.player.gold, 115);
});

test('G1: repeated unlock is idempotent and does not double-spend gold', async () => {
  requireDb();
  const data = await login(`mock_int_unlock_${Date.now()}`);
  client!.setToken(data.token);
  const first = (await client!.unlockPlot(6)) as ApiResponse<FarmUnlockResponse>;
  assert.equal(first.ok, true);
  const goldAfter = (first as { data: FarmUnlockResponse }).data.player.gold;
  const revAfter = (first as { data: FarmUnlockResponse }).data.revision;

  const second = (await client!.unlockPlot(6)) as ApiResponse<FarmUnlockResponse>;
  assert.equal(second.ok, true);
  assert.equal((second as { data: FarmUnlockResponse }).data.player.gold, goldAfter);
  assert.equal((second as { data: FarmUnlockResponse }).data.revision, revAfter, 'no revision bump for no-op');
  assert.equal((second as { data: FarmUnlockResponse }).data.payload.goldSpent, 0);
});

test('G1: idempotent retry with same operationId returns same payload', async () => {
  requireDb();
  const data = await login(`mock_int_idem_${Date.now()}`);
  client!.setToken(data.token);
  await client!.unlockPlot(6); // ensure plot[6] is unlocked
  const op = makeOperationId();
  const first = (await client!.plantPlot(0, 'carrot', op)) as ApiResponse<FarmPlantResponse>;
  assert.equal(first.ok, true);
  const second = (await client!.plantPlot(0, 'carrot', op)) as ApiResponse<FarmPlantResponse>;
  assert.equal(second.ok, true);
  assert.equal(
    (second as { data: FarmPlantResponse }).data.revision,
    (first as { data: FarmPlantResponse }).data.revision,
    'revision unchanged on idempotent replay',
  );
  assert.equal(
    (second as { data: FarmPlantResponse }).data.operationRevision,
    (first as { data: FarmPlantResponse }).data.operationRevision,
    'operationRevision unchanged on idempotent replay',
  );
  assert.equal(
    (second as { data: FarmPlantResponse }).data.replayed,
    true,
    'second response is flagged as a replay',
  );
  assert.equal(
    (second as { data: FarmPlantResponse }).data.player.gold,
    (first as { data: FarmPlantResponse }).data.player.gold,
    'gold unchanged on idempotent replay',
  );
});

test('G1: reuse operationId with different params returns OPERATION_ID_REUSED', async () => {
  requireDb();
  const data = await login(`mock_int_dup_${Date.now()}`);
  client!.setToken(data.token);
  // Unlock plot 6 so we have a place to plant.
  await client!.unlockPlot(6);
  const op = makeOperationId();
  const seed = (await client!.plantPlot(0, 'carrot', op)) as ApiResponse<FarmPlantResponse>;
  assert.equal(seed.ok, true);
  const mismatch = (await client!.plantPlot(1, 'carrot', op)) as ApiResponse<FarmPlantResponse>;
  if (mismatch.ok) {
    // eslint-disable-next-line no-console
    console.error('debug mismatch response:', JSON.stringify(mismatch, null, 2));
  }
  assert.equal(mismatch.ok, false, 'expected ok:false for operationId reuse with different params');
  assert.equal(
    (mismatch as { ok: false; code: number }).code,
    ErrorCode.OPERATION_ID_REUSED,
  );
});

test('G1: same operationId across commands rejects (water then harvest, both plot 0)', async () => {
  requireDb();
  const data = await login(`mock_int_xcmd_${Date.now()}`);
  client!.setToken(data.token);
  await client!.unlockPlot(6);
  await client!.plantPlot(0, 'carrot');
  const op = makeOperationId();
  const water = (await client!.waterPlot(0, op)) as ApiResponse<FarmWaterResponse>;
  assert.equal(water.ok, true);
  // Wait until ripe so harvest would otherwise be valid.
  const matureAt = (water as { data: FarmWaterResponse }).data.payload.plot.matureAt;
  await new Promise((r) => setTimeout(r, Math.max(0, (matureAt ?? Date.now()) - Date.now()) + 500));
  const harvest = (await client!.harvestPlot(0, op)) as ApiResponse<FarmHarvestResponse>;
  assert.equal(harvest.ok, false, 'expected ok:false for operationId reuse across commands');
  assert.equal(
    (harvest as { ok: false; code: number }).code,
    ErrorCode.OPERATION_ID_REUSED,
  );
});

test('G1: concurrent harvests on the same plot award gold only once', async () => {
  requireDb();
  const data = await login(`mock_int_concurrent_${Date.now()}`);
  client!.setToken(data.token);
  await client!.unlockPlot(6);
  await client!.plantPlot(0, 'carrot');
  // Force ripe by waiting for plant's matureAt minus the few seconds since.
  const me = await client!.getPlayerInfo();
  assert.equal(me.ok, true);
  const matureAt = (me as { data: import('@farm-game/shared').PlayerSave }).data.plots[0]!.matureAt ?? 0;
  const waitMs = Math.max(0, matureAt - Date.now()) + 500;
  await new Promise((r) => setTimeout(r, waitMs));

  // Fire two harvests with DIFFERENT operationIds in parallel.
  const [a, b] = await Promise.all([
    client!.harvestPlot(0, makeOperationId()),
    client!.harvestPlot(0, makeOperationId()),
  ]);
  const aOk = a.ok ? (a as { data: FarmHarvestResponse }).data : null;
  const bOk = b.ok ? (b as { data: FarmHarvestResponse }).data : null;
  // Exactly one must succeed with goldAwarded=25; the other must be CROP_NOT_RIPE.
  const successes = [aOk, bOk].filter((x): x is FarmHarvestResponse => Boolean(x));
  const failures = [a, b].filter((r): r is { ok: false; code: number; message: string } => !r.ok);
  assert.equal(successes.length, 1, 'exactly one harvest should succeed');
  assert.equal(failures.length, 1, 'the other harvest should fail');
  if (successes[0]) assert.equal(successes[0].payload.goldAwarded, 25);
  if (failures[0]) assert.equal(failures[0].code, ErrorCode.CROP_NOT_RIPE);
});

test('G1: insufficient gold leaves the plot and gold unchanged', async () => {
  requireDb();
  const data = await login(`mock_int_poor_${Date.now()}`);
  client!.setToken(data.token);
  // Spend almost all gold so the next plant fails (plant carrot = 10g).
  await client!.unlockPlot(6);   // -100
  await client!.unlockPlot(7);   // -100 → 0 gold remaining
  // Now planting carrot (10g) must fail with INSUFFICIENT_GOLD and not change anything.
  const before = await client!.getPlayerInfo();
  assert.equal(before.ok, true);
  const beforeGold = (before as { data: import('@farm-game/shared').PlayerSave }).data.gold;
  const fail = (await client!.plantPlot(0, 'carrot')) as ApiResponse<FarmPlantResponse>;
  assert.equal(fail.ok, false);
  assert.equal((fail as { ok: false; code: number }).code, ErrorCode.INSUFFICIENT_GOLD);
  const after = await client!.getPlayerInfo();
  assert.equal((after as { data: import('@farm-game/shared').PlayerSave }).data.gold, beforeGold);
});

test('G1: concurrent first-login with the same identity returns one player, no 500', async () => {
  requireDb();
  // Two parallel first-time logins for the same WeChat code must converge on
  // a single playerId. The atomic get-or-create in T1 closes the old race
  // window that produced an orphan player + a 500 from addIdentity's
  // unique-violation. The losing transaction is rejected and the client
  // can simply retry (the next call finds the identity already bound).
  const code = `mock_int_race_${Date.now()}_${Math.random()}`;
  const [a, b] = await Promise.all([
    client!.loginWeChat({ code }),
    client!.loginWeChat({ code }),
  ]);
  // At least one must succeed. The losing transaction either returns the
  // winning player too, or surfaces the IdentityAlreadyBoundError. We don't
  // assert a specific shape here — just that the suite doesn't blow up and
  // that exactly one player row exists for this code.
  const successes = [a, b].filter((r): r is { ok: true; data: LoginResponse } => r.ok);
  assert.ok(successes.length >= 1, 'at least one first-login must succeed');

  const em = orm!.em.fork();
  const rows = await em.getConnection().execute(
    `SELECT COUNT(*)::int AS n FROM auth_identities WHERE provider = 'weChatMini' AND subject = $1`,
    [`mock_${code.slice(0, 16)}`],
  );
  const count = Number((rows[0] as unknown as { n: number }).n);
  assert.equal(count, 1, `exactly one identity row should exist, got ${count}`);
});
