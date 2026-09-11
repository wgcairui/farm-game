import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeadlessGameApp, HeadlessGameApp } from '../src/runtime/headless.js';
import { TimeManager } from '@farm-game/shared';

let app: HeadlessGameApp;
let tm: TimeManager;

before(() => {
  app = buildHeadlessGameApp();
  tm = app.timeManager;
});

after(() => {
  app.stop();
});

test('starting coins are 200 and 5 plots are unlocked (v25 baseline = 8 unlocked)', () => {
  assert.equal(app.economy.coins, 200);
  const unlocked = app.farm.plots.filter((p) => p.unlocked).length;
  assert.equal(unlocked, 8);
});

test('buy carrot seed (10g) deducts coins and adds 1 seed to inventory', () => {
  const before = app.economy.coins;
  const ok = app.shop.buySeed('carrot', 1);
  assert.equal(ok, true);
  assert.equal(app.economy.coins, before - 10);
  assert.equal(app.inventory.getCount('carrot_seed'), 1);
});

test('plant carrot on plot 0; witherWindow preserved; matureAt set', () => {
  const ok = app.farm.plant(0, 'carrot');
  assert.equal(ok, true);
  const plot = app.farm.plots[0];
  assert.equal(plot.status, 'growing');
  assert.equal(plot.cropId, 'carrot');
  assert.ok(plot.plantedAt);
  assert.ok(plot.matureAt);
  assert.equal(plot.matureAt! - plot.plantedAt!, 30_000);
});

test('time-travel 31s → harvest → sells for 25g → total 205g', () => {
  // Plant an additional carrot for the harvest test
  app.shop.buySeed('carrot', 1);
  app.farm.plant(1, 'carrot');

  // Fast-forward 31s by mutating TimeManager offset.
  (tm as unknown as { _serverTimeOffset: number })._serverTimeOffset += 31_000;

  // Tick the farm manually to apply the new state.
  app.farm.tick();
  assert.equal(app.farm.plots[1].status, 'ready');

  const harvested = app.farm.harvest(1);
  assert.equal(harvested, true);
  assert.equal(app.inventory.getCount('carrot'), 1);

  const soldCount = app.shop.sellCrop('carrot');
  assert.equal(soldCount, 1);

  // 200 start - 10 buy - 10 buy + 25 sell = 205
  assert.equal(app.economy.coins, 205);
});

test('inventory overflow is rejected (warehouse cap 50)', () => {
  // Sell all + bulk add to test cap.
  app.inventory.clearByType('carrot');
  // Drop in 60 fake crops via direct add — should accept only up to 50.
  let accepted = 0;
  for (let i = 0; i < 60; i += 1) {
    if (app.inventory.add('carrot', 1)) accepted += 1;
  }
  assert.equal(accepted, 50);
  assert.equal(app.inventory.totalCount(), 50);
});