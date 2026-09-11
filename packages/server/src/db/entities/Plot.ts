/**
 * Plot entity — 24 rows per player (ADR-0002 D9).
 *
 * Per ADR-0003 D23: status is NOT denormalised by a background timer.
 * `status` reflects the persisted state (`empty`, `growing`, `ripe`, `locked`).
 * When a player fetches their save, the service layer lifts `status` from
 * `growing` → `ripe` based on `matureAt <= now`. Likewise `plot_locked`
 * means `unlocked = false`. This keeps reads cheap and removes the need for
 * a state-machine worker.
 *
 * `waterCount` is non-negative and bounded by `crop.maxWater`; the bound is
 * enforced by the application (`applyWater()` returns `limit_reached`) and
 * the DB CHECK is a safety net.
 */

import { defineEntity } from '@mikro-orm/core';

export class Plot {
  id!: string;
  playerId!: string;
  index!: number;
  unlocked!: boolean;
  status!: string;
  cropId!: string | null;
  plantedAt!: Date | null;
  matureAt!: Date | null;
  waterCount!: number;
}

export const PlotEntity = defineEntity({
  class: Plot,
  tableName: 'plots',
  primaryKeys: ['id'],
  properties: (p) => ({
    id: p.string().length(96).primary(),
    playerId: p.string().length(36).index(),
    index: p.type('integer'),
    unlocked: p.boolean().default(false),
    status: p.string().length(16).default('locked'),
    cropId: p.string().length(32).nullable(),
    plantedAt: p.datetime().nullable(),
    matureAt: p.datetime().nullable(),
    waterCount: p.type('integer').default(0),
  }),
  uniques: [
    {
      name: 'plots_player_id_index_uniq',
      properties: ['playerId', 'index'],
    },
  ],
});