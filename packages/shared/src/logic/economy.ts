/**
 * Pure economy math — server validates gold/sell amount, clients mirror locally.
 */

import { getCrop } from '../types/crop.js';

/** Returns total cost to buy `count` seeds, or null if cropId is unknown. */
export function seedTotalCost(cropId: string, count: number): number | null {
  const cfg = getCrop(cropId);
  if (!cfg || count <= 0) return null;
  return cfg.seedPrice * count;
}

/** Returns total revenue for selling `count` crops of cropId, or null if unknown. */
export function sellRevenue(cropId: string, count: number): number | null {
  const cfg = getCrop(cropId);
  if (!cfg || count <= 0) return null;
  return cfg.sellPrice * count;
}