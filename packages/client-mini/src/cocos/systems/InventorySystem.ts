/**
 * Inventory system (client-mini).
 */

import { EventBus, GameEvent, type InventoryItem } from '@farm-game/shared';

const WAREHOUSE_CAPACITY = 50;

export class InventorySystem {
  private _items: InventoryItem[] = [];

  init(items: InventoryItem[] | undefined): void {
    this._items = items ?? [];
  }

  get items(): ReadonlyArray<InventoryItem> { return this._items; }

  getCount(itemId: string): number {
    const it = this._items.find((i) => i.itemId === itemId);
    return it?.count ?? 0;
  }

  /** Returns false when the warehouse would overflow. */
  add(itemId: string, count = 1): boolean {
    if (this.totalCount() + count > WAREHOUSE_CAPACITY) return false;
    const it = this._items.find((i) => i.itemId === itemId);
    if (it) it.count += count;
    else this._items.push({ itemId, count });
    EventBus.emit(GameEvent.InventoryChanged);
    return true;
  }

  remove(itemId: string, count = 1): boolean {
    const it = this._items.find((i) => i.itemId === itemId);
    if (!it || it.count < count) return false;
    it.count -= count;
    if (it.count <= 0) this._items = this._items.filter((i) => i.itemId !== itemId);
    EventBus.emit(GameEvent.InventoryChanged);
    return true;
  }

  totalCount(): number {
    return this._items.reduce((sum, i) => sum + i.count, 0);
  }

  capacity(): number { return WAREHOUSE_CAPACITY; }

  clearByType(itemId: string): number {
    const it = this._items.find((i) => i.itemId === itemId);
    if (!it) return 0;
    const removed = it.count;
    this._items = this._items.filter((i) => i.itemId !== itemId);
    EventBus.emit(GameEvent.InventoryChanged);
    return removed;
  }
}