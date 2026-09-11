/**
 * Pure growth functions — server and clients agree on the math, no engine dependency.
 *
 * Per ADR-0001 §5, `applyWater()` discounts the *remaining* time at the moment of
 * watering, not the total duration. The function takes the authoritative server
 * `now` and the currently persisted `matureAt`, and returns a new `matureAt`
 * shifted earlier by 5%. This matches PRD §2.2.3 verbatim and prevents
 * replay-based cheating where a client could pretend it watered more times
 * than the persisted `waterCount` reflects.
 */

import { getCrop } from '../types/crop.js';
import type { PlotState } from '../types/plot.js';

export const WATER_DISCOUNT_PER = 0.05; // 5% of remaining time, per PRD §2.2.3

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

export type ApplyWaterFailure =
  | 'unknown_crop'
  | 'not_growing'
  | 'already_ripe'
  | 'limit_reached';

export interface ApplyWaterResult {
  matureAt: number;
  waterCount: number;
}

/**
 * Apply one watering to a growing plot.
 *
 * Returns `null` plus a `reason` on failure:
 *  - `unknown_crop` — `cropId` not in `CROPS`
 *  - `not_growing` — plot status is not 'growing' (empty / ready / withered)
 *  - `already_ripe` — `matureAt <= now` (PRD: cannot water a ripe crop)
 *  - `limit_reached` — `waterCount >= crop.maxWater`
 *
 * On success, `newMatureAt = now + ceil((oldMatureAt - now) × 0.95)`. Each water
 * therefore saves 5% of the time *remaining at that moment*, not of the original
 * duration. The discount compounds up to `maxWater` waters per crop.
 */
export function applyWater(
  plot: PlotState,
  now: number,
): { ok: true; value: ApplyWaterResult } | { ok: false; reason: ApplyWaterFailure } {
  if (!plot.cropId || plot.status !== 'growing') {
    return { ok: false, reason: 'not_growing' };
  }
  const cfg = getCrop(plot.cropId);
  if (!cfg) return { ok: false, reason: 'unknown_crop' };
  if (typeof plot.matureAt !== 'number') return { ok: false, reason: 'not_growing' };
  if (plot.waterCount >= cfg.maxWater) return { ok: false, reason: 'limit_reached' };

  const remaining = plot.matureAt - now;
  if (remaining <= 0) return { ok: false, reason: 'already_ripe' };

  const discounted = Math.ceil(remaining * (1 - WATER_DISCOUNT_PER));
  return {
    ok: true,
    value: {
      matureAt: now + discounted,
      waterCount: plot.waterCount + 1,
    },
  };
}
