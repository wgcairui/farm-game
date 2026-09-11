/**
 * Plot-state helpers — read-time derivation of `status` from persisted data.
 *
 * Per ADR-0003 D23: status is read-derived, not maintained by a background
 * worker. A `growing` plot becomes `ripe` once `matureAt <= now`. This
 * keeps the data layer cheap and removes the need for any cron / scheduler.
 */

import type { PlotStatus } from '@farm-game/shared';

export function derivePlotStatus(
  persisted: { unlocked: boolean; status: string; matureAt: Date | null },
  now: number,
): PlotStatus {
  if (!persisted.unlocked) return 'locked';
  if (persisted.status === 'empty') return 'empty';
  if (persisted.status === 'growing' && persisted.matureAt && persisted.matureAt.getTime() <= now) {
    return 'ripe';
  }
  return persisted.status as PlotStatus;
}