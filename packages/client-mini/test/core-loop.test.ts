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

test('starting coins are 200 and 6 plots are unlocked (ADR-0002 D9)', () => {
  assert.equal(app.economy.coins, 200);
  const unlocked = app.farm.plots.filter((p) => p.unlocked).length;
  assert.equal(unlocked, 6);
  const locked = app.farm.plots.filter((p) => p.status === 'locked').length;
  assert.equal(locked, 18);
});

test('plant carrot on plot 0 directly costs 10g and skips the inventory', () => {
  const before = app.economy.coins;
  const ok = app.farm.plant(0, 'carrot');
  assert.equal(ok, true);
  const plot = app.farm.plots[0];
  assert.equal(plot.status, 'growing');
  assert.equal(plot.cropId, 'carrot');
  assert.ok(plot.plantedAt);
  assert.ok(plot.matureAt);
  assert.equal(plot.matureAt! - plot.plantedAt!, 30_000);
  assert.equal(app.economy.coins, before - 10);
});

test('time-travel 31s → harvest awards 25g directly → total 195g', () => {
  // Plant a second carrot for the harvest test.
  app.farm.plant(1, 'carrot');

  // Fast-forward 31s by mutating TimeManager offset.
  (tm as unknown as { _serverTimeOffset: number })._serverTimeOffset += 31_000;

  // Tick the farm manually to apply the new state.
  app.farm.tick();
  assert.equal(app.farm.plots[1].status, 'ripe');

  const harvested = app.farm.harvest(1);
  assert.equal(harvested, true);

  // 200 start - 10 (plot 0 plant) - 10 (plot 1 plant) + 25 (harvest) = 205.
  // The plot-0 carrot is still growing, no reward yet.
  assert.equal(app.economy.coins, 205);
  // Plot 1 must be empty after harvest (D11: no withered bucket).
  assert.equal(app.farm.plots[1].status, 'empty');
});

test('locked plot refuses plant/harvest without unlock', () => {
  const lockedIndex = 10;
  assert.equal(app.farm.plots[lockedIndex].status, 'locked');
  const coinsBefore = app.economy.coins;
  assert.equal(app.farm.plant(lockedIndex, 'carrot'), false);
  assert.equal(app.economy.coins, coinsBefore);
});

test('harvestAll collects every ripe plot and resets them', () => {
  // Force one extra plot to ripe by time-traveling.
  app.farm.plant(2, 'carrot');
  (tm as unknown as { _serverTimeOffset: number })._serverTimeOffset += 31_000;
  app.farm.tick();
  const ripeCount = app.farm.plots.filter((p) => p.status === 'ripe').length;
  assert.ok(ripeCount >= 1, 'at least one plot should be ripe');

  const collected = app.farm.harvestAll();
  assert.ok(collected >= 1);
  const stillRipe = app.farm.plots.filter((p) => p.status === 'ripe').length;
  assert.equal(stillRipe, 0);
});
