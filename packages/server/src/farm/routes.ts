/**
 * /farm routes — POST /farm/unlock (Phase 1: mock unlock; Phase 2: deduct gold + persist).
 */

import {
  ErrorCode,
  seedTotalCost,
  type ApiResponse,
  type PlotState,
} from '@farm-game/shared';
import type { InMemoryPlayerRepo } from '../auth/repo.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type App = any;

export async function farmRoutes(
  app: App,
  deps: { repo: InMemoryPlayerRepo },
): Promise<void> {
  app.post('/farm/unlock', async (req: { body?: { plotIndex?: number }; user?: { openid?: string }; jwtVerify: () => Promise<void> }, reply: { code: (n: number) => unknown }): Promise<ApiResponse<{ plot: PlotState }>> => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401);
      return { ok: false, code: ErrorCode.NOT_AUTHENTICATED, message: 'invalid token' };
    }

    const openid = (req.user as { openid?: string } | undefined)?.openid;
    const { plotIndex } = req.body ?? ({} as { plotIndex?: number });
    if (!openid || typeof plotIndex !== 'number') {
      reply.code(400);
      return { ok: false, code: ErrorCode.BAD_REQUEST, message: 'plotIndex required' };
    }

    const player = await deps.repo.findByOpenid(openid);
    if (!player) {
      reply.code(404);
      return { ok: false, code: ErrorCode.NOT_AUTHENTICATED, message: 'player not found' };
    }
    const plot = player.plots[plotIndex];
    if (!plot) {
      reply.code(404);
      return { ok: false, code: ErrorCode.PLOT_NOT_OWNED, message: 'plot out of range' };
    }
    if (plot.unlocked) {
      return { ok: true, data: { plot } };
    }
    // Phase 1: free unlock. Phase 2: deduct gold (seedTotalCost placeholder,
    // real config table TBD).
    plot.unlocked = true;
    player.gold -= 0;
    await deps.repo.upsert(player);
    return { ok: true, data: { plot } };
  });
}