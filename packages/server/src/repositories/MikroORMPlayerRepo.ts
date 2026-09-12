/**
 * MikroORMPlayerRepo — PostgreSQL-backed implementation of `PlayerRepo`.
 *
 * Per ADR-0003 D18/D19/D25/D30:
 *  - Every public method that touches the DB uses a freshly-forked
 *    `EntityManager`. No long-lived EM is shared across requests.
 *  - Player rows are looked up by `playerId`; identity lookups use the
 *    composite UNIQUE on `auth_identities(provider, tenant_id, subject)`
 *    and translate the unique-violation error into
 *    `IdentityAlreadyBoundError`.
 *  - Plots are loaded alongside the player so callers can render a save
 *    in one round-trip; mutations go through the command services (T6),
 *    not through this repo.
 *
 * The class deliberately does not implement write paths for `gold` or
 * `plots` directly — those are owned by `services/farm/*` (T6), which
 * coordinate transactions with operation receipts and row locks.
 */

import { createDefaultPlayerSave } from '@farm-game/shared';
import {
  EntityManager,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';

import { AuthIdentity } from '../db/entities/AuthIdentity.js';
import { Plot } from '../db/entities/Plot.js';
import { Player } from '../db/entities/Player.js';
import {
  generatePlayerId,
  IdentityAlreadyBoundError,
  type PlayerRepo,
} from './player-repo.js';
import { derivePlotStatus } from '../services/farm/plot-state.js';
import type { TransactionRunner } from './transaction.js';

const PG_UNIQUE_VIOLATION = '23505';

/** Sentinel for "no tenant" (Postgres NULL-safe unique constraint). */
const NO_TENANT = '';

export class MikroORMPlayerRepo implements PlayerRepo {
  constructor(
    private readonly tx: TransactionRunner,
    /** Optional clock for tests. Defaults to `Date.now`. */
    private readonly now: () => number = Date.now,
  ) {}

  async findByIdentity(identity: Pick<import('@farm-game/shared').AuthIdentity, 'provider' | 'subject' | 'tenantId'>): Promise<import('@farm-game/shared').PlayerSave | null> {
    return this.tx.run(async (em) => {
      const row = await em.findOne(
        AuthIdentity,
        {
          provider: identity.provider,
          tenantId: identity.tenantId ?? NO_TENANT,
          subject: identity.subject,
        },
      );
      if (!row) return null;
      const save = await this.materialisePlayer(em, row.playerId);
      return save;
    });
  }

  async getOrCreateByIdentity(
    identity: Pick<import('@farm-game/shared').AuthIdentity, 'provider' | 'subject' | 'tenantId'>,
    createSave: (playerId: string) => import('@farm-game/shared').PlayerSave,
  ): Promise<import('@farm-game/shared').PlayerSave> {
    return this.tx.run(async (em) => {
      const tenantId = identity.tenantId ?? NO_TENANT;
      const existing = await em.findOne(AuthIdentity, {
        provider: identity.provider,
        tenantId,
        subject: identity.subject,
      });
      if (existing) {
        const save = await this.materialisePlayer(em, existing.playerId);
        if (!save) throw new Error('identity row references missing player');
        return save;
      }

      // First-login path. Generate the player id *outside* the DB so two
      // concurrent first logins with different ids can't collide; the
      // auth_identities UNIQUE constraint is what makes this safe — at most
      // one transaction's identity insert succeeds, the loser sees the
      // row already there and reads it back.
      const playerId = generatePlayerId();
      const save = createSave(playerId);

      // Insert the player row + 24 plot rows; flush the player first so the
      // FK from `plots.player_id` resolves.
      em.persist(
        em.create(Player, {
          playerId,
          nickname: save.nickname ?? null,
          avatarUrl: save.avatarUrl ?? null,
          gold: save.gold,
          gems: save.gems,
          level: save.level,
          exp: save.exp,
          musicVolume: save.settings.musicVolume,
          sfxVolume: save.settings.sfxVolume,
          notificationsEnabled: save.settings.notificationsEnabled,
          revision: save.revision,
          createdAt: new Date(save.createdAt),
          updatedAt: new Date(this.now()),
        }),
      );
      await em.flush();
      for (const plot of save.plots) {
        em.persist(
          em.create(Plot, {
            id: plot.id,
            playerId,
            index: plot.index,
            unlocked: plot.unlocked,
            status: plot.status,
            cropId: null,
            plantedAt: null,
            matureAt: null,
            waterCount: plot.waterCount,
          }),
        );
      }

      // Try to bind the identity. If a concurrent caller raced past the
      // `existing` check and committed first, the unique constraint fires
      // here. PG has already aborted this transaction at that point, so
      // "swallow and read back the winner" is impossible in-transaction;
      // instead we throw and let `ensurePlayer` re-read the winner in a
      // fresh transaction. The loser-side player + plots inserted above are
      // rolled back with this transaction — the winner's rows stay canonical.
      try {
        em.persist(
          em.create(AuthIdentity, {
            playerId,
            provider: identity.provider,
            tenantId,
            subject: identity.subject,
            boundAt: new Date(this.now()),
          }),
        );
        await em.flush();
      } catch (err) {
        if (!(err instanceof UniqueConstraintViolationException)) throw err;
        throw new IdentityAlreadyBoundError(
          identity.provider,
          identity.subject,
          '<raced>',
        );
      }

      const out = await this.materialisePlayer(em, playerId);
      return out!;
    });
  }

  async upsert(save: import('@farm-game/shared').PlayerSave): Promise<import('@farm-game/shared').PlayerSave> {
    // Test/seed helper used by `ensurePlayer` on first login. Inserts the
    // player row and seeds 24 plot rows atomically — the command services
    // never call this in production paths; real updates go through the
    // dedicated unlock/plant/water/harvest services.
    return this.tx.run(async (em) => {
      const row = await em.findOne(Player, { playerId: save.playerId });
      const now = this.now();
      if (!row) {
        em.persist(
          em.create(Player, {
            playerId: save.playerId,
            nickname: save.nickname ?? null,
            avatarUrl: save.avatarUrl ?? null,
            gold: save.gold,
            gems: save.gems,
            level: save.level,
            exp: save.exp,
            musicVolume: save.settings.musicVolume,
            sfxVolume: save.settings.sfxVolume,
            notificationsEnabled: save.settings.notificationsEnabled,
            revision: save.revision,
            createdAt: new Date(save.createdAt),
            updatedAt: new Date(now),
          }),
        );
        // Flush the player row before inserting plots — `plots.player_id` has a
        // foreign key back to `players`, so plots must come AFTER the player
        // insert is committed to the transaction buffer.
        await em.flush();
        // Seed 24 plot rows in one shot — unlocked / empty / locked per ADR-0002 D9.
        for (const plot of save.plots) {
          em.persist(
            em.create(Plot, {
              id: plot.id,
              playerId: save.playerId,
              index: plot.index,
              unlocked: plot.unlocked,
              status: plot.status,
              cropId: null,
              plantedAt: null,
              matureAt: null,
              waterCount: plot.waterCount,
            }),
          );
        }
      } else {
        row.gold = save.gold;
        row.gems = save.gems;
        row.level = save.level;
        row.exp = save.exp;
        row.musicVolume = save.settings.musicVolume;
        row.sfxVolume = save.settings.sfxVolume;
        row.notificationsEnabled = save.settings.notificationsEnabled;
        row.updatedAt = new Date(now);
      }
      await em.flush();
      const out = await this.materialisePlayer(em, save.playerId);
      return out!;
    });
  }

  async findByPlayerId(playerId: string): Promise<import('@farm-game/shared').PlayerSave | null> {
    return this.tx.run(async (em) => this.materialisePlayer(em, playerId));
  }

  async findIdentities(playerId: string): Promise<import('@farm-game/shared').AuthIdentity[]> {
    return this.tx.run(async (em) => {
      const rows = await em.find(AuthIdentity, { playerId });
      return rows.map((row) => ({
        provider: row.provider as import('@farm-game/shared').AuthProvider,
        subject: row.subject,
        tenantId: row.tenantId === NO_TENANT ? undefined : row.tenantId,
        boundAt: row.boundAt.getTime(),
      }));
    });
  }

  async addIdentity(playerId: string, identity: import('@farm-game/shared').AuthIdentity): Promise<import('@farm-game/shared').PlayerSave> {
    return this.tx.run(async (em) => {
      // Defensive — fail loud if the player row is missing.
      const player = await em.findOne(Player, { playerId });
      if (!player) throw new Error(`player ${playerId} not found`);

      const tenantId = identity.tenantId ?? NO_TENANT;
      try {
        em.persist(
          em.create(AuthIdentity, {
            playerId,
            provider: identity.provider,
            tenantId,
            subject: identity.subject,
            boundAt: new Date(identity.boundAt),
          }),
        );
        await em.flush();
      } catch (err) {
        if (err instanceof UniqueConstraintViolationException) {
          const existing = await em.findOne(AuthIdentity, {
            provider: identity.provider,
            tenantId,
            subject: identity.subject,
          });
          throw new IdentityAlreadyBoundError(
            identity.provider,
            identity.subject,
            existing?.playerId ?? '<unknown>',
          );
        }
        throw err;
      }
      const out = await this.materialisePlayer(em, playerId);
      return out!;
    });
  }

  async removeIdentity(playerId: string, key: Pick<import('@farm-game/shared').AuthIdentity, 'provider' | 'subject' | 'tenantId'>): Promise<import('@farm-game/shared').PlayerSave> {
    return this.tx.run(async (em) => {
      await em.nativeDelete(AuthIdentity, {
        playerId,
        provider: key.provider,
        tenantId: key.tenantId ?? NO_TENANT,
        subject: key.subject,
      });
      const out = await this.materialisePlayer(em, playerId);
      return out!;
    });
  }

  async size(): Promise<number> {
    return this.tx.run(async (em) => em.count(Player));
  }

  /**
   * Materialise a PlayerSave by reading the player row + 24 plot rows +
   * bound identity summaries.  Returns null when the player doesn't exist.
   *
   * Used by command services too (T6): they read-modify-write within a
   * single transaction and call this to project the latest world state.
   */
  async materialisePlayer(em: EntityManager, playerId: string): Promise<import('@farm-game/shared').PlayerSave | null> {
    const player = await em.findOne(Player, { playerId });
    if (!player) return null;

    const plots = await em.find(Plot, { playerId }, { orderBy: { index: 'ASC' } });
    const identities = await em.find(AuthIdentity, { playerId });

    const summaryIdentities: import('@farm-game/shared').AuthIdentitySummary[] = identities.map((row) => {
      const summary: import('@farm-game/shared').AuthIdentitySummary = {
        provider: row.provider as import('@farm-game/shared').AuthProvider,
        boundAt: row.boundAt.getTime(),
      };
      if (row.tenantId !== NO_TENANT) summary.tenantId = row.tenantId;
      return summary;
    });

    if (plots.length === 0) {
      // Cold-start fallback: a player that exists but has no plot rows yet
      // (e.g. created before G1 wired default plots) gets the v2 default.
      // In practice the createPlayer path always seeds 24 rows, so this is
      // a safety net for tests.
      return createDefaultPlayerSave({ playerId });
    }

    // Derive plot status from `matureAt` rather than reading the persisted
    // `Plot.status` directly — `growing → ripe` is a time-driven transition
    // (ADR-0003 D23) and must be visible after process restart. The DB only
    // persists `growing / empty / locked`; `ripe` is always computed at
    // projection time.
    const nowMs = this.now();
    const projected: import('@farm-game/shared').PlotState[] = plots.map((row) => {
      const status = derivePlotStatus(
        { unlocked: row.unlocked, status: row.status, matureAt: row.matureAt },
        nowMs,
      );
      const plot: import('@farm-game/shared').PlotState = {
        id: row.id,
        index: row.index,
        unlocked: row.unlocked,
        status,
        waterCount: row.waterCount,
      };
      if (row.cropId) plot.cropId = row.cropId;
      if (row.plantedAt) plot.plantedAt = row.plantedAt.getTime();
      if (row.matureAt) plot.matureAt = row.matureAt.getTime();
      return plot;
    });

    const save: import('@farm-game/shared').PlayerSave = {
      version: 2,
      playerId: player.playerId,
      gold: player.gold,
      gems: player.gems,
      plots: projected,
      level: player.level,
      exp: player.exp,
      settings: {
        musicVolume: player.musicVolume,
        sfxVolume: player.sfxVolume,
        notificationsEnabled: player.notificationsEnabled,
      },
      identities: summaryIdentities,
      createdAt: player.createdAt.getTime(),
      updatedAt: player.updatedAt.getTime(),
      revision: player.revision,
    };
    if (player.nickname) save.nickname = player.nickname;
    if (player.avatarUrl) save.avatarUrl = player.avatarUrl;
    return save;
  }
}