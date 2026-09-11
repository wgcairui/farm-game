/**
 * Player types — both client SaveManager and server InMemoryPlayerRepo use the same shape.
 */

import type { PlotState } from './plot.js';

export interface InventoryItem {
  itemId: string;           // 'carrot_seed' | 'carrot' | 'potato_seed' | ...
  count: number;
}

export interface PlayerSettings {
  musicVolume: number;      // 0..1
  sfxVolume: number;        // 0..1
  notificationsEnabled: boolean;
}

export interface PlayerSave {
  version: number;
  playerId: string;
  openid: string;
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
}

export function createDefaultPlayerSave(openid: string): PlayerSave {
  return {
    version: 1,
    playerId: openid,
    openid,
    gold: 200,
    gems: 0,
    inventory: [],
    plots: Array.from({ length: 24 }, (_, i) => ({
      id: `${openid}:${i}`,
      index: i,
      unlocked: i < 8,           // first 8 unlocked by default; rest to be unlocked
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
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}