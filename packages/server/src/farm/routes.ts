/**
 * /farm/unlock — unlocks a single plot for the authenticated player.
 *
 * Phase 1: free unlock; Phase 2: deduct gold (seedTotalCost placeholder,
 * real config table TBD). Gold deduction lands with G1 once the price table
 * is in the database.
 */

import type { FastifyInstance } from 'fastify';
import { ErrorCode, type ApiResponse, type PlotState } from '@farm-game/shared';
import { InMemoryPlayerRepo } from '../auth/repo.js';

const unlockBodySchema = {
  type: 'object',
  required: ['plotIndex'],
  additionalProperties: false,
  properties: { plotIndex: { type: 'integer', minimum: 0, maximum: 23 } },
} as const;

export async function farmRoutes(app: FastifyInstance, deps: { repo: InMemoryPlayerRepo }): Promise<void> {
  app.post<{ Body: { plotIndex: number }; Reply: ApiResponse<{ plot: PlotState }> }>(
    '/farm/unlock',
    { preHandler: app.authenticate, schema: { body: unlockBodySchema } },
    async (req): Promise<ApiResponse<{ plot: PlotState }>> => {
      const player = await deps.repo.findByPlayerId(req.user.sub);
      if (!player) {
        return { ok: false, code: ErrorCode.NOT_AUTHENTICATED, message: 'player not found' };
      }
      const { plotIndex } = req.body;
      const plot = player.plots[plotIndex];
      if (!plot) {
        return { ok: false, code: ErrorCode.PLOT_NOT_OWNED, message: 'plot out of range' };
      }
      if (!plot.unlocked) {
        plot.unlocked = true;
        await deps.repo.upsert(player);
      }
      return { ok: true, data: { plot } };
    },
  );
}
