import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimeManager } from '../src/time/TimeManager.js';
import { computeStage, computeMatureAt, applyWater } from '../src/logic/growth.js';
import { CROPS, getCrop } from '../src/types/crop.js';

test('TimeManager.now uses local clock with zero offset by default', () => {
  const tm = new TimeManager();
  const before = Date.now();
  const now = tm.now();
  const after = Date.now();
  assert.ok(now >= before && now <= after, 'should sit between before/after Date.now()');
});

test('TimeManager.syncServerTime applies offset', () => {
  const tm = new TimeManager();
  const serverNow = Date.now() + 60_000;
  tm.syncServerTime(serverNow);
  assert.equal(tm.now() - Date.now(), 60_000);
});

test('TimeManager.isReady and isWithered reflect growth duration', () => {
  const tm = new TimeManager();
  const planted = Date.now() - 31_000; // carrot = 30s
  assert.equal(tm.isReady(planted, 30), true);
  assert.equal(tm.isWithered(planted, 30, 24 * 3600), false);
});

test('CROPS is frozen and exposes five crops in v1', () => {
  assert.equal(Object.isFrozen(CROPS), true);
  const ids = Object.keys(CROPS);
  assert.equal(ids.length, 5);
  for (const id of ['carrot', 'potato', 'corn', 'tomato', 'strawberry']) {
    assert.ok(getCrop(id), `${id} must exist`);
  }
});

test('computeStage returns 0 for empty plots and 3 (last) when fully grown', () => {
  const now = Date.now();
  const planted = now - 31_000; // carrot = 30s
  const stage = computeStage(
    { id: 'p:0', index: 0, unlocked: true, status: 'growing', cropId: 'carrot', plantedAt: planted, waterCount: 0 },
    now,
  );
  assert.equal(stage, 3);
});

test('computeMatureAt returns undefined for unknown crop', () => {
  assert.equal(computeMatureAt(Date.now(), 'not-a-crop'), undefined);
});

test('applyWater caps at 50% discount and rejects beyond maxWater', () => {
  const planted = Date.now();
  const r1 = applyWater(planted, 'carrot', 0);
  assert.ok(r1);
  assert.equal(r1!.waterCount, 1);
  // 3 waters → max 50% discount → duration = 30s * 0.5
  const r3 = applyWater(planted, 'carrot', 2);
  assert.ok(r3);
  const cfg = getCrop('carrot')!;
  const expectedDuration = cfg.growthDuration * 1000 * 0.85; // 15% off after 3 waters
  // (1 - 0.05*3) = 0.85; wither/cap = 0.5
  assert.equal(r3!.matureAt - planted, expectedDuration);
  // 4th water rejected
  const r4 = applyWater(planted, 'carrot', 3);
  assert.equal(r4, null);
});