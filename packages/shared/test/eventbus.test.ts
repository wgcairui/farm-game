import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/eventbus/EventBus.js';

test('EventBus on → emit fires handler', () => {
  const bus = new (EventBus.constructor as any)();
  let got: number | undefined;
  bus.on<number>('x', (v) => { got = v; });
  bus.emit<number>('x', 42);
  assert.equal(got, 42);
});

test('EventBus off prevents further calls', () => {
  const bus = new (EventBus.constructor as any)();
  let count = 0;
  const handler = () => { count += 1; };
  bus.on('x', handler);
  bus.emit('x');
  assert.equal(count, 1);
  bus.off('x', handler);
  bus.emit('x');
  assert.equal(count, 1);
});

test('EventBus survives handler that throws', () => {
  const bus = new (EventBus.constructor as any)();
  const errors: unknown[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  bus.on('x', () => { throw new Error('boom'); });
  let count = 0;
  bus.on('x', () => { count += 1; });
  bus.emit('x');
  assert.equal(count, 1);
  assert.equal(errors.length, 1);
  console.error = origError;
});

test('EventBus listenerCount and clear', () => {
  const bus = new (EventBus.constructor as any)();
  bus.on('a', () => {});
  bus.on('a', () => {});
  bus.on('b', () => {});
  assert.equal(bus.listenerCount('a'), 2);
  bus.clear();
  assert.equal(bus.listenerCount('a'), 0);
});