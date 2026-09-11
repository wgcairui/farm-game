/**
 * HTTP API contract — request/response shapes for /auth, /player, /crop, /farm routes.
 * Server validates against these; clients serialize against these.
 */

import type { PlayerSave } from '../types/player.js';
import type { CropConfig } from '../types/crop.js';
import type { PlotState } from '../types/plot.js';
import type { LoginResponse, WeChatLoginRequest } from './auth.js';
import type { ErrorPayload } from './error.js';

/** Uniform success envelope. */
export interface OkResponse<T> { ok: true; data: T; }
/** Uniform error envelope; never use raw HTTP errors for business failures. */
export interface ErrResponse extends ErrorPayload { ok: false; }
export type ApiResponse<T> = OkResponse<T> | ErrResponse;

// ── /auth ──
export interface AuthLoginRoute {
  path: '/auth/wechat';
  method: 'POST';
  body: WeChatLoginRequest;
  response: ApiResponse<LoginResponse>;
}

// ── /player ──
export interface PlayerInfoRoute {
  path: '/player/info';
  method: 'GET';
  headers: { authorization: `Bearer ${string}` };
  response: ApiResponse<PlayerSave>;
}

// ── /crop ──
export interface CropConfigsRoute {
  path: '/crop/configs';
  method: 'GET';
  response: ApiResponse<{ crops: CropConfig[]; version: number }>;
}

// ── /farm ──
export interface FarmUnlockRequest {
  plotIndex: number;
}
export interface FarmUnlockRoute {
  path: '/farm/unlock';
  method: 'POST';
  headers: { authorization: `Bearer ${string}` };
  body: FarmUnlockRequest;
  response: ApiResponse<{ plot: PlotState }>;
}

/** Health-check; open to LB probes. */
export interface HealthRoute {
  path: '/healthz';
  method: 'GET';
  response: { ok: true; uptime: number; protocolVersion: string };
}

/** Compile-time union of every HTTP route declared above. */
export type HttpRoute =
  | AuthLoginRoute
  | PlayerInfoRoute
  | CropConfigsRoute
  | FarmUnlockRoute
  | HealthRoute;