/**
 * Shop system (client-mini). Pure business; UI calls these directly.
 */

import { CROPS, type CropConfig } from '@farm-game/shared';
import type { EconomySystem } from './EconomySystem.js';
import type { InventorySystem } from './InventorySystem.js';

export class ShopSystem {
  private _economy: EconomySystem | null = null;
  private _inventory: InventorySystem | null = null;

  init(): void { /* systems wired in GameApp via bind() */ }

  bind(economy: EconomySystem, inventory: InventorySystem): void {
    this._economy = economy;
    this._inventory = inventory;
  }

  listSeeds(): CropConfig[] { return Object.values(CROPS); }

  buySeed(cropId: string, count = 1): boolean {
    if (!this._economy || !this._inventory) return false;
    const cfg = CROPS[cropId];
    if (!cfg) return false;
    const totalCost = cfg.seedPrice * count;
    if (!this._economy.spend(totalCost)) return false;
    return this._inventory.add(cfg.seedItemId, count);
  }

  sellCrop(cropId: string): number {
    if (!this._economy || !this._inventory) return 0;
    const cfg = CROPS[cropId];
    if (!cfg) return 0;
    const count = this._inventory.clearByType(cfg.cropItemId);
    if (count > 0) this._economy.earn(cfg.sellPrice * count);
    return count;
  }
}