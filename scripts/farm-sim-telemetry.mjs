/**
 * Farm simulator dev bridge (port 9877).
 *
 * The WeChat automator protocol answers for mini-GAMES only at the IDE level
 * (Tool.*) — every App.* command times out against the game runtime on Stable
 * 2.02.2608070 (runbook §11.6). This bridge is the headless input channel,
 * injected by scripts/patch-wechat-build.mjs into the built game.js:
 *
 *   game → node   POST /log            console telemetry (also usable standalone)
 *                 POST /result         command results
 *                 GET  /cmd            next queued command ({} when idle)
 *   node → game   POST /enqueue        {kind:'eval'|'action'|'state', ...}
 *   drivers       GET  /lines?since=N  buffered console lines
 *                 GET  /result/:id     one command result (404 while pending)
 *                 GET  /health         {lastPollTs, gameListening, ...}
 *
 * Commands run against `globalThis.__farm` (OnlineFarm.ts exposes state() and
 * actions.{plant,water,harvest,unlock}) inside the game context.
 *
 * Usage: node scripts/farm-sim-telemetry.mjs
 */
import http from 'node:http';

const PORT = Number(process.env.BRIDGE_PORT ?? 9877);
const MAX_LINES = 4000;
const MAX_RESULTS = 500;

const queue = [];
const results = new Map();
const lines = [];
let seq = 0;
let lastPollTs = 0;
let lastResultTs = 0;

const ts = () => new Date().toISOString().slice(11, 23);
const json = (res, code, payload) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const body = await readBody(req);
  const path = url.pathname;

  if (path === '/log' && req.method === 'POST') {
    const line = `[${ts()}] ${body}`;
    lines.push(line);
    if (lines.length > MAX_LINES) lines.shift();
    console.log(line);
    return json(res, 200, { ok: true });
  }

  if (path === '/cmd' && req.method === 'GET') {
    lastPollTs = Date.now();
    const cmd = queue.shift();
    if (!cmd) return json(res, 200, {});
    return json(res, 200, { id: cmd.id, kind: cmd.kind, expr: cmd.expr, path: cmd.path, name: cmd.name, args: cmd.args });
  }

  if (path === '/result' && req.method === 'POST') {
    lastResultTs = Date.now();
    let msg = null;
    try {
      msg = JSON.parse(body);
    } catch {
      msg = null;
    }
    if (msg && msg.id !== undefined) {
      results.set(msg.id, msg);
      if (results.size > MAX_RESULTS) results.delete(results.keys().next().value);
    }
    const line = `[${ts()}] [result] ${body}`;
    lines.push(line);
    if (lines.length > MAX_LINES) lines.shift();
    console.log(line);
    return json(res, 200, { ok: true });
  }

  if (path === '/enqueue' && req.method === 'POST') {
    let cmd = null;
    try {
      cmd = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'bad json' });
    }
    seq += 1;
    const id = `c${seq}`;
    queue.push({ id, kind: cmd.kind, expr: cmd.expr, path: cmd.path, name: cmd.name, args: cmd.args });
    console.log(`[${ts()}] [enqueue] ${id} ${JSON.stringify({ kind: cmd.kind, path: cmd.path, name: cmd.name, expr: cmd.expr })}`);
    return json(res, 200, { ok: true, id });
  }

  if (path.startsWith('/result/') && req.method === 'GET') {
    const id = path.slice('/result/'.length);
    const hit = results.get(id);
    if (!hit) return json(res, 404, { ok: true, pending: true });
    return json(res, 200, { ok: true, ...hit });
  }

  if (path === '/lines' && req.method === 'GET') {
    const since = Number(url.searchParams.get('since') ?? 0) || 0;
    return json(res, 200, { ok: true, next: lines.length, lines: lines.slice(Math.max(0, since)) });
  }

  if (path === '/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      lastPollTs,
      lastResultTs,
      queued: queue.length,
      results: results.size,
      lines: lines.length,
      gameListening: lastPollTs > 0 && Date.now() - lastPollTs < 5000,
    });
  }

  return json(res, 404, { ok: false, error: `unknown ${req.method} ${path}` });
});

server.listen(PORT, '127.0.0.1', () => console.log(`[bridge] listening on ${PORT}`));
