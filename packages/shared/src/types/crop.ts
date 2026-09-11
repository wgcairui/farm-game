/**
 * Crop config — single source of truth across server and clients.
 * Phase 1 returns this from GET /crop/configs; clients can also bootstrap offline.
 */

export interface CropConfig {
  id: string;
  name: string;
  icon: string;
  seedPrice: number;
  sellPrice: number;
  growthDuration: number;   // seconds
  stages: number;           // seed → mature inclusive
  maxWater: number;         // watering cap (default 3)
  witherWindow: number;     // seconds ripe → withered
  seedItemId: string;
  cropItemId: string;
}

export const CROPS: Readonly<Record<string, CropConfig>> = Object.freeze({
  carrot: {
    id: 'carrot', name: '白萝卜', icon: 'carrot_icon',
    seedPrice: 10, sellPrice: 25,
    growthDuration: 30, stages: 4, maxWater: 3, witherWindow: 24 * 3600,
    seedItemId: 'carrot_seed', cropItemId: 'carrot',
  },
  potato: {
    id: 'potato', name: '土豆', icon: 'potato_icon',
    seedPrice: 30, sellPrice: 70,
    growthDuration: 120, stages: 4, maxWater: 3, witherWindow: 24 * 3600,
    seedItemId: 'potato_seed', cropItemId: 'potato',
  },
  corn: {
    id: 'corn', name: '玉米', icon: 'corn_icon',
    seedPrice: 60, sellPrice: 150,
    growthDuration: 300, stages: 4, maxWater: 3, witherWindow: 24 * 3600,
    seedItemId: 'corn_seed', cropItemId: 'corn',
  },
  tomato: {
    id: 'tomato', name: '番茄', icon: 'tomato_icon',
    seedPrice: 100, sellPrice: 280,
    growthDuration: 900, stages: 4, maxWater: 3, witherWindow: 24 * 3600,
    seedItemId: 'tomato_seed', cropItemId: 'tomato',
  },
  strawberry: {
    id: 'strawberry', name: '草莓', icon: 'strawberry_icon',
    seedPrice: 200, sellPrice: 600,
    growthDuration: 3600, stages: 4, maxWater: 3, witherWindow: 24 * 3600,
    seedItemId: 'strawberry_seed', cropItemId: 'strawberry',
  },
});

export function getCrop(id: string): CropConfig | undefined {
  return CROPS[id];
}

export function listCrops(): CropConfig[] {
  return Object.values(CROPS);
}