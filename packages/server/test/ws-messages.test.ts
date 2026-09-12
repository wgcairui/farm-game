/**
 * Unit tests for `realtime/ws-messages.ts` — farm_cmd parsing and envelope
 * construction. These pin the contract the Colyseus room relies on:
 * structural garbage is refused WITHOUT reaching the command services, and
 * server envelopes always carry the protocol version + timestamp.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ErrorCode, PROTOCOL_VERSION } from '@farm-game/shared';
import { parseFarmCmd, parseFarmRefresh, serverEnvelope } from '../src/realtime/ws-messages.js';

const OP = '0b8f6c1e-0000-4000-8000-000000000001';

function farmCmd(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    v: PROTOCOL_VERSION,
    t: 'farm_cmd',
    r: OP,
    p: { command: 'plant', operationId: OP, body: { plotIndex: 0, cropId: 'wheat' } },
    ...overrides,
  };
}

test('parseFarmCmd accepts each of the four farm commands', () => {
  for (const command of ['unlock', 'plant', 'water', 'harvest']) {
    const raw = farmCmd({ p: { command, operationId: OP, body: { plotIndex: 0 } } });
    const parsed = parseFarmCmd(raw);
    assert.ok(parsed.ok, `expected ok for ${command}`);
    if (parsed.ok) {
      assert.equal(parsed.cmd.command, command);
      assert.equal(parsed.cmd.operationId, OP);
      assert.deepEqual(parsed.cmd.body, { plotIndex: 0 });
    }
  }
});

test('parseFarmCmd rejects non-object envelopes', () => {
  for (const raw of [null, undefined, 42, 'farm_cmd', [], true]) {
    const parsed = parseFarmCmd(raw);
    assert.ok(!parsed.ok);
    if (!parsed.ok) assert.equal(parsed.code, ErrorCode.BAD_REQUEST);
  }
});

test('parseFarmCmd rejects a mismatching protocol version', () => {
  const parsed = parseFarmCmd(farmCmd({ v: '1.0.0' }));
  assert.ok(!parsed.ok);
  if (!parsed.ok) assert.equal(parsed.code, ErrorCode.PROTOCOL_VERSION_MISMATCH);
});

test('parseFarmCmd rejects an unknown message type', () => {
  const parsed = parseFarmCmd(farmCmd({ t: 'steal' }));
  assert.ok(!parsed.ok);
  if (!parsed.ok) assert.equal(parsed.code, ErrorCode.BAD_REQUEST);
});

test('parseFarmCmd rejects an unknown farm command', () => {
  const parsed = parseFarmCmd(farmCmd({ p: { command: 'steal', operationId: OP, body: {} } }));
  assert.ok(!parsed.ok);
  if (!parsed.ok) assert.equal(parsed.code, ErrorCode.BAD_REQUEST);
});

test('parseFarmCmd rejects missing or oversized operationId', () => {
  const missing = parseFarmCmd(farmCmd({ p: { command: 'plant', body: {} } }));
  assert.ok(!missing.ok);

  const oversized = parseFarmCmd(farmCmd({ p: { command: 'plant', operationId: 'x'.repeat(65), body: {} } }));
  assert.ok(!oversized.ok);
  if (!oversized.ok) assert.equal(oversized.code, ErrorCode.BAD_REQUEST);
});

test('parseFarmCmd rejects a non-object body but echoes the operationId', () => {
  const parsed = parseFarmCmd(farmCmd({ p: { command: 'plant', operationId: OP, body: [1, 2] } }));
  assert.ok(!parsed.ok);
  if (!parsed.ok) {
    assert.equal(parsed.code, ErrorCode.BAD_REQUEST);
    assert.equal(parsed.operationId, OP);
  }
});

test('serverEnvelope carries version, type, payload and a timestamp', () => {
  const env = serverEnvelope('welcome', { serverNow: 1, roomId: 'r', player: undefined });
  assert.equal(env.v, PROTOCOL_VERSION);
  assert.equal(env.t, 'welcome');
  assert.equal(env.ts !== undefined, true);
  assert.equal(env.r, undefined);
  assert.deepEqual(env.p, { serverNow: 1, roomId: 'r', player: undefined });
});

test('serverEnvelope echoes the request id when given', () => {
  const env = serverEnvelope('error', { code: ErrorCode.INTERNAL, message: 'x' }, OP);
  assert.equal(env.r, OP);
});

test('parseFarmRefresh accepts a version-correct farm_refresh envelope', () => {
  const parsed = parseFarmRefresh({ v: PROTOCOL_VERSION, t: 'farm_refresh', p: null });
  assert.deepEqual(parsed, { ok: true });
});

test('parseFarmRefresh rejects wrong version, wrong type and non-objects', () => {
  assert.ok(!parseFarmRefresh({ v: '1.0.0', t: 'farm_refresh', p: null }).ok);
  assert.ok(!parseFarmRefresh({ v: PROTOCOL_VERSION, t: 'farm_cmd', p: null }).ok);
  assert.ok(!parseFarmRefresh('farm_refresh').ok);
  for (const parsed of [
    parseFarmRefresh({ v: '1.0.0', t: 'farm_refresh', p: null }),
    parseFarmRefresh({ v: PROTOCOL_VERSION, t: 'farm_cmd', p: null }),
    parseFarmRefresh('farm_refresh'),
  ]) {
    if (!parsed.ok) {
      assert.ok(
        parsed.code === ErrorCode.PROTOCOL_VERSION_MISMATCH || parsed.code === ErrorCode.BAD_REQUEST,
      );
    }
  }
});
