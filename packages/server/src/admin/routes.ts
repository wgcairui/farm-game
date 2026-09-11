/**
 * Optional business-side webhooks for admin actions (Phase 2).
 *
 * Phase 2 examples:
 *   POST /admin/banned-players/:openid  — ban a player, revoke sessions
 *   POST /admin/items/:id/publish       — push a new crop config live
 *
 * Phase 1: empty; file exists so the boundary is explicit.
 */

import type { FastifyInstance } from 'fastify';

export async function adminWebhookRoutes(_app: FastifyInstance): Promise<void> {
  // intentionally empty in Phase 1
}