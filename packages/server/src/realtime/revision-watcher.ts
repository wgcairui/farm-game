/**
 * RoomRevisionWatcher — cross-process change detection for farm rooms (T4).
 *
 * The farm room is the WRITE authority for its farm (lease-arbitrated), but
 * the same player's state can change OUTSIDE the room: the HTTP entry
 * (another device using REST), scripts, or future admin actions. Those writes
 * commit to PostgreSQL directly, so the room cannot learn about them from its
 * own command path.
 *
 * Mechanism: a per-process interval polls `players.revision` for the owners
 * of all ACTIVE farm rooms (one query per tick, chunked IN-list), and any
 * room whose DB revision moved past its last projected revision receives a
 * fresh full snapshot to broadcast (`applyExternalUpdate`). Polling was
 * chosen over LISTEN/NOTIFY and Redis pub/sub because it adds no connection
 * lifecycle, works identically with the LocalDriver (no Redis) in dev, and
 * one 1s query over a handful of active farms is negligible at MVP scale.
 *
 * Clients deduplicate with the snapshot `revision` (ADR-0003 D18): a pushed
 * snapshot is ignored when the client already holds a newer revision, so the
 * extra `welcome` after a room-command is harmless.
 */

import type { MikroORM } from '@mikro-orm/core';
import type { PlayerSave } from '@farm-game/shared';
import type { MikroORMPlayerRepo } from '../repositories/MikroORMPlayerRepo.js';
import { logger } from '../obs/logger.js';

export interface RevisionWatchedRoom {
  /** The farm owner this room serves (players.player_id). */
  ownerId: string;
  /** Highest revision this room has already projected to its clients. */
  lastProjectedRevision: number;
  /** Deliver a fresh authoritative snapshot (broadcast + bookkeeping). */
  applyExternalUpdate(player: PlayerSave): void;
}

/** Chunk size for the IN-list — keeps any single statement trivially small. */
const QUERY_CHUNK = 100;

export class RoomRevisionWatcher {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly opts: {
      repo: MikroORMPlayerRepo;
      orm: MikroORM;
      pollMs: number;
      /** Live snapshot of active rooms; re-evaluated every tick. */
      rooms: () => RevisionWatchedRoom[];
      label?: string;
    },
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.pollOnce().catch((err) => {
        logger.error({ err, label: this.opts.label }, 'revision watcher tick failed');
      });
    }, this.opts.pollMs);
    // Don't hold the process open on its own — lifecycle is owned by serve.ts.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One poll cycle. Returns the number of rooms that received a push.
   * Errors propagate (start() logs them) so callers/tests can observe
   * failure — a failed tick simply retries on the next interval.
   */
  async pollOnce(): Promise<number> {
    if (this.polling) return 0; // previous tick still running — skip, don't pile up
    this.polling = true;
    try {
      const rooms = this.opts.rooms();
      if (rooms.length === 0) return 0;

      // Fetch current revisions for all watched owners in chunks.
      const revisions = new Map<string, number>();
      for (let i = 0; i < rooms.length; i += QUERY_CHUNK) {
        const chunk = rooms.slice(i, i + QUERY_CHUNK);
        const em = this.opts.orm.em.fork();
        // `em.getConnection().execute` is the typed raw-SQL path (MikroORM
        // rewrites `?` placeholders); a plain read needs no transaction ctx.
        const rows = (await em.getConnection().execute(
          `SELECT player_id, revision FROM players WHERE player_id IN (${chunk.map(() => '?').join(', ')})`,
          chunk.map((r) => r.ownerId),
          'all',
        )) as Array<{ player_id: string; revision: number }>;
        for (const row of rows) {
          revisions.set(row.player_id, Number(row.revision));
        }
      }

      let pushed = 0;
      for (const room of rooms) {
        const dbRevision = revisions.get(room.ownerId);
        if (dbRevision === undefined || dbRevision <= room.lastProjectedRevision) continue;
        const player = await this.opts.repo.materialisePlayer(this.opts.orm.em.fork(), room.ownerId);
        if (!player) {
          logger.warn({ ownerId: room.ownerId, label: this.opts.label }, 'revision watcher: player row vanished');
          continue;
        }
        room.applyExternalUpdate(player);
        pushed += 1;
      }
      return pushed;
    } finally {
      this.polling = false;
    }
  }
}
