/**
 * harvest command service — POST /farm/harvest.
 *
 * Awards `crop.sellPrice` gold when the plot is `ripe` (i.e. matureAt <= now),
 * then clears crop-related fields. Per ADR-0002 D12: harvest awards gold
 * directly, no warehouse/inventory detour.
 */

import {
  ErrorCode,
  getCrop,
  type FarmHarvestPayload,
} from '@farm-game/shared';
import { LockMode } from '@mikro-orm/core';
import { Plot } from '../../db/entities/Plot.js';
import { Player } from '../../db/entities/Player.js';
import { hashRequestBody, loadReceipt, persistReceipt, projectReplay } from './receipts.js';
import { failure, success, type CommandOutcome } from './outcome.js';
import { derivePlotStatus } from './plot-state.js';

export interface HarvestArgs {
  em: import('@mikro-orm/core').EntityManager;
  playerId: string;
  operationId: string;
  body: { plotIndex: number };
  serverNow: number;
}

export async function harvestCommand(args: HarvestArgs): Promise<CommandOutcome<FarmHarvestPayload>> {
  const { em, playerId, operationId, body, serverNow } = args;
  const requestHash = hashRequestBody(body);

  const player = await em.findOne(
    Player,
    { playerId },
    { lockMode: LockMode.PESSIMISTIC_WRITE },
  );
  if (!player) {
    // No player row to serialise on. Check for a prior receipt (lock-free)
    // so retrying a previously-settled operationId replays instead of
    // colliding on the receipts unique constraint.
    const prior = await loadReceipt<FarmHarvestPayload>(em, playerId, operationId, 'harvest', requestHash);
    if (prior) return projectReplay(prior);
    return persistReceipt({
      em, playerId, operationId, command: 'harvest', requestHash, serverNow,
      outcome: failure<FarmHarvestPayload>(ErrorCode.NOT_AUTHENTICATED, 'player row missing'),
    });
  }

  const replayed = await loadReceipt<FarmHarvestPayload>(
    em, playerId, operationId, 'harvest', requestHash,
  );
  if (replayed) return projectReplay(replayed);

  if (!Number.isInteger(body.plotIndex) || body.plotIndex < 0 || body.plotIndex > 23) {
    return persistReceipt({
      em, playerId, operationId, command: 'harvest', requestHash, serverNow,
      outcome: failure<FarmHarvestPayload>(ErrorCode.PLOT_NOT_OWNED, 'plotIndex out of range'),
    });
  }

  const plot = await em.findOne(Plot, { playerId, index: body.plotIndex });
  if (!plot) {
    return persistReceipt({
      em, playerId, operationId, command: 'harvest', requestHash, serverNow,
      outcome: failure<FarmHarvestPayload>(ErrorCode.PLOT_NOT_OWNED, 'plot row missing'),
    });
  }

  const liveStatus = derivePlotStatus(plot, serverNow);
  if (liveStatus !== 'ripe') {
    return persistReceipt({
      em, playerId, operationId, command: 'harvest', requestHash, serverNow,
      outcome: failure<FarmHarvestPayload>(ErrorCode.CROP_NOT_RIPE, 'plot is not ripe'),
    });
  }

  const cfg = plot.cropId ? getCrop(plot.cropId) : undefined;
  if (!cfg) {
    return persistReceipt({
      em, playerId, operationId, command: 'harvest', requestHash, serverNow,
      outcome: failure<FarmHarvestPayload>(ErrorCode.CROP_UNKNOWN, 'plot references unknown crop'),
    });
  }

  player.gold += cfg.sellPrice;
  player.revision += 1;
  player.updatedAt = new Date(serverNow);

  // Clear the crop, mark empty.
  plot.cropId = null;
  plot.plantedAt = null;
  plot.matureAt = null;
  plot.waterCount = 0;
  plot.status = 'empty';

  em.persist(player);
  em.persist(plot);

  const outcome = success<FarmHarvestPayload>({ plot: snapshot(plot), goldAwarded: cfg.sellPrice }, player.revision);
  return persistReceipt({ em, playerId, operationId, command: 'harvest', requestHash, serverNow, outcome });
}

function snapshot(row: Plot): import('@farm-game/shared').PlotState {
  return {
    id: row.id,
    index: row.index,
    unlocked: row.unlocked,
    status: row.status as import('@farm-game/shared').PlotStatus,
    waterCount: row.waterCount,
  };
}