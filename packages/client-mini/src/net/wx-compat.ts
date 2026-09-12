/**
 * WeChat minigame WebSocket compatibility — MUST be imported before
 * `@colyseus/sdk` (ESM evaluates imports in order, so listing this first in
 * ws.ts makes the patches below run before the SDK captures
 * `globalThis.WebSocket` at module-eval time).
 *
 * Two gaps bite the SDK on WeChat (both devtools-simulator and real device):
 *
 * 1. Send rejections — the SDK ships every frame as msgpack-encoded
 *    Uint8Array/Buffer, but `wx.sendSocketMessage` only accepts
 *    `string | ArrayBuffer`. Array views are silently rejected, so the join
 *    handshake never reaches the room (server logs show a connect but zero
 *    joins). Fix per https://docs.colyseus.io/getting-started/wechat — patch
 *    `WebSocket.prototype.send` to copy views into exactly-sized ArrayBuffers.
 *
 * 2. Node-form constructor — `WebSocketTransport.connect` first tries
 *    `new WebSocket(url, { headers, protocols })` (the Node `ws` form). The
 *    Cocos web-adapter forwards that options object to `wx.connectSocket` as
 *    a subprotocol, and the connection then never opens. We can't replace the
 *    read-only `window.WebSocket` binding, so we guard INSIDE
 *    `wx.connectSocket`: throw synchronously when a non-string subprotocol
 *    shows up, which unwinds the adapter constructor into the SDK's own catch
 *    — the workaround recorded in
 *    https://github.com/colyseus/colyseus.js/issues/161.
 *
 * No-op outside the WeChat runtime (editor preview, Node tests): the module
 * only acts when `wx` exists AND a global WebSocket class is present.
 */

interface WxConnectSocketOptions {
  url?: string;
  protocols?: unknown;
  tcpNoDelay?: boolean;
}

type WxConnectSocket = (opts: WxConnectSocketOptions) => unknown;

interface WxLike {
  connectSocket?: WxConnectSocket;
}

interface WebSocketCtorLike {
  prototype: { send?: (data: unknown) => void };
}

function toSendable(data: unknown): unknown {
  // Uint8Array/Buffer (msgpack output) → exactly-sized ArrayBuffer copy. Copy
  // explicitly via set() — `view.buffer` leaks the shared backing store, and
  // Node's Buffer.prototype.slice() returns a view rather than a copy, so
  // neither shortcut is safe for msgpackr's reusable output buffers. Plain
  // arrays go through Uint8Array per the official docs.
  if (ArrayBuffer.isView(data)) {
    const view = data as Uint8Array;
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    return copy.buffer;
  }
  if (Array.isArray(data)) return new Uint8Array(data).buffer;
  return data;
}

function installWeChatWebSocketCompat(): void {
  const g = globalThis as { wx?: WxLike; WebSocket?: WebSocketCtorLike; console?: { log?: (...a: unknown[]) => void } };
  if (typeof g.wx?.connectSocket !== 'function') return; // not the WeChat runtime
  const wx = g.wx as WxLike & { __wxCompat?: boolean };
  const log = (...a: unknown[]): void => { try { g.console?.log?.('[wx-compat]', ...a); } catch { /* noop */ } };
  let guardOk = false;
  let sendOk = false;

  // 1) wx.connectSocket guard — reject the options-object subprotocol form
  //    (colyseus.js#161) so the SDK falls back to the browser constructor.
  if (!wx.__wxCompat) {
    const originalConnectSocket = wx.connectSocket as WxConnectSocket;
    const guarded = function connectSocket(this: unknown, opts: WxConnectSocketOptions): unknown {
      const { protocols } = opts ?? {};
      if (Array.isArray(protocols) && protocols.some((p) => typeof p !== 'string')) {
        throw new TypeError(
          'wx.connectSocket: non-string subprotocols — the WebSocket options-object form is not supported on WeChat',
        );
      }
      return originalConnectSocket.call(this, opts);
    };
    try {
      wx.connectSocket = guarded as WxConnectSocket;
      guardOk = true;
    } catch {
      try {
        Object.defineProperty(wx, 'connectSocket', { value: guarded, configurable: true, writable: true });
        guardOk = true;
      } catch {
        // Give up on the guard; the send patch below still fixes joins.
        guardOk = false;
      }
    }
    if (guardOk) wx.__wxCompat = true;
  }

  // 2) WebSocket.prototype.send — views/arrays → ArrayBuffer (official patch).
  const proto = g.WebSocket?.prototype;
  if (proto && typeof proto.send === 'function' && !(proto.send as { __wxCompat?: boolean }).__wxCompat) {
    const originalSend = proto.send;
    const patchedSend = function (this: unknown, data: unknown): void {
      originalSend.call(this, toSendable(data));
    };
    (patchedSend as { __wxCompat?: boolean }).__wxCompat = true;
    proto.send = patchedSend;
    sendOk = true;
  }
  log(`installed guard=${guardOk} send=${sendOk}`);
}

installWeChatWebSocketCompat();
