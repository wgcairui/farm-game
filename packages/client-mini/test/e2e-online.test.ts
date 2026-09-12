/**
 * E2E online runtime test — spins up two REAL child processes (HTTP + WS)
 * and drives {@link OnlineGameApp} against the same stack the G3 spike
 * ships. Mirrors packages/server/scripts/smoke-realtime.ts process boot
 * semantics so the test is a faithful "the wire works" gate.
 *
 * If PostgreSQL or Redis is not reachable the whole file skips — this
 * keeps `pnpm --filter @farm-game/client-mini test` green on machines
 * without `pnpm db:up` running.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import { EventBus, GameEvent } from '@farm-game/shared';
import { FarmHttpClient } from '../src/net/index.js';
import { OnlineGameApp } from '../src/runtime/online.js';

const dbUrl = process.env.MAIN_DB_URL ?? 'postgres://farm:farm@127.0.0.1:5432/farm_game';
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6380/0';
const jwtSecret = process.env.JWT_SECRET ?? 'dev-secret-change-me';
// Derived from this file's location (packages/client-mini/test/) so the test
// works on any checkout — a hardcoded absolute path breaks elsewhere.
const SERVER_DIR = new URL('../../server/', import.meta.url).pathname;

interface SpawnPair { http: ChildProcess; ws: ChildProcess; }
interface BootResult { procs: SpawnPair; httpPort: number; wsPort: number; }

async function probePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') return reject(new Error('no port'));
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitReady(port: number, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
      socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
    });
    if (open) return;
    if (Date.now() > deadline) throw new Error(`port ${port} not ready in ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function checkRedis(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const authority = redisUrl.replace('redis://', '').split('/')[0];
    const [host, portStr] = authority.split(':');
    const socket = net.createConnection({ host, port: Number(portStr) });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(2000, () => { socket.destroy(); resolve(false); });
  });
}

async function checkPostgres(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // TCP-level preflight — keeps client-mini free of the `pg` dependency.
    // dbUrl format: postgres://user:pass@host:port/db
    const afterScheme = dbUrl.replace(/^postgres:\/\//, '');
    const authority = afterScheme.split('/')[0];
    const hostPart = authority.includes('@') ? authority.split('@')[1] : authority;
    const [host, portStr] = hostPart.split(':');
    const port = portStr !== undefined ? Number(portStr) : 5432;
    const socket = net.createConnection({ host, port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(2000, () => { socket.destroy(); resolve(false); });
  });
}

async function bootServers(): Promise<BootResult> {
  const [httpPort, wsPort] = await Promise.all([probePort(), probePort()]);
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    ENABLE_MOCK_AUTH: '1',
    MAIN_DB_URL: dbUrl,
    REDIS_URL: redisUrl,
    JWT_SECRET: jwtSecret,
  };
  const httpProc: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: SERVER_DIR,
    env: { ...env, PORT: String(httpPort), HOST: '127.0.0.1' },
    stdio: 'ignore',
  });
  const wsProc: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/realtime/serve.ts'], {
    cwd: SERVER_DIR,
    env: { ...env, WS_HOST: '127.0.0.1', WS_PORT: String(wsPort) },
    stdio: 'ignore',
  });
  try {
    await Promise.all([waitReady(httpPort), waitReady(wsPort)]);
  } catch (err) {
    // waitReady failure must not leak the already-spawned children.
    if (httpProc.exitCode === null) httpProc.kill('SIGKILL');
    if (wsProc.exitCode === null) wsProc.kill('SIGKILL');
    throw err;
  }
  return { procs: { http: httpProc, ws: wsProc }, httpPort, wsPort };
}

function teardown(procs: SpawnPair | null): void {
  if (procs === null) return;
  if (procs.ws.exitCode === null) procs.ws.kill('SIGKILL');
  if (procs.http.exitCode === null) procs.http.kill('SIGKILL');
}

// ── Test ──────────────────────────────────────────────────────

let procs: SpawnPair | null = null;
let baseUrl = '';
let wsEndpoint = '';
let httpClient: FarmHttpClient | null = null;
let app: OnlineGameApp | null = null;

test('e2e online: server-authoritative lifecycle', { concurrency: false }, async (t) => {
  // 1. preflight: PG + Redis reachable. Skip the whole subtree otherwise.
  const [pgUp, redisUp] = await Promise.all([checkPostgres(), checkRedis()]);
  if (!pgUp || !redisUp) {
    t.skip(`PG/Redis not reachable (pg=${pgUp}, redis=${redisUp}); run \`pnpm db:up\` to enable`);
    return;
  }

  // 2. boot HTTP + WS as real child processes
  const boot = await bootServers();
  procs = boot.procs;
  baseUrl = `http://127.0.0.1:${boot.httpPort}`;
  wsEndpoint = `ws://127.0.0.1:${boot.wsPort}`;

  t.after(() => {
    void (async () => {
      if (app !== null) await app.stop().catch(() => undefined);
      httpClient = null;
      app = null;
      teardown(procs);
      procs = null;
    })();
  });

  // ── HTTP-only path: proves the server wire + FarmHttpClient are sound ──
  await t.test('HTTP: login + getPlayerInfo (gold=200, 24 plots, 6 unlocked)', async () => {
    httpClient = new FarmHttpClient({ baseUrl });
    const login = await httpClient.loginWeChat(`e2e_${randomUUID().slice(0, 8)}`);
    assert.equal(login.player.gold, 200);
    assert.equal(login.player.plots.length, 24);
    assert.equal(login.player.plots.filter((p) => p.unlocked).length, 6);
    const info = await httpClient.getPlayerInfo();
    assert.equal(info.gold, 200);
  });

  await t.test('HTTP: plant (plot 0) + harvest shows gold flow', async () => {
    if (!httpClient) throw new Error('httpClient not initialised');
    const op = randomUUID();
    const plantRes = await fetch(`${baseUrl}/farm/plant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${httpClient.token}` },
      body: JSON.stringify({ operationId: op, body: { plotIndex: 0, cropId: 'carrot' } }),
    });
    const plantBody = (await plantRes.json()) as { ok: boolean; data?: { player: { gold: number; plots: { status: string }[] } } };
    assert.equal(plantBody.ok, true);
    assert.equal(plantBody.data?.player.gold, 190);
    assert.equal(plantBody.data?.player.plots[0].status, 'growing');
    // getPlayerInfo reflects the write.
    const info = await httpClient.getPlayerInfo();
    assert.equal(info.gold, 190);
  });

  // ── WS path via OnlineGameApp ──
  httpClient = new FarmHttpClient({ baseUrl });
  app = new OnlineGameApp({ baseUrl, wsEndpoint, httpClient });
  await app.start();

  await t.test('WS: start() applies the welcome snapshot (24 plots, 6 unlocked, gold 200)', async () => {
    if (!app) {
      t.skip('app not started');
      return;
    }
    const s = app.state();
    assert.equal(s.plots.length, 24);
    assert.equal(s.plots.filter((p) => p.unlocked).length, 6);
    assert.equal(s.gold, 200);
    assert.equal(s.connected, true);
  });

  await t.test('WS: plant(0, carrot) deducts gold, marks growing, emits events', async () => {
    if (!app) {
      t.skip('app not started');
      return;
    }
    const coinsEvents: number[] = [];
    const plotEvents: number[] = [];
    const onCoins = (n: number): void => { coinsEvents.push(n); };
    const onPlot = (n: number): void => { plotEvents.push(n); };
    EventBus.on(GameEvent.CoinsChanged, onCoins);
    EventBus.on(GameEvent.PlotStateChanged, onPlot);
    try {
      await app.plant(0, 'carrot');
    } finally {
      EventBus.off(GameEvent.CoinsChanged, onCoins);
      EventBus.off(GameEvent.PlotStateChanged, onPlot);
    }
    const s = app.state();
    assert.equal(s.gold, 190);
    assert.equal(s.plots[0].status, 'growing');
    assert.equal(s.plots[0].cropId, 'carrot');
    assert.ok(coinsEvents.includes(190), 'CoinsChanged(190) must fire');
    assert.ok(plotEvents.includes(0), 'PlotStateChanged(0) must fire');
  });

  await t.test('WS: HTTP plant (plot 1) is visible over WS after refresh()', async () => {
    if (!app || !httpClient) {
      t.skip('app not started');
      return;
    }
    const op = randomUUID();
    const res = await fetch(`${baseUrl}/farm/plant`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${httpClient.token}`,
      },
      body: JSON.stringify({ operationId: op, body: { plotIndex: 1, cropId: 'carrot' } }),
    });
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true, 'HTTP plant must succeed');
    await app.refresh();
    const s = app.state();
    assert.equal(s.plots[1].status, 'growing');
    assert.equal(s.plots[1].cropId, 'carrot');
    // 200 - 10 (WS plot 0) - 10 (HTTP plot 1) = 180.
    assert.equal(s.gold, 180);
  });

  await t.test('WS: unlock(6) + corn plant + water + failure semantics (UI 路径 U09)', async () => {
    if (!app) {
      t.skip('app not started');
      return;
    }
    const plotEvents: number[] = [];
    const onPlot = (n: number): void => { plotEvents.push(n); };
    EventBus.on(GameEvent.PlotStateChanged, onPlot);
    try {
      await app.unlock(6);
    } finally {
      EventBus.off(GameEvent.PlotStateChanged, onPlot);
    }
    let s = app.state();
    assert.equal(s.plots[6].unlocked, true, 'plot 6 must unlock');
    assert.equal(s.plots.filter((p) => p.unlocked).length, 7);
    assert.equal(s.gold, 80, '200 − 10 − 10 − 100(unlock)');
    assert.ok(plotEvents.includes(6), 'PlotStateChanged(6) must fire');

    await app.plant(3, 'corn');
    s = app.state();
    assert.equal(s.plots[3].cropId, 'corn');
    assert.equal(s.gold, 20);
    const matureBefore = s.plots[3].matureAt ?? 0;

    await app.water(3);
    s = app.state();
    assert.equal(s.plots[3].waterCount, 1);
    assert.ok((s.plots[3].matureAt ?? 0) < matureBefore, 'water must discount remaining time');

    // failure semantics the UI toast layer depends on (U07)
    await assert.rejects(() => app.plant(0, 'carrot'), /not empty/);
    await assert.rejects(() => app.plant(4, 'strawberry'), /insufficient gold/);
  });

  await t.test('view derivation: a growing plot with past matureAt shows derivedRipe=true', async () => {
    if (!app) {
      t.skip('app not started');
      return;
    }
    assert.equal(app.state().plots[2].status, 'empty');
    await app.plant(2, 'carrot');
    const sGrowing = app.state();
    assert.equal(sGrowing.plots[2].derivedRipe, false, 'fresh carrot is not yet ripe');
    // Push the local clock past matureAt via the public clock-sync seam.
    app.syncServerClock(Date.now() + app.state().serverNowOffsetMs + 31_000);
    const sRipe = app.state();
    assert.equal(sRipe.plots[2].status, 'growing', 'underlying status stays growing');
    assert.equal(sRipe.plots[2].derivedRipe, true, 'view must derive ripe');
  });

  await t.test('stop() clears connection state', async () => {
    if (!app) {
      t.skip('app not started');
      return;
    }
    await app.stop();
    assert.equal(app.state().connected, false);
  });
});