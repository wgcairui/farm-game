/**
 * /crop/configs — open (no auth) endpoint returning the crop catalog from shared.
 */

import { listCrops, type ApiResponse, type CropConfig, PROTOCOL_VERSION } from '@farm-game/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type App = any;

export async function cropRoutes(app: App): Promise<void> {
  app.get('/crop/configs', async (): Promise<ApiResponse<{ crops: CropConfig[]; version: number }>> => {
    return {
      ok: true,
      data: {
        crops: listCrops(),
        version: 1,
      },
    };
  });

  // The protocol version is repeated here so clients can ping one endpoint
  // for both data and protocol version without an extra /auth/_meta round-trip.
  app.get('/crop/_meta', async () => ({ ok: true, data: { protocolVersion: PROTOCOL_VERSION } }));
}