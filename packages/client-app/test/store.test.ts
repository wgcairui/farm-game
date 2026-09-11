import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, patchPlot } from '../src/store/GameStore.js';
import { createDefaultPlayerSave, EventBus, GameEvent, type PlotState } from '@farm-game/shared';

test('GameStore notifies subscribers on setPlayer', () => {
  const store = new GameStore();
  const calls: number[] = [];
  store.subscribe(() => calls.push(1));
  store.setPlayer(createDefaultPlayerSave('openid-1'));
  assert.equal(calls.length, 1);
  store.destroy();
});

test('GameStore.setConnected toggles flag without changing player', () => {
  const store = new GameStore();
  const player = createDefaultPlayerSave('openid-2');
  store.setPlayer(player);
  store.setConnected(true);
  assert.equal(store.state.connected, true);
  assert.equal(store.state.player?.openid, 'openid-2');
  store.destroy();
});

test('patchPlot updates the matching plot immutably', () => {
  const player = createDefaultPlayerSave('openid-3');
  const before = { player, connected: false };
  const patch: PlotState = {
    id: 'openid-3:2', index: 2, unlocked: true, status: 'growing',
    cropId: 'carrot', plantedAt: 1, waterCount: 0,
  };
  const after = patchPlot(before, patch);
  assert.equal(after.player?.plots[2].cropId, 'carrot');
  assert.notEqual(after, before);
});

test('EventBus listener leaks are bounded by destroy()', () => {
  EventBus.clear();
  const before = EventBus.listenerCount(GameEvent.CoinsChanged);
  const store = new GameStore();
  assert.equal(EventBus.listenerCount(GameEvent.CoinsChanged), before + 1);
  store.destroy();
  assert.equal(EventBus.listenerCount(GameEvent.CoinsChanged), before);
});