/**
 * G2 T5 integration tests — the cross-process failover matrix on REAL
 * PostgreSQL + REAL Redis + REAL OS processes.
 *
 * Two child processes run the production WS entry (`src/realtime/serve.ts`)
 * with the RedisDriver/RedisPresence and a short lease (TTL 2s, renew 500ms),
 * so a SIGKILLed instance's lease is takeable within ~2s. The test process
 * talks to them with @colyseus/sdk over real WebSocket connections.
 *
 * IMPORTANT (verified against core 0.18.12): a matchmake `create` request is
 * forwarded over IPC to an arbitrary LIVE process in the shared directory
 * (and times out with `ipc_timeout` when it lands on a dead one). Which
 * process ends up owning a room is therefore NOT controlled by the endpoint
 * the client dialed — every test reads the lease row's `instance_id` and maps
 * it to the child that announced that instanceId at boot, then acts on the
 * actual owner.
 *
 * Covered scenarios:
 *  1. kill -9 the instance that owns a live farm room → the survivor takes
 *     over (lease epoch increments, instance_id moves) and a fresh client
 *     lands on a working room; the command path keeps working on DB-authoritative state.
 *  2. the killed instance restarts → joinOrCreate routes to the EXISTING room
 *     (shared Redis directory + publicAddress routing), with NO lease takeover.
 *  3. SIGTERM to the owning instance → orderly shutdown: process exits 0,
 *     client sees SERVER_SHUTDOWN, and the lease is released instead of
 *     waiting out the TTL.
 *
 * Requires `pnpm db:up` (postgres + redis on 6380), `pnpm db:migrate:test`,
 * and the tsx devDependency (children boot via `node --import tsx`).
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import { MikroORM } from '@mikro-orm/postgresql';
import { Pool } from 'pg';
import { createSigner } from 'fast-jwt';
import { ColyseusSDK, type Room as SdkRoom } from '@colyseus/sdk';
// Side-effect import: patches the SDK Room prototype with waitForMessage etc.
// (farm-room.test.ts gets this transitively via ColyseusTestServer; this file
// drives the SDK directly and needs the explicit import).
import '@colyseus/testing';

import { buildMainDbOptions } from '../../src/db/mikro-orm.config.js';
import { MikroORMPlayerRepo } from '../../src/repositories/MikroORMPlayerRepo.js';
import { makeMikroOrmTransactionRunner } from '../../src/repositories/transaction.js';
import { generatePlayerId } from '../../src/repositories/player-repo.js';
import {
  CROPS,
  PROTOCOL_VERSION,
  createDefaultPlayerSave,
  type PlayerSave,
} from '@farm-game/shared';

const dbUrl = process.env.MAIN_DB_URL ?? process.env.TEST_DB_URL ?? 'postgres://farm:farm@127.0.0.1:5432/farm_game_test';
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6380/0';
const SERVER_DIR = new URL('../..', import.meta.url).pathname;

interface WsProcess {
  proc: ChildProcess;
  port: number;
  label: string;
  stderr: string[];
  /** Parsed from the child's boot log ("farm-game-ws listening"). */
  instanceId: string | null;
}

let orm: MikroORM | null = null;
let poolDb: Pool | null = null;
const children: WsProcess[] = [];
const jwtSecret = 'integration-secret';
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

async function redisReachable(): Promise<boolean> {
  // redis://host:port/db — strip scheme and the /db suffix.
  const authority = redisUrl.replace('redis://', '').split('/')[0];
  const [host, portStr] = authority.split(':');
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(portStr) });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

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

function spawnWs(port: number, label: string): WsProcess {
  const proc = spawn(
    process.execPath,
    ['--import', 'tsx', 'src/realtime/serve.ts'],
    {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MAIN_DB_URL: dbUrl,
        REDIS_URL: redisUrl,
        WS_HOST: '127.0.0.1',
        WS_PORT: String(port),
        // Short lease so a killed instance's farm is takeable within ~2s.
        LEASE_TTL_MS: '2000',
        LEASE_RENEW_MS: '500',
        REFRESH_POLL_MS: '250',
        ROOM_RECONNECT_TTL_SEC: '5',
        JWT_SECRET: jwtSecret,
        JWT_TTL_SEC: '3600',
        ENABLE_ADMIN: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const child: WsProcess = { proc, port, label, stderr: [], instanceId: null };
  const stderr: string[] = [];
  proc.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString();
    stderr.push(line);
    if (stderr.length > 200) stderr.shift();
  });
  // pino logs go to stdout — parse the boot line for this child's instanceId
  // and mirror the load-bearing lifecycle lines into the test log.
  proc.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      const boot = line.match(/"instanceId":"([0-9a-f-]{36})".*farm-game-ws listening/);
      if (boot) child.instanceId = boot[1];
      if (/lease (acquired|released|lost)|ipc_|Error|fatal/.test(line)) {
        // eslint-disable-next-line no-console
        console.error(`[child ${port}] ${line.trim().slice(0, 240)}`);
      }
    }
  });
  proc.on('exit', (code, signal) => {
    // A child dying outside its test's kill step is the #1 debugging sink —
    // surface it immediately in the test output.
    // eslint-disable-next-line no-console
    console.error(`[failover] child ${label} exited: code=${code} signal=${signal}`);
  });
  child.stderr = stderr;
  children.push(child);
  return child;
}

async function waitReady(child: WsProcess, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const listening = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: child.port });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (listening && child.instanceId) return;
    if (Date.now() > deadline) {
      throw new Error(`WS process ${child.label} (port ${child.port}) not ready in ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

function signToken(playerId: string): string {
  const sign = createSigner({ key: jwtSecret, expiresIn: 3600 });
  return sign({ sub: playerId, identities: [], iss: 'farm-game', aud: 'client' });
}

/** Rejection guard — a join that neither resolves nor rejects must surface as a test failure, not a hang. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

function sdkFor(port: number): ColyseusSDK {
  return new ColyseusSDK(`ws://127.0.0.1:${port}`);
}

function liveChildren(): WsProcess[] {
  return children.filter((c) => c.proc.exitCode === null && c.proc.signalCode === null);
}

function childByInstanceId(instanceId: string): WsProcess | undefined {
  return children.find((c) => c.instanceId === instanceId);
}

async function seedPlayer(): Promise<string> {
  const repo = new MikroORMPlayerRepo(makeMikroOrmTransactionRunner(orm!));
  const playerId = generatePlayerId();
  await repo.upsert(createDefaultPlayerSave({ playerId }));
  return playerId;
}

async function leaseRow(playerId: string): Promise<{ instance_id: string; epoch: string; live: boolean }> {
  const res = await poolDb!.query(
    'SELECT instance_id, epoch, expires_at > now() AS live FROM farm_room_leases WHERE owner_id = $1',
    [playerId],
  );
  assert.equal(res.rowCount, 1, `lease row missing for ${playerId}`);
  return res.rows[0];
}

function refreshEnv(): Record<string, unknown> {
  return { v: PROTOCOL_VERSION, t: 'farm_refresh', p: null };
}

function farmCmdEnv(command: string, operationId: string, body: unknown): Record<string, unknown> {
  return { v: PROTOCOL_VERSION, t: 'farm_cmd', r: operationId, p: { command, operationId, body } };
}

async function pullWelcome(client: SdkRoom): Promise<PlayerSave> {
  client.send('farm_refresh', refreshEnv() as never);
  const welcome = (await client.waitForMessage('welcome', 5000)) as { p: { player: PlayerSave } };
  return welcome.p.player;
}

async function retryJoin(
  fn: () => Promise<SdkRoom>,
  deadlineMs: number,
): Promise<SdkRoom> {
  const deadline = Date.now() + deadlineMs;
  let delay = 300;
  let lastErr: unknown = null;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (Date.now() + delay > deadline) {
        throw new Error(`join never succeeded: ${(lastErr as Error)?.message ?? lastErr}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function killSync(child: WsProcess, signal: NodeJS.Signals): Promise<number | null> {
  return new Promise((resolve) => {
    if (child.proc.exitCode !== null || child.proc.signalCode !== null) {
      resolve(child.proc.exitCode);
      return;
    }
    child.proc.once('exit', (code) => resolve(code));
    child.proc.kill(signal);
  });
}

before(async () => {
  reachable = (await ping()) && (await redisReachable());
  if (!reachable) {
    // eslint-disable-next-line no-console
    console.error(
      `[integration] FAIL — PostgreSQL (${dbUrl}) or Redis (${redisUrl}) not reachable. Start with \`pnpm db:up\`.`,
    );
    process.exitCode = 1;
    return;
  }
  process.env.NODE_ENV = 'test';
  orm = await MikroORM.init(buildMainDbOptions(dbUrl));
  poolDb = new Pool({ connectionString: dbUrl, max: 2 });

  const em = orm.em.fork();
  await em.execute('TRUNCATE TABLE farm_room_leases, operation_receipts, plots, auth_identities, players RESTART IDENTITY CASCADE');

  spawnWs(await probePort(), 'A');
  spawnWs(await probePort(), 'B');
  await Promise.all([waitReady(children[0]), waitReady(children[1])]);
});

after(async () => {
  for (const child of liveChildren()) {
    child.proc.kill('SIGKILL');
  }
  if (poolDb) await poolDb.end();
  if (orm) await orm.close(true);
});

function requireInfra(): void {
  if (!reachable || !poolDb || liveChildren().length === 0) {
    assert.fail(`PostgreSQL/Redis not reachable — failover tests need \`pnpm db:up\` (postgres + redis)`);
  }
}

test('kill -9 the owning instance → survivor takes over (epoch++) and serves new clients', async () => {
  requireInfra();
  const playerId = await seedPlayer();

  // The room may be created on EITHER child (IPC-based create routing) —
  // read the lease to learn the actual owner.
  const dialFirst = liveChildren()[0];
  await withTimeout(
    sdkFor(dialFirst.port).joinOrCreate('farm', { ownerId: playerId, token: signToken(playerId) }),
    15_000,
    'initial joinOrCreate',
  );
  const before = await leaseRow(playerId);
  const owner = childByInstanceId(before.instance_id);
  assert.ok(owner, `lease instance_id ${before.instance_id} does not match any child`);
  const survivor = liveChildren().find((c) => c !== owner);
  assert.ok(survivor, 'expected one other live child to survive the kill');

  const ownerClient = await withTimeout(
    retryJoin(() => sdkFor(survivor!.port).joinOrCreate('farm', { ownerId: playerId, token: signToken(playerId) }), 15_000),
    20_000,
    'join owner room for command',
  );
  const player = await pullWelcome(ownerClient);
  assert.equal(player.playerId, playerId);
  const op = randomUUID();
  ownerClient.send('farm_cmd', farmCmdEnv('plant', op, { plotIndex: 0, cropId: 'carrot' }) as never);
  await ownerClient.waitForMessage('cmd_result', 5000);
  ownerClient.leave();

  assert.equal(before.live, true);

  // SIGKILL the owner: no graceful shutdown, no release — the lease lives
  // until TTL, after which the survivor can take over.
  const killedPort = owner.port;
  await killSync(owner, 'SIGKILL');

  // A fresh create lands on the survivor; the takeover can only happen after
  // the 2s lease TTL (plus IPC timeouts on attempts routed at the dead child),
  // so retry with a generous deadline.
  const newClient = await withTimeout(
    retryJoin(() => sdkFor(survivor!.port).create('farm', { ownerId: playerId, token: signToken(playerId) }), 25_000),
    30_000,
    'takeover create',
  );

  const afterRow = await leaseRow(playerId);
  assert.equal(afterRow.live, true);
  assert.equal(afterRow.instance_id, survivor!.instanceId, 'lease must have moved to the surviving instance');
  assert.ok(BigInt(afterRow.epoch) > BigInt(before.epoch), `epoch must increment (${before.epoch} → ${afterRow.epoch})`);

  // The new room serves the full command path against the DB authority.
  const fresh = await pullWelcome(newClient);
  assert.equal(fresh.revision, 1); // the A-era plant survived (DB is the authority)
  const op2 = randomUUID();
  newClient.send('farm_cmd', farmCmdEnv('plant', op2, { plotIndex: 1, cropId: 'carrot' }) as never);
  const result = (await newClient.waitForMessage('cmd_result', 5000)) as { p: { player: PlayerSave } };
  assert.equal(result.p.player.gold, 200 - 2 * CROPS.carrot.seedPrice);
  newClient.leave();
  void killedPort;
});

test('restarted instance routes joins to the existing room (no takeover)', async () => {
  requireInfra();
  // Restart a child on the port freed by test 1's kill.
  const deadChild = children.find((c) => c.proc.exitCode !== null || c.proc.signalCode !== null);
  assert.ok(deadChild, 'expected one killed child from test 1');
  const restarted = spawnWs(deadChild.port, 'A-restart');
  await waitReady(restarted);

  const playerId = await seedPlayer();

  // Create the farm (may land on any live child) and read its owner.
  await withTimeout(
    sdkFor(restarted.port).joinOrCreate('farm', { ownerId: playerId, token: signToken(playerId) }),
    15_000,
    'initial joinOrCreate',
  );
  const owned = await leaseRow(playerId);
  assert.equal(owned.live, true);
  const owner = childByInstanceId(owned.instance_id);
  assert.ok(owner, 'lease instance must be one of the live children');
  const ownerClient = await withTimeout(
    retryJoin(() => sdkFor(restarted.port).joinOrCreate('farm', { ownerId: playerId, token: signToken(playerId) }), 15_000),
    20_000,
    'join owner room',
  );

  // The restarted child (and any other endpoint) must route to the SAME room
  // via the shared directory + publicAddress — no second room, no takeover.
  const routedClient = await withTimeout(
    sdkFor(restarted.port).joinOrCreate('farm', { ownerId: playerId, token: signToken(playerId) }),
    15_000,
    'routed joinOrCreate',
  );

  const unchanged = await leaseRow(playerId);
  assert.equal(unchanged.instance_id, owned.instance_id, 'lease must stay with the owning instance');
  assert.equal(unchanged.epoch, owned.epoch, 'no takeover may occur while the lease is live');

  // Both connections see the same authoritative state; a command from the
  // routed client lands on the owner's room and broadcasts to the other.
  await pullWelcome(routedClient);
  const op = randomUUID();
  routedClient.send('farm_cmd', farmCmdEnv('plant', op, { plotIndex: 0, cropId: 'carrot' }) as never);
  await routedClient.waitForMessage('cmd_result', 5000);
  const plotOnOwner = (await ownerClient.waitForMessage('plot_updated', 5000)) as { p: { plot: { index: number } } };
  assert.equal(plotOnOwner.p.plot.index, 0);
  routedClient.leave();
  ownerClient.leave();
});

test('SIGTERM drains and releases the lease instead of waiting out the TTL', async () => {
  requireInfra();
  const playerId = await seedPlayer();
  const dial = liveChildren()[0];
  const client = await withTimeout(
    retryJoin(() => sdkFor(dial.port).create('farm', { ownerId: playerId, token: signToken(playerId) }), 15_000),
    20_000,
    'create for shutdown test',
  );
  await pullWelcome(client);

  const owned = await leaseRow(playerId);
  const owner = childByInstanceId(owned.instance_id);
  assert.ok(owner, 'lease instance must be one of the children');
  const leavePromise = new Promise<number>((resolve) => client.onLeave.once((code: number) => resolve(code)));

  const exitCode = await killSync(owner, 'SIGTERM');
  assert.equal(exitCode, 0, `graceful SIGTERM shutdown must exit 0; stderr: ${owner.stderr.slice(-5).join('')}`);

  // Bounded: the server closes sockets with SERVER_SHUTDOWN before exiting,
  // but a missing close event must fail the test, not hang the suite.
  const leaveCode = await Promise.race([
    leavePromise,
    new Promise<number>((resolve) => setTimeout(() => resolve(-1), 5000)),
  ]);
  assert.equal(leaveCode, 4001, `expected SERVER_SHUTDOWN close code, got ${leaveCode}`);

  const released = await poolDb!.query(
    'SELECT expires_at <= now() AS released FROM farm_room_leases WHERE owner_id = $1',
    [playerId],
  );
  assert.equal(released.rows[0].released, true, 'lease must be released on graceful shutdown');
});
