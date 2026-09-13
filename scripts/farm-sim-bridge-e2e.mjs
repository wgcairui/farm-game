/**
 * Simulator E2E over the dev bridge (headless).
 *
 * Why not miniprogram-automator: for mini-GAMES the IDE answers only IDE-level
 * (Tool.*) commands; every App.* command returns "timeout waiting for
 * automator response" on Stable 2.02.2608070 (runbook §11.6). The bridge
 * (scripts/patch-wechat-build.mjs + scripts/farm-sim-telemetry.mjs) is the
 * equivalent input channel: raise → poll → evaluate `globalThis.__farm.*`.
 *
 * Prereqs:
 *   1. backend + DB up (see runbook §11.2): HTTP :3000, WS :2567, postgres
 *   2. bridge up:            node scripts/farm-sim-telemetry.mjs
 *   3. IDE + game running:   cli auto --project <build> --auto-port 9422 --trust-project
 *      (the game polls the bridge every 400ms once it boots)
 *
 * Run: node scripts/farm-sim-bridge-e2e.mjs
 * Exit code 0 = all checks pass.
 */
import { execSync } from 'node:child_process';

const BRIDGE = process.env.BRIDGE_URL ?? 'http://127.0.0.1:9877';
const PSQL = 'docker exec farm-game-postgres psql -U farm -d farm_game -t -A -c';
const GROWTH_WAIT_MS = Number(process.env.FARM_GROWTH_WAIT_MS ?? 31000);

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  ✖ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(path, init) {
  const res = await fetch(`${BRIDGE}${path}`, init);
  if (res.status === 404) return null;
  return res.json();
}

/** Raise a command into the game's poll queue, wait for its result. */
async function cmd(kind, opts = {}, timeoutMs = 15000) {
  const body = JSON.stringify({ kind, ...opts });
  const raised = await http('/enqueue', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  if (!raised?.id) throw new Error(`enqueue failed for ${kind}`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = await http(`/result/${raised.id}`);
    if (hit) {
      if (!hit.ok) throw new Error(`${kind} ${opts.name ?? ''} failed: ${hit.error}`);
      return hit.result;
    }
    await sleep(250);
  }
  throw new Error(`no result for ${kind} ${opts.name ?? ''} within ${timeoutMs}ms`);
}

const state = () => cmd('state');
async function lines() {
  const out = await http('/lines?since=0');
  return out?.lines ?? [];
}
async function waitForLine(pattern, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = (await lines()).find((l) => l.includes(pattern));
    if (hit) return hit;
    await sleep(500);
  }
  return null;
}

console.log(`== 0. bridge health (${BRIDGE}) ==`);
const health = await http('/health');
if (!health?.gameListening) {
  console.error('bridge has no game polling it. Start the game first (runbook §11.2).');
  process.exit(2);
}
console.log(`   game polling the bridge (lastPollTs=${health.lastPollTs})`);

console.log('== 1. console baseline ==');
await waitForLine('已连接服务端', 20000);
const all = (await lines()).map((l) => l.replace(/^\[\d\d:\d\d:\d\d\.\d\d\d\] /, ''));
check('server connected line', all.some((l) => l.includes('已连接服务端')));
check('no boot failure in console', !all.some((l) => l.includes('boot failed')), all.find((l) => l.includes('boot failed'))?.slice(0, 120) ?? '');
check('no missing sprite frame', !all.some((l) => l.includes('missing sprite frame')));
check('no unhandled rejection', !all.some((l) => l.includes('[onRejection]')));

console.log('== 2. UI state ==');
let s = await state();
check('state reachable via __farm', !!s, `gold=${s?.gold} rev=${s?.revision} unlocked=${s?.plots?.filter((p) => p.unlocked).length}/24`);
check('24 plots', s.plots.length === 24);
check('server-authoritative connection', s.connected === true);
check('plot 0 unlocked', s.plots[0].unlocked === true);

const playerId = execSync(`${PSQL} "SELECT player_id FROM auth_identities WHERE subject='mock_dev_cocos_simulator'"`).toString().trim();
console.log(`   player: ${playerId}`);
const db = (q) => execSync(`${PSQL} "${q}"`).toString().trim();
const dbGold = () => Number(db(`SELECT gold FROM players WHERE player_id='${playerId}'`));
const dbRev = () => Number(db(`SELECT revision FROM players WHERE player_id='${playerId}'`));
const dbPlot = (i) => db(`SELECT status FROM plots WHERE player_id='${playerId}' AND index=${i}`);
const dbUnlocked = () => Number(db(`SELECT count(*) FROM plots WHERE player_id='${playerId}' AND unlocked`));

console.log('== 2.5 fixtures — deterministic start state ==');
// Reruns must not depend on the previous run's leftovers (the unlock step
// needs a locked plot 6 and plot 0 empty to plant). Same fixture style as the
// gold top-up below: direct SQL + a refresh command to re-sync the UI.
db(`UPDATE plots SET unlocked = TRUE, status = 'empty', crop_id = NULL, planted_at = NULL, mature_at = NULL, water_count = 0 WHERE player_id = '${playerId}' AND index = 0`);
db(`UPDATE plots SET unlocked = FALSE, status = 'locked', crop_id = NULL, planted_at = NULL, mature_at = NULL, water_count = 0 WHERE player_id = '${playerId}' AND index = 6`);
await cmd('call', { path: '__farm.app.refresh' });
await sleep(1000);
s = await state();
check('fixture: plot 0 empty', s.plots[0].status === 'empty' && s.plots[0].unlocked === true, JSON.stringify(s.plots[0]));
check('fixture: plot 6 locked', s.plots[6].unlocked === false && s.plots[6].status === 'locked', JSON.stringify(s.plots[6]));

console.log('== 3. plant carrot (plot 0) ==');
const goldBefore = s.gold;
await cmd('action', { name: 'plant', args: [0, 'carrot'] });
await sleep(800);
s = await state();
check('UI gold −10 after plant', s.gold === goldBefore - 10, `${goldBefore} → ${s.gold}`);
check('UI plot 0 growing carrot', s.plots[0].status === 'growing' && s.plots[0].cropId === 'carrot');
check('DB gold matches UI', dbGold() === s.gold, `db=${dbGold()} ui=${s.gold}`);
check('DB plot 0 growing', dbPlot(0) === 'growing', dbPlot(0));

console.log('== 4. water (plot 0) ==');
const revBefore = s.revision;
await cmd('action', { name: 'water', args: [0] });
await sleep(800);
s = await state();
check('UI waterCount=1', s.plots[0].waterCount === 1, `w=${s.plots[0].waterCount}`);
check('DB revision bumped', dbRev() > revBefore, `${revBefore} → ${dbRev()}`);

console.log(`== 5. wait ${Math.round(GROWTH_WAIT_MS / 1000)}s for maturity ==`);
await sleep(GROWTH_WAIT_MS);
s = await state();
check('UI status still growing until harvest', s.plots[0].status === 'growing');
check('UI derivedRipe true', s.plots[0].derivedRipe === true);
check('DB still growing (server clock authoritative)', dbPlot(0) === 'growing', dbPlot(0));

console.log('== 6. harvest (plot 0) ==');
const goldRipe = s.gold;
await cmd('action', { name: 'harvest', args: [0] });
await sleep(800);
s = await state();
check('UI gold +25 after harvest', s.gold === goldRipe + 25, `${goldRipe} → ${s.gold}`);
check('UI plot 0 empty', s.plots[0].status === 'empty');
check('DB gold matches UI', dbGold() === s.gold, `db=${dbGold()} ui=${s.gold}`);
check('DB plot 0 empty', dbPlot(0) === 'empty', dbPlot(0));

console.log('== 7. unlock (plot 6) — top up gold via SQL, then real WS command ==');
execSync(`${PSQL} "UPDATE players SET gold = 500 WHERE player_id='${playerId}'"`);
await cmd('call', { path: '__farm.app.refresh' });
await sleep(1000);
s = await state();
check('refresh picked up SQL top-up', s.gold === 500, `gold=${s.gold}`);
const unlockedBefore = s.plots.filter((p) => p.unlocked).length;
await cmd('action', { name: 'unlock', args: [6] });
await sleep(800);
s = await state();
check('UI plot 6 unlocked', s.plots[6].unlocked === true);
check('UI gold −100 after unlock', s.gold === 400, `gold=${s.gold}`);
check('DB unlocked count +1', dbUnlocked() === unlockedBefore + 1, `db=${dbUnlocked()}`);
check('DB gold 400', dbGold() === 400, `db=${dbGold()}`);

console.log('== 8. runtime capability probes (get/call channel) ==');
// Capability question for the visual walkthrough: can a bridge command reach
// the Cocos scene graph (node positions / hit-area sizes) for a layout audit?
const paths = ['GameGlobal.canvas', 'cc.director', 'GameGlobal.cc', '__farm.app'];
for (const p of paths) {
  try {
    const v = await cmd('get', { path: p });
    const kind = v === null ? 'null' : typeof v;
    console.log(`   ${p}: ${kind}${kind === 'object' && v ? ` keys=${Object.keys(v).slice(0, 6).join(',')}` : ''}`);
  } catch (e) {
    console.log(`   ${p}: unavailable (${String(e.message).slice(0, 80)})`);
  }
}

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
