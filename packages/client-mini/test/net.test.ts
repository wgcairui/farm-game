import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOL_VERSION,
  type CropConfig,
  type LoginResponse,
  type PlayerSave,
} from '@farm-game/shared';
import {
  buildFarmCmdEnvelope,
  buildFarmRefreshEnvelope,
  makeOperationId,
  parseWelcomeEnvelope,
  FarmApiError,
  FarmHttpClient,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from '../src/net/index.js';

// ── envelope builders ──

test('buildFarmCmdEnvelope carries v/t/r/p with operationId mirrored in r and p', () => {
  const opId = 'op_test_123';
  const env = buildFarmCmdEnvelope('plant', opId, { plotIndex: 0, cropId: 'carrot' });
  assert.equal(env.v, PROTOCOL_VERSION);
  assert.equal(env.t, 'farm_cmd');
  assert.equal(env.r, opId);
  assert.equal(env.p.command, 'plant');
  assert.equal(env.p.operationId, opId);
  assert.deepEqual(env.p.body, { plotIndex: 0, cropId: 'carrot' });
});

test('buildFarmCmdEnvelope supports all four command names', () => {
  for (const command of ['unlock', 'plant', 'water', 'harvest'] as const) {
    const env = buildFarmCmdEnvelope(command, 'op_x', { plotIndex: 1 });
    assert.equal(env.p.command, command);
  }
});

test('buildFarmRefreshEnvelope is v/t/p=null', () => {
  const env = buildFarmRefreshEnvelope();
  assert.equal(env.v, PROTOCOL_VERSION);
  assert.equal(env.t, 'farm_refresh');
  assert.equal(env.p, null);
});

test('makeOperationId produces non-empty unique-ish ids', () => {
  const a = makeOperationId();
  const b = makeOperationId();
  assert.ok(a.length > 0, 'operationId must be non-empty');
  assert.ok(b.length > 0);
  assert.notEqual(a, b, 'two consecutive ids must differ');
});

// ── parseWelcomeEnvelope guards ──

const validWelcome = {
  v: PROTOCOL_VERSION,
  t: 'welcome',
  p: {
    serverNow: 1_700_000_000_000,
    roomId: 'farm-room-1',
    player: { playerId: 'p1', gold: 200, revision: 0 } as unknown as PlayerSave,
  },
};

test('parseWelcomeEnvelope accepts a well-formed welcome', () => {
  const parsed = parseWelcomeEnvelope(validWelcome);
  assert.ok(parsed !== null);
  assert.equal(parsed!.serverNow, 1_700_000_000_000);
  assert.equal(parsed!.roomId, 'farm-room-1');
});

test('parseWelcomeEnvelope rejects null / non-objects', () => {
  assert.equal(parseWelcomeEnvelope(null), null);
  assert.equal(parseWelcomeEnvelope(42), null);
  assert.equal(parseWelcomeEnvelope('hello'), null);
});

test('parseWelcomeEnvelope rejects wrong major version', () => {
  const bad = { ...validWelcome, v: '1.9.9' };
  assert.equal(parseWelcomeEnvelope(bad), null);
});

test('parseWelcomeEnvelope rejects wrong type discriminator', () => {
  assert.equal(parseWelcomeEnvelope({ ...validWelcome, t: 'cmd_result' }), null);
});

test('parseWelcomeEnvelope rejects missing/typed-wrong fields', () => {
  assert.equal(parseWelcomeEnvelope({ ...validWelcome, p: null }), null);
  assert.equal(parseWelcomeEnvelope({ ...validWelcome, p: { ...validWelcome.p, serverNow: 'now' } }), null);
  assert.equal(parseWelcomeEnvelope({ ...validWelcome, p: { ...validWelcome.p, roomId: 42 } }), null);
  assert.equal(parseWelcomeEnvelope({ ...validWelcome, p: { ...validWelcome.p, player: null } }), null);
});

// ── FarmHttpClient ──

class MockTransport implements HttpTransport {
  public lastReq: HttpRequest | null = null;
  constructor(private readonly response: HttpResponse) {}
  async request(req: HttpRequest): Promise<HttpResponse> {
    this.lastReq = req;
    return this.response;
  }
}

const sampleLoginData: LoginResponse = {
  token: 'jwt-test',
  player: {
    version: 2,
    playerId: 'player-1',
    gold: 200,
    gems: 0,
    plots: [],
    level: 1,
    exp: 0,
    settings: { musicVolume: 0.7, sfxVolume: 1, notificationsEnabled: true },
    createdAt: 1,
    updatedAt: 1,
    identities: [],
    revision: 0,
  },
  auth: {
    playerId: 'player-1',
    identities: [],
    expiresAt: 1,
    issuedAt: 1,
  },
  serverNow: 1_700_000_000_000,
  revision: 0,
};

const sampleCropConfigs = {
  crops: [
    {
      id: 'carrot', name: 'carrot', icon: 'i',
      seedPrice: 10, sellPrice: 25,
      growthDuration: 30, stages: 4, maxWater: 3, witherWindow: 24 * 3600,
      seedItemId: 'carrot_seed', cropItemId: 'carrot',
    } satisfies CropConfig,
  ],
  version: 1,
};

test('FarmHttpClient.loginWeChat records token and computes serverNowOffsetMs', async () => {
  const transport = new MockTransport({ status: 200, json: { ok: true, data: sampleLoginData } });
  const before = Date.now();
  const client = new FarmHttpClient({ baseUrl: 'http://api.test', transport });
  const data = await client.loginWeChat('mock_xyz');
  const after = Date.now();

  assert.equal(data.token, 'jwt-test');
  assert.equal(client.token, 'jwt-test');
  // Offset must equal serverNow - Date.now() at the moment of the call.
  // Bound by [serverNow - after, serverNow - before] (whichever is tighter).
  const offset = client.serverNowOffsetMs;
  assert.ok(offset <= sampleLoginData.serverNow - before);
  assert.ok(offset >= sampleLoginData.serverNow - after);
  assert.equal(transport.lastReq!.method, 'POST');
  assert.equal(transport.lastReq!.url, 'http://api.test/auth/wechat');
  assert.deepEqual(transport.lastReq!.body, { code: 'mock_xyz' });
});

test('FarmHttpClient.loginWeChat throws FarmApiError on {ok:false} envelope', async () => {
  const transport = new MockTransport({
    status: 200,
    json: { ok: false, code: 2000, message: 'bad wechat code' },
  });
  const client = new FarmHttpClient({ baseUrl: 'http://api.test', transport });
  await assert.rejects(
    () => client.loginWeChat('bad'),
    (err: unknown) => {
      assert.ok(err instanceof FarmApiError);
      assert.equal((err as FarmApiError).code, 2000);
      assert.equal((err as FarmApiError).status, 200);
      assert.equal((err as FarmApiError).message, 'bad wechat code');
      return true;
    },
  );
  // Token must remain unset on failure.
  assert.equal(client.token, null);
});

test('FarmHttpClient.getCropConfigs unwraps data.crops', async () => {
  const transport = new MockTransport({ status: 200, json: { ok: true, data: sampleCropConfigs } });
  const client = new FarmHttpClient({ baseUrl: 'http://api.test', transport });
  const crops = await client.getCropConfigs();
  assert.equal(crops.length, 1);
  assert.equal(crops[0]!.id, 'carrot');
  assert.equal(transport.lastReq!.method, 'GET');
  assert.equal(transport.lastReq!.url, 'http://api.test/crop/configs');
});

test('FarmHttpClient.getPlayerInfo attaches Bearer token', async () => {
  const transport = new MockTransport({ status: 200, json: { ok: true, data: sampleLoginData.player } });
  const client = new FarmHttpClient({ baseUrl: 'http://api.test', transport });
  // Bypass login — directly seed the token.
  client.token = 'jwt-direct';
  const save = await client.getPlayerInfo();
  assert.equal(save.playerId, 'player-1');
  assert.equal(transport.lastReq!.method, 'GET');
  assert.equal(transport.lastReq!.url, 'http://api.test/player/info');
  assert.equal(transport.lastReq!.headers!.authorization, 'Bearer jwt-direct');
});

test('FarmHttpClient.getPlayerInfo refuses when no token', async () => {
  const transport = new MockTransport({ status: 200, json: { ok: true, data: sampleLoginData.player } });
  const client = new FarmHttpClient({ baseUrl: 'http://api.test', transport });
  await assert.rejects(
    () => client.getPlayerInfo(),
    (err: unknown) => err instanceof FarmApiError && (err as FarmApiError).code === 'NOT_AUTHENTICATED',
  );
});

test('FarmHttpClient surfaces HTTP error status with synthetic code when envelope is malformed', async () => {
  const transport = new MockTransport({ status: 500, json: { error: 'oops' } });
  const client = new FarmHttpClient({ baseUrl: 'http://api.test', transport });
  await assert.rejects(
    () => client.getCropConfigs(),
    (err: unknown) => err instanceof FarmApiError && (err as FarmApiError).code === 'HTTP_500',
  );
});
