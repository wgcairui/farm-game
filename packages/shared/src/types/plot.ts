/**
 * Plot types — shared by client (Coc/GameApp) and server (Colyseus FarmState).
 * Plot is a single farm tile; the home page exposes a 4×6 = 24 tile grid in v25 baseline.
 */

export type PlotId = string; // stable id; Phase 1 may use "player:openid:0"

export type PlotStatus = 'empty' | 'growing' | 'ready' | 'withered';

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