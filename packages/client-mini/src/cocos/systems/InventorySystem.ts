/**
 * Inventory system — RETIRED placeholder.
 *
 * Per ADR-0002 D12: the Phase 1 seed/warehouse detour is gone. Planting
 * deducts gold directly; harvest awards gold directly. This module is kept
 * as a typed stub so any older import path compiles, but the runtime is a
 * no-op and no GameEvent is emitted.
 *
 * Callers that still need a transient bag (UI scratch buffers, hot-bar
 * counts) should be migrated to a typed local map in the new G1 era.
 */

export class InventorySystem {
  init(_items?: unknown): void { /* retired */ }
  get items(): readonly unknown[] { return []; }
  getCount(_itemId: string): number { return 0; }
  add(_itemId: string, _count = 1): boolean { return false; }
  remove(_itemId: string, _count = 1): boolean { return false; }
  totalCount(): number { return 0; }
  capacity(): number { return 0; }
  clearByType(_itemId: string): number { return 0; }
}
