import automator from 'miniprogram-automator';
import { execSync } from 'node:child_process';

// automator internals occasionally reject background promises (e.g. queued
// commands after a timeout) — survive them, we poll state explicitly instead.
process.on('unhandledRejection', (err) => {
  console.log(`[unhandledRejection] ${String(err).slice(0, 120)}`);
});

function withTimeout(p, ms, tag) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${tag} timeout ${ms}ms`)), ms)),
  ]);
}

const logs = [];
const mini = await automator.launch({
  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  projectPath: '/Users/cairui/Code/farm-game/packages/client-mini/build/wechatgame',
  port: 9422,
  timeout: 120000,
});
console.log('LAUNCH OK');
mini.on('console', (msg) => {
  const text = (msg.args || []).map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  logs.push(`${msg.type}|${text}`);
});
console.log('console listener attached');

// patient wait: first tourist-mode run may download the base library (minutes).
// The game is "really alive" once it opens a socket to the WS backend.
const deadline = Date.now() + 180000;
let gameUp = false;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 5000));
  let out = '';
  try {
    out = execSync("lsof -nP -iTCP:2567 2>/dev/null | grep -i estab | grep -ci wechat || true").toString().trim();
  } catch { /* ignore */ }
  if (logs.length > 0) console.log(`[${Math.round((Date.now() - (deadline - 180000)) / 1000)}s] console lines: ${logs.length}`);
  if (out !== '0' && out !== '') {
    gameUp = true;
    console.log(`game connected to backend after ~${Math.round((Date.now() - (deadline - 180000)) / 1000)}s`);
    break;
  }
}
if (!gameUp) console.log('game did NOT connect to backend within 180s');

console.log('--- logs so far ---');
console.log(logs.slice(0, 30).join('\n') || '(none)');

try {
  const st = await withTimeout(mini.evaluate(() => {
    const s = globalThis.__farm && globalThis.__farm.state();
    return s ? { gold: s.gold, connected: s.connected, plots: s.plots.length } : null;
  }), 20000, 'evaluate');
  console.log('--- evaluate __farm.state ---');
  console.log(JSON.stringify(st));
} catch (e) {
  console.log('evaluate failed:', String(e).slice(0, 120));
}

console.log('--- backend connections ---');
try {
  console.log(execSync("lsof -nP -iTCP:2567 2>/dev/null | grep -i estab | head -4 || true").toString() || '(none on 2567)');
} catch { /* ignore */ }

await mini.disconnect().catch(() => undefined);
process.exit(0);
