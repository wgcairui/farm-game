/**
 * Post-build patch for the G4 release build (run after every release Cocos CLI
 * build — the build regenerates all of these files). Idempotent.
 *
 * Differences from patch-wechat-build.mjs (debug build):
 *   - `enhance: false` is NOT applied: release bundles already minify via
 *     babel; turning enhance off re-introduces a separate transpile pass that
 *     double-minifies (bloats the bundle). We trust the release pipeline.
 *   - No game.js dev bridge / telemetry injection: release G4 must not
 *     expose 127.0.0.1:9877 to the wire.
 *
 * Still applied:
 *   - urlCheck=false (devtools G4 reset otherwise blocks 127.0.0.1 calls)
 *   - appid=wx39a9fdbb628725fd (upload target)
 *   - libVersion=3.17.2 (Stable 2.02.2608070 default)
 *   - game.json networkTimeout stripped (runbook §11.5)
 *
 * Usage: node scripts/patch-release-build.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../packages/client-mini/build/wechatgame/', import.meta.url).pathname;

// ── 1. project.config.json ────────────────────────────────────────────────
const pcPath = `${ROOT}project.config.json`;
const pc = JSON.parse(readFileSync(pcPath, 'utf8'));
pc.setting = { ...(pc.setting ?? {}), urlCheck: false };
pc.appid = 'wx39a9fdbb628725fd';
pc.libVersion = '3.17.2';
writeFileSync(pcPath, `${JSON.stringify(pc, null, 2)}\n`);
console.log('patched project.config.json (release: urlCheck/appid/libVersion, no enhance override)');

// ── 2. game.json ──────────────────────────────────────────────────────────
const gameJsonPath = `${ROOT}game.json`;
const gameJson = JSON.parse(readFileSync(gameJsonPath, 'utf8'));
if ('networkTimeout' in gameJson) {
  delete gameJson.networkTimeout;
  writeFileSync(gameJsonPath, `${JSON.stringify(gameJson, null, 4)}\n`);
  console.log('patched game.json (removed networkTimeout)');
} else {
  console.log('game.json already clean');
}
