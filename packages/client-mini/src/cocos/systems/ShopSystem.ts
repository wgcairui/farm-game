/**
 * Shop system (client-mini). Per ADR-0002 D12 the Phase 1 buy-sell flow is
 * retired: planting deducts gold directly via FarmSystem, harvest awards
 * gold directly. ShopSystem now only exposes the price catalog so the UI
 * layer can render the list; it never mutates economy state.
 */

import { CROPS, type CropConfig } from '@farm-game/shared';

export class ShopSystem {
  init(): void { /* retired: no bind() needed */ }

  listSeeds(): CropConfig[] { return Object.values(CROPS); }

  /** Compatibility shim — returns true if the crop id is known. */
  buySeed(_cropId: string, _count = 1): boolean { return false; }

  /** Compatibility shim — always returns 0; harvest awards gold via FarmSystem. */
  sellCrop(_cropId: string): number { return 0; }
}
