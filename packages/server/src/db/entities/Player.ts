/**
 * Player entity — one row per registered player.
 *
 * Per ADR-0003 D18/D19: a server-side `revision` integer increments on every
 * successful write command, atomically with the asset update and the
 * operation receipt. `gold` and `gems` are non-negative; the unique index on
 * `playerId` is the primary key (UUIDv4 issued by the server).
 *
 * Identity bindings live in a separate table (see AuthIdentity) so the public
 * `PlayerSave` envelope can list identity summaries without leaking subjects.
 */

import { defineEntity } from '@mikro-orm/core';

export class Player {
  playerId!: string;
  nickname!: string | null;
  avatarUrl!: string | null;
  gold!: number;
  gems!: number;
  level!: number;
  exp!: number;
  musicVolume!: number;
  sfxVolume!: number;
  notificationsEnabled!: boolean;
  revision!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export const PlayerEntity = defineEntity({
  class: Player,
  tableName: 'players',
  primaryKeys: ['playerId'],
  properties: (p) => ({
    playerId: p.string().length(36).primary(),
    nickname: p.string().length(64).nullable(),
    avatarUrl: p.string().length(512).nullable(),
    gold: p.type('integer').default(200),
    gems: p.type('integer').default(0),
    level: p.type('integer').default(1),
    exp: p.type('integer').default(0),
    musicVolume: p.double().default(0.7),
    sfxVolume: p.double().default(1.0),
    notificationsEnabled: p.boolean().default(true),
    revision: p.type('integer').default(0),
    createdAt: p.datetime().defaultRaw('now()'),
    updatedAt: p.datetime().defaultRaw('now()'),
  }),
});