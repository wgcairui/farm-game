/**
 * Post-build patches for build/wechatgame (run after every Cocos CLI build —
 * the build regenerates all of these files). Idempotent.
 *
 * 1. project.config.json: urlCheck=false (devtools resets it), appid=touristappid
 *    (stale AppIDs fail `cli open/auto` with code 10 — runbook §11.3),
 *    libVersion pinned to 3.17.2.
 * 2. game.json: drop networkTimeout — devtools validator false-positives
 *    "networkTimeout 字段需为 object" on the generated 500000ms downloadFile
 *    value (runbook §11.5). The field is not load-bearing.
 * 3. game.js: console telemetry -> scripts/farm-sim-telemetry.mjs (port 9877)
 *    plus GameGlobal.global fallback. New base libraries (3.17.x subcontext)
 *    no longer predefine bare `global` for the engine bundles, and telemetry
 *    keeps the E2E/console visible when the automation protocol is wedged
 *    (runbook §11.6).
 *
 * Usage: node scripts/patch-wechat-build.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../packages/client-mini/build/wechatgame/', import.meta.url).pathname;

// ── 1. project.config.json ────────────────────────────────────────────────
const pcPath = `${ROOT}project.config.json`;
const pc = JSON.parse(readFileSync(pcPath, 'utf8'));
pc.setting = { ...(pc.setting ?? {}), urlCheck: false, enhance: false };
pc.appid = 'wx39a9fdbb628725fd';
pc.libVersion = '3.17.2';
writeFileSync(pcPath, `${JSON.stringify(pc, null, 2)}\n`);
console.log('patched project.config.json (urlCheck/appid/libVersion)');

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

// ── 3. game.js ────────────────────────────────────────────────────────────
const gameJsPath = `${ROOT}game.js`;
const MARKER = 'function __initApp () {  // init app';
const HOOK = `function __initApp () {  // init app
/* === farm-sim post-build patch (idempotent marker: farm-sim-telemetry) === */
GameGlobal.global = GameGlobal; // lib 3.17.x subcontext no longer predefines bare "global"
(function () {
  try {
    var __origLog = console.log, __origErr = console.error, __origWarn = console.warn;
    function __fmt(args) {
      var out = [];
      for (var i = 0; i < args.length; i++) {
        var a = args[i];
        if (typeof a === 'string') { out.push(a); continue; }
        if (a && a.stack) { out.push(a.message + ' | ' + String(a.stack).slice(0, 300)); continue; }
        try { out.push(JSON.stringify(a)); } catch (e) { out.push(String(a)); }
      }
      return out.join(' ');
    }
    function __send(o) {
      try { wx.request({ url: 'http://127.0.0.1:9877/log', method: 'POST', data: o, fail: function () {} }); } catch (e) {}
    }
    console.log = function () { var m = __fmt(arguments); __send({ t: 'log', m: m, d: Date.now() }); __origLog.apply(console, arguments); };
    console.warn = function () { var m = __fmt(arguments); __send({ t: 'warn', m: m, d: Date.now() }); __origWarn.apply(console, arguments); };
    console.error = function () { var m = __fmt(arguments); __send({ t: 'err', m: m, d: Date.now() }); __origErr.apply(console, arguments); };
    if (wx.onError) wx.onError(function (msg) { var m; try { m = typeof msg === 'string' ? msg : JSON.stringify(msg); } catch (e) { m = String(msg); } __send({ t: 'onError', m: String(m).slice(0, 800), d: Date.now() }); });
    if (wx.onUnhandledRejection) wx.onUnhandledRejection(function (res) { __send({ t: 'onRejection', m: String(res && res.reason && (res.reason.message || res.reason)).slice(0, 500), d: Date.now() }); });
    __send({ t: 'boot', m: 'game.js telemetry installed', d: Date.now() });
  } catch (e) {}
})();
/* === end farm-sim post-build patch === */`;
let gameJs = readFileSync(gameJsPath, 'utf8');
if (gameJs.includes('farm-sim-telemetry')) {
  console.log('game.js already patched');
} else {
  if (!gameJs.includes(MARKER)) throw new Error('game.js marker not found — Cocos template changed?');
  gameJs = gameJs.replace(MARKER, HOOK, 1);
  writeFileSync(gameJsPath, gameJs);
  console.log('patched game.js (telemetry + GameGlobal.global)');
}
