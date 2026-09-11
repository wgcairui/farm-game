import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let baseUrl: string;

before(async () => {
  process.env.NODE_ENV = 'test';
  // ENABLE_ADMIN stays 0 by default — admin sub-module returns 404
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

test('ENABLE_ADMIN=0 → GET /admin/healthz returns ok with enabled=false', async () => {
  const res = await fetch(`${baseUrl}/admin/healthz`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; enabled: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.enabled, false);
});

test('ENABLE_ADMIN=0 → GET /admin returns 404', async () => {
  const res = await fetch(`${baseUrl}/admin`);
  assert.equal(res.status, 404);
});