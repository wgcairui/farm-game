import { GameEvent, EventBus } from '../core/EventBus';
import { InventoryItem } from '../core/SaveManager';

const WAREHOUSE_CAPACITY = 50;

/**
 * 背包 / 仓库系统。
 * MVP 阶段仓库 = 背包，Phase 2 可拆分种子背包和作物仓库。
 */
export class InventorySystem {
    private _items: InventoryItem[] = [];

    init(items: InventoryItem[]) {
        this._items = items ?? [];
    }

    get items(): ReadonlyArray<InventoryItem> { return this._items; }

    getCount(itemId: string): number {
        const it = this._items.find(i => i.itemId === itemId);
        return it?.count ?? 0;
    }

    /** 增加物品，返回是否成功（仓库满则失败） */
    add(itemId: string, count = 1): boolean {
        if (this.totalCount() + count > WAREHOUSE_CAPACITY) return false;
        const it = this._items.find(i => i.itemId === itemId);
        if (it) {
            it.count += count;
        } else {
            this._items.push({ itemId, count });
        }
        EventBus.emit(GameEvent.InventoryChanged);
        return true;
    }

    /** 扣减物品，返回是否成功 */
    remove(itemId: string, count = 1): boolean {
        const it = this._items.find(i => i.itemId === itemId);
        if (!it || it.count < count) return false;
        it.count -= count;
        if (it.count <= 0) {
            this._items = this._items.filter(i => i.itemId !== itemId);
        }
        EventBus.emit(GameEvent.InventoryChanged);
        return true;
    }

    totalCount(): number {
        return this._items.reduce((sum, i) => sum + i.count, 0);
    }

    capacity(): number {
        return WAREHOUSE_CAPACITY;
    }

    /** 清空指定类型物品（出售用） */
    clearByType(itemId: string): number {
        const it = this._items.find(i => i.itemId === itemId);
        if (!it) return 0;
        const removed = it.count;
        this._items = this._items.filter(i => i.itemId !== itemId);
        EventBus.emit(GameEvent.InventoryChanged);
        return removed;
    }
}