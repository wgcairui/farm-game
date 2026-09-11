/**
 * Player repository — interface + InMemory implementation for Phase 1.
 *
 * Per ADR-0001 §1 (and G0 review H1/H2):
 *  - Login key is the `(provider, subject, tenantId?)` tuple, not `openid`.
 *  - `PlayerSave.identities` carries **public summaries only** (no provider
 *    subject). The full `AuthIdentity` records (with subjects) live in a
 *    separate internal map keyed by `playerId`, accessible only via
 *    `findIdentities(playerId)`.
 *  - The by-identity index is maintained atomically: identities removed from
 *    the player are also removed from the index (H2), so a removed identity
 *    can be cleanly re-bound to another player.
 *  - Duplicate (provider, subject, tenantId) on a single player is rejected
 *    by `addIdentity` (H3).
 *
 * Phase 2 swaps InMemoryPlayerRepo for MikroORMPlayerRepo implementing the same
 * interface. The shape of `PlayerSave` is unchanged.
 */

import {
  createDefaultPlayerSave,
  identityKey,
  toIdentitySummary,
  type AuthIdentity,
  type AuthIdentitySummary,
  type PlayerSave,
} from '@farm-game/shared';

export class IdentityAlreadyBoundError extends Error {
  constructor(provider: string, subject: string, existingPlayerId: string) {
    super(`identity ${provider}:${subject} already bound to player ${existingPlayerId}`);
    this.name = 'IdentityAlreadyBoundError';
  }
}

export interface PlayerRepo {
  /** Find a player bound to the given provider identity. */
  findByIdentity(identity: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): Promise<PlayerSave | null>;
  /** Insert or update the player record. */
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
 * Phase 1 in-memory repo — keyed by stable identity key and by playerId.
 * Two indices so the auth route can resolve on first login and the gameplay
 * route can resolve on every subsequent request without scanning.
 *
 * `PlayerSave.identities` here stores `AuthIdentitySummary` (no subject).
 * Full records (with subject) live in `_fullIdentities` and are the source
 * of truth for the by-identity index.
 */
export class InMemoryPlayerRepo implements PlayerRepo {
  private readonly _byId = new Map<string, PlayerSave>();
  private readonly _byIdentity = new Map<string, string>(); // identityKey -> playerId
  private readonly _fullIdentities = new Map<string, AuthIdentity[]>(); // playerId -> AuthIdentity[]

  async findByIdentity(identity: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): Promise<PlayerSave | null> {
    const key = identityKey(identity);
    const playerId = this._byIdentity.get(key);
    if (!playerId) return null;
    const save = this._byId.get(playerId);
    if (!save) return null;
    // Defensive: the public projection never carries the subject.
    return save;
  }

  async findByPlayerId(playerId: string): Promise<PlayerSave | null> {
    return this._byId.get(playerId) ?? null;
  }

  async findIdentities(playerId: string): Promise<AuthIdentity[]> {
    return [...(this._fullIdentities.get(playerId) ?? [])];
  }

  async upsert(save: PlayerSave): Promise<PlayerSave> {
    save.updatedAt = Date.now();
    this._byId.set(save.playerId, save);
    // Defensive: if the caller somehow put a record with a subject into
    // the public summary, drop it. The full identity is the source of truth.
    const fulls = this._fullIdentities.get(save.playerId) ?? [];
    save.identities = fulls.map(toIdentitySummary);
    return save;
  }

  async addIdentity(playerId: string, identity: AuthIdentity): Promise<PlayerSave> {
    const key = identityKey(identity);
    const existingPlayer = this._byIdentity.get(key);
    if (existingPlayer) {
      throw new IdentityAlreadyBoundError(identity.provider, identity.subject, existingPlayer);
    }
    const fulls = this._fullIdentities.get(playerId) ?? [];
    if (fulls.some((i) => identityKey(i) === key)) {
      // Same player already has this identity — idempotent success.
      const save = this._byId.get(playerId);
      if (!save) throw new Error(`player ${playerId} not found`);
      return save;
    }
    fulls.push(identity);
    this._fullIdentities.set(playerId, fulls);
    this._byIdentity.set(key, playerId);
    const save = this._byId.get(playerId);
    if (!save) throw new Error(`player ${playerId} not found`);
    save.identities = fulls.map(toIdentitySummary);
    save.updatedAt = Date.now();
    return save;
  }

  async removeIdentity(playerId: string, key: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): Promise<PlayerSave> {
    const fullKey = identityKey(key);
    const fulls = this._fullIdentities.get(playerId) ?? [];
    const next = fulls.filter((i) => identityKey(i) !== fullKey);
    if (next.length === fulls.length) {
      // Nothing to remove.
      const save = this._byId.get(playerId);
      if (!save) throw new Error(`player ${playerId} not found`);
      return save;
    }
    this._fullIdentities.set(playerId, next);
    // Only drop the by-identity index if the entry was ours — another player
    // may legitimately hold the same identity now (the only way for that is
    // if addIdentity had already moved it, which would have replaced the
    // entry, so dropping here is safe).
    if (this._byIdentity.get(fullKey) === playerId) {
      this._byIdentity.delete(fullKey);
    }
    const save = this._byId.get(playerId);
    if (!save) throw new Error(`player ${playerId} not found`);
    save.identities = next.map(toIdentitySummary);
    save.updatedAt = Date.now();
    return save;
  }

  async size(): Promise<number> {
    return this._byId.size;
  }
}

/**
 * Test helper — get-or-create a player for the given identity.
 * Phase 1 only used by smoke. Phase 2 moves the same logic to MikroORM
 * under a transaction.
 */
export async function ensurePlayer(
  repo: PlayerRepo,
  identity: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>,
): Promise<PlayerSave> {
  const existing = await repo.findByIdentity(identity);
  if (existing) return existing;
  const playerId = generatePlayerId();
  const save = createDefaultPlayerSave({ playerId });
  // Use the repo's internal storage path so the by-identity index is populated
  // atomically. We can't go through `addIdentity` because the player doesn't
  // exist in `_byId` yet — we therefore add it directly via the upsert
  // helper, then call addIdentity.
  await upsertNewPlayer(repo, save);
  await repo.addIdentity(playerId, { ...identity, boundAt: Date.now() });
  return (await repo.findByPlayerId(playerId))!;
}

/**
 * Internal — insert a brand-new PlayerSave into the repo without touching
 * the identity index. The caller MUST follow up with `addIdentity` to make
 * the player discoverable by login.
 */
async function upsertNewPlayer(repo: PlayerRepo, save: PlayerSave): Promise<void> {
  await repo.upsert(save);
}

/**
 * Internal-only UUID generator — uses Node's crypto.randomUUID so the id is
 * stable across processes and platform-independent. Falls back to a timestamped
 * random string in environments where crypto.randomUUID is unavailable (older
 * Node, jsdom). Never used as a login key.
 */
export function generatePlayerId(): string {
  // Node 19+ exposes globalThis.crypto.randomUUID.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const rand = Math.random().toString(36).slice(2, 10);
  return `p-${Date.now().toString(36)}-${rand}`;
}
