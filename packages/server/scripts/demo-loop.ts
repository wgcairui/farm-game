/**
 * demo-loop — G1 HTTP demo (ADR-0003).
 *
 * Requires a running PostgreSQL container (`pnpm db:up`) and a freshly
 * migrated schema (`pnpm db:migrate`). Boots the server in-process
 * against `MAIN_DB_URL`, then runs the canonical farming loop against a
 * real HTTP boundary:
 *
 *   1. POST /auth/wechat            → JWT + fresh player
 *   2. GET  /player/info            → 200 gold, 24 plots, 6 unlocked
 *   3. POST /farm/unlock plot[6]    → 100 gold spent
 *   4. POST /farm/plant plot[0] carrot → 10 gold spent, matureAt ≈ now + 30s
 *   5. POST /farm/water plot[0]     → matureAt moves 5% earlier
 *   6. Wait until matureAt <= now
 *   7. POST /farm/harvest plot[0]   → 25 gold awarded
 *   8. Retry with SAME operationId  → idempotent (gold unchanged)
 *   9. Reuse operationId with DIFFERENT params → BAD_REQUEST
 *
 * Run: `pnpm --filter @farm-game/server demo:loop` (after `pnpm db:up`).
 */

import {
  type ApiResponse,
  type FarmUnlockResponse,
  type FarmPlantResponse,
  type FarmWaterResponse,
  type FarmHarvestResponse,
  type LoginResponse,
  PROTOCOL_VERSION,
  Platform,
} from '@farm-game/shared';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildApp } from '../src/app.js';
import { buildMainDbOptions } from '../src/db/mikro-orm.config.js';
import { loadConfig } from '../src/config.js';
import { ApiClient, makeOperationId } from '@farm-game/client-app';

const FAILURES: string[] = [];

function expect(name: string, condition: boolean, detail?: unknown): void {
  // eslint-disable-next-line no-console
  console.log(`${condition ? '✔' : '✖'} ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
  if (!condition) FAILURES.push(name);
}

async function call<T>(label: string, p: Promise<ApiResponse<T>>): Promise<T> {
  const res = await p;
  expect(`${label} ok`, res.ok === true, !res.ok ? { code: res.code, message: res.message } : undefined);
  if (!res.ok) throw new Error(`${label} failed: ${'message' in res ? res.message : 'unknown'}`);
  return res.data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<number> {
  const dbUrl = process.env.MAIN_DB_URL ?? process.env.TEST_DB_URL;
  if (!dbUrl) {
    // eslint-disable-next-line no-console
    console.error('demo-loop requires MAIN_DB_URL (start postgres + migrate first).');
    return 2;
  }
  const config = loadConfig({
    port: 0,
    host: '127.0.0.1',
    jwtSecret: 'demo-secret',
    enableAdmin: false,
    enableMockAuth: true,
  });
  const orm = await MikroORM.init(buildMainDbOptions(dbUrl));
  const app = await buildApp({ config, orm });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr !== 'object') {
    // eslint-disable-next-line no-console
    console.error('server did not return an address');
    return 2;
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const client = new ApiClient({ baseUrl, platform: Platform.WeChatMini });

  try {
    const code = `mock_demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 1. login
    const login = await call<LoginResponse>('POST /auth/wechat', client.loginWeChat({ code }));
    expect('login.serverNow present', typeof login.serverNow === 'number');
    expect('login.revision is 0', login.revision === 0);
    expect('login.player.gold == 200', login.player.gold === 200);
    expect('login.player.plots.length == 24', login.player.plots.length === 24);
    expect('PROTOCOL_VERSION == 2.0.0', PROTOCOL_VERSION === '2.0.0');
    client.setToken(login.token);

    // 2. /player/info
    const me = await call('GET /player/info', client.getPlayerInfo());
    expect('me.gold == 200', me.gold === 200);
    expect('me.plots[6].unlocked == false', me.plots[6]?.unlocked === false);

    // 3. unlock plot 6 (100 gold spent)
    const unlock = await call<FarmUnlockResponse>('POST /farm/unlock plot[6]', client.unlockPlot(6));
    expect('unlock goldSpent == 100', unlock.payload.goldSpent === 100);
    expect('unlock revision == 1', unlock.revision === 1);
    expect('unlock player gold 100', unlock.player.gold === 100);
    expect('unlock plot[6].unlocked', unlock.player.plots[6]?.unlocked === true);

    // 4. plant carrot on plot 0
    const plant = await call<FarmPlantResponse>('POST /farm/plant plot[0] carrot', client.plantPlot(0, 'carrot'));
    expect('plant revision == 2', plant.revision === 2);
    expect('plant player gold 90', plant.player.gold === 90);
    expect('plant plot[0].cropId', plant.player.plots[0]?.cropId === 'carrot');
    const matureAt = plant.payload.plot.matureAt;
    expect(
      'plant matureAt in ~30s',
      typeof matureAt === 'number' && matureAt > Date.now() + 20_000 && matureAt < Date.now() + 35_000,
    );

    // 5. water once → matureAt moves earlier
    const beforeWater = matureAt!;
    const water = await call<FarmWaterResponse>('POST /farm/water plot[0]', client.waterPlot(0));
    expect('water revision == 3', water.revision === 3);
    expect('water maturedAt earlier', (water.payload.plot.matureAt ?? 0) < beforeWater);

    // 6. wait until ripe
    const waitMs = Math.max(0, (water.payload.plot.matureAt ?? Date.now()) - Date.now()) + 500;
    // eslint-disable-next-line no-console
    console.log(`waiting ${Math.round(waitMs / 1000)}s for plot[0] to ripen…`);
    await sleep(waitMs);

    // 7. harvest
    const harvest = await call<FarmHarvestResponse>('POST /farm/harvest plot[0]', client.harvestPlot(0));
    expect('harvest revision == 4', harvest.revision === 4);
    expect('harvest goldAwarded == 25', harvest.payload.goldAwarded === 25);
    expect('harvest player gold 115', harvest.player.gold === 115);

    // 8. idempotent retry — same operationId, same body → no double-deduct
    const op = makeOperationId();
    const before = await call('GET /player/info (pre-idempotent)', client.getPlayerInfo());
    await call('seed plant with op', client.plantPlot(0, 'carrot', op));
    const after1 = await call('GET /player/info (post plant)', client.getPlayerInfo());
    expect('first plant deducted 10g', before.gold - after1.gold === 10);
    const after2 = await call('idempotent plant retry', client.plantPlot(0, 'carrot', op));
    expect('idempotent retry did NOT deduct gold a second time', after2.player.gold === after1.gold);
    expect('idempotent retry preserved revision', after2.revision === after1.revision);

    // 9. dup operationId with DIFFERENT params → ok:false
    const dupOp = makeOperationId();
    await call('seed dup-op with plot[1]', client.plantPlot(1, 'carrot', dupOp));
    const dupRetry = await client.plantPlot(0, 'carrot', dupOp);
    expect('dup operationId w/ diff params returns ok:false', dupRetry.ok === false, {
      code: dupRetry.ok ? undefined : dupRetry.code,
      message: dupRetry.ok ? undefined : dupRetry.message,
    });

    // eslint-disable-next-line no-console
    console.log(`\ndemo summary: ${FAILURES.length === 0 ? 'all green' : `${FAILURES.length} failures`}`);
    if (FAILURES.length > 0) {
      // eslint-disable-next-line no-console
      console.log('failures:', FAILURES);
    }
    return FAILURES.length === 0 ? 0 : 1;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('demo crashed:', err);
    return 1;
  } finally {
    await app.close();
    await orm.close(true);
  }
}

main().then((code) => process.exit(code)).catch((err) => {
  // eslint-disable-next-line no-console
  console.error('demo crashed:', err);
  process.exit(2);
});