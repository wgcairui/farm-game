/**
 * water command service — POST /farm/water.
 *
 * Per ADR-0003 D28: reuses the shared `applyWater()` helper so server and
 * client apply the same discount math. The plot MUST be `growing` (or
 * `ripe` if the client was a tick slow — the helper returns `already_ripe`
 * which maps to `WATER_LIMIT_REACHED` semantically — but for water we use
 * a more specific `CROP_NOT_RIPE` since the plot is ready to harvest, not
 * waterable).
 */

import {
  ErrorCode,
  applyWater,
  getCrop,
  type FarmWaterPayload,
  type PlotState,
} from '@farm-game/shared';
import { LockMode } from '@mikro-orm/core';
import { Plot } from '../../db/entities/Plot.js';
import { Player } from '../../db/entities/Player.js';
import { hashRequestBody, loadReceipt, persistReceipt } from './receipts.js';
import { failure, replayedFailure, replayedSuccess, success, type CommandOutcome } from './outcome.js';
import { derivePlotStatus } from './plot-state.js';

export interface WaterArgs {
  em: import('@mikro-orm/core').EntityManager;
  playerId: string;
  operationId: string;
  body: { plotIndex: number };
  serverNow: number;
}

export async function waterCommand(args: WaterArgs): Promise<CommandOutcome<FarmWaterPayload>> {
  const { em, playerId, operationId, body, serverNow } = args;
  const requestHash = hashRequestBody(body);

  const player = await em.findOne(
    Player,
    { playerId },
    { lockMode: LockMode.PESSIMISTIC_WRITE },
  );
  if (!player) {
    return persistReceipt({
      em, playerId, operationId, command: 'water', requestHash, serverNow,
      outcome: failure<FarmWaterPayload>(ErrorCode.NOT_AUTHENTICATED, 'player row missing'),
    });
  }

  const replayed = await loadReceipt<FarmWaterPayload>(
    em, playerId, operationId, 'water', requestHash,
  );
  if (replayed) {
    return replayed.outcome.ok
      ? replayedSuccess<FarmWaterPayload>(replayed.outcome.payload, replayed.outcome.revision)
      : replayedFailure<FarmWaterPayload>(replayed.outcome.code, replayed.outcome.message);
  }

  if (!Number.isInteger(body.plotIndex) || body.plotIndex < 0 || body.plotIndex > 23) {
    return persistReceipt({
      em, playerId, operationId, command: 'water', requestHash, serverNow,
      outcome: failure<FarmWaterPayload>(ErrorCode.PLOT_NOT_OWNED, 'plotIndex out of range'),
    });
  }

  const plot = await em.findOne(Plot, { playerId, index: body.plotIndex });
  if (!plot) {
    return persistReceipt({
      em, playerId, operationId, command: 'water', requestHash, serverNow,
      outcome: failure<FarmWaterPayload>(ErrorCode.PLOT_NOT_OWNED, 'plot row missing'),
    });
  }

  // Build a PlotState-shaped snapshot for applyWater (no `id` collisions with the DB row).
  const liveStatus = derivePlotStatus(plot, serverNow);
  const live: PlotState = {
    id: plot.id,
    index: plot.index,
    unlocked: plot.unlocked,
    status: liveStatus,
    waterCount: plot.waterCount,
    ...(plot.cropId ? { cropId: plot.cropId } : {}),
    ...(plot.plantedAt ? { plantedAt: plot.plantedAt.getTime() } : {}),
    ...(plot.matureAt ? { matureAt: plot.matureAt.getTime() } : {}),
  };

  const result = applyWater(live, serverNow);
  if (!result.ok) {
    const code = mapWaterReason(result.reason);
    return persistReceipt({
      em, playerId, operationId, command: 'water', requestHash, serverNow,
      outcome: failure<FarmWaterPayload>(code, `cannot water: ${result.reason}`),
    });
  }

  // `applyWater` never changes cropId/plantedAt; matureAt is the only
  // persisted field that moves. Persist + bump revision.
  plot.matureAt = new Date(result.value.matureAt);
  plot.waterCount = result.value.waterCount;
  player.revision += 1;
  player.updatedAt = new Date(serverNow);
  em.persist(player);
  em.persist(plot);

  const outcome = success<FarmWaterPayload>({ plot: snapshot(plot, liveStatus) }, player.revision);
  return persistReceipt({ em, playerId, operationId, command: 'water', requestHash, serverNow, outcome });
}

type WaterReason = 'unknown_crop' | 'plot_locked' | 'not_growing' | 'already_ripe' | 'limit_reached' | 'corrupted';

function mapWaterReason(reason: WaterReason): ErrorCode {
  switch (reason) {
    case 'plot_locked':
      return ErrorCode.PLOT_NOT_OWNED;
    case 'not_growing':
      return ErrorCode.PLOT_NOT_EMPTY;
    case 'already_ripe':
      return ErrorCode.CROP_NOT_RIPE;
    case 'limit_reached':
      return ErrorCode.WATER_LIMIT_REACHED;
    case 'unknown_crop':
    case 'corrupted':
      return ErrorCode.CROP_UNKNOWN;
  }
  void getCrop;
  return ErrorCode.INTERNAL;
}

function snapshot(row: Plot, liveStatus: import('@farm-game/shared').PlotStatus): import('@farm-game/shared').PlotState {
  return {
    id: row.id,
    index: row.index,
    unlocked: row.unlocked,
    status: liveStatus,
    waterCount: row.waterCount,
    ...(row.cropId ? { cropId: row.cropId } : {}),
    ...(row.plantedAt ? { plantedAt: row.plantedAt.getTime() } : {}),
    ...(row.matureAt ? { matureAt: row.matureAt.getTime() } : {}),
  };
}