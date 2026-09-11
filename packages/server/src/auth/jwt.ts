/**
 * JWT helpers — thin wrapper around @fastify/jwt to keep payload shape aligned
 * with the shared AuthContext.
 */

import type { AuthContext } from '@farm-game/shared';
import type { Platform } from '@farm-game/shared';

export interface JwtPayload extends AuthContext {}

export function buildAuthContext(args: {
  openid: string;
  platform: Platform;
  deviceId?: string;
  issuedAt: number;
  expiresAt: number;
}): JwtPayload {
  return { ...args };
}