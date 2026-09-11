/**
 * Root-level smoke: boot @farm-game/server on an ephemeral port, run the
 * canonical Phase 1 handshake chain via @farm-game/client-app's ApiClient,
 * then exit 0 on success / non-zero on any contract mismatch.
 *
 *   1. GET  /healthz             — protocol version echo
 *   2. POST /auth/wechat         — stub login → JWT + AuthContext
 *   3. GET  /crop/configs        — 5 crops from shared CROPS
 *   4. GET  /player/info         — bearer-protected; returns the save from #2
 *   5. POST /farm/unlock         — bearer-protected; flips plot[8].unlocked
 *
 * Plus a final assertion: PROTOCOL_VERSION from shared matches /healthz.
 *
 * Run: `pnpm smoke`  (defined in root package.json).
 */

import { buildApp } from '../packages/server/dist/app.js';
import { loadConfig } from '../packages/server/dist/config.js';
import { ApiClient } from '../packages/client-app/dist/index.js';
import { Platform, PROTOCOL_VERSION } from '../packages/shared/dist/index.js';

const CHECKS: Array<{ name: string; pass: boolean; detail?: unknown }> = [];

function expect(name: string, condition: boolean, detail?: unknown): void {
  CHECKS.push({ name, pass: condition, detail });
  // eslint-disable-next-line no-console
  console.log(`${condition ? '✔' : '✖'} ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
}

async function main(): Promise<number> {
  const config = loadConfig({
    port: 0,
    host: '127.0.0.1',
    jwtSecret: 'smoke-secret',
    enableAdmin: false,
    enableMockAuth: true,
  });

  const app = await buildApp({ config });
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
    // 1. /healthz
    const health = await client.getHealth();
    expect('GET /healthz ok', health.ok === true);
    expect('PROTOCOL_VERSION matches shared', health.protocolVersion === PROTOCOL_VERSION, {
      server: health.protocolVersion,
      shared: PROTOCOL_VERSION,
    });

    // 2. /auth/wechat
    const login = await client.loginWeChat({ code: 'mock_smoke_code_xyz' });
    expect('POST /auth/wechat ok', login.ok === true);
    if (!login.ok) throw new Error(login.message);
    const { token, player } = login.data;
    expect('login.player.playerId is uuid-like', /^[0-9a-f-]{8,}$/i.test(player.playerId), player.playerId);
    expect('login.player.identities[0].subject matches code', player.identities[0]?.subject === 'mock_smoke_code_xyz');
    client.setToken(token);

    // 3. /crop/configs
    const crops = await client.getCropConfigs();
    expect('GET /crop/configs ok', crops.ok === true);
    if (!crops.ok) throw new Error(crops.message);
    expect('crop count == 5', crops.data.crops.length === 5);

    // 4. /player/info
    const me = await client.getPlayerInfo();
    expect('GET /player/info ok', me.ok === true);
    if (!me.ok) throw new Error(me.message);
    expect('me.plots.length == 24', me.data.plots.length === 24);
    expect('me.gold == 200', me.data.gold === 200);

    // 5. /farm/unlock
    const unlock = await client.unlockPlot(8);
    expect('POST /farm/unlock ok', unlock.ok === true);
    if (!unlock.ok) throw new Error(unlock.message);
    expect('plot[8] now unlocked', unlock.data.plot.unlocked === true);

    // 6. ENABLE_ADMIN=0 admin boundary
    const adminHealth = await fetch(`${baseUrl}/admin/healthz`);
    expect('GET /admin/healthz == 200', adminHealth.status === 200);
    const adminBody = (await adminHealth.json()) as { enabled: boolean };
    expect('admin.enabled == false', adminBody.enabled === false);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('smoke threw:', err);
    await app.close();
    return 1;
  }

  await app.close();

  const failed = CHECKS.filter((c) => !c.pass);
  // eslint-disable-next-line no-console
  console.log(`\nsmoke summary: ${CHECKS.length - failed.length}/${CHECKS.length} passed`);
  return failed.length === 0 ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  // eslint-disable-next-line no-console
  console.error('smoke crashed:', err);
  process.exit(2);
});