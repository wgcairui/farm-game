/**
 * T0 spike test — verify the standalone Colyseus 0.18 server boots and accepts
 * a raw WebSocket upgrade on its matchmake route.
 *
 * Why this and not a full client handshake:
 *   The official `colyseus.js` SDK tops out at 0.16.x; 0.18 introduces a new
 *   matchmake HTTP response shape, new JOIN_ROOM handshake sections, and a
 *   `ResponseStatus` byte on `ROOM_RESPONSE` — none of which the 0.16 client
 *   understands. Reverse-engineering the 0.18 binary wire format is out of
 *   scope for T0, and the WeChat mini-game runtime cannot load `colyseus.js`
 *   anyway. The Phase 2 client will speak our own `WsEnvelope` over a
 *   transport of its own; this test only proves the server-side stack is
 *   coherent (core + transport + Room lifecycle) before T1 wires it to the
 *   real command services.
 *
 * It does:
 *  - boot `startSpikeServer` on an ephemeral port
 *  - perform an HTTP upgrade with `Sec-WebSocket-Protocol: colyseus` against
 *    `/matchmake/joinOrCreate/farm`
 *  - assert the server returns 101 Switching Protocols
 *
 * It does NOT:
 *  - validate the Colyseus handshake bytes
 *  - decode ROOM_STATE / ROOM_DATA
 *  - exercise reconnect
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { startSpikeServer, type SpikeServerHandle } from '../src/realtime/spike/serve.js';

test('T0 spike: 0.18 server listens and accepts a WebSocket upgrade on /matchmake/*', async (t) => {
  // Pick an ephemeral port by binding to 0 and reading the assigned port.
  // Colyseus listen() does not expose the assigned port when given 0, so we
  // probe via TCP first.
  const probe = await new Promise<number>((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('could not read ephemeral port'));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });

  let handle: SpikeServerHandle | undefined;
  t.after(async () => {
    if (handle) {
      await handle.shutdown();
    }
  });

  handle = await startSpikeServer(probe);

  // Issue a WebSocket upgrade against /matchmake/joinOrCreate/farm. We do not
  // care about the post-handshake framing here — only that the server answers
  // the upgrade request. A failing path returns HTTP 4xx/5xx on the underlying
  // request handler, observable without consuming any post-handshake bytes.
  const result = await new Promise<{ status: number | null; errored: boolean }>((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port: probe,
      method: 'GET',
      path: '/matchmake/joinOrCreate/farm',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    });

    let settled = false;
    const done = (value: { status: number | null; errored: boolean }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    req.on('upgrade', (_res, socket) => {
      // The server accepted the upgrade. Close the socket to free resources.
      socket.destroy();
      done({ status: 101, errored: false });
    });

    req.on('response', (res) => {
      // Server rejected the upgrade. Drain the response and report the status.
      res.resume();
      done({ status: res.statusCode ?? null, errored: false });
    });

    req.on('error', () => {
      done({ status: null, errored: true });
    });

    req.end();
  });

  if (result.errored) {
    assert.fail('WS upgrade request errored before server replied');
  }
  assert.equal(result.status, 101, `expected 101 Switching Protocols, got ${result.status}`);
});
