/**
 * Pure growth functions — server and clients agree on the math, no engine dependency.
 */

import { getCrop } from '../types/crop.js';
import type { PlotState } from '../types/plot.js';

/** Map a (plantedAt, cropId) pair to its current visual stage index. */
export function computeStage(plot: PlotState, now: number): number {
  if (!plot.plantedAt || !plot.cropId) return 0;
  const cfg = getCrop(plot.cropId);
  if (!cfg) return 0;
  const elapsedSec = (now - plot.plantedAt) / 1000;
  const progress = Math.min(Math.max(elapsedSec / cfg.growthDuration, 0), 1);
  return Math.min(Math.floor(progress * cfg.stages), cfg.stages - 1);
}

/** Compute when a plot will mature; returns undefined for non-growing plots. */
export function computeMatureAt(plantedAt: number, cropId: string): number | undefined {
  const cfg = getCrop(cropId);
  if (!cfg) return undefined;
  return plantedAt + cfg.growthDuration * 1000;
}

/** Water discount: each water speeds up remaining time by `discountPerWater`. */
export const WATER_DISCOUNT_PER = 0.05; // 5% per PRD §2.2.3

export function applyWater(plantedAt: number, cropId: string, currentWaterCount: number): {
  matureAt: number;
  waterCount: number;
} | null {
  const cfg = getCrop(cropId);
  if (!cfg) return null;
  if (currentWaterCount >= cfg.maxWater) return null;

  const baseDuration = cfg.growthDuration * 1000;
  const newWaterCount = currentWaterCount + 1;
  // remaining after N waters = duration * (1 - N*0.05)
  const discount = Math.min(newWaterCount * WATER_DISCOUNT_PER, 0.5);
  const newDuration = baseDuration * (1 - discount);
  return {
    matureAt: plantedAt + newDuration,
    waterCount: newWaterCount,
  };
}