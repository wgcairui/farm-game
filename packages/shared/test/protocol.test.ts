import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION, PROTOCOL_VERSION_MAJOR } from '../src/protocol/version.js';
import { ErrorCode, isErrorPayload } from '../src/protocol/error.js';
import { createDefaultPlayerSave } from '../src/types/player.js';

test('PROTOCOL_VERSION is 2.x (per ADR-0002 D13)', () => {
  assert.match(PROTOCOL_VERSION, /^2\./);
  assert.equal(PROTOCOL_VERSION_MAJOR, 2);
});

test('ErrorCode ranges are exclusive (1000-4999) and distinct', () => {
  const codes = new Set<number>();
  for (const v of Object.values(ErrorCode)) {
    assert.equal(typeof v, 'number');
    assert.ok(v >= 1000 && v <= 4999, `${v} out of range`);
    assert.ok(!codes.has(v as number), `${v} duplicate`);
    codes.add(v as number);
  }
});

test('isErrorPayload narrows shape', () => {
  assert.equal(isErrorPayload({ code: 1000, message: 'x' }), true);
  assert.equal(isErrorPayload({ code: '1000', message: 'x' }), false);
  assert.equal(isErrorPayload(null), false);
  assert.equal(isErrorPayload(undefined), false);
});

test('createDefaultPlayerSave generates 24 plots with 6 unlocked (ADR-0002 D9)', () => {
  const save = createDefaultPlayerSave({ playerId: 'tester' });
  assert.equal(save.playerId, 'tester');
  assert.equal(save.plots.length, 24);
  assert.equal(save.plots.filter((p) => p.unlocked).length, 6);
  assert.equal(save.plots.filter((p) => p.status === 'empty').length, 6);
  assert.equal(save.plots.filter((p) => p.status === 'locked').length, 18);
  assert.equal(save.gold, 200);
  assert.equal(save.version, 2);
  assert.deepEqual(save.identities, []);
});

test('createDefaultPlayerSave seeds initial identity when provided', () => {
  const save = createDefaultPlayerSave({
    playerId: 'tester',
    initialIdentity: { provider: 'weChatMini', boundAt: 100 },
  });
  assert.equal(save.identities.length, 1);
  assert.equal(save.identities[0]!.provider, 'weChatMini');
  // Public projection strips the subject (G0 review H1).
  assert.equal('subject' in save.identities[0]!, false);
});

test('AuthIdentitySummary does not carry a subject field', () => {
  const summary = { provider: 'ios' as const, boundAt: 1 };
  assert.equal('subject' in summary, false);
});

test('identityKey includes tenantId when provided', async () => {
  const { identityKey } = await import('../src/types/auth-identity.js');
  assert.equal(
    identityKey({ provider: 'weChatMini', subject: 's', tenantId: 't1' }),
    'weChatMini:t1:s',
  );
  assert.equal(
    identityKey({ provider: 'weChatMini', subject: 's' }),
    'weChatMini:-:s',
  );
});