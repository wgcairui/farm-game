/**
 * Simulator E2E for the v13 UI home page (implementation-plan-ui-v13.md U16).
 *
 * Connects to WeChat DevTools automation (ws://127.0.0.1:9420), asserts the
 * console baseline, then drives the SAME public API the UI buttons call
 * (globalThis.__farm.actions.*) and asserts server truth via psql after every
 * step. Visual/dialog touches are not synthesizable in the simulator canvas
 * (runbook §10.6) — screenshot is captured for the visual checklist instead.
 *
 * Usage: node /tmp/farm-sim-e2e.mjs
 */

import automator from 'miniprogram-automator';
import { execSync } from 'node:child_process';

const PSQL = 'docker exec farm-game-postgres psql -U farm -d farm_game -t -A -c';

function db(query) {
  return execSync(`${PSQL} "${query}"`).toString().trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForLog(logs, needle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (logs.some((l) => l.includes(needle))) return;
    if (Date.now() > deadline) {
      throw new Error(`console baseline not seen in ${timeoutMs}ms: ${needle}\nLOGS:\n${logs.join('\n')}`);
    }
    await sleep(500);
  }
}

async function evalState(mini) {
  const raw = await mini.evaluate(() => {
    const s = globalThis.__farm && globalThis.__farm.state();
    return s === null ? null : {
      gold: s.gold, gems: s.gems, revision: s.revision, connected: s.connected,
      plots: s.plots.map((p) => ({ i: p.index, u: p.unlocked, st: p.status, c: p.cropId || null, w: p.waterCount })),
    };
  });
  if (raw === null || raw === undefined) throw new Error('__farm.state() unavailable (evaluate failed)');
  return raw;
}

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

const logs = [];
// Force-launch mode: a stale automation port answers TCP but never completes
// the protocol handshake — a fresh IDE + fresh port is the reliable path.
const AUTO_PORT = process.env.AUTO_PORT ? Number(process.env.AUTO_PORT) : 9421;
let mini = null;
if (process.env.FARM_SKIP_LAUNCH) {
  mini = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}` });
  console.log(`connected to existing automation port ${AUTO_PORT}`);
} else {
  mini = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath: '/Users/cairui/Code/farm-game/packages/client-mini/build/wechatgame',
    port: AUTO_PORT,
    timeout: 120000,
  });
  console.log(`launched IDE with automation on port ${AUTO_PORT}`);
}
mini.on('console', (msg) => {
  const text = (msg.args || []).map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  logs.push(`${msg.type}|${text}`);
});
mini.on('exception', (err) => logs.push(`EXCEPTION|${err && err.message}`));

console.log('== 1. console baseline ==');
try {
  await waitForLog(logs, '[wx-compat] installed', 20000);
  check('wx-compat installed line', true);
} catch (e) {
  check('wx-compat installed line', false, String(e.message).slice(0, 200));
}
try {
  await waitForLog(logs, '[OnlineFarm] 已连接服务端', 60000);
  check('connected baseline', true);
} catch (e) {
  check('connected baseline', false, String(e.message).slice(0, 400));
}

console.log('== 2. UI state ==');
let s = null;
try {
  s = await evalState(mini);
  check('state reachable via __farm', true, `gold=${s.gold} rev=${s.revision} unlocked=${s.plots.filter((p) => p.u).length}/24`);
  check('24 plots', s.plots.length === 24);
  check('server-authoritative connection', s.connected === true);
} catch (e) {
  check('state reachable via __farm', false, String(e.message).slice(0, 300));
}

// player id from DB (fixed mock code → single player)
const playerId = db("SELECT player_id FROM auth_identities WHERE subject='mock_dev_cocos_simulator'");
console.log(`   player: ${playerId}`);
const dbGold = () => Number(db(`SELECT gold FROM players WHERE player_id='${playerId}'`));
const dbRev = () => Number(db(`SELECT revision FROM players WHERE player_id='${playerId}'`));
const dbPlot = (i) => db(`SELECT status FROM plots WHERE player_id='${playerId}' AND index=${i}`);
const dbUnlocked = () => Number(db(`SELECT count(*) FROM plots WHERE player_id='${playerId}' AND unlocked`));

console.log('== 3. plant carrot (plot 0) — optimistic UI → server truth ==');
if (s) {
  const goldBefore = s.gold;
  await mini.evaluate(() => globalThis.__farm.actions.plant(0, 'carrot'));
  await sleep(800);
  s = await evalState(mini);
  check('UI gold −10 after plant', s.gold === goldBefore - 10, `${goldBefore} → ${s.gold}`);
  check('UI plot 0 growing', s.plots[0].st === 'growing' && s.plots[0].c === 'carrot');
  check('DB gold matches UI', dbGold() === s.gold, `db=${dbGold()} ui=${s.gold}`);
  check('DB plot 0 growing', dbPlot(0) === 'growing', dbPlot(0));

  console.log('== 4. water (plot 0) ==');
  const revBefore = s.revision;
  await mini.evaluate(() => globalThis.__farm.actions.water(0));
  await sleep(800);
  s = await evalState(mini);
  check('UI waterCount=1', s.plots[0].w === 1);
  check('DB revision bumped', dbRev() > revBefore, `${revBefore} → ${dbRev()}`);

  console.log('== 5. wait 31s for maturity ==');
  await sleep(31000);
  s = await evalState(mini);
  check('UI derivedRipe (status growing until harvest)', s.plots[0].st === 'growing');
  check('DB still growing (server clock authoritative)', dbPlot(0) === 'growing', dbPlot(0));

  console.log('== 6. harvest (plot 0) ==');
  const goldRipe = s.gold;
  await mini.evaluate(() => globalThis.__farm.actions.harvest(0));
  await sleep(800);
  s = await evalState(mini);
  check('UI gold +25 after harvest', s.gold === goldRipe + 25, `${goldRipe} → ${s.gold}`);
  check('UI plot 0 empty', s.plots[0].st === 'empty');
  check('DB gold matches UI', dbGold() === s.gold, `db=${dbGold()} ui=${s.gold}`);
  check('DB plot 0 empty', dbPlot(0) === 'empty', dbPlot(0));

  console.log('== 7. unlock (plot 6) — top up gold via SQL, then real WS command ==');
  execSync(`${PSQL} "UPDATE players SET gold = 500 WHERE player_id='${playerId}'"`);
  await mini.evaluate(() => globalThis.__farm.app.refresh());
  await sleep(800);
  s = await evalState(mini);
  check('refresh picked up SQL top-up', s.gold === 500, `gold=${s.gold}`);
  const unlockedBefore = s.plots.filter((p) => p.u).length;
  await mini.evaluate(() => globalThis.__farm.actions.unlock(6));
  await sleep(800);
  s = await evalState(mini);
  check('UI plot 6 unlocked', s.plots[6].u === true);
  check('UI gold −100 after unlock', s.gold === 400, `gold=${s.gold}`);
  check('DB unlocked count +1', dbUnlocked() === unlockedBefore + 1, `db=${dbUnlocked()}`);
  check('DB gold 400', dbGold() === 400, `db=${dbGold()}`);

  console.log('== 8. screenshots for the visual checklist ==');
  try {
    await mini.screenshot({ path: '/tmp/farm-sim-home.png' });
    console.log('   saved /tmp/farm-sim-home.png');
  } catch (e) {
    console.log(`   screenshot unavailable: ${String(e).slice(0, 120)}`);
  }
}

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
await mini.disconnect();
process.exit(fail > 0 ? 1 : 0);
