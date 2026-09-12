/**
 * Cocos bundle entry — everything the in-editor game UI needs from the
 * client-mini runtime, re-exported as a single ESM bundle
 * (see scripts/build-cocos-bundle.mjs → assets/scripts/vendor/farm-online.js).
 */
// ── WeChat minigame fetch shims (must install before the SDK is imported) ──
// The Colyseus SDK's matchmake HTTP layer uses globalThis.fetch with
// Headers/Response semantics; the minigame runtime provides neither (its
// native API is wx.request). Minimal shims over wx.request — just the
// surface the SDK consumes: headers.get / json / text / blob / ok / status.
type HeadersLikeInit = Record<string, string> | Array<[string, string]> | MinigameHeaders | undefined;

class MinigameHeaders {
  private map = new Map<string, string[]>();
  constructor(init?: HeadersLikeInit) {
    if (init instanceof MinigameHeaders) {
      init.forEach((v, k) => this.append(k, v));
    } else if (Array.isArray(init)) {
      for (const [k, v] of init) this.append(k, v);
    } else if (init !== undefined) {
      for (const [k, v] of Object.entries(init)) this.append(k, v);
    }
  }
  append(name: string, value: string): void {
    const key = name.toLowerCase();
    this.map.set(key, (this.map.get(key) ?? []).concat(value));
  }
  set(name: string, value: string): void { this.map.set(name.toLowerCase(), [value]); }
  get(name: string): string | null {
    const vs = this.map.get(name.toLowerCase());
    return vs === undefined ? null : vs.join(', ');
  }
  has(name: string): boolean { return this.map.has(name.toLowerCase()); }
  forEach(cb: (value: string, name: string) => void): void {
    // Map.forEach callbacks only — the DevTools' babel "enhance" transpile
    // mangles Map-iterator spread/destructuring (`[...map.entries()]`,
    // `for (const [k, v] of map)`) into arrays with undefined holes, which
    // crashed matchmake with "Cannot read properties of undefined (reading
    // 'join')". Plain method calls survive it.
    this.map.forEach((vs, k) => cb(vs.join(', '), k));
  }
  entries(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    this.map.forEach((vs, k) => out.push([k, vs.join(', ')]));
    return out;
  }
}

class MinigameResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: MinigameHeaders;
  private readonly body: string | ArrayBuffer;
  constructor(body: string | ArrayBuffer, init: { status: number; statusText?: string; headers?: MinigameHeaders }) {
    this.body = body;
    this.status = init.status;
    this.statusText = init.statusText ?? '';
    this.headers = init.headers ?? new MinigameHeaders();
  }
  get ok(): boolean { return this.status >= 200 && this.status < 300; }
  async json(): Promise<unknown> {
    if (this.body instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(this.body));
    return JSON.parse(this.body);
  }
  async text(): Promise<string> {
    return this.body instanceof ArrayBuffer ? new TextDecoder().decode(this.body) : this.body;
  }
  // Matchmake responses are JSON, so this path should not fire; return the
  // raw body shaped like a Blob just in case.
  async blob(): Promise<unknown> {
    const buf = this.body instanceof ArrayBuffer ? this.body : new TextEncoder().encode(this.body).buffer;
    return { arrayBuffer: async () => buf, size: (buf as ArrayBuffer).byteLength, type: '' };
  }
}

interface WxRequestShape {
  (opts: {
    url: string;
    method: string;
    header?: Record<string, string>;
    data?: string | ArrayBuffer;
    responseType?: string;
    dataType?: string;
    success?: (res: { statusCode: number; data: string | ArrayBuffer; header?: Record<string, string> }) => void;
    fail?: (err: { errMsg: string }) => void;
  }): void;
}

class MinigameURLSearchParams {
  private map = new Map<string, string[]>();
  constructor(init?: string | Record<string, string> | MinigameURLSearchParams) {
    if (typeof init === 'string') {
      for (const pair of init.replace(/^\?/, '').split('&')) {
        if (pair === '') continue;
        const eq = pair.indexOf('=');
        const k = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
        const v = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
        this.append(k, v);
      }
    } else if (init instanceof MinigameURLSearchParams) {
      init.forEach((v, k) => this.append(k, v));
    } else if (init !== undefined) {
      for (const [k, v] of Object.entries(init)) this.set(k, v);
    }
  }
  append(name: string, value: string): void {
    this.map.set(name, [...(this.map.get(name) ?? []), value]);
  }
  set(name: string, value: string): void { this.map.set(name, [value]); }
  get(name: string): string | null { return this.map.get(name)?.[0] ?? null; }
  has(name: string): boolean { return this.map.has(name); }
  delete(name: string): void { this.map.delete(name); }
  forEach(cb: (value: string, name: string) => void): void {
    // See MinigameHeaders.forEach — Map.forEach, never Map iterators.
    this.map.forEach((vs, k) => {
      for (let i = 0; i < vs.length; i += 1) cb(vs[i], k);
    });
  }
  toString(): string {
    const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');
    const out: string[] = [];
    this.map.forEach((vs, k) => {
      for (let i = 0; i < vs.length; i += 1) out.push(`${enc(k)}=${enc(vs[i])}`);
    });
    return out.join('&');
  }
}

class MinigameURL {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  searchParams: MinigameURLSearchParams;
  constructor(raw: string) {
    const str = String(raw);
    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(str);
    this.protocol = schemeMatch ? `${schemeMatch[1].toLowerCase()}:` : '';
    const rest = schemeMatch ? str.slice(schemeMatch[0].length) : str;
    const hashIdx = rest.indexOf('#');
    const noHash = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
    this.hash = hashIdx >= 0 ? rest.slice(hashIdx) : '';
    const qIdx = noHash.indexOf('?');
    const authorityPath = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
    const query = qIdx >= 0 ? noHash.slice(qIdx + 1) : '';
    const slashIdx = authorityPath.indexOf('/');
    const authority = slashIdx >= 0 ? authorityPath.slice(0, slashIdx) : authorityPath;
    const pathOnly = slashIdx >= 0 ? authorityPath.slice(slashIdx) : '/';
    const atIdx = authority.lastIndexOf('@');
    const hostPart = atIdx >= 0 ? authority.slice(atIdx + 1) : authority;
    const colon = hostPart.lastIndexOf(':');
    if (colon > hostPart.lastIndexOf(']')) {
      this.hostname = hostPart.slice(0, colon);
      this.port = hostPart.slice(colon + 1);
    } else {
      this.hostname = hostPart;
      this.port = '';
    }
    this.pathname = pathOnly;
    this.search = query ? `?${query}` : '';
    this.searchParams = new MinigameURLSearchParams(query);
  }
  get origin(): string {
    const portPart = this.port ? `:${this.port}` : '';
    return `${this.protocol}//${this.hostname}${portPart}`;
  }
  get host(): string { return `${this.hostname}${this.port ? `:${this.port}` : ''}`; }
  toString(): string {
    const base = `${this.origin}${this.pathname}`;
    const search = this.searchParams.toString();
    return `${base}${search ? `?${search}` : ''}${this.hash}`;
  }
}

function installMinigameFetchShims(): void {
  const g = globalThis as {
    Headers?: unknown; fetch?: unknown; Response?: unknown;
    URLSearchParams?: unknown; URL?: unknown;
    wx?: { request?: WxRequestShape };
  };
  const wxRequest = g.wx?.request;
  if (typeof wxRequest !== 'function') return; // Node/tests keep real fetch
  if (typeof g.Headers === 'undefined') g.Headers = MinigameHeaders;
  if (typeof g.Response === 'undefined') g.Response = MinigameResponse;
  if (typeof g.URLSearchParams === 'undefined') g.URLSearchParams = MinigameURLSearchParams;
  if (typeof g.URL === 'undefined') g.URL = MinigameURL;
  if (typeof g.fetch === 'undefined') {
    g.fetch = (input: string | { url: string }, init?: {
      method?: string; headers?: HeadersLikeInit; body?: string | ArrayBuffer;
    }): Promise<MinigameResponse> => new Promise((resolve, reject) => {
      try {
        const url = typeof input === 'string' ? input : input.url;
        const headerEntries = new MinigameHeaders(init?.headers).entries();
        wxRequest({
          url,
          method: init?.method ?? 'GET',
          header: Object.fromEntries(headerEntries),
          data: init?.body,
          responseType: 'text',
          dataType: 'text',
          success: (res) => resolve(new MinigameResponse(res.data, {
            status: res.statusCode,
            headers: new MinigameHeaders(res.header),
          })),
          fail: (err) => reject(new Error(`wx.request failed: ${err?.errMsg ?? String(err)}`)),
        });
      } catch (err) {
        // Surface the TypeError's real birth stack in the DevTools console —
        // regenerator wrapping in the SDK otherwise masks it behind a
        // MatchMakeError whose stack only shows the async machinery.
        // eslint-disable-next-line no-console
        console.error('[fetch-shim] sync throw:', (err as Error)?.stack ?? err);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}
installMinigameFetchShims();

export { OnlineGameApp, FarmApiError, FarmWsError } from './runtime/online.js';
export type { OnlineState, OnlinePlotView } from './runtime/online.js';
export { makeOperationId } from './net/index.js';
// OnlineGameApp emits lifecycle/gameplay events on the shared global bus —
// the Cocos UI subscribes to the same bus instead of an per-app .on().
export { EventBus, GameEvent } from '@farm-game/shared';
