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

test('applyWater discounts remaining time, not total duration', () => {
  const now = Date.now();
  const plot = {
    id: 'p:0', index: 0, unlocked: true, status: 'growing' as const,
    cropId: 'carrot', plantedAt: now, matureAt: now + 30_000, waterCount: 0,
  };
  const r = applyWater(plot, now);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // New matureAt = now + ceil(30000 × 0.95) = now + 28500
  assert.equal(r.value.matureAt, now + 28_500);
  assert.equal(r.value.waterCount, 1);
});

test('applyWater compounds: 2nd water discounts new remaining time', () => {
  const now = Date.now();
  const firstMatureAt = now + 30_000;
  const afterFirst = { matureAt: now + 28_500, waterCount: 1 };
  const plot = {
    id: 'p:0', index: 0, unlocked: true, status: 'growing' as const,
    cropId: 'carrot', plantedAt: now, matureAt: afterFirst.matureAt, waterCount: afterFirst.waterCount,
  };
  const r = applyWater(plot, now);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // 2nd water on same `now`: remaining = 28500 → new matureAt = now + ceil(28500 × 0.95) = now + 27075
  assert.equal(r.value.matureAt, now + 27_075);
  assert.equal(r.value.waterCount, 2);
});

test('applyWater rejects limit_reached at maxWater', () => {
  const now = Date.now();
  const plot = {
    id: 'p:0', index: 0, unlocked: true, status: 'growing' as const,
    cropId: 'carrot', plantedAt: now, matureAt: now + 30_000, waterCount: 3, // carrot.maxWater
  };
  const r = applyWater(plot, now);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'limit_reached');
});

test('applyWater rejects already_ripe when matureAt <= now', () => {
  const now = Date.now();
  const plot = {
    id: 'p:0', index: 0, unlocked: true, status: 'growing' as const,
    cropId: 'carrot', plantedAt: now - 30_000, matureAt: now - 100, waterCount: 0,
  };
  const r = applyWater(plot, now);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'already_ripe');
});

test('applyWater rejects not_growing for empty plots', () => {
  const now = Date.now();
  const plot = {
    id: 'p:0', index: 0, unlocked: true, status: 'empty' as const,
    plantedAt: now, waterCount: 0,
  };
  const r = applyWater(plot, now);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'not_growing');
});

test('applyWater rejects already_ripe for ready plots (distinct from not_growing)', () => {
  const now = Date.now();
  const plot = {
    id: 'p:0', index: 0, unlocked: true, status: 'ready' as const,
    cropId: 'carrot', plantedAt: now - 30_000, matureAt: now - 100, waterCount: 0,
  };
  const r = applyWater(plot, now);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'already_ripe');
});

test('applyWater rejects withered plots (distinct from already_ripe)', () => {
  const now = Date.now();
  const plot = {
    id: 'p:0', index: 0, unlocked: true, status: 'withered' as const,
    cropId: 'carrot', plantedAt: now - 60_000, matureAt: now - 30_000, waterCount: 0,
  };
  const r = applyWater(plot, now);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'withered');
});

test('applyWater rejects corrupted matureAt (NaN/Infinity/missing)', () => {
  const now = Date.now();
  for (const matureAt of [Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number]) {
    const plot = {
      id: 'p:0', index: 0, unlocked: true, status: 'growing' as const,
      cropId: 'carrot', plantedAt: now, matureAt, waterCount: 0,
    };
    const r = applyWater(plot, now);
    assert.equal(r.ok, false, `matureAt=${String(matureAt)}`);
    if (!r.ok) assert.equal(r.reason, 'corrupted');
  }
});

test('applyWater rejects unknown_crop', () => {
  const now = Date.now();
  const plot = {
    id: 'p:0', index: 0, unlocked: true, status: 'growing' as const,
    cropId: 'not-a-crop', plantedAt: now, matureAt: now + 30_000, waterCount: 0,
  };
  const r = applyWater(plot, now);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'unknown_crop');
});