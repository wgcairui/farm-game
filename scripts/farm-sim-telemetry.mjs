// Receives console telemetry POSTed from the minigame sandbox (game.js hook).
import http from 'node:http';

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const ts = new Date().toISOString().slice(11, 23);
    if (body) console.log(`[${ts}] ${body}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
});
server.listen(9877, '127.0.0.1', () => console.log('[listener] listening on 9877'));
