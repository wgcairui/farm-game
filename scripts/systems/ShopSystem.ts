import { EconomySystem } from './EconomySystem';
import { InventorySystem } from './InventorySystem';
import { CROPS, CropConfig } from './CropConfig';

/**
 * 商店系统：MVP 只卖种子，Phase 2 加道具 / 装饰。
 */
export class ShopSystem {
    private _economy: EconomySystem | null = null;
    private _inventory: InventorySystem | null = null;

    init() { /* 系统在 GameApp 里绑定，下面 set 方法负责注入 */ }

    bind(economy: EconomySystem, inventory: InventorySystem) {
        this._economy = economy;
        this._inventory = inventory;
    }

    /** 列出当前可售种子 */
    listSeeds(): CropConfig[] {
        return Object.values(CROPS);
    }

    /** 购买种子 */
    buySeed(cropId: string, count = 1): boolean {
        if (!this._economy || !this._inventory) return false;
        const cfg = CROPS[cropId];
        if (!cfg) return false;
        const totalCost = cfg.seedPrice * count;
        if (!this._economy.spend(totalCost)) return false;
        return this._inventory.add(cfg.seedItemId, count);
    }

    /** 卖出指定类型所有作物 */
    sellCrop(cropId: string): number {
        if (!this._economy || !this._inventory) return 0;
        const cfg = CROPS[cropId];
        if (!cfg) return 0;
        const count = this._inventory.clearByType(cfg.cropItemId);
        if (count > 0) this._economy.earn(cfg.sellPrice * count);
        return count;
    }
}