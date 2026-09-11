/**
 * Player types — both client SaveManager and server InMemoryPlayerRepo use the same shape.
 *
 * Per ADR-0001 §1, `PlayerSave` carries the *internal* playerId (UUID) and a
 * list of bound `AuthIdentityRef`s. Provider subject strings (WeChat openid,
 * Apple sub, Google sub) live in `AuthIdentity` records, not on the player
 * envelope. This split is what lets the same backend serve WeChat, iOS, and
 * Android without leaking openids between players.
 *
 * Per ADR-0002 D9/D12:
 *  - 24 plots, 6 unlocked by default; remaining 18 carry `status: 'locked'`.
 *  - No `inventory` field: G1 closes the loop by planting deducting gold
 *    directly and harvest awarding gold directly. The Phase 1 seed/backpack
 *    detour is removed.
 *  - `version` bumped to `2` to reflect the public envelope change.
 */

import type { PlotState } from './plot.js';
import type { AuthIdentitySummary } from './auth-identity.js';

export interface PlayerSettings {
  musicVolume: number;      // 0..1
  sfxVolume: number;        // 0..1
  notificationsEnabled: boolean;
}

export interface PlayerSave {
  version: 2;
  /** Internal stable UUID. Server-issued. Cross-platform unique. */
  playerId: string;
  nickname?: string;
  avatarUrl?: string;
  gold: number;
  gems: number;
  plots: PlotState[];
  level: number;
  exp: number;
  settings: PlayerSettings;
  createdAt: number;
  updatedAt: number;
  /**
   * Bound provider identities — public projection only (no `subject`).
   * To see your own provider subjects, call `GET /auth/identities/me` after login.
   */
  identities: AuthIdentitySummary[];
  /**
   * Server-side state revision number (ADR-0003 D18). Monotonically
   * incremented on every successful write command (unlock / plant /
   * water / harvest) and returned alongside the save. Starts at 0 for a
   * freshly created player and is independent of `version`` (which is
   * the public envelope shape version, currently `2`). Clients may use
   * this to reject stale snapshots when reconnecting.
   */
  revision: number;
}

/**
 * Construct a fresh PlayerSave. `playerId` is generated server-side via crypto.randomUUID;
 * the constructor accepts the generated id so the same shape can be built in tests with
 * deterministic ids.
 *
 * Per ADR-0002 D9: 6 plots unlocked (indices 0..5), the rest carry `status: 'locked'`.
 */
export function createDefaultPlayerSave(args: {
  playerId: string;
  initialIdentity?: AuthIdentitySummary;
}): PlayerSave {
  const { playerId, initialIdentity } = args;
  const now = Date.now();
  return {
    version: 2,
    playerId,
    gold: 200,
    gems: 0,
    plots: Array.from({ length: 24 }, (_, i) => ({
      id: `${playerId}:${i}`,
      index: i,
      unlocked: i < 6,
      status: (i < 6 ? 'empty' : 'locked') as PlotState['status'],
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
    revision: 0,
  };
}
