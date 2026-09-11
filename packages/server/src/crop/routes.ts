/**
 * /crop/configs — open (no auth) endpoint returning the crop catalog from shared.
 */

import type { FastifyInstance } from 'fastify';
import {
  listCrops,
  PROTOCOL_VERSION,
  type ApiResponse,
  type CropConfig,
} from '@farm-game/shared';

export async function cropRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: ApiResponse<{ crops: CropConfig[]; version: number }> }>(
    '/crop/configs',
    async (): Promise<ApiResponse<{ crops: CropConfig[]; version: number }>> => ({
      ok: true,
      data: { crops: listCrops(), version: 1 },
    }),
  );

  // Single-endpoint for clients that need the protocol version without a separate round-trip.
  app.get<{ Reply: ApiResponse<{ protocolVersion: string }> }>(
    '/crop/_meta',
    async () => ({ ok: true, data: { protocolVersion: PROTOCOL_VERSION } }),
  );
}
