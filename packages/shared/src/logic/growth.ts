/**
 * Pure growth functions — server and clients agree on the math, no engine dependency.
 *
 * Per ADR-0001 §5, `applyWater()` discounts the *remaining* time at the moment of
 * watering, not the total duration. The function takes the authoritative server
 * `now` and the currently persisted `matureAt`, and returns a new `matureAt`
 * shifted earlier by 5%. This matches PRD §2.2.3 verbatim and prevents
 * replay-based cheating where a client could pretend it watered more times
 * than the persisted `waterCount` reflects.
 *
 * Per ADR-0002 D10/D11: status enum is now `locked / empty / growing / ripe`.
 * The `withered` state is removed (D11); ripe plots are reachable through
 * `status: 'ripe'` once `now >= matureAt`.
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
  | 'plot_locked'         // status is 'locked' (not yet purchased)
  | 'not_growing'         // status is 'empty' (no crop planted)
  | 'already_ripe'        // status is 'ripe' (matureAt <= now)
  | 'limit_reached'
  | 'corrupted';          // matureAt missing or non-finite

export interface ApplyWaterResult {
  matureAt: number;
  waterCount: number;
}

/**
 * Apply one watering to a growing plot.
 *
 * Returns `null` plus a `reason` on failure:
 *  - `plot_locked`  — status is 'locked' (unlock the tile first)
 *  - `not_growing`  — status is 'empty' (no crop planted)
 *  - `unknown_crop` — `cropId` not in `CROPS`
 *  - `already_ripe` — status is 'ripe' (matureAt reached)
 *  - `limit_reached`— `waterCount >= crop.maxWater`
 *  - `corrupted`    — `matureAt` is missing or non-finite (refuse rather than
 *    propagate NaN into the next state)
 *
 * On success, `newMatureAt = now + ceil((oldMatureAt - now) × 0.95)`. Each water
 * therefore saves 5% of the time *remaining at that moment*, not of the original
 * duration. The discount compounds up to `maxWater` waters per crop.
 */
export function applyWater(
  plot: PlotState,
  now: number,
): { ok: true; value: ApplyWaterResult } | { ok: false; reason: ApplyWaterFailure } {
  if (plot.status === 'locked') return { ok: false, reason: 'plot_locked' };
  if (plot.status === 'empty') return { ok: false, reason: 'not_growing' };
  if (plot.status === 'ripe') return { ok: false, reason: 'already_ripe' };
  // plot.status === 'growing' from here.
  if (!plot.cropId) return { ok: false, reason: 'not_growing' };
  const cfg = getCrop(plot.cropId);
  if (!cfg) return { ok: false, reason: 'unknown_crop' };
  if (typeof plot.matureAt !== 'number' || !Number.isFinite(plot.matureAt)) {
    return { ok: false, reason: 'corrupted' };
  }
  if (plot.waterCount >= cfg.maxWater) return { ok: false, reason: 'limit_reached' };

  const remaining = plot.matureAt - now;
  // remaining can be 0 if `now === matureAt` exactly (status should be 'ripe'
  // by then, but defend against clock skew).
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
