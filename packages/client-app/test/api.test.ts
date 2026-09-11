import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../src/net/api.js';
import { Platform, type ApiResponse, type PlayerSave } from '@farm-game/shared';

test('ApiClient sends x-protocol-version and x-platform headers', async () => {
  let captured: { url: string; init?: RequestInit } | null = null;
  const fetchStub: typeof fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ ok: true, data: { crops: [], version: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new ApiClient({ baseUrl: 'http://example.test', platform: Platform.IOS, fetchImpl: fetchStub });
  await client.getCropConfigs();
  assert.ok(captured);
  assert.equal(captured!.url, 'http://example.test/crop/configs');
  const headers = captured!.init?.headers as Record<string, string>;
  assert.equal(headers['x-platform'], 'ios');
  assert.match(headers['x-protocol-version'], /^2\./);
});

test('ApiClient.loginWeChat posts JSON body and returns parsed shape', async () => {
  const fetchStub: typeof fetch = async () =>
    new Response(JSON.stringify({
      ok: true,
      data: {
        token: 'jwt',
        player: { playerId: 'p-1' } as PlayerSave,
        auth: { playerId: 'p-1', identities: [], issuedAt: 0, expiresAt: 0 },
      },
    }), { status: 200 });
  const client = new ApiClient({ baseUrl: 'http://example.test', platform: Platform.WeChatMini, fetchImpl: fetchStub });
  const r = await client.loginWeChat({ code: 'abc' });
  const typed = r as ApiResponse<{ token: string }>;
  assert.equal(typed.ok, true);
  if (typed.ok) assert.equal(typed.data.token, 'jwt');
});

test('ApiClient.getPlayerInfo attaches bearer when token is set', async () => {
  let captured: { init?: RequestInit } | null = null;
  const fetchStub: typeof fetch = async (_url, init) => {
    captured = { init };
    return new Response(JSON.stringify({ ok: true, data: { playerId: 'x' } }), { status: 200 });
  };
  const client = new ApiClient({ baseUrl: 'http://example.test', platform: Platform.Android, fetchImpl: fetchStub });
  client.setToken('token-xyz');
  await client.getPlayerInfo();
  const headers = captured!.init?.headers as Record<string, string>;
  assert.equal(headers.authorization, 'Bearer token-xyz');
});