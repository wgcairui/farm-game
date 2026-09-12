/**
 * G2 T2 integration tests — farm room ownership leases on REAL PostgreSQL.
 *
 * These tests exercise `RoomLeaseRepo` against real row locks — two separate
 * pg Pools stand in for two WS processes (full cross-process tests with real
 * OS processes and Colyseus rooms land in T5). All expiry decisions are made
 * by the database clock via `now()`; tests force expiry with SQL updates
 * rather than wall-clock sleeps so the suite stays fast and deterministic.
 *
 * Covered scenarios:
 *  - Fresh acquire → epoch 1
 *  - Live lease refuses a different instance (LeaseConflictError with holder info)
 *  - Same holder re-acquire extends without bumping the epoch
 *  - Release → findCurrent null → other instance takes over with epoch 2
 *  - Renew with wrong epoch / wrong instance → null
 *  - Renew after expiry → null (expired leases never resurrect in place)
 *  - Forced-expiry takeover from another instance → epoch increments
 *  - assertCurrent passes under ownership and throws after takeover
 *
 * Requires `pnpm db:migrate:test` to have applied 0002-g2-room-leases.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MikroORM } from '@mikro-orm/postgresql';
import { Pool } from 'pg';

import { buildMainDbOptions } from '../../src/db/mikro-orm.config.js';
import { MikroORMPlayerRepo } from '../../src/repositories/MikroORMPlayerRepo.js';
import { makeMikroOrmTransactionRunner } from '../../src/repositories/transaction.js';
import { generatePlayerId } from '../../src/repositories/player-repo.js';
import {
  RoomLeaseRepo,
  LeaseConflictError,
  LeaseLostError,
  type RoomLease,
} from '../../src/repositories/room-lease-repo.js';
import { createDefaultPlayerSave } from '@farm-game/shared';

const dbUrl = process.env.MAIN_DB_URL ?? process.env.TEST_DB_URL ?? 'postgres://farm:farm@127.0.0.1:5432/farm_game_test';

let orm: MikroORM | null = null;
let poolA: Pool | null = null;
let poolB: Pool | null = null;
let leasesA: RoomLeaseRepo | null = null;
let leasesB: RoomLeaseRepo | null = null;
let reachable = false;

async function ping(): Promise<boolean> {
  const c = new Pool({ connectionString: dbUrl, max: 1 });
  try {
    await c.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await c.end();
  }
}

before(async () => {
  reachable = await ping();
  if (!reachable) {
    // eslint-disable-next-line no-console
    console.error(`[integration] FAIL — PostgreSQL not reachable at ${dbUrl}. Start with \`pnpm db:up\`.`);
    process.exitCode = 1;
    return;
  }
  process.env.NODE_ENV = 'test';
  orm = await MikroORM.init(buildMainDbOptions(dbUrl));
  poolA = new Pool({ connectionString: dbUrl, max: 4 });
  poolB = new Pool({ connectionString: dbUrl, max: 4 });
  leasesA = new RoomLeaseRepo(poolA, 15_000);
  leasesB = new RoomLeaseRepo(poolB, 15_000);
});

after(async () => {
  if (poolA) await poolA.end();
  if (poolB) await poolB.end();
  if (orm) await orm.close(true);
});

beforeEach(async () => {
  if (!orm) return;
  const em = orm.em.fork();
  await em.execute('TRUNCATE TABLE farm_room_leases, operation_receipts, plots, auth_identities, players RESTART IDENTITY CASCADE');
});

function requireDb(): asserts reachable {
  if (!reachable || !leasesA || !leasesB || !orm) {
    assert.fail(`PostgreSQL not reachable at ${dbUrl} — lease tests must run against a real DB`);
  }
}

/** Create a player row so the lease FK target exists. */
async function seedPlayer(): Promise<string> {
  const repo = new MikroORMPlayerRepo(makeMikroOrmTransactionRunner(orm!));
  const playerId = generatePlayerId();
  await repo.upsert(createDefaultPlayerSave({ playerId }));
  return playerId;
}

/** Force-expire every lease row using the DB clock. */
async function expireAllLeases(): Promise<void> {
  const em = orm!.em.fork();
  await em.getConnection().execute(`UPDATE farm_room_leases SET expires_at = now() - interval '1 second'`);
}

test('lease: fresh acquire creates the row with epoch 1', async () => {
  requireDb();
  const ownerId = await seedPlayer();
  const lease = await leasesA!.acquire(ownerId, ownerId, 'instance-A');
  assert.equal(lease.epoch, '1');
  assert.equal(lease.roomId, ownerId);
  assert.equal(lease.instanceId, 'instance-A');
  assert.ok(lease.expiresAtMs > Date.now() - 1000, 'expiry is in the future (DB clock)');
});

test('lease: live lease refuses a different instance with holder info', async () => {
  requireDb();
  const ownerId = await seedPlayer();
  await leasesA!.acquire(ownerId, ownerId, 'instance-A');
  await assert.rejects(
    () => leasesB!.acquire(ownerId, ownerId, 'instance-B'),
    (err: unknown) => {
      assert.ok(err instanceof LeaseConflictError, 'expected LeaseConflictError');
      assert.equal((err as LeaseConflictError).holder.instanceId, 'instance-A');
      assert.equal((err as LeaseConflictError).holder.roomId, ownerId);
      return true;
    },
  );
});

test('lease: same holder re-acquire extends and keeps the epoch', async () => {
  requireDb();
  const ownerId = await seedPlayer();
  const first = await leasesA!.acquire(ownerId, ownerId, 'instance-A');
  const again = await leasesA!.acquire(ownerId, ownerId, 'instance-A');
  assert.equal(again.epoch, first.epoch, 'same holder keeps epoch');
  assert.ok(again.expiresAtMs >= first.expiresAtMs, 're-acquire extends the deadline');
});

test('lease: release expires the row and the next holder takes over with epoch 2', async () => {
  requireDb();
  const ownerId = await seedPlayer();
  const first = await leasesA!.acquire(ownerId, ownerId, 'instance-A');
  await leasesA!.release(first);
  assert.equal(await leasesA!.findCurrent(ownerId), null, 'no live lease after release');

  const second = await leasesB!.acquire(ownerId, ownerId, 'instance-B');
  assert.equal(second.epoch, '2', 'takeover after release increments epoch');
  assert.equal(second.instanceId, 'instance-B');
});

test('lease: renew is guarded by room, instance and epoch', async () => {
  requireDb();
  const ownerId = await seedPlayer();
  const lease = await leasesA!.acquire(ownerId, ownerId, 'instance-A');

  const wrongEpoch: RoomLease = { ...lease, epoch: '999' };
  assert.equal(await leasesA!.renew(wrongEpoch), null, 'wrong epoch cannot renew');

  const wrongInstance: RoomLease = { ...lease, instanceId: 'instance-B' };
  assert.equal(await leasesA!.renew(wrongInstance), null, 'wrong instance cannot renew');

  const renewed = await leasesA!.renew(lease);
  assert.ok(renewed, 'correct holder renews');
  assert.equal(renewed!.epoch, lease.epoch);
});

test('lease: expired leases never resurrect via renew', async () => {
  requireDb();
  const ownerId = await seedPlayer();
  const lease = await leasesA!.acquire(ownerId, ownerId, 'instance-A');
  await expireAllLeases();
  assert.equal(await leasesA!.renew(lease), null, 'expired lease cannot renew in place');
  assert.equal(await leasesA!.findCurrent(ownerId), null);
});

test('lease: forced-expiry takeover from another instance increments the epoch', async () => {
  requireDb();
  const ownerId = await seedPlayer();
  const first = await leasesA!.acquire(ownerId, ownerId, 'instance-A');
  await expireAllLeases();

  const second = await leasesB!.acquire(ownerId, ownerId, 'instance-B');
  assert.equal(second.epoch, String(Number(first.epoch) + 1), 'takeover increments epoch');
  // The old lease handle is now stale — renewing it must fail.
  assert.equal(await leasesA!.renew(first), null, 'old owner cannot renew after takeover');
});

test('lease: assertCurrent locks and verifies inside a command transaction', async () => {
  requireDb();
  const ownerId = await seedPlayer();
  const lease = await leasesA!.acquire(ownerId, ownerId, 'instance-A');

  // Valid ownership passes inside a real transaction.
  const em = orm!.em.fork();
  await em.transactional(async (tem) => {
    await leasesA!.assertCurrent(tem, lease);
  });

  // Fail closed: without a transaction context there is no lock to hold —
  // the check must refuse rather than run in autocommit (T2 review #1).
  const bareEm = orm!.em.fork();
  await assert.rejects(
    () => leasesA!.assertCurrent(bareEm, lease),
    (err: unknown) => {
      assert.ok(err instanceof LeaseLostError);
      assert.equal((err as LeaseLostError).reason, 'no-transaction');
      return true;
    },
  );

  // After another instance takes over, the stale handle fails with a
  // mismatch reason (room/instance/epoch — epoch is the decisive fence).
  await expireAllLeases();
  await leasesB!.acquire(ownerId, ownerId, 'instance-B');

  const em2 = orm!.em.fork();
  await assert.rejects(
    () =>
      em2.transactional(async (tem) => {
        await leasesA!.assertCurrent(tem, lease);
      }),
    (err: unknown) => {
      assert.ok(err instanceof LeaseLostError, 'expected LeaseLostError after takeover');
      const reasons: LeaseLostError['reason'][] = ['room-mismatch', 'instance-mismatch', 'epoch-mismatch'];
      assert.ok(reasons.includes((err as LeaseLostError).reason), `unexpected reason: ${(err as LeaseLostError).reason}`);
      return true;
    },
  );
});

test('lease: FOR UPDATE row lock blocks competing writers until the command transaction commits', async () => {
  // The discriminating test for T2 review Critical #1. When assertCurrent
  // runs inside the transaction, the lease row lock is held until commit
  // and any competing writer waits; the old autocommit behaviour released
  // the lock at statement end, so writers returned immediately and this
  // test went red against the broken implementation. NOTE: the blocked
  // writer is the expire UPDATE itself — the takeover only runs after it,
  // so the timing window MUST include the expire.
  requireDb();
  const ownerId = await seedPlayer();
  const lease = await leasesA!.acquire(ownerId, ownerId, 'instance-A');

  const em = orm!.em.fork();
  let txCommitted = false;
  const tx = em.transactional(async (tem) => {
    await leasesA!.assertCurrent(tem, lease);
    // Hold the row lock long enough for the competing writer to queue.
    await new Promise((resolve) => setTimeout(resolve, 600));
    txCommitted = true;
  });

  try {
    // Let the transaction acquire the lock first.
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Competing writer: the expire UPDATE must queue behind the open
    // transaction and only proceed once it commits. Under autocommit
    // fencing it returns in a few milliseconds.
    const start = Date.now();
    await expireAllLeases();
    const takeover = await leasesB!.acquire(ownerId, ownerId, 'instance-B');
    const elapsed = Date.now() - start;

    await tx;
    assert.ok(txCommitted, 'command transaction committed');
    assert.ok(
      elapsed >= 300,
      `competing writer should block until commit, returned in ${elapsed}ms`,
    );
    assert.equal(takeover.epoch, '2');
  } finally {
    // Never leave a dangling transaction behind to poison the next test
    // (a failed assertion before `await tx` would otherwise leak an open
    // transaction holding row locks into beforeEach's TRUNCATE).
    await tx.catch(() => undefined);
  }
});

test('lease: same holder re-acquiring its own expired lease keeps the epoch', async () => {
  // Fencing invariant pairing: epoch only increments when ownership CHANGES
  // hands. The same instance re-acquiring after expiry is not a handover —
  // its (room, instance, epoch) fencing triple stays coherent.
  requireDb();
  const ownerId = await seedPlayer();
  const first = await leasesA!.acquire(ownerId, ownerId, 'instance-A');
  await expireAllLeases();
  const again = await leasesA!.acquire(ownerId, ownerId, 'instance-A');
  assert.equal(again.epoch, first.epoch, 'same holder re-acquire does not bump epoch');
  // A different instance can only take over once the holder gives the lease
  // up — and a real handover increments the epoch.
  await leasesA!.release(again);
  const other = await leasesB!.acquire(ownerId, ownerId, 'instance-B');
  assert.equal(other.epoch, '2', 'real handover increments epoch');
});
