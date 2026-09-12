/**
 * Farm HTTP client — thin wrapper around {@link HttpTransport} that enforces
 * the G2 success/error envelope contract (`{ok:true, data}` vs
 * `{ok:false, code, message}`).
 *
 * Why a dedicated client instead of bare fetch:
 *  - Centralises Bearer-token attachment (login is the only call that doesn't
 *    need one).
 *  - Centralises clock-skew capture: every successful login stamps
 *    `serverNowOffsetMs = serverNow - Date.now()` so the rest of the app can
 *    align its local clock with the server's authoritative epoch.
 *  - Surfaces business failures as {@link FarmApiError}, never as raw HTTP
 *    errors — callers switch on `error.code` (see {@link ErrorCode}) the same
 *    way they do over the WS transport.
 */

import {
  type ApiResponse,
  type CropConfig,
  type LoginResponse,
  type PlayerSave,
} from '@farm-game/shared';

import {
  autoHttpTransport,
  type HttpTransport,
} from './transport.js';

/**
 * Thrown for any business failure (server returned `{ok:false}`) or
 * transport-level failure (HTTP ≥ 400 with no parseable envelope).
 */
export class FarmApiError extends Error {
  readonly code: number | string;
  readonly status: number;

  constructor(message: string, opts: { code: number | string; status: number }) {
    super(message);
    this.name = 'FarmApiError';
    this.code = opts.code;
    this.status = opts.status;
  }
}

export interface FarmHttpClientOptions {
  baseUrl: string;
  /**
   * Inject a custom transport — tests provide a mock that returns canned
   * envelopes without spinning up the Fastify entry. Production code should
   * leave this unset and rely on {@link autoHttpTransport}.
   */
  transport?: HttpTransport;
}

export class FarmHttpClient {
  readonly baseUrl: string;
  readonly transport: HttpTransport;
  /** Bearer token; null until `loginWeChat` succeeds. */
  token: string | null = null;
  /**
   * Server epoch minus local Date.now() at the last successful login.
   * Wallclock skew correction — see ADR-0003 D20. Defaults to 0 until set.
   */
  serverNowOffsetMs = 0;

  constructor(opts: FarmHttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.transport = opts.transport ?? autoHttpTransport();
  }

  /**
   * POST /auth/wechat. Mock codes (`mock_…`) are accepted only when the
   * server has `ENABLE_MOCK_AUTH=1`; real WeChat `jscode2session` codes work
   * everywhere.
   *
   * Side-effects on success:
   *  - `this.token` is set to the issued JWT.
   *  - `this.serverNowOffsetMs` captures the clock skew for the rest of the
   *    session (the server stamps its epoch at issue time).
   */
  async loginWeChat(code: string): Promise<LoginResponse> {
    const res = await this.transport.request({
      method: 'POST',
      url: `${this.baseUrl}/auth/wechat`,
      headers: { 'content-type': 'application/json' },
      body: { code },
    });
    const data = unwrapEnvelope<LoginResponse>(res);
    this.token = data.token;
    this.serverNowOffsetMs = data.serverNow - Date.now();
    return data;
  }

  /** GET /crop/configs — crop catalogue for the shop UI. */
  async getCropConfigs(): Promise<CropConfig[]> {
    const res = await this.transport.request({
      method: 'GET',
      url: `${this.baseUrl}/crop/configs`,
    });
    const data = unwrapEnvelope<{ crops: CropConfig[]; version: number }>(res);
    return data.crops;
  }

  /** GET /player/info — requires a Bearer token (login must have run first). */
  async getPlayerInfo(): Promise<PlayerSave> {
    const token = this.requireToken();
    const res = await this.transport.request({
      method: 'GET',
      url: `${this.baseUrl}/player/info`,
      headers: { authorization: `Bearer ${token}` },
    });
    return unwrapEnvelope<PlayerSave>(res);
  }

  private requireToken(): string {
    if (this.token === null) {
      throw new FarmApiError('not authenticated — call loginWeChat() first', {
        code: 'NOT_AUTHENTICATED',
        status: 0,
      });
    }
    return this.token;
  }
}

/**
 * Envelope handler — peels `{ok, data}` into a typed value, or throws a
 * {@link FarmApiError} when the envelope is an error response or the body is
 * unparseable. HTTP-level ≥ 400 with no envelope also becomes a FarmApiError
 * (carrying the status as the synthetic code).
 */
export function unwrapEnvelope<T>(res: { status: number; json: unknown }): T {
  const env = res.json as ApiResponse<T> | null | undefined;
  if (env !== null && typeof env === 'object' && (env as { ok?: unknown }).ok === true) {
    return (env as { ok: true; data: T }).data;
  }
  if (env !== null && typeof env === 'object' && (env as { ok?: unknown }).ok === false) {
    const err = env as { code: number | string; message: string };
    throw new FarmApiError(err.message ?? 'request failed', { code: err.code, status: res.status });
  }
  throw new FarmApiError(
    `HTTP ${res.status} with non-conforming body`,
    { code: `HTTP_${res.status}`, status: res.status },
  );
}
