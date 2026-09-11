/**
 * Plot types — shared by client (Coc/GameApp) and server (Colyseus FarmState).
 * Plot is a single farm tile; the home page exposes a 4×6 = 24 tile grid in v25 baseline.
 *
 * Per ADR-0002 D9/D10/D11:
 *  - Total tile count is 24; 6 unlocked on creation, the rest stay `locked`.
 *  - Status enum is `locked / empty / growing / ripe` (no `ready`, no `withered`).
 *  - `unlocked` mirrors the locked→empty transition: a tile is `locked` while
 *    `unlocked === false`, and `empty` once unlocked until planted.
 */

export type PlotId = string; // stable id; "{playerId}:{index}"

export type PlotStatus = 'locked' | 'empty' | 'growing' | 'ripe';

export interface PlotState {
  id: PlotId;
  index: number;            // 0..N-1 within a player's farm
  unlocked: boolean;
  status: PlotStatus;
  cropId?: string;
  plantedAt?: number;       // epoch ms; absent when not growing
  matureAt?: number;        // epoch ms; computed from crop.growthDuration + plantedAt
  waterCount: number;       // 0..crop.maxWater; reset on harvest
}