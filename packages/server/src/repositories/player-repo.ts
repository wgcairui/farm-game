/**
 * PlayerRepo — interface implemented by both the in-memory test repo and
 * the MikroORM-backed repo.
 *
 * Split out from `auth/repo.ts` so the in-memory variant can be referenced
 * by auth routes without dragging in MikroORM types, and so the production
 * wiring (`buildApp`) accepts either implementation via DI.
 *
 * Per ADR-0001 §1 + ADR-0003 D25/D30:
 *  - Login key is `(provider, subject, tenantId?)`; the by-identity index
 *    is enforced atomically — duplicates throw `IdentityAlreadyBoundError`.
 *  - `PlayerSave.identities` carries public summaries only (no `subject`).
 *  - Write paths to gold / plots / revision belong to the command services
 *    (T6), NOT to this repo. The interface is intentionally read-only on
 *    assets; the only writes here are identity bindings and bookkeeping
 *    rows used by tests.
 */

import type {
  AuthIdentity,
  AuthIdentitySummary,
  PlayerSave,
} from '@farm-game/shared';
import { createDefaultPlayerSave } from '@farm-game/shared';

export class IdentityAlreadyBoundError extends Error {
  constructor(provider: string, subject: string, existingPlayerId: string) {
    super(`identity ${provider}:${subject} already bound to player ${existingPlayerId}`);
    this.name = 'IdentityAlreadyBoundError';
  }
}

export interface PlayerRepo {
  /** Find a player bound to the given provider identity. */
  findByIdentity(identity: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): Promise<PlayerSave | null>;
  /**
   * Atomically return the existing player for `(provider, subject, tenantId)`,
   * or create a fresh one seeded by `createSave` and bind the identity.
   *
   * Replaces the old `ensurePlayer` two-step (`findByIdentity → upsert →
   * addIdentity`) which raced on concurrent first logins: both transactions
   * saw no existing identity, both created a player, and the second one's
   * `addIdentity` then collided on the unique constraint — producing an
   * orphan player and a 500. This entry point keeps the player create +
   * identity bind in a single transaction with `ON CONFLICT` semantics on
   * the auth_identities unique index.
   */
  getOrCreateByIdentity(
    identity: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>,
    createSave: (playerId: string) => PlayerSave,
  ): Promise<PlayerSave>;
  /** Insert or update the player record. Test/seed helper. */
  upsert(save: PlayerSave): Promise<PlayerSave>;
  /** Find by internal playerId. */
  findByPlayerId(playerId: string): Promise<PlayerSave | null>;
  /** Get the full identities (with subjects) for the given player. Server-internal only. */
  findIdentities(playerId: string): Promise<AuthIdentity[]>;
  /**
   * Add a new identity to the given player. Throws `IdentityAlreadyBoundError`
   * if the (provider, subject, tenantId) is already bound to any player,
   * including the same one.
   */
  addIdentity(playerId: string, identity: AuthIdentity): Promise<PlayerSave>;
  /** Remove an identity from the given player. No-op if not present. */
  removeIdentity(playerId: string, key: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): Promise<PlayerSave>;
  /** Test/observability helper. */
  size(): Promise<number>;
}

/**
 * Internal-only UUID generator — uses Node's crypto.randomUUID so the id is
 * stable across processes and platform-independent.
 */
export function generatePlayerId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const rand = Math.random().toString(36).slice(2, 10);
  return `p-${Date.now().toString(36)}-${rand}`;
}

/**
 * Get-or-create a player for the given identity. Used by `/auth/wechat` and
 * `/auth/oauth`; delegates the atomic create+bind to `repo.getOrCreateByIdentity`.
 *
 * If `createSave` is omitted, the player is bootstrapped with
 * `createDefaultPlayerSave({ playerId })` (6 unlocked plots, 200 gold).
 * Passing a custom factory lets callers inject extra seeding (e.g. an
 * initial identity summary on the public envelope).
 */
export async function ensurePlayer(
  repo: PlayerRepo,
  identity: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>,
  createSave?: (playerId: string) => PlayerSave,
): Promise<PlayerSave> {
  return repo.getOrCreateByIdentity(identity, (playerId) =>
    createSave ? createSave(playerId) : createDefaultPlayerSave({ playerId }),
  );
}

// Re-export AuthIdentitySummary so existing imports keep working.
export type { AuthIdentitySummary };