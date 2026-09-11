/**
 * Shared command DTO tests — pure validators for ADR-0003 D17/D20/D27.
 *
 * The server applies these rules on every write command:
 *  - `operationId` must be a non-empty string <= 64 chars
 *  - `plotIndex` must be an integer 0..23 (24 plots per ADR-0002 D9)
 *  - `cropId` must be present and non-empty
 *  - request bodies must be canonicalisable to a stable string for hashing
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicaliseBody,
  OPERATION_ID_MAX_LENGTH,
  type FarmPlantBody,
} from '../src/protocol/commands.js';

test('canonicaliseBody sorts keys so the hash is stable across clients', () => {
  const a = canonicaliseBody({ plotIndex: 3, cropId: 'carrot' });
  const b = canonicaliseBody({ cropId: 'carrot', plotIndex: 3 });
  assert.equal(a, b);
});

test('canonicaliseBody distinguishes different values', () => {
  const a = canonicaliseBody({ plotIndex: 3, cropId: 'carrot' });
  const b = canonicaliseBody({ plotIndex: 4, cropId: 'carrot' });
  assert.notEqual(a, b);
});

test('canonicaliseBody on nested objects preserves key order recursively', () => {
  const a = canonicaliseBody({ a: { x: 1, y: 2 }, b: 1 });
  const b = canonicaliseBody({ b: 1, a: { y: 2, x: 1 } });
  assert.equal(a, b);
});

test('OPERATION_ID_MAX_LENGTH is 64', () => {
  // Locked by ADR-0003 D17 to keep receipts table bounded.
  assert.equal(OPERATION_ID_MAX_LENGTH, 64);
});

test('FarmPlantBody shape is preserved', () => {
  const body: FarmPlantBody = { plotIndex: 7, cropId: 'potato' };
  // Type-level assertion: the object matches the structural type.
  assert.equal(typeof body.plotIndex, 'number');
  assert.equal(typeof body.cropId, 'string');
});