/**
 * HTTP API client for the global backend. Used by both client-mini (Cocos/TS)
 * and client-app (RN/TS). Pure fetch wrapper — no React, no Cocos dependency.
 *
 * Phase 1: contract-only, no auth refresh, no retry. Phase 2 adds token refresh
 * + offline queue.
 */

import {
  PROTOCOL_VERSION,
  Platform,
  type ApiResponse,
  type CropConfig,
  type LoginResponse,
  type PlayerSave,
  type PlotState,
  type WeChatLoginRequest,
  type OAuthLoginRequest,
} from '@farm-game/shared';

export interface ApiClientOptions {
  baseUrl: string;
  /** Optional bearer token; required for /player/info, /farm/*. */
  token?: string;
  /** Default X-Platform header; override per call if needed. */
  platform?: Platform;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

export class ApiClient {
  readonly baseUrl: string;
  private _token?: string;
  private _platform: Platform;
  private readonly _fetch: typeof fetch;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this._token = opts.token;
    this._platform = opts.platform ?? Platform.IOS;
    this._fetch = opts.fetchImpl ?? globalThis.fetch;
  }

  setToken(token: string | undefined): void { this._token = token; }

  private _headers(extra?: Record<string, string>): HeadersInit {
    return {
      'content-type': 'application/json',
      'x-protocol-version': PROTOCOL_VERSION,
      'x-platform': this._platform,
      ...(this._token ? { authorization: `Bearer ${this._token}` } : {}),
      ...extra,
    };
  }

  async getHealth(): Promise<{ ok: true; protocolVersion: string }> {
    const res = await this._fetch(`${this.baseUrl}/healthz`, { headers: this._headers() });
    return res.json() as Promise<{ ok: true; protocolVersion: string }>;
  }

  async loginWeChat(req: WeChatLoginRequest): Promise<ApiResponse<LoginResponse>> {
    const res = await this._fetch(`${this.baseUrl}/auth/wechat`, {
      method: 'POST', headers: this._headers(), body: JSON.stringify(req),
    });
    return res.json() as Promise<ApiResponse<LoginResponse>>;
  }

  async loginOAuth(req: OAuthLoginRequest): Promise<ApiResponse<LoginResponse>> {
    const res = await this._fetch(`${this.baseUrl}/auth/oauth`, {
      method: 'POST', headers: this._headers(), body: JSON.stringify(req),
    });
    return res.json() as Promise<ApiResponse<LoginResponse>>;
  }

  async getPlayerInfo(): Promise<ApiResponse<PlayerSave>> {
    const res = await this._fetch(`${this.baseUrl}/player/info`, { headers: this._headers() });
    return res.json() as Promise<ApiResponse<PlayerSave>>;
  }

  async getCropConfigs(): Promise<ApiResponse<{ crops: CropConfig[]; version: number }>> {
    const res = await this._fetch(`${this.baseUrl}/crop/configs`, { headers: this._headers() });
    return res.json() as Promise<ApiResponse<{ crops: CropConfig[]; version: number }>>;
  }

  async unlockPlot(plotIndex: number): Promise<ApiResponse<{ plot: PlotState }>> {
    const res = await this._fetch(`${this.baseUrl}/farm/unlock`, {
      method: 'POST', headers: this._headers(), body: JSON.stringify({ plotIndex }),
    });
    return res.json() as Promise<ApiResponse<{ plot: PlotState }>>;
  }
}