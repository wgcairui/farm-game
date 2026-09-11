/**
 * Farm command DTOs — request/response shapes for the four write commands
 * that mutate a player's farm.
 *
 * Per ADR-0003 D17/D27/D28/D29: each request carries a client-generated
 * `operationId`; the response carries `serverNow` and `revision` so clients
 * can synchronise with the server's authoritative clock and state version.
 * Success responses return the full updated `PlayerSave` so clients can
 * replace their local snapshot without a second round-trip.
 */

import type { PlotState } from '../types/plot.js';
import type { PlayerSave } from '../types/player.js';

/** Hard limit on operationId length to keep the receipts table bounded. */
export const OPERATION_ID_MAX_LENGTH = 64;

/** All four write commands share the same envelope shape. */
export interface CommandRequest<TBody> {
  /** Client-generated UUIDv4 recommended; uniquely identifies a logical write. */
  operationId: string;
  body: TBody;
}

/**
 * Common response fields — every command returns `serverNow` and `revision`
 * even on failure, so the client can refresh its local clock and state
 * version. On success, `player` carries the fresh save. On deterministic
 * failure, `player` reflects the unchanged save so the client doesn't have
 * to re-fetch to see the current world.
 */
export interface CommandResponse<TPayload> {
  operationId: string;
  serverNow: number;
  revision: number;
  player: PlayerSave;
  payload?: TPayload;
}

// ─── plant ───
export interface FarmPlantBody {
  plotIndex: number;
  cropId: string;
}
export type FarmPlantRequest = CommandRequest<FarmPlantBody>;
export interface FarmPlantPayload {
  plot: PlotState;
}
export type FarmPlantResponse = CommandResponse<FarmPlantPayload>;

// ─── water ───
export interface FarmWaterBody {
  plotIndex: number;
}
export type FarmWaterRequest = CommandRequest<FarmWaterBody>;
export interface FarmWaterPayload {
  plot: PlotState;
}
export type FarmWaterResponse = CommandResponse<FarmWaterPayload>;

// ─── harvest ───
export interface FarmHarvestBody {
  plotIndex: number;
}
export type FarmHarvestRequest = CommandRequest<FarmHarvestBody>;
export interface FarmHarvestPayload {
  plot: PlotState;
  goldAwarded: number;
}
export type FarmHarvestResponse = CommandResponse<FarmHarvestPayload>;

// ─── unlock (existing route, now carries operation envelope) ───
export interface FarmUnlockBody {
  plotIndex: number;
}
export type FarmUnlockRequest = CommandRequest<FarmUnlockBody>;
export interface FarmUnlockPayload {
  plot: PlotState;
  goldSpent: number;
}
export type FarmUnlockResponse = CommandResponse<FarmUnlockPayload>;

/**
 * Normalise the request body for hashing. The order of fields is irrelevant
 * to semantics, but the hash must be stable across client/server so the
 * server can detect operationId reuse with mismatched parameters. Recurses
 * into plain objects and arrays so `{a: {x:1, y:2}}` and `{a: {y:2, x:1}}`
 * produce the same string.
 */
export function canonicaliseBody(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortValue(obj[k]);
  }
  return sorted;
}