/**
 * Transport seam — single abstraction over fetch / wx.request so the same
 * network layer runs under Node tests and the WeChat mini-program runtime.
 *
 * The shape mirrors fetch closely: the caller passes `{method, url, headers, body}`
 * and gets back `{status, json}`. We deliberately don't expose a `Response`
 * object — the SDK never streams bodies, and a thin DTO keeps the test
 * doubles trivial.
 */

export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  json: unknown;
}

export interface HttpTransport {
  request(req: HttpRequest): Promise<HttpResponse>;
}

interface FetchLike {
  (input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{ status: number; json(): Promise<unknown> }>;
}

/**
 * Node / browser transport — wraps globalThis.fetch. Resolves with the parsed
 * JSON body so callers never deal with a Response stream.
 *
 * Note: a non-2xx status does NOT throw here — the caller inspects `status`
 * and decides whether the envelope is `{ok:false}` (business error) or
 * represents an HTTP-level failure.
 */
export function nodeHttpTransport(): HttpTransport {
  const fetchImpl = (globalThis as { fetch?: FetchLike }).fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('nodeHttpTransport: globalThis.fetch is unavailable in this runtime');
  }
  return {
    async request(req) {
      const init: { method: string; headers: Record<string, string>; body?: string } = {
        method: req.method,
        headers: req.headers ?? {},
      };
      if (req.body !== undefined) init.body = JSON.stringify(req.body);
      const res = await fetchImpl(req.url, init);
      // Gateways/proxies can return HTML or empty bodies on 5xx — hand back
      // json:null and let the envelope unwrapper synthesize an HTTP_<status>
      // error instead of leaking a raw SyntaxError to the caller.
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    },
  };
}

/** Minimal shape of wx.request we depend on. */
interface WxRequestLike {
  (opts: {
    url: string;
    method: 'GET' | 'POST';
    header?: Record<string, string>;
    data?: unknown;
    success?: (res: { statusCode: number; data: unknown }) => void;
    fail?: (err: unknown) => void;
  }): unknown;
}

interface WxGlobal {
  request: WxRequestLike;
}

/**
 * WeChat mini-program transport — promisifies wx.request.
 *
 * Throws if `wx` is not on globalThis (i.e. we're not inside the mini-program
 * runtime); the caller is expected to gate this via `autoHttpTransport` or
 * instantiate it directly inside the wx entry point.
 */
export function wxHttpTransport(): HttpTransport {
  const wx = (globalThis as { wx?: WxGlobal }).wx;
  if (typeof wx === 'undefined' || typeof wx.request !== 'function') {
    throw new Error('wxHttpTransport: globalThis.wx.request is unavailable — not running in the WeChat mini-program runtime');
  }
  return {
    request(req) {
      return new Promise<HttpResponse>((resolve, reject) => {
        wx.request({
          url: req.url,
          method: req.method,
          header: req.headers,
          data: req.body,
          success(res) {
            resolve({ status: res.statusCode, json: res.data });
          },
          fail(err) {
            reject(err instanceof Error ? err : new Error(`wx.request failed: ${String(err)}`));
          },
        });
      });
    },
  };
}

/**
 * Auto-detect transport — picks wx when available, otherwise fetch. Used at
 * app boot; tests inject their own transport via FarmHttpClient's constructor.
 */
export function autoHttpTransport(): HttpTransport {
  const wx = (globalThis as { wx?: WxGlobal }).wx;
  if (typeof wx !== 'undefined' && typeof wx.request === 'function') {
    return wxHttpTransport();
  }
  return nodeHttpTransport();
}
