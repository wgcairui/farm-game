/**
 * plant command service — POST /farm/plant.
 *
 * Per ADR-0003 D27/D29: planting deducts `crop.seedPrice` gold and sets
 * `cropId / plantedAt / matureAt / status='growing'`. The plot MUST be
 * unlocked and empty. The crop must be in `CROPS`.
 *
 * The receiving plot is locked with the player row to serialise concurrent
 * plantings and harvests.
 */

import { ErrorCode, computeMatureAt, getCrop, type FarmPlantPayload } from '@farm-game/shared';
import { LockMode } from '@mikro-orm/core';
import { Plot } from '../../db/entities/Plot.js';
import { Player } from '../../db/entities/Player.js';
import { hashRequestBody, loadReceipt, persistReceipt, projectReplay } from './receipts.js';
import { failure, success, type CommandOutcome } from './outcome.js';
import { derivePlotStatus } from './plot-state.js';

export interface PlantArgs {
  em: import('@mikro-orm/core').EntityManager;
  playerId: string;
  operationId: string;
  body: { plotIndex: number; cropId: string };
  serverNow: number;
}

export async function plantCommand(args: PlantArgs): Promise<CommandOutcome<FarmPlantPayload>> {
  const { em, playerId, operationId, body, serverNow } = args;
  const requestHash = hashRequestBody(body);

  // Lock the player row first so concurrent plant/water/harvest on the same
  // player serialise. Using `lockMode: PESSIMISTIC_WRITE` on `findOne` issues
  // `SELECT ... FOR UPDATE` in a single round-trip; the old two-step
  // (findOne → em.lock) was racy because two transactions could read the
  // same row before either held the lock.
  const player = await em.findOne(
    Player,
    { playerId },
    { lockMode: LockMode.PESSIMISTIC_WRITE },
  );
  if (!player) {
    // No player row to serialise on. Check for a prior receipt (lock-free)
    // so retrying a previously-settled operationId replays instead of
    // colliding on the receipts unique constraint.
    const prior = await loadReceipt<FarmPlantPayload>(em, playerId, operationId, 'plant', requestHash);
    if (prior) return projectReplay(prior);
    return persistReceipt({
      em, playerId, operationId, command: 'plant', requestHash, serverNow,
      outcome: failure<FarmPlantPayload>(ErrorCode.NOT_AUTHENTICATED, 'player row missing'),
    });
  }

  const replayed = await loadReceipt<FarmPlantPayload>(
    em, playerId, operationId, 'plant', requestHash,
  );
  if (replayed) return projectReplay(replayed);

  if (!Number.isInteger(body.plotIndex) || body.plotIndex < 0 || body.plotIndex > 23) {
    return persistReceipt({
      em, playerId, operationId, command: 'plant', requestHash, serverNow,
      outcome: failure<FarmPlantPayload>(ErrorCode.PLOT_NOT_OWNED, 'plotIndex out of range'),
    });
  }
  const cfg = getCrop(body.cropId);
  if (!cfg) {
    return persistReceipt({
      em, playerId, operationId, command: 'plant', requestHash, serverNow,
      outcome: failure<FarmPlantPayload>(ErrorCode.CROP_UNKNOWN, 'unknown cropId'),
    });
  }

  const plot = await em.findOne(Plot, { playerId, index: body.plotIndex });
  if (!plot) {
    return persistReceipt({
      em, playerId, operationId, command: 'plant', requestHash, serverNow,
      outcome: failure<FarmPlantPayload>(ErrorCode.PLOT_NOT_OWNED, 'plot row missing'),
    });
  }

  const liveStatus = derivePlotStatus(plot, serverNow);
  // Only `empty` plots accept a seed. Planting over a `ripe` crop used to be
  // allowed here, which silently destroyed an unharvested crop — flagged in
  // the T1 review and closed alongside the T1 review-fix (matches the G2
  // plan: farm commands operate on `empty` plots only).
  if (!plot.unlocked || liveStatus !== 'empty') {
    return persistReceipt({
      em, playerId, operationId, command: 'plant', requestHash, serverNow,
      outcome: failure<FarmPlantPayload>(ErrorCode.PLOT_NOT_EMPTY, 'plot is not empty'),
    });
  }

  if (player.gold < cfg.seedPrice) {
    return persistReceipt({
      em, playerId, operationId, command: 'plant', requestHash, serverNow,
      outcome: failure<FarmPlantPayload>(ErrorCode.INSUFFICIENT_GOLD, 'not enough gold to plant'),
    });
  }

  player.gold -= cfg.seedPrice;
  player.revision += 1;
  player.updatedAt = new Date(serverNow);

  plot.cropId = cfg.id;
  plot.plantedAt = new Date(serverNow);
  const matureAtMs = computeMatureAt(serverNow, cfg.id);
  plot.matureAt = matureAtMs === undefined ? null : new Date(matureAtMs);
  plot.waterCount = 0;
  plot.status = 'growing';

  em.persist(player);
  em.persist(plot);

  const outcome = success<FarmPlantPayload>({ plot: snapshot(plot) }, player.revision);
  return persistReceipt({ em, playerId, operationId, command: 'plant', requestHash, serverNow, outcome });
}

function snapshot(row: Plot): import('@farm-game/shared').PlotState {
  return {
    id: row.id,
    index: row.index,
    unlocked: row.unlocked,
    status: row.status as import('@farm-game/shared').PlotStatus,
    waterCount: row.waterCount,
    ...(row.cropId ? { cropId: row.cropId } : {}),
    ...(row.plantedAt ? { plantedAt: row.plantedAt.getTime() } : {}),
    ...(row.matureAt ? { matureAt: row.matureAt.getTime() } : {}),
  };
}