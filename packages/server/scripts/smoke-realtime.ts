/**
 * Realtime smoke — the G2 stack end-to-end with TWO REAL PROCESSES:
 * the HTTP entry (Fastify) and the WS entry (Colyseus + Redis), plus real
 * PostgreSQL and Redis from the dev compose.
 *
 * Flow (each step prints ✓):
 *   1. preflight: PostgreSQL + Redis reachable
 *   2. boot both entries as child processes on ephemeral ports
 *   3. HTTP login (mock WeChat code) → token + playerId
 *   4. WS joinOrCreate('farm') → farm_refresh → full welcome snapshot
 *   5. WS plant → cmd_result (operationId idempotency path shared with HTTP)
 *   6. HTTP /player/info → gold matches the WS command result
 *   7. HTTP plant (different plot) → WS farm_refresh sees the HTTP write
 *   8. SIGTERM the WS entry → exit 0 with the lease released
 *
 * Run: `pnpm smoke:realtime` (needs `pnpm db:up` + `pnpm db:migrate`).
 * Writes one throwaway player into the configured MAIN_DB_URL.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import { createSigner } from 'fast-jwt';
import { ColyseusSDK, type Room as SdkRoom } from '@colyseus/sdk';
// Dev-only side-effect import: patches the SDK Room prototype with
// waitForMessage (same as the integration tests).
import '@colyseus/testing';
import { CROPS, PROTOCOL_VERSION, type PlayerSave } from '@farm-game/shared';

const dbUrl = process.env.MAIN_DB_URL ?? 'postgres://farm:farm@127.0.0.1:5432/farm_game';
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6380/0';
const jwtSecret = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const SERVER_DIR = new URL('..', import.meta.url).pathname;

let passed = 0;
function ok(step: string, detail = ''): void {
  passed += 1;
  console.log(`  ✓ ${step}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<number> {
  console.log(`smoke-realtime: db=${dbUrl} redis=${redisUrl}`);

  // 1. preflight
  const pg = new (await import('pg')).Pool({ connectionString: dbUrl, max: 1 });
  try {
    await pg.query('SELECT 1');
    ok('PostgreSQL reachable');
  } catch (err) {
    console.error(`  ✗ PostgreSQL not reachable at ${dbUrl} — run \`pnpm db:up\` first`);
    await pg.end().catch(() => undefined);
    return 1;
  }
  const redisAlive = await new Promise<boolean>((resolve) => {
    const authority = redisUrl.replace('redis://', '').split('/')[0];
    const [host, portStr] = authority.split(':');
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
  if (!redisAlive) {
    console.error(`  ✗ Redis not reachable at ${redisUrl} — run \`pnpm db:up\` first`);
    await pg.end();
    return 1;
  }
  ok('Redis reachable');
  await pg.end();

  // 2. boot both entries as real child processes
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

  const httpPort = await probePort();
  const wsPort = await probePort();
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

  async function waitReady(port: number, timeoutMs = 25_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const open = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ host: '127.0.0.1', port });
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
      if (open) return;
      if (Date.now() > deadline) throw new Error(`port ${port} not ready in ${timeoutMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  let room: SdkRoom | null = null;
  try {
    await Promise.all([waitReady(httpPort), waitReady(wsPort)]);
    ok('HTTP + WS entries listening (two real processes)', `http:${httpPort} ws:${wsPort}`);

    // 3. HTTP login
    const code = `smoke_${randomUUID().slice(0, 16)}`;
    const loginRes = await fetch(`http://127.0.0.1:${httpPort}/auth/wechat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const login = (await loginRes.json()) as { ok: boolean; data?: { token: string; player: PlayerSave } };
    if (!login.ok || !login.data) throw new Error(`login failed: ${JSON.stringify(login).slice(0, 200)}`);
    const playerId = login.data.player.playerId;
    ok('HTTP login (mock WeChat) issued token', `playerId=${playerId}`);

    // 4. WS join + full snapshot
    const sdk = new ColyseusSDK(`ws://127.0.0.1:${wsPort}`);
    room = await sdk.joinOrCreate('farm', { ownerId: playerId, token: login.data.token });
    // Acknowledge broadcast messages so the SDK does not warn about
    // unregistered types (this smoke pulls snapshots instead).
    room.onMessage('plot_updated', () => undefined);
    room.onMessage('gold_updated', () => undefined);
    room.send('farm_refresh', { v: PROTOCOL_VERSION, t: 'farm_refresh', p: null });
    const welcome = (await room.waitForMessage('welcome', 5000)) as { p: { player: PlayerSave; roomId: string } };
    if (welcome.p.player.plots.length !== 24) throw new Error(`expected 24 plots, got ${welcome.p.player.plots.length}`);
    if (welcome.p.player.plots.filter((p) => p.unlocked).length !== 6) throw new Error('expected 6 unlocked plots');
    ok('WS join + farm_refresh full snapshot', `roomId=${welcome.p.roomId} revision=${welcome.p.player.revision}`);

    // 5. WS plant
    const op1 = randomUUID();
    room.send('farm_cmd', { v: PROTOCOL_VERSION, t: 'farm_cmd', r: op1, p: { command: 'plant', operationId: op1, body: { plotIndex: 0, cropId: 'carrot' } } });
    const result = (await room.waitForMessage('cmd_result', 5000)) as { r: string; p: { player: PlayerSave } };
    if (result.r !== op1) throw new Error('cmd_result r mismatch');
    const goldAfterWsPlant = result.p.player.gold;
    if (goldAfterWsPlant !== 200 - CROPS.carrot.seedPrice) throw new Error(`gold after WS plant = ${goldAfterWsPlant}`);
    ok('WS plant → cmd_result', `gold=${goldAfterWsPlant}`);

    // 6. HTTP sees the WS write
    const infoRes = await fetch(`http://127.0.0.1:${httpPort}/player/info`, {
      headers: { authorization: `Bearer ${login.data.token}` },
    });
    const info = (await infoRes.json()) as { ok: boolean; data?: PlayerSave };
    if (!info.ok || !info.data) throw new Error('/player/info failed');
    if (info.data.gold !== goldAfterWsPlant) throw new Error(`HTTP gold ${info.data.gold} ≠ WS gold ${goldAfterWsPlant}`);
    if (info.data.plots[0]?.status !== 'growing') throw new Error('plot 0 not growing over HTTP');
    ok('HTTP /player/info reflects the WS write');

    // 7. HTTP write → visible over WS via farm_refresh
    const op2 = randomUUID();
    const httpPlant = await fetch(`http://127.0.0.1:${httpPort}/farm/plant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.data.token}` },
      body: JSON.stringify({ operationId: op2, body: { plotIndex: 1, cropId: 'carrot' } }),
    });
    const httpPlantBody = (await httpPlant.json()) as { ok: boolean };
    if (!httpPlantBody.ok) throw new Error(`HTTP plant failed: ${JSON.stringify(httpPlantBody).slice(0, 200)}`);
    room.send('farm_refresh', { v: PROTOCOL_VERSION, t: 'farm_refresh', p: null });
    const welcome2 = (await room.waitForMessage('welcome', 5000)) as { p: { player: PlayerSave } };
    if (welcome2.p.player.plots[1]?.status !== 'growing') throw new Error('plot 1 not growing over WS');
    if (welcome2.p.player.gold !== goldAfterWsPlant - CROPS.carrot.seedPrice) throw new Error('gold mismatch after HTTP plant');
    ok('HTTP write visible over WS via farm_refresh', `gold=${welcome2.p.player.gold}`);

    // 8. graceful shutdown of the WS entry
    const exitCode = await new Promise<number | null>((resolve) => {
      wsProc.once('exit', (c) => resolve(c));
      wsProc.kill('SIGTERM');
    });
    if (exitCode !== 0) throw new Error(`WS entry exited with ${exitCode}`);
    ok('WS entry SIGTERM → exit 0 (drain + lease release)');

    console.log(`\nsmoke-realtime summary: ${passed}/${passed} passed`);
    return 0;
  } catch (err) {
    console.error(`  ✗ ${(err as Error).message}`);
    console.error(`\nsmoke-realtime summary: ${passed} passed before failure`);
    return 1;
  } finally {
    room?.leave().catch(() => undefined);
    if (wsProc.exitCode === null) wsProc.kill('SIGKILL');
    if (httpProc.exitCode === null) httpProc.kill('SIGKILL');
  }
}

process.exitCode = await main();
