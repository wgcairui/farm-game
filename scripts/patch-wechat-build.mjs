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

// ── 3. game.js: telemetry + dev command bridge ────────────────────────────
// The bridge is the headless input channel: the automator protocol answers
// only IDE-level (Tool.*) commands for minigames, so driver scripts queue
// {eval,action,state} commands that the game polls from 127.0.0.1:9877
// (scripts/farm-sim-telemetry.mjs). See runbook §11.7.
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

const BRIDGE_MARKER = 'farm-sim-bridge';
const BRIDGE = `/* === farm-sim dev bridge (idempotent marker: ${BRIDGE_MARKER}) === */
(function () {
  try {
    var G = (typeof GameGlobal !== 'undefined' && GameGlobal) ? GameGlobal : globalThis;
    var BASE = 'http://127.0.0.1:9877';
    var lastId = null;
    function post(path, data) {
      try { wx.request({ url: BASE + path, method: 'POST', data: data, fail: function () {} }); } catch (e) {}
    }
    function resolvePath(root, path) {
      var parts = String(path).split('.');
      var cur = root;
      for (var i = 0; i < parts.length; i += 1) {
        if (cur === null || cur === undefined) throw new Error('path broke at "' + parts[i] + '"');
        cur = cur[parts[i]];
      }
      return cur;
    }
    // Circular / huge values (engine objects) must not break the reply —
    // wx.request serialises 'data', and a JSON.stringify throw looks like a
    // lost command on the driver side. Fall back to a shape summary.
    function safeResult(v) {
      try {
        var s = JSON.stringify(v);
        if (s === undefined) return { __type: typeof v, __value: String(v) };
        if (s.length <= 120000) return JSON.parse(s);
        return { __summary: 'too large', __keys: Object.keys(v).slice(0, 30) };
      } catch (e) {
        var keys = [];
        try { keys = v && typeof v === 'object' ? Object.keys(v).slice(0, 30) : []; } catch (e2) {}
        return { __summary: 'unserializable: ' + String(e && e.message), __type: typeof v, __keys: keys };
      }
    }
    // Scene-graph walk for layout/asset audits: which SpriteFrames are really
    // mounted, where, and how big. cc lives on GameGlobal in the game context.
    function dumpScene() {
      var cc = G.cc || (G.window && G.window.cc);
      if (!cc || !cc.director) throw new Error('cc.director unavailable');
      var scene = cc.director.getScene();
      if (!scene) throw new Error('no running scene');
      var nodes = [];
      var frames = {};
      var CAP = 2000;
      // Component classes are looked up by name, not via the cc namespace:
      // cc.UITransform / cc.Sprite were nil in the game context and getComponent
      // then spammed "Type must be non-nil" while returning nothing.
      function findComp(node, name) {
        var list = node.components || node._components || [];
        for (var i = 0; i < list.length; i += 1) {
          var c = list[i];
          if (!c) continue;
          var cn = '';
          try { cn = (c.constructor && c.constructor.name) || c.__classname__ || ''; } catch (e) { cn = ''; }
          if (String(cn).indexOf(name) !== -1) return c;
        }
        return null;
      }
      function walk(node, path) {
        if (!node || nodes.length >= CAP) return;
        var p = path + '/' + node.name;
        var entry = { p: p, v: node.activeInHierarchy ? 1 : 0 };
        var ui = findComp(node, 'UITransform');
        if (ui && ui.contentSize) entry.sz = [Math.round(ui.contentSize.width), Math.round(ui.contentSize.height)];
        var pos = node.position;
        if (pos) entry.xy = [Math.round(pos.x), Math.round(pos.y)];
        var sp = findComp(node, 'Sprite');
        if (sp) {
          var sf = sp.spriteFrame;
          var fname = sf ? (sf.name || sf._uuid || 'unnamed-frame') : '(null frame)';
          entry.f = fname;
          frames[fname] = (frames[fname] || 0) + 1;
          if (sp.color) entry.op = sp.color.a;
          entry.vis = sf && sp.color && sp.color.a > 0;
        }
        nodes.push(entry);
        var kids = node.children;
        for (var k = 0; k < kids.length && nodes.length < CAP; k += 1) walk(kids[k], p);
      }
      walk(scene, '');
      return { count: nodes.length, frames: frames, nodes: nodes };
    }
    function run(cmd) {
      var out;
      try {
        if (cmd.kind === 'dump') {
          out = dumpScene();
        } else if (cmd.kind === 'eval') {
          // The devtools game sandbox stubs out Function/eval (anti codegen) —
          // kept for diagnostics only; use the 'get' / 'call' kinds instead.
          var body = 'return (' + cmd.expr + ');';
          var fn = null;
          var diag = { ctor: String(Function).slice(0, 80) };
          try { fn = new Function('__farm', 'GameGlobal', body); } catch (e) { diag.ctorErr = String(e && e.message); }
          diag.fnType = typeof fn;
          if (typeof fn !== 'function') throw new Error('eval unavailable (sandbox blocks codegen): ' + JSON.stringify(diag));
          out = fn(G.__farm, G);
        } else if (cmd.kind === 'get') {
          out = resolvePath(G, cmd.path);
        } else if (cmd.kind === 'call') {
          var parts = String(cmd.path).split('.');
          var last = parts.pop();
          var parent = parts.length ? resolvePath(G, parts.join('.')) : G;
          var target = parent ? parent[last] : null;
          if (typeof target !== 'function') throw new Error('not a function: ' + cmd.path);
          out = target.apply(parent, cmd.args || []);
        } else if (cmd.kind === 'action') {
          var api = G.__farm && G.__farm.actions;
          var f = api ? api[cmd.name] : null;
          if (!f) throw new Error('no such action: ' + cmd.name);
          out = f.apply(null, cmd.args || []);
        } else if (cmd.kind === 'state') {
          if (!G.__farm || !G.__farm.state) throw new Error('__farm.state missing');
          out = G.__farm.state();
        } else {
          throw new Error('unknown kind: ' + cmd.kind);
        }
        post('/result', { id: cmd.id, ok: true, result: safeResult(out) });
      } catch (e) {
        post('/result', { id: cmd.id, ok: false, error: String((e && e.message) || e) });
      }
    }
    setInterval(function () {
      try {
        wx.request({
          url: BASE + '/cmd',
          method: 'GET',
          dataType: 'json',
          success: function (res) {
            var cmd = res && res.data;
            if (!cmd || !cmd.id || cmd.id === lastId) return;
            lastId = cmd.id;
            run(cmd);
          },
          fail: function () {},
        });
      } catch (e) {}
    }, 400);
    console.log('[farm-sim-bridge] installed farm=' + (G.__farm ? 'yes' : 'no'));
  } catch (e) {}
})();
/* === end farm-sim dev bridge === */`;

let gameJs = readFileSync(gameJsPath, 'utf8');
let gameJsTouched = false;
if (!gameJs.includes('farm-sim-telemetry')) {
  if (!gameJs.includes(MARKER)) throw new Error('game.js marker not found — Cocos template changed?');
  gameJs = gameJs.replace(MARKER, HOOK, 1);
  gameJsTouched = true;
}
// The bridge block is re-synced on every run: when BRIDGE changes here, the
// stale block in the artifact is replaced (otherwise old injections linger).
const bridgePattern = /\/\* === farm-sim dev bridge[\s\S]*?\/\* === end farm-sim dev bridge === \*\//;
const existingBridge = gameJs.match(bridgePattern);
if (existingBridge) {
  if (existingBridge[0] !== BRIDGE) {
    gameJs = gameJs.replace(existingBridge[0], BRIDGE);
    gameJsTouched = true;
  }
} else {
  const endMarker = '/* === end farm-sim post-build patch === */';
  if (!gameJs.includes(endMarker)) throw new Error('telemetry end marker missing — cannot anchor the bridge block');
  gameJs = gameJs.replace(endMarker, `${endMarker}\n${BRIDGE}`, 1);
  gameJsTouched = true;
}
if (gameJsTouched) {
  writeFileSync(gameJsPath, gameJs);
  console.log('patched game.js (telemetry + dev bridge)');
} else {
  console.log('game.js already patched');
}
