/**
 * Drizzle / @colyseus/database connection pool — Phase 2.
 *
 * Phase 1: file exists as a placeholder so the boundary is explicit, but no
 * connection is opened. The export is a factory that throws AdminConfigError
 * until Phase 2 lands.
 */

import { AdminConfigError } from './index.js';

export interface DrizzlePoolConfig {
  url: string;
  poolMin: number;
  poolMax: number;
}

export function buildAdminPoolConfig(url: string): DrizzlePoolConfig {
  return { url, poolMin: 2, poolMax: 10 };
}

/** Phase 2: returns a connected drizzle pool. Phase 1: throws. */
export async function connectAdminDb(_config: DrizzlePoolConfig): Promise<never> {
  throw new AdminConfigError(
    'connectAdminDb is Phase 2. ENABLE_ADMIN must stay 0 in Phase 1. ' +
    'See docs/admin-integration.md §3 migration order.',
  );
}