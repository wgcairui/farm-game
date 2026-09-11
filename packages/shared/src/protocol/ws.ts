/**
 * WebSocket envelope + Colyseus message shapes.
 * Phase 1: stub — server does not yet host Colyseus. These shapes are stable so
 * the RN client can begin binding without rework.
 */

import type { PlotState } from '../types/plot.js';

/** Every WS message is wrapped in this envelope to carry protocol version + message type. */
export interface WsEnvelope<TName extends string, TPayload> {
  v: string;                  // PROTOCOL_VERSION
  t: TName;                   // message discriminator
  /** Optional request id; server echoes it back for request/response semantics. */
  r?: string;
  p: TPayload;
  /** Server epoch ms at dispatch. S→C fills it; C→S may omit. */
  ts?: number;
}

// ── Client → Server ──
export type ClientHello = WsEnvelope<'hello', { openid: string; token: string; }>;
export type ClientPlant = WsEnvelope<'plant', { plotIndex: number; cropId: string; }>;
export type ClientWater = WsEnvelope<'water', { plotIndex: number; }>;
export type ClientHarvest = WsEnvelope<'harvest', { plotIndex: number; }>;
export type ClientSteal = WsEnvelope<'steal', { victimPlayerId: string; plotIndex: number; }>;

export type ClientMessage = ClientHello | ClientPlant | ClientWater | ClientHarvest | ClientSteal;

// ── Server → Client ──
export type ServerWelcome = WsEnvelope<'welcome', { serverNow: number; roomId: string; }>;
export type ServerPlotUpdated = WsEnvelope<'plot_updated', { plot: PlotState }>;
export type ServerCropStolen = WsEnvelope<'crop_stolen', {
  victimOpenid: string;
  plotIndex: number;
  cropId: string;
  lostAmount: number;
}>;
export type ServerGoldUpdated = WsEnvelope<'gold_updated', { gold: number }>;
export type ServerError = WsEnvelope<'error', { code: number; message: string }>;

export type ServerMessage = ServerWelcome | ServerPlotUpdated | ServerCropStolen | ServerGoldUpdated | ServerError;