/**
 * Player repository — interface + InMemory implementation for Phase 1.
 *
 * Per ADR-0001 §1, the lookup key is the (provider, subject) tuple, not the
 * WeChat openid alone. The provider-subject pair is what uniquely identifies
 * a player across platforms. `playerId` (UUID) is internal and never used as
 * a login key.
 *
 * Phase 2 swaps InMemoryPlayerRepo for MikroORMPlayerRepo implementing the same
 * interface. The shape of `PlayerSave` is unchanged.
 */

import {
  createDefaultPlayerSave,
  identityKey,
  type AuthIdentity,
  type AuthIdentityRef,
  type PlayerSave,
} from '@farm-game/shared';

export interface PlayerRepo {
  /** Find a player bound to the given provider identity. */
  findByIdentity(identity: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): Promise<PlayerSave | null>;
  /** Insert or update the player record. */
  upsert(save: PlayerSave): Promise<PlayerSave>;
  /** Find by internal playerId. */
  findByPlayerId(playerId: string): Promise<PlayerSave | null>;
  /** Test/observability helper. */
  size(): Promise<number>;
}

/**
 * Phase 1 in-memory repo — keyed by stable identity key and by playerId.
 * Two indices so the auth route can resolve on first login and the gameplay
 * route can resolve on every subsequent request without scanning.
 */
export class InMemoryPlayerRepo implements PlayerRepo {
  private readonly _byId = new Map<string, PlayerSave>();
  private readonly _byIdentity = new Map<string, string>(); // identityKey -> playerId

  async findByIdentity(identity: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): Promise<PlayerSave | null> {
    const key = identityKey(identity);
    const playerId = this._byIdentity.get(key);
    if (!playerId) return null;
    return this._byId.get(playerId) ?? null;
  }

  async findByPlayerId(playerId: string): Promise<PlayerSave | null> {
    return this._byId.get(playerId) ?? null;
  }

  async upsert(save: PlayerSave): Promise<PlayerSave> {
    save.updatedAt = Date.now();
    this._byId.set(save.playerId, save);
    for (const id of save.identities) {
      this._byIdentity.set(identityKey({ provider: id.provider, subject: id.subject }), save.playerId);
    }
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
  const ref: AuthIdentityRef = {
    provider: identity.provider,
    subject: identity.subject,
    boundAt: Date.now(),
  };
  const fresh = createDefaultPlayerSave({ playerId, initialIdentity: ref });
  return repo.upsert(fresh);
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
  // Deterministic fallback for test environments without crypto.randomUUID.
  const rand = Math.random().toString(36).slice(2, 10);
  return `p-${Date.now().toString(36)}-${rand}`;
}
