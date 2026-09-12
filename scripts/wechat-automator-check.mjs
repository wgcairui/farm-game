/**
 * WeChat devtools automation harness — connects to the simulator running the
 * wechatgame build and asserts the G3 acceptance loop (login → plant → grow
 * → harvest) against the real backend.
 *
 * Prereqs:
 *   1. Backend up: HTTP :3000 + WS :2567 (pnpm --filter @farm-game/server dev / dev:ws)
 *   2. DevTools automation: wechatwebdevtools cli auto \
 *        --project packages/client-mini/build/wechatgame --auto-port 9420
 *
 * Run: node scripts/wechat-automator-check.mjs [--drive]
 *   --drive  actively plants/waters/harvests via the exposed window.__farm
 *            (default: observe-only)
 */
import { createRequire } from 'node:module';
import automator from 'miniprogram-automator';

// The automation handshake for mini-GAME projects omits the version fields
// that miniprogram-automator's checkVersion compares — skip it.
const requireCjs = createRequire(import.meta.url);
const MiniProgramMod = requireCjs('miniprogram-automator/out/MiniProgram');
const MiniProgramClass = MiniProgramMod.default ?? MiniProgramMod;
MiniProgramClass.prototype.checkVersion = async function checkVersion() {};

const DRIVE = process.argv.includes('--drive');
const wsEndpoint = process.env.WS_AUTOMATOR_ENDPOINT ?? 'ws://127.0.0.1:9420';

const mp = await automator.connect({ wsEndpoint });
console.log(`connected: ${wsEndpoint}`);

const sys = await mp.systemInfo();
console.log(`simulator: platform=${sys.platform} SDK=${sys.SDKVersion}`);

const runtime = await mp.evaluate(() => ({
  hasCC: typeof globalThis.cc !== 'undefined',
  hasFarm: typeof globalThis.__farm !== 'undefined',
  wxDefined: typeof globalThis.wx !== 'undefined',
  websocketDefined: typeof globalThis.WebSocket !== 'undefined',
}));
console.log('runtime:', JSON.stringify(runtime));
if (!runtime.hasFarm) {
  console.error('window.__farm missing — game did not boot OnlineFarm');
  await mp.disconnect();
  process.exit(1);
}

async function state() {
  return mp.evaluate(() => {
    const s = globalThis.__farm.state();
    return {
      ok: true, playerId: s.playerId, gold: s.gold, connected: s.connected,
      revision: s.revision,
      unlocked: s.plots.filter((p) => p.unlocked).length,
      plot0: { status: s.plots[0].status, derivedRipe: s.plots[0].derivedRipe, cropId: s.plots[0].cropId ?? null },
      plot1: { status: s.plots[1].status, derivedRipe: s.plots[1].derivedRipe, cropId: s.plots[1].cropId ?? null },
    };
  });
}

const boot = await state();
console.log('boot state:', JSON.stringify(boot));

if (!DRIVE) {
  await mp.disconnect();
  process.exit(0);
}

const snap = (label, s) => console.log(`${label}: gold=${s.gold} plot0=${s.plot0.status}${s.plot0.derivedRipe ? '(ripe*)' : ''} plot1=${s.plot1.status}`);

// ── plant via the real click handler path (TOUCH_END on Plot_0) ──
await mp.evaluate(() => {
  const scene = globalThis.cc.director.getScene();
  const plot = scene.getChildByName('Canvas').getChildByName('Plot_0');
  plot.dispatchEvent(globalThis.cc.Node.EventType.TOUCH_END, true);
});
await new Promise((r) => setTimeout(r, 1500));
snap('after plant  ', await state());

// ── wait for the 30s carrot growth (poll until derivedRipe) ──
let ripe = false;
for (let i = 0; i < 40; i += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await state();
  if (s.plot0.derivedRipe) { ripe = true; break; }
}
console.log(`growth: plot0 ripe=${ripe}`);
snap('pre-harvest  ', await state());

// ── harvest via the click handler path ──
await mp.evaluate(() => {
  const scene = globalThis.cc.director.getScene();
  const plot = scene.getChildByName('Canvas').getChildByName('Plot_0');
  plot.dispatchEvent(globalThis.cc.Node.EventType.TOUCH_END, true);
});
await new Promise((r) => setTimeout(r, 1500));
snap('after harvest', await state());

await mp.disconnect();
