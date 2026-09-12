/**
 * G2 T3 integration tests — the FULL FarmRoom against REAL PostgreSQL and a
 * REAL Colyseus transport, driven through `@colyseus/testing` (0.18.5 +
 * @colyseus/sdk 0.18.2). Matchmaking, `onAuth`, message dispatch and
 * broadcasts all run the production code paths — only the process boundary
 * is in-process (true cross-process matrices land in T5).
 *
 * Snapshot delivery: clients PULL via `farm_refresh`. The room pushes
 * `welcome` from onJoin, but the Colyseus handshake writes JOIN_ROOM after
 * onJoin returns, so the push reaches a client before it can register
 * handlers (see shared/protocol/ws.ts and room.ts) — tests use the pull.
 *
 * Covered scenarios:
 *  1. farm_refresh → welcome full projection (24 plots / 6 unlocked / revision)
 *  2. plant via WS → cmd_result + real DB effects (gold, plot, revision)
 *  3. multi-connection broadcast (second device sees plot_updated/gold_updated)
 *  4. same operationId replays from the receipts table (replayed=true)
 *  5. join rejected: bad token / owner mismatch
 *  6. fencing: after a forced-expiry takeover by "instance-B", the old room
 *     refuses the command (LEASE_LOST), disconnects, and NOTHING was written
 *  7. matchmaking reuses the same room per owner (filterBy) and separates owners
 *  8. room creation refused while another instance holds the lease; retry
 *     succeeds after release
 * T4:
 *  9. out-of-band write (HTTP entry) pushed to clients by the revision watcher
 * 10. abnormal drop → reconnection seat → reconnect → farm_refresh
 * 11. lease renew failures tolerated within budget, then disconnect + release
 *
 * Requires `pnpm db:migrate:test` (migrations 0001 + 0002) and
 * `pnpm db:up` (postgres + redis compose; redis unused here).
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { MikroORM } from '@mikro-orm/postgresql';
import { Pool } from 'pg';
import { createSigner } from 'fast-jwt';
import { ColyseusTestServer } from '@colyseus/testing';
import type { Room as SdkRoom } from '@colyseus/sdk';

import { buildWsServer, type BuiltWsServer } from '../../src/realtime/serve.js';
import { buildMainDbOptions } from '../../src/db/mikro-orm.config.js';
import { MikroORMPlayerRepo } from '../../src/repositories/MikroORMPlayerRepo.js';
import { makeMikroOrmTransactionRunner } from '../../src/repositories/transaction.js';
import { generatePlayerId } from '../../src/repositories/player-repo.js';
import { RoomLeaseRepo, type RoomLease } from '../../src/repositories/room-lease-repo.js';
import {
  CROPS,
  ErrorCode,
  PROTOCOL_VERSION,
  createDefaultPlayerSave,
  type PlayerSave,
} from '@farm-game/shared';

const dbUrl = process.env.MAIN_DB_URL ?? process.env.TEST_DB_URL ?? 'postgres://farm:farm@127.0.0.1:5432/farm_game_test';

let orm: MikroORM | null = null;
let poolDb: Pool | null = null;
let poolB: Pool | null = null;
let leasesB: RoomLeaseRepo | null = null;
let built: BuiltWsServer | null = null;
let testServer: ColyseusTestServer | null = null;
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

/** Bind to 0 and release to claim an ephemeral port for the Colyseus listen. */
async function probePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('could not read ephemeral port'));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
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
  poolDb = new Pool({ connectionString: dbUrl, max: 2 });
  poolB = new Pool({ connectionString: dbUrl, max: 4 });
  leasesB = new RoomLeaseRepo(poolB, 60_000);

  const port = await probePort();
  built = await buildWsServer({
    config: {
      env: 'test',
      mainDbUrl: dbUrl,
      // Renew is deliberately slow: the fencing test takes over the lease via
      // SQL + a second "instance" pool, and must win the race against the
      // room's own renew timer deterministically. 2×renew < ttl satisfies the
      // T4 failure-budget validation in loadConfig.
      leaseRenewMs: 30_000,
      leaseTtlMs: 90_000,
      // T4: fast revision polling so out-of-band pushes land quickly, and a
      // short reconnection seat so pending seats never linger between tests.
      refreshPollMs: 150,
      roomReconnectTtlSec: 10,
      jwtSecret: 'integration-secret',
      enableAdmin: false,
    },
  });
  await built.server.listen(port, '127.0.0.1');
  testServer = new ColyseusTestServer(built.server);
});

after(async () => {
  if (testServer) {
    await testServer.shutdown(); // gracefullyShutdown → onShutdown → boot.close()
  }
  if (poolB) await poolB.end();
  if (poolDb) await poolDb.end();
  if (orm) await orm.close(true);
});

beforeEach(async () => {
  if (!reachable || !testServer) return;
  // Disconnect every client; empty rooms auto-dispose (releasing leases).
  await testServer.cleanup();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const em = orm!.em.fork();
  await em.execute('TRUNCATE TABLE farm_room_leases, operation_receipts, plots, auth_identities, players RESTART IDENTITY CASCADE');
});

function requireDb(): asserts reachable {
  if (!reachable || !built || !testServer || !poolDb || !leasesB) {
    assert.fail(`PostgreSQL not reachable at ${dbUrl} — farm-room tests must run against a real DB`);
  }
}

// ── helpers ──

function signToken(playerId: string): string {
  const cfg = built!.boot.config;
  const sign = createSigner({ key: cfg.jwtSecret, expiresIn: cfg.jwtTtlSec });
  return sign({ sub: playerId, identities: [], iss: cfg.jwtIssuer, aud: cfg.jwtAudience });
}

async function seedPlayer(): Promise<string> {
  const repo = new MikroORMPlayerRepo(makeMikroOrmTransactionRunner(orm!));
  const playerId = generatePlayerId();
  await repo.upsert(createDefaultPlayerSave({ playerId }));
  return playerId;
}

/** Create the room server-side (bypasses onAuth), then connect a real client (runs onAuth). */
async function joinFarm(playerId: string): Promise<{ room: import('@colyseus/core').Room; client: SdkRoom }> {
  requireDb();
  const room = await testServer!.createRoom('farm', { ownerId: playerId });
  const client = await testServer!.sdk.joinById(room.roomId, { ownerId: playerId, token: signToken(playerId) });
  return { room, client };
}

function farmCmdEnv(command: string, operationId: string, body: unknown): Record<string, unknown> {
  return { v: PROTOCOL_VERSION, t: 'farm_cmd', r: operationId, p: { command, operationId, body } };
}

function refreshEnv(): Record<string, unknown> {
  return { v: PROTOCOL_VERSION, t: 'farm_refresh', p: null };
}

function sendCmd(client: SdkRoom, command: string, operationId: string, body: unknown): void {
  client.send('farm_cmd', farmCmdEnv(command, operationId, body) as never);
}

async function pullWelcome(client: SdkRoom): Promise<{ t: string; p: { serverNow: number; roomId: string; player: PlayerSave }; v: string; ts: number }> {
  client.send('farm_refresh', refreshEnv() as never);
  return (await client.waitForMessage('welcome', 5000)) as never;
}

async function playerRow(playerId: string): Promise<{ gold: number; revision: number }> {
  const res = await poolDb!.query('SELECT gold, revision FROM players WHERE player_id = $1', [playerId]);
  assert.equal(res.rowCount, 1, `player row missing for ${playerId}`);
  return res.rows[0];
}

async function plotRow(playerId: string, index: number): Promise<{ status: string; crop_id: string | null }> {
  const res = await poolDb!.query('SELECT status, crop_id FROM plots WHERE player_id = $1 AND index = $2', [playerId, index]);
  assert.equal(res.rowCount, 1, `plot row missing for ${playerId}#${index}`);
  return res.rows[0];
}

async function receiptCount(playerId: string): Promise<number> {
  const res = await poolDb!.query('SELECT COUNT(*)::int AS n FROM operation_receipts WHERE player_id = $1', [playerId]);
  return res.rows[0].n;
}

async function forceExpireLease(playerId: string): Promise<void> {
  await poolDb!.query("UPDATE farm_room_leases SET expires_at = now() - interval '1 second' WHERE owner_id = $1", [playerId]);
}

async function leaveOnce(client: SdkRoom): Promise<void> {
  return new Promise((resolve) => client.onLeave.once(() => resolve()));
}

async function leaveOnceWithTimeout(client: SdkRoom, timeoutMs = 5000): Promise<void> {
  return Promise.race([
    leaveOnce(client),
    new Promise((_, reject) => setTimeout(() => reject(new Error('client did not leave in time')), timeoutMs)),
  ]);
}

// ── scenarios ──

test('farm_refresh → welcome: full DB projection (24 plots / 6 unlocked / revision / roomId)', async () => {
  requireDb();
  const playerId = await seedPlayer();
  const { client } = await joinFarm(playerId);

  const welcome = await pullWelcome(client);
  assert.equal(welcome.t, 'welcome');
  assert.equal(welcome.v, PROTOCOL_VERSION);
  assert.equal(typeof welcome.ts, 'number');
  assert.equal(welcome.p.roomId, playerId);
  assert.equal(welcome.p.player.playerId, playerId);
  assert.equal(welcome.p.player.plots.length, 24);
  assert.equal(welcome.p.player.plots.filter((p) => p.unlocked).length, 6);
  assert.equal(welcome.p.player.revision, 0);
  assert.equal(typeof welcome.p.serverNow, 'number');
});

test('plant via WS → cmd_result with fresh snapshot, and real DB effects', async () => {
  requireDb();
  const playerId = await seedPlayer();
  const { client } = await joinFarm(playerId);

  const op = randomUUID();
  sendCmd(client, 'plant', op, { plotIndex: 0, cropId: 'carrot' });
  const result = (await client.waitForMessage('cmd_result', 5000)) as {
    r: string;
    p: {
      operationId: string;
      replayed: boolean;
      revision: number;
      operationRevision: number | null;
      serverNow: number;
      player: PlayerSave;
      payload: { plot: { index: number; status: string; cropId?: string } };
    };
  };

  assert.equal(result.r, op);
  assert.equal(result.p.operationId, op);
  assert.equal(result.p.replayed, false);
  assert.equal(result.p.payload.plot.index, 0);
  assert.equal(result.p.payload.plot.status, 'growing');
  assert.equal(result.p.payload.plot.cropId, 'carrot');
  assert.equal(result.p.player.gold, 200 - CROPS.carrot.seedPrice);
  assert.equal(result.p.revision, 1);
  assert.equal(result.p.operationRevision, 1);

  const row = await playerRow(playerId);
  assert.equal(row.gold, 200 - CROPS.carrot.seedPrice);
  assert.equal(row.revision, 1);
  const plot = await plotRow(playerId, 0);
  assert.equal(plot.status, 'growing');
  assert.equal(plot.crop_id, 'carrot');
  assert.equal(await receiptCount(playerId), 1);
});

test('a second connection in the same room receives plot_updated + gold_updated broadcasts', async () => {
  requireDb();
  const playerId = await seedPlayer();
  const room = await testServer!.createRoom('farm', { ownerId: playerId });
  const cA = await testServer!.sdk.joinById(room.roomId, { ownerId: playerId, token: signToken(playerId) });
  const cB = await testServer!.sdk.joinById(room.roomId, { ownerId: playerId, token: signToken(playerId) });

  const op = randomUUID();
  // Register the broadcast waiters BEFORE sending: the server dispatches
  // cmd_result and the broadcasts in the same tick, so a waiter attached
  // after the cmd_result await would miss the already-delivered frames.
  const plotUpdatedP = cA.waitForMessage('plot_updated', 5000) as Promise<{ p: { plot: { index: number } } }>;
  const goldUpdatedP = cA.waitForMessage('gold_updated', 5000) as Promise<{ p: { gold: number } }>;
  sendCmd(cB, 'plant', op, { plotIndex: 1, cropId: 'carrot' });
  await cB.waitForMessage('cmd_result', 5000);

  const plotUpdated = await plotUpdatedP;
  const goldUpdated = await goldUpdatedP;
  assert.equal(plotUpdated.p.plot.index, 1);
  assert.equal(goldUpdated.p.gold, 200 - CROPS.carrot.seedPrice);
});

test('retrying the same operationId over WS replays the persisted receipt', async () => {
  requireDb();
  const playerId = await seedPlayer();
  const { client } = await joinFarm(playerId);

  const op = randomUUID();
  sendCmd(client, 'plant', op, { plotIndex: 2, cropId: 'carrot' });
  const first = (await client.waitForMessage('cmd_result', 5000)) as { p: { replayed: boolean; operationRevision: number | null } };
  assert.equal(first.p.replayed, false);

  sendCmd(client, 'plant', op, { plotIndex: 2, cropId: 'carrot' });
  const second = (await client.waitForMessage('cmd_result', 5000)) as { p: { replayed: boolean; operationRevision: number | null; player: PlayerSave } };
  assert.equal(second.p.replayed, true);
  assert.equal(second.p.operationRevision, 1);
  assert.equal(second.p.player.gold, 200 - CROPS.carrot.seedPrice); // not deducted twice
  assert.equal(await receiptCount(playerId), 1);
});

test('join is rejected for a bad token', async () => {
  requireDb();
  const playerId = await seedPlayer();
  const room = await testServer!.createRoom('farm', { ownerId: playerId });
  await assert.rejects(
    () => testServer!.sdk.joinById(room.roomId, { ownerId: playerId, token: 'garbage-token' }),
  );
});

test('join is rejected when options.ownerId does not match the token subject', async () => {
  requireDb();
  const owner = await seedPlayer();
  const outsider = await seedPlayer();
  const room = await testServer!.createRoom('farm', { ownerId: owner });
  // Outsider's token, but the join addresses the owner's farm — onAuth must refuse.
  await assert.rejects(
    () => testServer!.sdk.joinById(room.roomId, { ownerId: owner, token: signToken(outsider) }),
  );
});

test('fencing: after a takeover by instance-B the old room refuses commands, disconnects, and writes nothing', async () => {
  requireDb();
  const playerId = await seedPlayer();
  const { client } = await joinFarm(playerId);
  await pullWelcome(client); // room is live and serving

  // "Instance B" force-expires A's lease and takes over (epoch 1 → 2).
  await forceExpireLease(playerId);
  const leaseB: RoomLease = await leasesB!.acquire(playerId, playerId, 'instance-B');
  assert.equal(leaseB.epoch, '2');

  // The stale room still believes it owns the farm — the command must hit the
  // in-transaction fence and die with the room, not write anything.
  sendCmd(client, 'water', randomUUID(), { plotIndex: 0 });
  const err = (await client.waitForMessage('error', 5000)) as { p: { code: number; message: string } };
  assert.equal(err.p.code, ErrorCode.LEASE_LOST);
  await leaveOnceWithTimeout(client);

  const row = await playerRow(playerId);
  assert.equal(row.gold, 200);
  assert.equal(row.revision, 0);
  assert.equal(await receiptCount(playerId), 0);

  // NOTE: no lease-release assertion here — the row now belongs to
  // instance-B's live takeover lease; the old room's guarded release is a
  // no-op by design. Release-on-loss is asserted in the renew-tolerance test.
});

test('matchmaking reuses one room per owner (filterBy) and separates different owners', async () => {
  requireDb();
  const owner = await seedPlayer();
  const c1 = await testServer!.sdk.joinOrCreate('farm', { ownerId: owner, token: signToken(owner) });
  const c2 = await testServer!.sdk.joinOrCreate('farm', { ownerId: owner, token: signToken(owner) });
  assert.equal(c1.roomId, c2.roomId);

  const other = await seedPlayer();
  const c3 = await testServer!.sdk.joinOrCreate('farm', { ownerId: other, token: signToken(other) });
  assert.notEqual(c3.roomId, c1.roomId);
});

test('room creation is refused while another instance holds the lease; retry after release succeeds', async () => {
  requireDb();
  const playerId = await seedPlayer();
  const held = await leasesB!.acquire(playerId, playerId, 'instance-B');

  await assert.rejects(
    () => testServer!.sdk.joinOrCreate('farm', { ownerId: playerId, token: signToken(playerId) }),
  );

  await leasesB!.release(held);
  const room = await testServer!.sdk.joinOrCreate('farm', { ownerId: playerId, token: signToken(playerId) });
  assert.equal(room.roomId, playerId);
});

// ── T4: cross-process sync, reconnection, failure tolerance ──

test('out-of-band state change (HTTP-entry write) is pushed to connected clients by the revision watcher', async () => {
  requireDb();
  const playerId = await seedPlayer();
  const { client } = await joinFarm(playerId);
  await pullWelcome(client); // baseline snapshot at revision 0

  // An out-of-band write — exactly what an HTTP-entry command commits.
  await poolDb!.query(
    'UPDATE players SET gold = gold + 50, revision = revision + 1 WHERE player_id = $1',
    [playerId],
  );

  // The watcher polls at 150ms and broadcasts a fresh full snapshot.
  const pushed = (await client.waitForMessage('welcome', 4000)) as {
    p: { player: PlayerSave; roomId: string };
  };
  assert.equal(pushed.p.roomId, playerId);
  assert.equal(pushed.p.player.revision, 1);
  assert.equal(pushed.p.player.gold, 250);
});

test('abnormal drop offers a reconnection seat; reconnect keeps auth and serves fresh snapshots', async () => {
  requireDb();
  const playerId = await seedPlayer();
  const { room, client } = await joinFarm(playerId);
  await pullWelcome(client);

  const token = (client as unknown as { reconnectionToken: string }).reconnectionToken;
  assert.equal(typeof token, 'string');

  // Abnormal close (no LEAVE_ROOM protocol message) → server onDrop → seat.
  await client.leave(false);
  await new Promise((resolve) => setTimeout(resolve, 100));

  const reconnected = await testServer!.sdk.reconnect(token);
  assert.equal(reconnected.roomId, room.roomId);

  // onAuth/onJoin are skipped on this path; the client pulls a fresh snapshot.
  reconnected.send('farm_refresh', refreshEnv() as never);
  const welcome = (await reconnected.waitForMessage('welcome', 5000)) as {
    p: { player: PlayerSave };
  };
  assert.equal(welcome.p.player.playerId, playerId);

  // The seat is consumed — the same token cannot be replayed.
  await assert.rejects(() => testServer!.sdk.reconnect(token));
});

test('lease renew failures are tolerated within budget, then the room disconnects and releases', async () => {
  requireDb();
  const playerId = await seedPlayer();
  const { room, client } = await joinFarm(playerId);
  await pullWelcome(client);

  const farmRoom = testServer!.getRoomById(room.roomId) as unknown as {
    handleRenewResult(renewed: unknown): Promise<void>;
  };

  // First consecutive failure — tolerated, room keeps serving.
  await farmRoom.handleRenewResult(null);
  client.send('farm_refresh', refreshEnv() as never);
  await client.waitForMessage('welcome', 3000);

  // Second consecutive failure — budget exhausted, room stops serving.
  await farmRoom.handleRenewResult(null);
  await leaveOnceWithTimeout(client);

  await new Promise((resolve) => setTimeout(resolve, 150));
  const lease = await poolDb!.query(
    'SELECT expires_at <= now() AS released FROM farm_room_leases WHERE owner_id = $1',
    [playerId],
  );
  assert.equal(lease.rows[0].released, true);
});
