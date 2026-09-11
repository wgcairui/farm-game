/**
 * Player types — both client SaveManager and server InMemoryPlayerRepo use the same shape.
 *
 * Per ADR-0001 §1, `PlayerSave` carries the *internal* playerId (UUID) and a
 * list of bound `AuthIdentityRef`s. Provider subject strings (WeChat openid,
 * Apple sub, Google sub) live in `AuthIdentity` records, not on the player
 * envelope. This split is what lets the same backend serve WeChat, iOS, and
 * Android without leaking openids between players.
 */

import type { PlotState } from './plot.js';
import type { AuthIdentityRef } from './auth-identity.js';

export interface InventoryItem {
  itemId: string;
  count: number;
}

export interface PlayerSettings {
  musicVolume: number;      // 0..1
  sfxVolume: number;        // 0..1
  notificationsEnabled: boolean;
}

export interface PlayerSave {
  version: number;
  /** Internal stable UUID. Server-issued. Cross-platform unique. */
  playerId: string;
  nickname?: string;
  avatarUrl?: string;
  gold: number;
  gems: number;
  inventory: InventoryItem[];
  plots: PlotState[];
  level: number;
  exp: number;
  settings: PlayerSettings;
  createdAt: number;
  updatedAt: number;
  /** Bound provider identities. Empty for a fresh player until first login binds it. */
  identities: AuthIdentityRef[];
}

/**
 * Construct a fresh PlayerSave. `playerId` is generated server-side via crypto.randomUUID;
 * the constructor accepts the generated id so the same shape can be built in tests with
 * deterministic ids.
 */
export function createDefaultPlayerSave(args: {
  playerId: string;
  initialIdentity?: AuthIdentityRef;
}): PlayerSave {
  const { playerId, initialIdentity } = args;
  const now = Date.now();
  return {
    version: 1,
    playerId,
    gold: 200,
    gems: 0,
    inventory: [],
    plots: Array.from({ length: 24 }, (_, i) => ({
      id: `${playerId}:${i}`,
      index: i,
      unlocked: i < 8,
      status: 'empty' as const,
      waterCount: 0,
    })),
    level: 1,
    exp: 0,
    settings: {
      musicVolume: 0.7,
      sfxVolume: 1.0,
      notificationsEnabled: true,
    },
    identities: initialIdentity ? [initialIdentity] : [],
    createdAt: now,
    updatedAt: now,
  };
}
