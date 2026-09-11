/**
 * @colyseus/admin panel bootstrap — Phase 2.
 *
 * Phase 1: file exists for boundary documentation. Phase 2 will wrap the
 * `admin({})` factory with our config + drizzle pool.
 */

import { AdminConfigError } from './index.js';

export async function bootstrapAdminPanel(_options: { enableAdmin: boolean }): Promise<never> {
  throw new AdminConfigError(
    'bootstrapAdminPanel is Phase 2. ENABLE_ADMIN must stay 0 in Phase 1. ' +
    'See docs/admin-integration.md §3 migration order.',
  );
}