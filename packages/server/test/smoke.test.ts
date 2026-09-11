import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { PROTOCOL_VERSION } from '@farm-game/shared';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let baseUrl: string;

before(async () => {
  process.env.NODE_ENV = 'test';
  const config = loadConfig({ port: 0, jwtSecret: 'test-secret', enableAdmin: false });
  app = await buildApp({ config });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (addr && typeof addr === 'object') {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  } else {
    throw new Error('server did not return an address');
  }
});

after(async () => {
  await app.close();
});

test('GET /healthz returns protocol version', async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; protocolVersion: string };
  assert.equal(body.ok, true);
  assert.equal(body.protocolVersion, PROTOCOL_VERSION);
});

test('POST /auth/wechat with empty body returns BAD_REQUEST', async () => {
  const res = await fetch(`${baseUrl}/auth/wechat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; code: number };
  assert.equal(body.ok, false);
  assert.equal(body.code, 1000);
});

test('POST /auth/wechat → /player/info → /farm/unlock chain', async () => {
  const login = await fetch(`${baseUrl}/auth/wechat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'mock_code_1234567890' }),
  });
  assert.equal(login.status, 200);
  const loginBody = (await login.json()) as { ok: boolean; data: { token: string; player: { openid: string } } };
  assert.equal(loginBody.ok, true);
  const token = loginBody.data.token;
  assert.ok(token.length > 0);

  const me = await fetch(`${baseUrl}/player/info`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(me.status, 200);
  const meBody = (await me.json()) as { ok: boolean; data: { openid: string; gold: number; plots: unknown[] } };
  assert.equal(meBody.ok, true);
  assert.equal(meBody.data.gold, 200);
  assert.equal(meBody.data.plots.length, 24);

  const unlock = await fetch(`${baseUrl}/farm/unlock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ plotIndex: 8 }),
  });
  assert.equal(unlock.status, 200);
  const unlockBody = (await unlock.json()) as { ok: boolean; data: { plot: { unlocked: boolean } } };
  assert.equal(unlockBody.ok, true);
  assert.equal(unlockBody.data.plot.unlocked, true);
});

test('GET /crop/configs returns 5 crops', async () => {
  const res = await fetch(`${baseUrl}/crop/configs`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; data: { crops: unknown[]; version: number } };
  assert.equal(body.ok, true);
  assert.equal(body.data.crops.length, 5);
  assert.equal(body.data.version, 1);
});

test('GET /player/info without token returns 401', async () => {
  const res = await fetch(`${baseUrl}/player/info`);
  assert.equal(res.status, 401);
});