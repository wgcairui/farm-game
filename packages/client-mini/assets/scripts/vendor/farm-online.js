var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target2) => (target2 = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target2, "default", { value: mod, enumerable: true }) : target2,
  mod
));

// node-stub:ws
var require_ws = __commonJS({
  "node-stub:ws"(exports, module) {
    module.exports = {};
  }
});

// ../shared/dist/types/crop.js
var CROPS = Object.freeze({
  carrot: {
    id: "carrot",
    name: "\u767D\u841D\u535C",
    icon: "carrot_icon",
    seedPrice: 10,
    sellPrice: 25,
    growthDuration: 30,
    stages: 4,
    maxWater: 3,
    witherWindow: 24 * 3600,
    seedItemId: "carrot_seed",
    cropItemId: "carrot"
  },
  potato: {
    id: "potato",
    name: "\u571F\u8C46",
    icon: "potato_icon",
    seedPrice: 30,
    sellPrice: 70,
    growthDuration: 120,
    stages: 4,
    maxWater: 3,
    witherWindow: 24 * 3600,
    seedItemId: "potato_seed",
    cropItemId: "potato"
  },
  corn: {
    id: "corn",
    name: "\u7389\u7C73",
    icon: "corn_icon",
    seedPrice: 60,
    sellPrice: 150,
    growthDuration: 300,
    stages: 4,
    maxWater: 3,
    witherWindow: 24 * 3600,
    seedItemId: "corn_seed",
    cropItemId: "corn"
  },
  tomato: {
    id: "tomato",
    name: "\u756A\u8304",
    icon: "tomato_icon",
    seedPrice: 100,
    sellPrice: 280,
    growthDuration: 900,
    stages: 4,
    maxWater: 3,
    witherWindow: 24 * 3600,
    seedItemId: "tomato_seed",
    cropItemId: "tomato"
  },
  strawberry: {
    id: "strawberry",
    name: "\u8349\u8393",
    icon: "strawberry_icon",
    seedPrice: 200,
    sellPrice: 600,
    growthDuration: 3600,
    stages: 4,
    maxWater: 3,
    witherWindow: 24 * 3600,
    seedItemId: "strawberry_seed",
    cropItemId: "strawberry"
  }
});
function getCrop(id) {
  return CROPS[id];
}

// ../shared/dist/types/events.js
var GameEvent;
(function(GameEvent2) {
  GameEvent2["CoinsChanged"] = "coins_changed";
  GameEvent2["DiamondsChanged"] = "diamonds_changed";
  GameEvent2["PlotStateChanged"] = "plot_state_changed";
  GameEvent2["CropHarvested"] = "crop_harvested";
  GameEvent2["SceneChanged"] = "scene_changed";
  GameEvent2["ToastShow"] = "toast_show";
  GameEvent2["ServerConnected"] = "server_connected";
  GameEvent2["ServerDisconnected"] = "server_disconnected";
  GameEvent2["ServerPlotUpdated"] = "server_plot_updated";
  GameEvent2["ServerCropStolen"] = "server_crop_stolen";
  GameEvent2["AuthLoggedIn"] = "auth_logged_in";
})(GameEvent || (GameEvent = {}));

// ../shared/dist/eventbus/EventBus.js
var EventBusImpl = class {
  _listeners = /* @__PURE__ */ new Map();
  on(event, handler) {
    let set = this._listeners.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this._listeners.set(event, set);
    }
    set.add(handler);
  }
  off(event, handler) {
    const set = this._listeners.get(event);
    if (!set)
      return;
    set.delete(handler);
    if (set.size === 0)
      this._listeners.delete(event);
  }
  emit(event, arg) {
    const set = this._listeners.get(event);
    if (!set)
      return;
    const snapshot = [];
    set.forEach((handler) => snapshot.push(handler));
    for (let i = 0; i < snapshot.length; i += 1) {
      try {
        snapshot[i](arg);
      } catch (err) {
        console.error(`[EventBus] handler for "${event}" threw`, err);
      }
    }
  }
  /** Number of listeners currently registered for `event` (test helper). */
  listenerCount(event) {
    return this._listeners.get(event)?.size ?? 0;
  }
  /** Remove every listener — call between test cases. */
  clear() {
    this._listeners.clear();
  }
};
var EventBus = new EventBusImpl();

// ../shared/dist/protocol/version.js
var PROTOCOL_VERSION = "2.0.0";
var PROTOCOL_VERSION_MAJOR = 2;

// src/net/transport.ts
function nodeHttpTransport() {
  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("nodeHttpTransport: globalThis.fetch is unavailable in this runtime");
  }
  return {
    async request(req) {
      const init = {
        method: req.method,
        headers: req.headers ?? {}
      };
      if (req.body !== void 0) init.body = JSON.stringify(req.body);
      const res = await fetchImpl(req.url, init);
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    }
  };
}
function wxHttpTransport() {
  const wx = globalThis.wx;
  if (typeof wx === "undefined" || typeof wx.request !== "function") {
    throw new Error("wxHttpTransport: globalThis.wx.request is unavailable \u2014 not running in the WeChat mini-program runtime");
  }
  return {
    request(req) {
      return new Promise((resolve, reject) => {
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
          }
        });
      });
    }
  };
}
function autoHttpTransport() {
  const wx = globalThis.wx;
  if (typeof wx !== "undefined" && typeof wx.request === "function") {
    return wxHttpTransport();
  }
  return nodeHttpTransport();
}

// src/net/http.ts
var FarmApiError = class extends Error {
  code;
  status;
  constructor(message, opts) {
    super(message);
    this.name = "FarmApiError";
    this.code = opts.code;
    this.status = opts.status;
  }
};
var FarmHttpClient = class {
  baseUrl;
  transport;
  /** Bearer token; null until `loginWeChat` succeeds. */
  token = null;
  /**
   * Server epoch minus local Date.now() at the last successful login.
   * Wallclock skew correction — see ADR-0003 D20. Defaults to 0 until set.
   */
  serverNowOffsetMs = 0;
  constructor(opts) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
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
  async loginWeChat(code) {
    const res = await this.transport.request({
      method: "POST",
      url: `${this.baseUrl}/auth/wechat`,
      headers: { "content-type": "application/json" },
      body: { code }
    });
    const data = unwrapEnvelope(res);
    this.token = data.token;
    this.serverNowOffsetMs = data.serverNow - Date.now();
    return data;
  }
  /** GET /crop/configs — crop catalogue for the shop UI. */
  async getCropConfigs() {
    const res = await this.transport.request({
      method: "GET",
      url: `${this.baseUrl}/crop/configs`
    });
    const data = unwrapEnvelope(res);
    return data.crops;
  }
  /** GET /player/info — requires a Bearer token (login must have run first). */
  async getPlayerInfo() {
    const token = this.requireToken();
    const res = await this.transport.request({
      method: "GET",
      url: `${this.baseUrl}/player/info`,
      headers: { authorization: `Bearer ${token}` }
    });
    return unwrapEnvelope(res);
  }
  requireToken() {
    if (this.token === null) {
      throw new FarmApiError("not authenticated \u2014 call loginWeChat() first", {
        code: "NOT_AUTHENTICATED",
        status: 0
      });
    }
    return this.token;
  }
};
function unwrapEnvelope(res) {
  const env = res.json;
  if (env !== null && typeof env === "object" && env.ok === true) {
    return env.data;
  }
  if (env !== null && typeof env === "object" && env.ok === false) {
    const err = env;
    throw new FarmApiError(err.message ?? "request failed", { code: err.code, status: res.status });
  }
  throw new FarmApiError(
    `HTTP ${res.status} with non-conforming body`,
    { code: `HTTP_${res.status}`, status: res.status }
  );
}

// src/net/wx-compat.ts
function toSendable(data) {
  if (ArrayBuffer.isView(data)) {
    const view2 = data;
    const copy2 = new Uint8Array(view2.byteLength);
    copy2.set(view2);
    return copy2.buffer;
  }
  if (Array.isArray(data)) return new Uint8Array(data).buffer;
  return data;
}
function installWeChatWebSocketCompat() {
  const g = globalThis;
  if (typeof g.wx?.connectSocket !== "function") return;
  const wx = g.wx;
  const log = (...a) => {
    try {
      g.console?.log?.("[wx-compat]", ...a);
    } catch {
    }
  };
  let guardOk = false;
  let sendOk = false;
  if (!wx.__wxCompat) {
    const originalConnectSocket = wx.connectSocket;
    const guarded = function connectSocket(opts) {
      const { protocols } = opts ?? {};
      if (Array.isArray(protocols) && protocols.some((p) => typeof p !== "string")) {
        throw new TypeError(
          "wx.connectSocket: non-string subprotocols \u2014 the WebSocket options-object form is not supported on WeChat"
        );
      }
      return originalConnectSocket.call(this, opts);
    };
    try {
      wx.connectSocket = guarded;
      guardOk = true;
    } catch {
      try {
        Object.defineProperty(wx, "connectSocket", { value: guarded, configurable: true, writable: true });
        guardOk = true;
      } catch {
        guardOk = false;
      }
    }
    if (guardOk) wx.__wxCompat = true;
  }
  const proto = g.WebSocket?.prototype;
  if (proto && typeof proto.send === "function" && !proto.send.__wxCompat) {
    const originalSend = proto.send;
    const patchedSend = function(data) {
      originalSend.call(this, toSendable(data));
    };
    patchedSend.__wxCompat = true;
    proto.send = patchedSend;
    sendOk = true;
  }
  log(`installed guard=${guardOk} send=${sendOk}`);
}
installWeChatWebSocketCompat();

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/legacy.mjs
if (!ArrayBuffer.isView) {
  ArrayBuffer.isView = (a) => {
    return a !== null && typeof a === "object" && a.buffer instanceof ArrayBuffer;
  };
}
if (typeof globalThis === "undefined" && typeof window !== "undefined") {
  window["globalThis"] = window;
}
if (typeof FormData === "undefined") {
  globalThis["FormData"] = class {
  };
}

// ../../node_modules/.pnpm/@colyseus+shared-types@0.18.2/node_modules/@colyseus/shared-types/build/Protocol.mjs
var Protocol = {
  // Room-related (10~19)
  JOIN_ROOM: 10,
  ERROR: 11,
  LEAVE_ROOM: 12,
  ROOM_DATA: 13,
  ROOM_STATE: 14,
  ROOM_STATE_PATCH: 15,
  ROOM_DATA_SCHEMA: 16,
  // DEPRECATED: schema instances via room.send()
  ROOM_DATA_BYTES: 17,
  PING: 18,
  // Input-related (19~20).
  ROOM_INPUT_RELIABLE: 19,
  // [byte, stamp?, ...InputEncoder.encode() bytes]       single input
  ROOM_INPUT_UNRELIABLE: 20,
  // [byte, len|input, len|input, ...]                    length-framed ring
  // Request/response (21~22)
  ROOM_REQUEST: 21,
  // [byte, requestId varint, type(str|num), msgpack payload]     client→server, expects a reply
  ROOM_RESPONSE: 22
  // [byte, requestId varint, status uint8, msgpack payload?]     server→client, reply to a request
};
var ProtocolModifier = {
  /**
   * Server-time + per-recipient last-input-ack are prepended to the message
   * body.
   *
   * Layout when set (applied to {@link Protocol.ROOM_STATE} and
   * {@link Protocol.ROOM_STATE_PATCH}):
   *
   *     [code | TIMED][uint32 sNow LE][uint32 inputSeq LE][...body]
   *
   * - `sNow` is the server clock as ms since room start
   *   (`room.clock.elapsedTime` — NOT raw `performance.now()`; portable
   *   integer, wraps at u32 ≈ 49.7 days). Shared across all recipients of
   *   this tick.
   * - `inputSeq` is the seq value of the last input CONSUMED into the
   *   authoritative state from *this specific recipient* (`0` if the client
   *   never sent an input). Per-recipient — never another client's ack.
   *
   * Authoritative field semantics: the `TIMED_PREFIX_SIZE` doc in
   * `@colyseus/core` `serializer/SchemaSerializer.ts`.
   *
   * The client SDK uses these to estimate RTT, server time, and clock offset
   * (and to prune its reconciliation replay buffer) without any
   * application-level schema cooperation.
   *
   * Emitted whenever the Room called `defineInput()`. SDK clients that
   * understand the TIMED bit decode the prefix; older clients that don't
   * support it would fail to parse — Colyseus 0.18 introduces the feature
   * alongside the first SDK release that decodes it, so the protocol bump
   * is implicit in the version.
   *
   * Also set on either client→server input opcode
   * ({@link Protocol.ROOM_INPUT_RELIABLE} / {@link Protocol.ROOM_INPUT_UNRELIABLE})
   * when the Room's lag-comp attachments require a per-client stamp. The
   * handshake tells the client which timeline(s) to send via
   * {@link InputFlags.RENDER_TIME} / {@link InputFlags.RECKON_TIME}; the prefix
   * shape follows from which flags are set — and from the channel, because the
   * two have different delivery guarantees.
   *
   * RELIABLE carries ONE stamp for its single input, DELTA-CODED: each frame
   * ships the signed change from the previous stamp via the self-describing
   * number codec (≈ one fixed step per tick → ~1 byte vs a raw 4-byte u32; the
   * first frame / post-reset ships the absolute as a one-off larger delta). The
   * server reconstructs it against a per-client baseline both sides re-zero
   * together on (re)connect:
   *
   *   - RECKON_TIME only: `[varint Δreckon]`
   *   - RENDER_TIME only: `[varint Δrender]`
   *   - BOTH:             `[varint Δreckon][uint16 renderDelta]`
   *
   * UNRELIABLE carries a SELF-CONTAINED block, one stamp per ring slot, because
   * the packet holds `k` inputs sampled at `k` different instants and a running
   * baseline cannot survive loss or reordering:
   *
   *       [varint k][uint32 newest][varint Δ]×(k−1)
   *       [uint16 rdNewest][varint Δrd]×(k−1)        ← BOTH mode only
   *
   * `newest` is absolute, and each Δ walks one slot older
   * (`stamp[i] = stamp[i+1] − Δ`) — so a packet is readable on its own and an
   * input recovered redundantly from a later packet still arrives with its own
   * instant. Stamps pair positionally with the ring's oldest→newest slots.
   *
   * BOTH mode trails the `renderDelta` series in the same shape — one value per
   * slot, not one per packet — so each input keeps the interp buffer plus
   * one-way latency it was actually sampled with. Consecutive values differ by
   * ~0–1 ms, which the number codec encodes in one byte, so per-slot exactness
   * costs `k−1` bytes over a single shared value.
   *
   * The block is all-or-nothing: every slot is stamped, or the bit is not set.
   * A client's `allowRewind` gates the RELIABLE opcode only — here the block
   * ships whole, so excluding a slot would save nothing and would make its
   * neighbour's delta swing the full absolute value. Slots sampled before the
   * client's clock synced ship as `0`, the standard "unstamped, read live"
   * sentinel.
   *
   * reckonTime (ms since room start) = the client's serverNow estimate at
   * input-sample time — what its forward-RECKONED entities display at, stamped
   * directly so the server's rewind read is immune to the client's
   * RTT-estimation error. renderTime = the snapshot-timeline instant on screen
   * (what a LERPING client shows) = `reckonTime − renderDelta`
   * (≈ `renderDelay + rtt/2`). In the BOTH case the gap is shipped as a u16
   * `renderDelta` (bounded ≪ 65 s) rather than a second delta and the server
   * derives renderTime; single-timeline rooms ship the one timeline they use.
   * See {@link HandshakeSection.INPUT_OPTIONS} / {@link InputFlags}.
   */
  TIMED: 128,
  /**
   * The frame rode the transport's UNRELIABLE channel (a WebTransport datagram)
   * and may therefore be lost, duplicated, or reordered.
   *
   * Layout when set (applied to {@link Protocol.ROOM_STATE_PATCH}):
   *
   *     [code | UNRELIABLE][uint16 seq LE][...body]
   *
   * - `seq` is a room-wide counter incremented once per unreliable flush and
   *   shared by every recipient of that flush. It wraps at 65536, so freshness
   *   is a wrap-safe comparison — `(int16)(seq - lastApplied) > 0` — not `>`.
   *   The client drops any frame that isn't newer than the last one it applied;
   *   a reordered datagram would otherwise write a stale value that survives
   *   until the field changes again.
   *
   * Carries only fields marked `@unreliable` in the state schema. Those are
   * restricted to primitives, so every ADD/DELETE of a ref still travels the
   * reliable channel: a dropped frame costs a stale field value and can never
   * desync the ref graph.
   *
   * Never combined with {@link ProtocolModifier.TIMED}. The clock sample and the
   * input ack must arrive in order to be meaningful, so they stay exclusive to
   * the reliable patch — which already emits a per-tick heartbeat in rooms that
   * called `defineInput()`.
   */
  UNRELIABLE: 64
};
var PROTOCOL_CODE_MASK = 31;
var ResponseStatus = {
  OK: 0,
  REJECTED: 1,
  ERROR: 2
};
var HandshakeSection = {
  /**
   * Reflection bytes (`Reflection.encode`) for the Room's input schema —
   * present when the server called `defineInput()`. The SDK reconstructs a
   * constructor and uses it as the default for `conn.input()` calls that
   * don't pass an explicit `type`.
   */
  INPUT_REFLECTION: 1,
  /**
   * Input feature flags + optional values the client mirrors — present when the
   * Room called `defineInput()`. Layout:
   * `[flags uint8][tickRate varint?][patchRate varint?][subSteps varint?]`,
   * bits per {@link InputFlags}; trailing varints appear in flag-bit order
   * when set.
   */
  INPUT_OPTIONS: 2
};
var InputFlags = {
  /** Client auto-stamps reliable inputs with the SNAPSHOT-timeline instant it
   *  was rendering (`renderTime`, ms since room start) for lag-compensated hit
   *  registration of `mode:"snapshot"` rewind targets. Prefix shape depends on
   *  whether {@link RECKON_TIME} is also set — see {@link ProtocolModifier.TIMED}. */
  RENDER_TIME: 1 << 0,
  /** A `[tickRate varint]` (Hz) follows — the server's fixed sim/input step
   *  rate. The client predicts at dt = 1/tickRate. */
  FIXED_TIMESTEP: 1 << 1,
  /** A `[patchRate varint]` (ms) follows — the server's state-patch interval =
   *  the reconcile/correction cadence. The client tunes smoothing to it. */
  PATCH_RATE: 1 << 2,
  /** A `[subSteps varint]` (count ≥ 2) follows — physics sub-steps per input
   *  tick. The simulation integrates `subSteps` engine steps of
   *  `(1/tickRate)/subSteps` per input, identically on both sides, so the
   *  physics rate is `tickRate * subSteps` while the input/network rate stays
   *  `tickRate`. Absent ⇒ 1 (input rate == physics rate). */
  SUB_STEPS: 1 << 3,
  /** Client auto-stamps reliable inputs with the RECKON-timeline instant
   *  (`reckonTime` = its serverNow estimate, ms since room start) for
   *  lag-compensated hit registration of `mode:"reckon"` rewind targets. The
   *  stamp is DELTA-CODED (signed varint vs the previous stamp): together with
   *  {@link RENDER_TIME} the input ships `[varint Δreckon][uint16 renderDelta]`;
   *  alone it ships `[varint Δreckon]`. See {@link ProtocolModifier.TIMED}. */
  RECKON_TIME: 1 << 4
};
var CloseCode = {
  NORMAL_CLOSURE: 1e3,
  GOING_AWAY: 1001,
  NO_STATUS_RECEIVED: 1005,
  ABNORMAL_CLOSURE: 1006,
  CONSENTED: 4e3,
  SERVER_SHUTDOWN: 4001,
  WITH_ERROR: 4002,
  FAILED_TO_RECONNECT: 4003,
  MAY_TRY_RECONNECT: 4010
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/errors/Errors.mjs
var ServerError = class extends Error {
  code;
  headers;
  status;
  response;
  data;
  constructor(code, message, opts) {
    super(message);
    this.name = "ServerError";
    this.code = code;
    if (opts) {
      this.headers = opts.headers;
      this.status = opts.status;
      this.response = opts.response;
      this.data = opts.data;
    }
  }
};
var MatchMakeError = class _MatchMakeError extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "MatchMakeError";
    Object.setPrototypeOf(this, _MatchMakeError.prototype);
  }
};

// ../../node_modules/.pnpm/@colyseus+schema@5.0.27_typescript@5.5.4/node_modules/@colyseus/schema/build/index.mjs
var SWITCH_TO_STRUCTURE = 255;
var TYPE_ID = 213;
var OPERATION;
(function(OPERATION2) {
  OPERATION2[OPERATION2["ADD"] = 128] = "ADD";
  OPERATION2[OPERATION2["REPLACE"] = 0] = "REPLACE";
  OPERATION2[OPERATION2["DELETE"] = 64] = "DELETE";
  OPERATION2[OPERATION2["DELETE_AND_MOVE"] = 96] = "DELETE_AND_MOVE";
  OPERATION2[OPERATION2["MOVE_AND_ADD"] = 160] = "MOVE_AND_ADD";
  OPERATION2[OPERATION2["DELETE_AND_ADD"] = 192] = "DELETE_AND_ADD";
  OPERATION2[OPERATION2["CLEAR"] = 10] = "CLEAR";
  OPERATION2[OPERATION2["REVERSE"] = 15] = "REVERSE";
  OPERATION2[OPERATION2["MOVE"] = 32] = "MOVE";
  OPERATION2[OPERATION2["DELETE_BY_REFID"] = 33] = "DELETE_BY_REFID";
  OPERATION2[OPERATION2["ADD_BY_REFID"] = 129] = "ADD_BY_REFID";
})(OPERATION || (OPERATION = {}));
Symbol.metadata ??= /* @__PURE__ */ Symbol.for("Symbol.metadata");
function shadowMetadata(ctor) {
  Object.defineProperty(ctor, Symbol.metadata, {
    value: void 0,
    writable: true,
    configurable: true,
    enumerable: false
  });
}
var _g = (function() {
  if (typeof globalThis !== "undefined")
    return globalThis;
  if (typeof global !== "undefined")
    return global;
  if (typeof self !== "undefined")
    return self;
  if (typeof window !== "undefined")
    return window;
  return {};
})();
if (typeof Symbol === "function" && typeof Symbol.for !== "function") {
  const REGISTRY_KEY = "colyseus.symbolRegistry";
  const registry = _g[REGISTRY_KEY] || (_g[REGISTRY_KEY] = /* @__PURE__ */ Object.create(null));
  Symbol.for = function(key) {
    return registry[key] || (registry[key] = Symbol(key));
  };
  Symbol.keyFor = function(sym) {
    for (const k in registry)
      if (registry[k] === sym)
        return k;
    return void 0;
  };
}
var $refId = /* @__PURE__ */ Symbol.for("$refId");
var $track = "~track";
var $encoder = "~encoder";
var $decoder = "~decoder";
var $filter = "~filter";
var $getByIndex = "~getByIndex";
var $deleteByIndex = "~deleteByIndex";
var $resyncPrune = "~resyncPrune";
var $changes = /* @__PURE__ */ Symbol.for("$changes");
var $childType = /* @__PURE__ */ Symbol.for("$childType");
var $proxyTarget = /* @__PURE__ */ Symbol.for("$proxyTarget");
var $onEncodeEnd = "~onEncodeEnd";
var $reset = "~reset";
var $onDecodeEnd = "~onDecodeEnd";
var $values = /* @__PURE__ */ Symbol.for("$values");
var $builder = "~builder";
var $descriptors = "~descriptors";
var $encodeDescriptor = "~__encodeDescriptor";
var $encoders = "~encoders";
var $numFields = "~__numFields";
var $refTypeFieldIndexes = "~__refTypeFieldIndexes";
var $viewFieldIndexes = "~__viewFieldIndexes";
var $fieldIndexesByViewTag = "$__fieldIndexesByViewTag";
var $unreliableFieldIndexes = "~__unreliableFieldIndexes";
var $patchOnlyFieldIndexes = "~__patchOnlyFieldIndexes";
var $fullSyncSkipIndexes = "~__fullSyncSkipIndexes";
var $fullStateOnlyFieldIndexes = "~__fullStateOnlyFieldIndexes";
var $streamFieldIndexes = "~__streamFieldIndexes";
var $streamPriorities = "~__streamPriorities";
var textEncoder;
try {
  textEncoder = new TextEncoder();
} catch (e) {
}
var _convoBuffer$1 = new ArrayBuffer(8);
var _int32$1 = new Int32Array(_convoBuffer$1);
var _float32$1 = new Float32Array(_convoBuffer$1);
var _float64$1 = new Float64Array(_convoBuffer$1);
var _int64$1 = new BigInt64Array(_convoBuffer$1);
var hasBufferByteLength = typeof Buffer !== "undefined" && Buffer.byteLength;
var utf8Length = hasBufferByteLength ? Buffer.byteLength : function(str, _) {
  var c = 0, length = 0;
  for (var i = 0, l = str.length; i < l; i++) {
    c = str.charCodeAt(i);
    if (c < 128) {
      length += 1;
    } else if (c < 2048) {
      length += 2;
    } else if (c < 55296 || c >= 57344) {
      length += 3;
    } else {
      i++;
      length += 4;
    }
  }
  return length;
};
function utf8Write(view2, str, it) {
  var c = 0;
  for (var i = 0, l = str.length; i < l; i++) {
    c = str.charCodeAt(i);
    if (c < 128) {
      view2[it.offset++] = c;
    } else if (c < 2048) {
      view2[it.offset] = 192 | c >> 6;
      view2[it.offset + 1] = 128 | c & 63;
      it.offset += 2;
    } else if (c < 55296 || c >= 57344) {
      view2[it.offset] = 224 | c >> 12;
      view2[it.offset + 1] = 128 | c >> 6 & 63;
      view2[it.offset + 2] = 128 | c & 63;
      it.offset += 3;
    } else {
      i++;
      c = 65536 + ((c & 1023) << 10 | str.charCodeAt(i) & 1023);
      view2[it.offset] = 240 | c >> 18;
      view2[it.offset + 1] = 128 | c >> 12 & 63;
      view2[it.offset + 2] = 128 | c >> 6 & 63;
      view2[it.offset + 3] = 128 | c & 63;
      it.offset += 4;
    }
  }
}
function int8$1(bytes, value, it) {
  bytes[it.offset++] = value & 255;
}
function uint8$1(bytes, value, it) {
  bytes[it.offset++] = value & 255;
}
function int16$1(bytes, value, it) {
  bytes[it.offset++] = value & 255;
  bytes[it.offset++] = value >> 8 & 255;
}
function uint16$1(bytes, value, it) {
  bytes[it.offset++] = value & 255;
  bytes[it.offset++] = value >> 8 & 255;
}
function int32$1(bytes, value, it) {
  bytes[it.offset++] = value & 255;
  bytes[it.offset++] = value >> 8 & 255;
  bytes[it.offset++] = value >> 16 & 255;
  bytes[it.offset++] = value >> 24 & 255;
}
function uint32$1(bytes, value, it) {
  const b4 = value >> 24;
  const b3 = value >> 16;
  const b2 = value >> 8;
  const b1 = value;
  bytes[it.offset++] = b1 & 255;
  bytes[it.offset++] = b2 & 255;
  bytes[it.offset++] = b3 & 255;
  bytes[it.offset++] = b4 & 255;
}
function int64$1(bytes, value, it) {
  const high = Math.floor(value / Math.pow(2, 32));
  const low = value >>> 0;
  uint32$1(bytes, low, it);
  uint32$1(bytes, high, it);
}
function uint64$1(bytes, value, it) {
  const high = value / Math.pow(2, 32) >> 0;
  const low = value >>> 0;
  uint32$1(bytes, low, it);
  uint32$1(bytes, high, it);
}
function bigint64$1(bytes, value, it) {
  _int64$1[0] = BigInt.asIntN(64, value);
  int32$1(bytes, _int32$1[0], it);
  int32$1(bytes, _int32$1[1], it);
}
function biguint64$1(bytes, value, it) {
  _int64$1[0] = BigInt.asIntN(64, value);
  int32$1(bytes, _int32$1[0], it);
  int32$1(bytes, _int32$1[1], it);
}
function float32$1(bytes, value, it) {
  _float32$1[0] = value;
  int32$1(bytes, _int32$1[0], it);
}
function float64$1(bytes, value, it) {
  _float64$1[0] = value;
  int32$1(bytes, _int32$1[0], it);
  int32$1(bytes, _int32$1[1], it);
}
function boolean$1(bytes, value, it) {
  bytes[it.offset++] = value ? 1 : 0;
}
function string$1(bytes, value, it) {
  if (!value) {
    value = "";
  }
  let length = utf8Length(value, "utf8");
  let size = 0;
  if (length < 32) {
    bytes[it.offset++] = length | 160;
    size = 1;
  } else if (length < 256) {
    bytes[it.offset++] = 217;
    bytes[it.offset++] = length;
    size = 2;
  } else if (length < 65536) {
    bytes[it.offset++] = 218;
    uint16$1(bytes, length, it);
    size = 3;
  } else if (length < 4294967296) {
    bytes[it.offset++] = 219;
    uint32$1(bytes, length, it);
    size = 5;
  } else {
    throw new Error("String too long");
  }
  utf8Write(bytes, value, it);
  return size + length;
}
function number$1(bytes, value, it) {
  if (isNaN(value)) {
    return number$1(bytes, 0, it);
  } else if (!isFinite(value)) {
    return number$1(bytes, value > 0 ? Number.MAX_SAFE_INTEGER : -Number.MAX_SAFE_INTEGER, it);
  } else if (value !== (value | 0)) {
    if (Math.abs(value) <= 34028235e31) {
      _float32$1[0] = value;
      if (Math.abs(Math.abs(_float32$1[0]) - Math.abs(value)) < 1e-4) {
        bytes[it.offset++] = 202;
        float32$1(bytes, value, it);
        return 5;
      }
    }
    bytes[it.offset++] = 203;
    float64$1(bytes, value, it);
    return 9;
  }
  if (value >= 0) {
    if (value < 128) {
      bytes[it.offset++] = value & 255;
      return 1;
    }
    if (value < 256) {
      bytes[it.offset++] = 204;
      bytes[it.offset++] = value & 255;
      return 2;
    }
    if (value < 65536) {
      bytes[it.offset++] = 205;
      uint16$1(bytes, value, it);
      return 3;
    }
    if (value < 4294967296) {
      bytes[it.offset++] = 206;
      uint32$1(bytes, value, it);
      return 5;
    }
    bytes[it.offset++] = 207;
    uint64$1(bytes, value, it);
    return 9;
  } else {
    if (value >= -32) {
      bytes[it.offset++] = 224 | value + 32;
      return 1;
    }
    if (value >= -128) {
      bytes[it.offset++] = 208;
      int8$1(bytes, value, it);
      return 2;
    }
    if (value >= -32768) {
      bytes[it.offset++] = 209;
      int16$1(bytes, value, it);
      return 3;
    }
    if (value >= -2147483648) {
      bytes[it.offset++] = 210;
      int32$1(bytes, value, it);
      return 5;
    }
    bytes[it.offset++] = 211;
    int64$1(bytes, value, it);
    return 9;
  }
}
var encode = {
  int8: int8$1,
  uint8: uint8$1,
  int16: int16$1,
  uint16: uint16$1,
  int32: int32$1,
  uint32: uint32$1,
  int64: int64$1,
  uint64: uint64$1,
  bigint64: bigint64$1,
  biguint64: biguint64$1,
  float32: float32$1,
  float64: float64$1,
  boolean: boolean$1,
  string: string$1,
  number: number$1,
  utf8Write,
  utf8Length
};
var _convoBuffer = new ArrayBuffer(8);
var _int32 = new Int32Array(_convoBuffer);
var _float32 = new Float32Array(_convoBuffer);
var _float64 = new Float64Array(_convoBuffer);
var _uint64 = new BigUint64Array(_convoBuffer);
var _int64 = new BigInt64Array(_convoBuffer);
function utf8Read(bytes, it, length) {
  if (length > bytes.length - it.offset) {
    length = bytes.length - it.offset;
  }
  var string2 = "", chr = 0;
  for (var i = it.offset, end = it.offset + length; i < end; i++) {
    var byte = bytes[i];
    if ((byte & 128) === 0) {
      string2 += String.fromCharCode(byte);
      continue;
    }
    if ((byte & 224) === 192) {
      string2 += String.fromCharCode((byte & 31) << 6 | bytes[++i] & 63);
      continue;
    }
    if ((byte & 240) === 224) {
      string2 += String.fromCharCode((byte & 15) << 12 | (bytes[++i] & 63) << 6 | (bytes[++i] & 63) << 0);
      continue;
    }
    if ((byte & 248) === 240) {
      chr = (byte & 7) << 18 | (bytes[++i] & 63) << 12 | (bytes[++i] & 63) << 6 | (bytes[++i] & 63) << 0;
      if (chr >= 65536) {
        chr -= 65536;
        string2 += String.fromCharCode((chr >>> 10) + 55296, (chr & 1023) + 56320);
      } else {
        string2 += String.fromCharCode(chr);
      }
      continue;
    }
    console.error("decode.utf8Read(): Invalid byte " + byte + " at offset " + i + ". Skip to end of string: " + (it.offset + length));
    break;
  }
  it.offset += length;
  return string2;
}
function int8(bytes, it) {
  return uint8(bytes, it) << 24 >> 24;
}
function uint8(bytes, it) {
  return bytes[it.offset++];
}
function int16(bytes, it) {
  return uint16(bytes, it) << 16 >> 16;
}
function uint16(bytes, it) {
  return bytes[it.offset++] | bytes[it.offset++] << 8;
}
function int32(bytes, it) {
  return bytes[it.offset++] | bytes[it.offset++] << 8 | bytes[it.offset++] << 16 | bytes[it.offset++] << 24;
}
function uint32(bytes, it) {
  return int32(bytes, it) >>> 0;
}
function float32(bytes, it) {
  _int32[0] = int32(bytes, it);
  return _float32[0];
}
function float64(bytes, it) {
  _int32[0] = int32(bytes, it);
  _int32[1] = int32(bytes, it);
  return _float64[0];
}
function int64(bytes, it) {
  const low = uint32(bytes, it);
  const high = int32(bytes, it) * Math.pow(2, 32);
  return high + low;
}
function uint64(bytes, it) {
  const low = uint32(bytes, it);
  const high = uint32(bytes, it) * Math.pow(2, 32);
  return high + low;
}
function bigint64(bytes, it) {
  _int32[0] = int32(bytes, it);
  _int32[1] = int32(bytes, it);
  return _int64[0];
}
function biguint64(bytes, it) {
  _int32[0] = int32(bytes, it);
  _int32[1] = int32(bytes, it);
  return _uint64[0];
}
function boolean(bytes, it) {
  return uint8(bytes, it) > 0;
}
function string(bytes, it) {
  const prefix = bytes[it.offset++];
  let length;
  if (prefix < 192) {
    length = prefix & 31;
  } else if (prefix === 217) {
    length = uint8(bytes, it);
  } else if (prefix === 218) {
    length = uint16(bytes, it);
  } else if (prefix === 219) {
    length = uint32(bytes, it);
  }
  return utf8Read(bytes, it, length);
}
function number(bytes, it) {
  const prefix = bytes[it.offset++];
  if (prefix < 128) {
    return prefix;
  } else if (prefix === 202) {
    return float32(bytes, it);
  } else if (prefix === 203) {
    return float64(bytes, it);
  } else if (prefix === 204) {
    return uint8(bytes, it);
  } else if (prefix === 205) {
    return uint16(bytes, it);
  } else if (prefix === 206) {
    return uint32(bytes, it);
  } else if (prefix === 207) {
    return uint64(bytes, it);
  } else if (prefix === 208) {
    return int8(bytes, it);
  } else if (prefix === 209) {
    return int16(bytes, it);
  } else if (prefix === 210) {
    return int32(bytes, it);
  } else if (prefix === 211) {
    return int64(bytes, it);
  } else if (prefix > 223) {
    return (255 - prefix + 1) * -1;
  }
}
function stringCheck(bytes, it) {
  const prefix = bytes[it.offset];
  return (
    // fixstr
    prefix < 192 && prefix > 160 || // str 8
    prefix === 217 || // str 16
    prefix === 218 || // str 32
    prefix === 219
  );
}
var decode = {
  utf8Read,
  int8,
  uint8,
  int16,
  uint16,
  int32,
  uint32,
  float32,
  float64,
  int64,
  uint64,
  bigint64,
  biguint64,
  boolean,
  string,
  number,
  stringCheck
};
var registeredTypes = {};
var identifiers = /* @__PURE__ */ new Map();
function registerType(identifier, definition) {
  if (definition.constructor) {
    if (Object.prototype.hasOwnProperty.call(definition, "constructor") && definition.constructor[Symbol.metadata] == null) {
      shadowMetadata(definition.constructor);
    }
    identifiers.set(definition.constructor, identifier);
    registeredTypes[identifier] = definition;
  }
  if (definition.encode) {
    encode[identifier] = definition.encode;
  }
  if (definition.decode) {
    decode[identifier] = definition.decode;
  }
}
function getType(identifier) {
  return registeredTypes[identifier];
}
var ARRAY_STREAM_NOT_SUPPORTED = "ArraySchema does not support streaming \u2014 positional ops (splice / unshift / reverse) shift subsequent indexes, so holding ADDs back for a later tick under `maxPerTick` would desync the decoder. Use `t.stream(X)` (stable monotonic positions) or `t.map(X).stream()` (stable keys) instead.";
function createStreamableState() {
  return {
    pendingByView: /* @__PURE__ */ new Map(),
    sentByView: /* @__PURE__ */ new Map(),
    broadcastPending: /* @__PURE__ */ new Set(),
    sentBroadcast: /* @__PURE__ */ new Set(),
    broadcastDeletes: /* @__PURE__ */ new Set(),
    maxPerTick: 32
  };
}
function ensureStreamState(s) {
  return s._stream ??= createStreamableState();
}
function streamRouteAdd(s, root, index) {
  if (root.activeViews.size === 0) {
    ensureStreamState(s).broadcastPending.add(index);
  }
}
function streamRouteRemove(s, root, refId, index) {
  const st = s._stream;
  if (st === void 0)
    return true;
  let neverSent = false;
  if (st.broadcastPending.delete(index)) {
    neverSent = true;
  } else if (st.sentBroadcast.delete(index)) {
    st.broadcastDeletes.add(index);
  }
  root.forEachActiveView((view2) => {
    const pending = st.pendingByView.get(view2.id);
    if (pending?.has(index)) {
      pending.delete(index);
      neverSent = true;
      return;
    }
    const sent = st.sentByView.get(view2.id);
    if (sent?.has(index)) {
      sent.delete(index);
      let changes = view2.changes.get(refId);
      if (changes === void 0) {
        changes = /* @__PURE__ */ new Map();
        view2.changes.set(refId, changes);
      }
      changes.set(index, OPERATION.DELETE);
    }
  });
  return neverSent;
}
function streamRouteClear(s, root, refId) {
  const st = s._stream;
  if (st === void 0)
    return;
  st.broadcastPending.clear();
  for (const index of st.sentBroadcast)
    st.broadcastDeletes.add(index);
  st.sentBroadcast.clear();
  root.forEachActiveView((view2) => {
    st.pendingByView.get(view2.id)?.clear();
    const sent = st.sentByView.get(view2.id);
    if (sent !== void 0 && sent.size > 0) {
      let changes = view2.changes.get(refId);
      if (changes === void 0) {
        changes = /* @__PURE__ */ new Map();
        view2.changes.set(refId, changes);
      }
      for (const index of sent)
        changes.set(index, OPERATION.DELETE);
      sent.clear();
    }
  });
}
function streamEnqueueForView(s, viewId, index) {
  const st = ensureStreamState(s);
  let pending = st.pendingByView.get(viewId);
  if (pending === void 0) {
    pending = /* @__PURE__ */ new Set();
    st.pendingByView.set(viewId, pending);
  }
  pending.add(index);
}
function streamDropView(s, viewId) {
  const st = s._stream;
  if (st === void 0)
    return;
  st.pendingByView.delete(viewId);
  st.sentByView.delete(viewId);
  st.priorityByView?.delete(viewId);
}
var WIRE_BY_BITS = {
  8: "uint8",
  16: "uint16",
  32: "uint32"
};
function resolveQuantize(opts) {
  if (opts == null || typeof opts !== "object") {
    throw new Error("t.quantized(): options object with { min, max } is required.");
  }
  const { min, max } = opts;
  if (typeof min !== "number" || typeof max !== "number" || !(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(`t.quantized(): require finite min < max (got min=${min}, max=${max}).`);
  }
  const bits = opts.bits ?? 16;
  if (bits !== 8 && bits !== 16 && bits !== 32) {
    throw new Error(`t.quantized(): bits must be 8, 16 or 32 (got ${bits}).`);
  }
  const mode = opts.mode ?? "clamp";
  if (mode !== "clamp" && mode !== "wrap") {
    throw new Error(`t.quantized(): mode must be "clamp" or "wrap" (got ${JSON.stringify(mode)}).`);
  }
  const wrap = mode === "wrap";
  const steps = Math.pow(2, bits);
  return {
    min,
    max,
    bits,
    wrap,
    wire: WIRE_BY_BITS[bits],
    range: max - min,
    // wrapping spreads `2^bits` steps across [min,max) (top ≡ bottom); clamped
    // maps the endpoints onto `0` and `2^bits − 1` inclusive — one fewer on a
    // symmetric range so zero lands on a step too. Ports must match this rule.
    span: wrap ? steps : min === -max ? steps - 2 : steps - 1
  };
}
function isQuantizedType(type) {
  return type !== null && typeof type === "object" && type.quantized !== void 0;
}
function quantize(desc, value) {
  if (desc.wrap) {
    if (!Number.isFinite(value))
      return 0;
    const range = desc.range;
    let a = (value - desc.min) % range;
    if (a < 0)
      a += range;
    const steps = desc.span;
    return Math.floor(a / range * steps + 0.5) % steps;
  }
  if (value !== value)
    return 0;
  const v = value < desc.min ? desc.min : value > desc.max ? desc.max : value;
  return Math.floor((v - desc.min) / desc.range * desc.span + 0.5);
}
function dequantize(desc, q) {
  return desc.min + q / desc.span * desc.range;
}
function makeQuantizedEncoder(desc) {
  const writeWire = encode[desc.wire];
  return (bytes, value, it) => writeWire(bytes, quantize(desc, value), it);
}
function decodeQuantized(desc, bytes, it) {
  const readWire = decode[desc.wire];
  return dequantize(desc, readWire(bytes, it));
}
var TypeContext = class _TypeContext {
  types = {};
  schemas = /* @__PURE__ */ new Map();
  hasFilters = false;
  /**
   * For inheritance support
   * Keeps track of which classes extends which. (parent -> children)
   */
  static inheritedTypes = /* @__PURE__ */ new Map();
  static cachedContexts = /* @__PURE__ */ new Map();
  static register(target2) {
    const parent = Object.getPrototypeOf(target2);
    if (parent !== Schema) {
      let inherits = _TypeContext.inheritedTypes.get(parent);
      if (!inherits) {
        inherits = /* @__PURE__ */ new Set();
        _TypeContext.inheritedTypes.set(parent, inherits);
      }
      inherits.add(target2);
    }
  }
  static cache(rootClass) {
    let context = _TypeContext.cachedContexts.get(rootClass);
    if (!context) {
      context = new _TypeContext(rootClass);
      _TypeContext.cachedContexts.set(rootClass, context);
    }
    return context;
  }
  constructor(rootClass) {
    if (rootClass) {
      this.discoverTypes(rootClass);
    }
  }
  has(schema2) {
    return this.schemas.has(schema2);
  }
  get(typeid) {
    return this.types[typeid];
  }
  add(schema2, typeid = this.schemas.size) {
    if (this.schemas.has(schema2)) {
      return false;
    }
    this.types[typeid] = schema2;
    if (schema2[Symbol.metadata] == null) {
      Metadata.initialize(schema2);
    }
    this.schemas.set(schema2, typeid);
    return true;
  }
  getTypeId(klass) {
    return this.schemas.get(klass);
  }
  discoverTypes(klass) {
    if (!this.add(klass)) {
      return;
    }
    _TypeContext.inheritedTypes.get(klass)?.forEach((child) => {
      this.discoverTypes(child);
    });
    let parent = klass;
    while ((parent = Object.getPrototypeOf(parent)) && parent !== Schema && // stop at root (Schema)
    parent !== Function.prototype) {
      this.discoverTypes(parent);
    }
    const metadata = klass[Symbol.metadata];
    if (metadata[$viewFieldIndexes] || metadata[$streamFieldIndexes]) {
      this.hasFilters = true;
    }
    for (const fieldIndex in metadata) {
      const index = fieldIndex;
      const fieldType = metadata[index].type;
      if (typeof fieldType === "string") {
        continue;
      }
      if (isQuantizedType(fieldType)) {
        continue;
      }
      if (typeof fieldType === "function") {
        this.discoverTypes(fieldType);
      } else {
        const type = Object.values(fieldType)[0];
        if (typeof type === "string") {
          continue;
        }
        this.discoverTypes(type);
      }
    }
  }
  debug() {
    return `TypeContext ->
	Schema types: ${this.schemas.size}
	hasFilters: ${this.hasFilters}`;
  }
};
var MAX_FIELDS = 63;
function resolveFieldType(type) {
  const complexTypeKlass = typeof Object.keys(type)[0] === "string" && getType(Object.keys(type)[0]);
  return {
    complexTypeKlass,
    childType: complexTypeKlass ? Object.values(type)[0] : type
  };
}
function getNormalizedType(type) {
  if (Array.isArray(type)) {
    return { array: getNormalizedType(type[0]) };
  } else if (isQuantizedType(type)) {
    return typeof type.quantized.wire === "string" ? type : { quantized: resolveQuantize(type.quantized) };
  } else if (typeof type["type"] !== "undefined") {
    return type["type"];
  } else if (isTSEnum(type)) {
    return Object.keys(type).every((key) => typeof type[key] === "string") ? "string" : "number";
  } else if (typeof type === "object" && type !== null) {
    const collectionType = Object.keys(type).find((k) => registeredTypes[k] !== void 0);
    if (collectionType) {
      type[collectionType] = getNormalizedType(type[collectionType]);
      return type;
    }
  }
  return type;
}
function isTSEnum(_enum) {
  if (typeof _enum === "function" && _enum[Symbol.metadata]) {
    return false;
  }
  const keys = Object.keys(_enum);
  const numericFields = keys.filter((k) => /\d+/.test(k));
  if (numericFields.length > 0 && numericFields.length === keys.length / 2 && _enum[_enum[numericFields[0]]] == numericFields[0]) {
    return true;
  }
  if (keys.length > 0 && keys.every((key) => typeof _enum[key] === "string" && _enum[key] === key)) {
    return true;
  }
  return false;
}
var INHERITED_ARRAY_KEYS = [
  $refTypeFieldIndexes,
  $unreliableFieldIndexes,
  $patchOnlyFieldIndexes,
  $fullSyncSkipIndexes,
  $fullStateOnlyFieldIndexes,
  $streamFieldIndexes,
  $encoders
];
function pushIndexList(metadata, key, index) {
  if (!metadata[key]) {
    Object.defineProperty(metadata, key, {
      value: [],
      enumerable: false,
      configurable: true,
      writable: true
    });
  }
  metadata[key].push(index);
}
var Metadata = {
  addField(metadata, index, name, type, descriptor) {
    if (index >= MAX_FIELDS) {
      throw new Error(`Can't define field '${name}'.
Schema instances may only have up to ${MAX_FIELDS} fields.`);
    }
    metadata[index] = Object.assign(
      metadata[index] || {},
      // avoid overwriting previous field metadata (@deprecated / @unreliable)
      {
        type: getNormalizedType(type),
        index,
        name
      }
    );
    Object.defineProperty(metadata, $descriptors, {
      value: metadata[$descriptors] || {},
      enumerable: false,
      configurable: true
    });
    if (descriptor) {
      metadata[$descriptors][name] = descriptor;
    } else {
      metadata[$descriptors][name] = {
        value: void 0,
        writable: true,
        enumerable: true,
        configurable: true
      };
    }
    Object.defineProperty(metadata, $numFields, {
      value: index,
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(metadata, name, {
      value: index,
      enumerable: false,
      configurable: true
    });
    if (typeof metadata[index].type !== "string" && !isQuantizedType(metadata[index].type)) {
      if (metadata[$refTypeFieldIndexes] === void 0) {
        Object.defineProperty(metadata, $refTypeFieldIndexes, {
          value: [],
          enumerable: false,
          configurable: true
        });
      }
      metadata[$refTypeFieldIndexes].push(index);
    }
    const t2 = metadata[index].type;
    if (t2 && typeof t2 === "object" && t2["stream"] !== void 0) {
      if (t2.array !== void 0) {
        throw new Error(ARRAY_STREAM_NOT_SUPPORTED);
      }
      metadata[index].stream = true;
      if (!metadata[$streamFieldIndexes]) {
        Object.defineProperty(metadata, $streamFieldIndexes, {
          value: [],
          enumerable: false,
          configurable: true,
          writable: true
        });
      }
      if (!metadata[$streamFieldIndexes].includes(index)) {
        metadata[$streamFieldIndexes].push(index);
      }
      const priorityFn = type?.priority;
      if (typeof priorityFn === "function") {
        Metadata.setStreamPriority(metadata, name, priorityFn);
      }
    }
  },
  setTag(metadata, fieldName, tag) {
    const index = metadata[fieldName];
    const field = metadata[index];
    field.tag = tag;
    if (!metadata[$viewFieldIndexes]) {
      Object.defineProperty(metadata, $viewFieldIndexes, {
        value: [],
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(metadata, $fieldIndexesByViewTag, {
        value: {},
        enumerable: false,
        configurable: true
      });
    }
    metadata[$viewFieldIndexes].push(index);
    if (tag < 0) {
      if (!metadata[$fieldIndexesByViewTag][tag]) {
        metadata[$fieldIndexesByViewTag][tag] = [];
      }
      metadata[$fieldIndexesByViewTag][tag].push(index);
    } else {
      for (let bits = tag; bits > 0; bits &= bits - 1) {
        const bit = bits & -bits;
        if (!metadata[$fieldIndexesByViewTag][bit]) {
          metadata[$fieldIndexesByViewTag][bit] = [];
        }
        metadata[$fieldIndexesByViewTag][bit].push(index);
      }
    }
  },
  setUnreliable(metadata, fieldName) {
    const index = metadata[fieldName];
    const fieldType = metadata[index].type;
    if (typeof fieldType !== "string") {
      throw new Error(`@unreliable cannot be applied to ref-type field "${fieldName}". For ref-type fields, mark each primitive sub-field with @unreliable instead. See README "Limitations and best practices".`);
    }
    metadata[index].unreliable = true;
    if (!metadata[$unreliableFieldIndexes]) {
      Object.defineProperty(metadata, $unreliableFieldIndexes, {
        value: [],
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
    metadata[$unreliableFieldIndexes].push(index);
  },
  setPatchOnly(metadata, fieldName) {
    const index = metadata[fieldName];
    if (metadata[index].fullStateOnly) {
      throw new Error(`field "${fieldName}" cannot be both patchOnly and fullStateOnly \u2014 those are the only two delivery channels, so the field would never reach a client.`);
    }
    metadata[index].patchOnly = true;
    pushIndexList(metadata, $patchOnlyFieldIndexes, index);
    pushIndexList(metadata, $fullSyncSkipIndexes, index);
  },
  /**
   * `@deprecated()` bookkeeping: the field keeps its wire index (so peers
   * that still carry it stay compatible) but is excluded from full sync —
   * its accessor may throw — and hidden from `for..in` consumers.
   */
  setDeprecated(metadata, fieldName) {
    const index = metadata[fieldName];
    metadata[index].deprecated = true;
    pushIndexList(metadata, $fullSyncSkipIndexes, index);
    Object.defineProperty(metadata, index, {
      value: metadata[index],
      enumerable: false,
      configurable: true
    });
  },
  setFullStateOnly(metadata, fieldName) {
    const index = metadata[fieldName];
    if (metadata[index].patchOnly) {
      throw new Error(`field "${fieldName}" cannot be both patchOnly and fullStateOnly \u2014 those are the only two delivery channels, so the field would never reach a client.`);
    }
    metadata[index].fullStateOnly = true;
    pushIndexList(metadata, $fullStateOnlyFieldIndexes, index);
  },
  setStream(metadata, fieldName) {
    const index = metadata[fieldName];
    metadata[index].stream = true;
    if (!metadata[$streamFieldIndexes]) {
      Object.defineProperty(metadata, $streamFieldIndexes, {
        value: [],
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
    metadata[$streamFieldIndexes].push(index);
  },
  /**
   * Attach a declaration-scope priority callback to a stream field.
   * Called at schema definition time (via `t.stream(X).priority(fn)` or
   * `@type({ stream: X, priority: fn })`), looked up at stream-attach
   * time to seed the instance's `_stream.priority` slot. The callback
   * signature is `(view: StateView, element: V) => number` — only fires
   * during `encodeView`, broadcast mode emits FIFO regardless.
   */
  setStreamPriority(metadata, fieldName, fn) {
    const index = metadata[fieldName];
    if (!metadata[$streamPriorities]) {
      Object.defineProperty(metadata, $streamPriorities, {
        value: {},
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
    metadata[$streamPriorities][index] = fn;
  },
  getStreamPriority(metadata, index) {
    return metadata?.[$streamPriorities]?.[index];
  },
  /**
   * Install a single field with full encoder wiring: accessor descriptor
   * on the prototype + `metadata[$encoders]` slot for primitives. Shared
   * between `Metadata.setFields` (build path) and
   * `Reflection.makeEncodable` (Reflection upgrade path).
   */
  defineField(target2, metadata, fieldIndex, fieldName, type) {
    const normalized = getNormalizedType(type);
    const { complexTypeKlass, childType } = resolveFieldType(normalized);
    Metadata.addField(metadata, fieldIndex, fieldName, normalized, getPropertyDescriptor(fieldName, fieldIndex, childType, complexTypeKlass));
    if (metadata[$descriptors][fieldName]) {
      Object.defineProperty(target2.prototype, fieldName, metadata[$descriptors][fieldName]);
    }
    if (typeof normalized === "string" || isQuantizedType(normalized)) {
      if (!metadata[$encoders]) {
        Object.defineProperty(metadata, $encoders, {
          value: [],
          enumerable: false,
          configurable: true,
          writable: true
        });
      }
      metadata[$encoders][fieldIndex] = typeof normalized === "string" ? encode[normalized] : makeQuantizedEncoder(normalized.quantized);
    }
  },
  setFields(target2, fields) {
    const constructor = target2.prototype.constructor;
    TypeContext.register(constructor);
    const parentClass = Object.getPrototypeOf(constructor);
    const parentMetadata = parentClass && parentClass[Symbol.metadata];
    const metadata = Metadata.initialize(constructor);
    if (!constructor[$track]) {
      constructor[$track] = Schema[$track];
    }
    if (!constructor[$encoder]) {
      constructor[$encoder] = Schema[$encoder];
    }
    if (!constructor[$decoder]) {
      constructor[$decoder] = Schema[$decoder];
    }
    if (!constructor.prototype.toJSON) {
      constructor.prototype.toJSON = Schema.prototype.toJSON;
    }
    let fieldIndex = metadata[$numFields] ?? (parentMetadata && parentMetadata[$numFields]) ?? -1;
    fieldIndex++;
    if (!metadata[$encoders]) {
      Object.defineProperty(metadata, $encoders, {
        value: parentMetadata?.[$encoders] ? [...parentMetadata[$encoders]] : [],
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
    for (const field in fields) {
      if (metadata[field] !== void 0) {
        throw new Error(`@colyseus/schema: Duplicate '${field}' definition on '${constructor.name || "(anonymous)"}'.`);
      }
      Metadata.defineField(constructor, metadata, fieldIndex, field, fields[field]);
      fieldIndex++;
    }
    return target2;
  },
  isDeprecated(metadata, field) {
    return metadata[field].deprecated === true;
  },
  initialize(constructor) {
    const parentClass = Object.getPrototypeOf(constructor);
    const parentMetadata = parentClass[Symbol.metadata];
    let metadata = constructor[Symbol.metadata] ?? /* @__PURE__ */ Object.create(null);
    if (parentClass !== Schema && metadata === parentMetadata) {
      metadata = /* @__PURE__ */ Object.create(null);
      if (parentMetadata) {
        Object.setPrototypeOf(metadata, parentMetadata);
        Object.defineProperty(metadata, $numFields, {
          value: parentMetadata[$numFields],
          enumerable: false,
          configurable: true,
          writable: true
        });
        if (parentMetadata[$viewFieldIndexes] !== void 0) {
          Object.defineProperty(metadata, $viewFieldIndexes, {
            value: [...parentMetadata[$viewFieldIndexes]],
            enumerable: false,
            configurable: true,
            writable: true
          });
          Object.defineProperty(metadata, $fieldIndexesByViewTag, {
            value: { ...parentMetadata[$fieldIndexesByViewTag] },
            enumerable: false,
            configurable: true,
            writable: true
          });
        }
        for (const key of INHERITED_ARRAY_KEYS) {
          const list = parentMetadata[key];
          if (list !== void 0) {
            Object.defineProperty(metadata, key, {
              value: [...list],
              enumerable: false,
              configurable: true,
              writable: true
            });
          }
        }
        Object.defineProperty(metadata, $descriptors, {
          value: { ...parentMetadata[$descriptors] },
          enumerable: false,
          configurable: true,
          writable: true
        });
      }
    }
    Object.defineProperty(constructor, Symbol.metadata, {
      value: metadata,
      writable: false,
      configurable: true
    });
    return metadata;
  },
  isValidInstance(klass) {
    return klass.constructor[Symbol.metadata] && Object.prototype.hasOwnProperty.call(klass.constructor[Symbol.metadata], $numFields);
  },
  getFields(klass) {
    const metadata = klass[Symbol.metadata];
    const fields = {};
    for (let i = 0; i <= metadata[$numFields]; i++) {
      fields[metadata[i].name] = metadata[i].type;
    }
    return fields;
  },
  hasViewTagAtIndex(metadata, index) {
    return metadata?.[$viewFieldIndexes]?.includes(index);
  },
  hasUnreliableAtIndex(metadata, index) {
    return metadata?.[$unreliableFieldIndexes]?.includes(index);
  },
  hasPatchOnlyAtIndex(metadata, index) {
    return metadata?.[$patchOnlyFieldIndexes]?.includes(index);
  },
  hasFullStateOnlyAtIndex(metadata, index) {
    return metadata?.[$fullStateOnlyFieldIndexes]?.includes(index);
  },
  hasStreamAtIndex(metadata, index) {
    return metadata?.[$streamFieldIndexes]?.includes(index);
  }
};
var _invokeNoCtx$2 = (cb, index, op) => cb(index, op);
var SchemaChangeRecorder = class {
  // Bitmask storage for fields 0-31 (low) and 32-63 (high).
  dirtyLow = 0;
  dirtyHigh = 0;
  // ops[fieldIndex] = OPERATION value. Pre-sized to numFields+1.
  ops;
  constructor(numFields) {
    this.ops = new Uint8Array(Math.max(numFields + 1, 1));
  }
  record(index, op) {
    const prev = this.ops[index];
    if (prev === 0)
      this.ops[index] = op;
    else if (prev === OPERATION.DELETE)
      this.ops[index] = OPERATION.DELETE_AND_ADD;
    else if (prev === OPERATION.ADD && op === OPERATION.DELETE_AND_ADD) {
      this.ops[index] = OPERATION.DELETE_AND_ADD;
    }
    if (index < 32)
      this.dirtyLow |= 1 << index;
    else
      this.dirtyHigh |= 1 << index - 32;
  }
  recordDelete(index, op) {
    this.ops[index] = op;
    if (index < 32)
      this.dirtyLow |= 1 << index;
    else
      this.dirtyHigh |= 1 << index - 32;
  }
  recordRaw(index, op) {
    this.record(index, op);
  }
  operationAt(index) {
    const op = this.ops[index];
    return op === 0 ? void 0 : op;
  }
  setOperationAt(index, op) {
    this.ops[index] = op;
  }
  forEach(cb) {
    this.forEachWithCtx(cb, _invokeNoCtx$2);
  }
  forEachWithCtx(ctx, cb) {
    let low = this.dirtyLow;
    let high = this.dirtyHigh;
    const ops = this.ops;
    while (low !== 0) {
      const bit = low & -low;
      const fieldIndex = 31 - Math.clz32(bit);
      low ^= bit;
      cb(ctx, fieldIndex, ops[fieldIndex]);
    }
    while (high !== 0) {
      const bit = high & -high;
      const fieldIndex = 31 - Math.clz32(bit) + 32;
      high ^= bit;
      cb(ctx, fieldIndex, ops[fieldIndex]);
    }
  }
  size() {
    return popcount32(this.dirtyLow) + popcount32(this.dirtyHigh);
  }
  has() {
    return (this.dirtyLow | this.dirtyHigh) !== 0;
  }
  reset() {
    this.dirtyLow = 0;
    this.dirtyHigh = 0;
    this.ops.fill(0);
  }
};
var CollectionChangeRecorder = class {
  dirty = /* @__PURE__ */ new Map();
  pureOps = [];
  record(index, op) {
    const prev = this.dirty.get(index);
    if (prev === void 0)
      this.dirty.set(index, op);
    else if (prev === OPERATION.DELETE)
      this.dirty.set(index, OPERATION.DELETE_AND_ADD);
    else if (prev === OPERATION.ADD && op === OPERATION.DELETE_AND_ADD) {
      this.dirty.set(index, OPERATION.DELETE_AND_ADD);
    }
  }
  recordDelete(index, op) {
    this.dirty.set(index, op);
  }
  recordRaw(index, op) {
    this.dirty.set(index, op);
  }
  recordPure(op) {
    this.pureOps.push([this.dirty.size, op]);
  }
  operationAt(index) {
    return this.dirty.get(index);
  }
  setOperationAt(index, op) {
    if (this.dirty.has(index))
      this.dirty.set(index, op);
  }
  forEach(cb) {
    this.forEachWithCtx(cb, _invokeNoCtx$2);
  }
  forEachWithCtx(ctx, cb) {
    const pure = this.pureOps;
    if (pure.length > 0) {
      let pureIdx = 0, i = 0;
      for (const [index, op] of this.dirty) {
        while (pureIdx < pure.length && pure[pureIdx][0] <= i) {
          const pureOp = pure[pureIdx++][1];
          cb(ctx, -pureOp, pureOp);
        }
        cb(ctx, index, op);
        i++;
      }
      while (pureIdx < pure.length) {
        const pureOp = pure[pureIdx++][1];
        cb(ctx, -pureOp, pureOp);
      }
    } else {
      for (const [index, op] of this.dirty)
        cb(ctx, index, op);
    }
  }
  size() {
    return this.dirty.size + this.pureOps.length;
  }
  has() {
    return this.dirty.size > 0 || this.pureOps.length > 0;
  }
  reset() {
    this.dirty.clear();
    this.pureOps.length = 0;
  }
  shift(shiftIndex) {
    const dst = /* @__PURE__ */ new Map();
    for (const [idx, val] of this.dirty)
      dst.set(idx + shiftIndex, val);
    this.dirty = dst;
  }
};
function popcount32(n) {
  n = n - (n >>> 1 & 1431655765);
  n = (n & 858993459) + (n >>> 2 & 858993459);
  return (n + (n >>> 4) & 252645135) * 16843009 >>> 24;
}
function indexesToBitmask(indexes) {
  if (indexes === void 0)
    return 0;
  let bm = 0;
  for (let i = 0, len = indexes.length; i < len; i++) {
    const idx = indexes[i];
    if (idx < 32)
      bm |= 1 << idx;
  }
  return bm;
}
function buildFieldArrays(metadata) {
  const names = [];
  const types = [];
  const tags = [];
  const encoders = [];
  const numFields = metadata?.[$numFields];
  if (numFields === void 0)
    return { names, types, tags, encoders };
  const srcEncoders = metadata[$encoders];
  for (let i = 0; i <= numFields; i++) {
    const field = metadata[i];
    if (field === void 0) {
      names[i] = void 0;
      types[i] = void 0;
      tags[i] = void 0;
      encoders[i] = void 0;
      continue;
    }
    names[i] = field.name;
    types[i] = field.type;
    tags[i] = field.tag;
    encoders[i] = srcEncoders?.[i];
  }
  return { names, types, tags, encoders };
}
function getEncodeDescriptor(ref) {
  const ctor = ref.constructor;
  if (Object.prototype.hasOwnProperty.call(ctor, $encodeDescriptor)) {
    return ctor[$encodeDescriptor];
  }
  const metadata = ctor[Symbol.metadata];
  const isSchema = Metadata.isValidInstance(ref);
  const hasAnyView = (metadata?.[$viewFieldIndexes]?.length ?? 0) > 0;
  const arrays = buildFieldArrays(metadata);
  const filter = isSchema && !hasAnyView ? void 0 : ctor[$filter];
  const desc = {
    encoder: ctor[$encoder],
    filter,
    metadata,
    isSchema,
    filterBitmask: isSchema ? indexesToBitmask(metadata?.[$viewFieldIndexes]) : 0,
    hasAnyFullStateOnly: (metadata?.[$fullStateOnlyFieldIndexes]?.length ?? 0) > 0,
    hasAnyUnreliable: (metadata?.[$unreliableFieldIndexes]?.length ?? 0) > 0,
    hasAnyStream: (metadata?.[$streamFieldIndexes]?.length ?? 0) > 0,
    hasAnyView,
    fullStateOnlyBitmask: indexesToBitmask(metadata?.[$fullStateOnlyFieldIndexes]),
    unreliableBitmask: indexesToBitmask(metadata?.[$unreliableFieldIndexes]),
    streamBitmask: indexesToBitmask(metadata?.[$streamFieldIndexes]),
    names: arrays.names,
    types: arrays.types,
    tags: arrays.tags,
    encoders: arrays.encoders
  };
  Object.defineProperty(ctor, $encodeDescriptor, {
    value: desc,
    enumerable: false,
    writable: true,
    configurable: true
  });
  return desc;
}
function addParent(tree, parent, index) {
  if (tree.parentRef) {
    if (tree.parentRef[$changes] === parent[$changes]) {
      tree._parentIndex = index;
      return;
    }
    if (hasParent(tree, (p, _) => p[$changes] === parent[$changes])) {
      tree._parentIndex = index;
      return;
    }
  }
  if (tree.parentRef === void 0) {
    tree.parentRef = parent;
    tree._parentIndex = index;
  } else {
    tree.extraParents = {
      ref: tree.parentRef,
      index: tree._parentIndex,
      next: tree.extraParents
    };
    tree.parentRef = parent;
    tree._parentIndex = index;
  }
}
function setParentIndex(tree, parent, index) {
  if (tree.extraParents === void 0) {
    tree._parentIndex = index;
    return;
  }
  if (tree.parentRef[$changes] === parent[$changes]) {
    tree._parentIndex = index;
    return;
  }
  for (let entry = tree.extraParents; entry !== void 0; entry = entry.next) {
    if (entry.ref[$changes] === parent[$changes]) {
      entry.index = index;
      return;
    }
  }
}
function removeParent(tree, parent) {
  if (tree.parentRef && tree.parentRef[$changes] === parent[$changes]) {
    if (tree.extraParents) {
      tree.parentRef = tree.extraParents.ref;
      tree._parentIndex = tree.extraParents.index;
      tree.extraParents = tree.extraParents.next;
    } else {
      tree.parentRef = void 0;
      tree._parentIndex = void 0;
    }
    return true;
  }
  let current = tree.extraParents;
  let previous = null;
  while (current) {
    if (current.ref[$changes] === parent[$changes]) {
      if (previous) {
        previous.next = current.next;
      } else {
        tree.extraParents = current.next;
      }
      return true;
    }
    previous = current;
    current = current.next;
  }
  return tree.parentRef === void 0;
}
function findParent(tree, predicate) {
  if (tree.parentRef !== void 0 && predicate(tree.parentRef, tree._parentIndex)) {
    return { ref: tree.parentRef, index: tree._parentIndex };
  }
  for (let entry = tree.extraParents; entry !== void 0; entry = entry.next) {
    if (predicate(entry.ref, entry.index)) {
      return { ref: entry.ref, index: entry.index };
    }
  }
  return void 0;
}
function hasParent(tree, predicate) {
  if (tree.parentRef !== void 0 && predicate(tree.parentRef, tree._parentIndex)) {
    return true;
  }
  for (let entry = tree.extraParents; entry !== void 0; entry = entry.next) {
    if (predicate(entry.ref, entry.index)) {
      return true;
    }
  }
  return false;
}
function indexInParent(tree, parent) {
  if (tree.parentRef && tree.parentRef[$changes] === parent[$changes]) {
    return tree._parentIndex;
  }
  for (let entry = tree.extraParents; entry !== void 0; entry = entry.next) {
    if (entry.ref[$changes] === parent[$changes]) {
      return entry.index;
    }
  }
  return void 0;
}
function getAllParents(tree) {
  const parents = [];
  if (tree.parentRef) {
    parents.push({ ref: tree.parentRef, index: tree._parentIndex });
  }
  let current = tree.extraParents;
  while (current) {
    parents.push({ ref: current.ref, index: current.index });
    current = current.next;
  }
  return parents;
}
function isEdgeLive(tree, parentTree, index) {
  const target2 = parentTree.refTarget;
  if (parentTree.isArray) {
    const items = target2.items;
    const at2 = items[index];
    if (at2 !== void 0 && at2[$changes] === tree)
      return true;
    for (let i = 0, len = items.length; i < len; i++) {
      const v = items[i];
      if (v !== void 0 && v[$changes] === tree)
        return true;
    }
    return false;
  }
  const at = parentTree.getValue(index);
  return at !== void 0 && at[$changes] === tree;
}
var restageLiveCb = (tree, fieldIndex) => {
  if (tree.isFieldUnreliable(fieldIndex)) {
    tree.ensureUnreliableRecorder().record(fieldIndex, OPERATION.ADD);
  } else {
    tree.record(fieldIndex, OPERATION.ADD);
  }
};
var _invokeNoCtx$1 = (cb, index) => cb(index);
function forEachLive(tree, callback) {
  forEachLiveWithCtx(tree, callback, _invokeNoCtx$1);
}
function forEachLiveWithCtx(tree, ctx, cb) {
  const ref = tree.refTarget;
  if (ref[$childType] !== void 0) {
    if (tree.isPatchOnly)
      return;
    if (Array.isArray(ref.items)) {
      const items = ref.items;
      for (let i = 0, len = items.length; i < len; i++) {
        if (items[i] !== void 0)
          cb(ctx, i);
      }
    } else if (ref.journal !== void 0) {
      for (const [index, key] of ref.journal.keyByIndex) {
        if (ref.$items.has(key))
          cb(ctx, index);
      }
    } else if (ref.$items !== void 0) {
      for (const index of ref.$items.keys()) {
        cb(ctx, index);
      }
    }
  } else {
    const metadata = tree.metadata;
    if (!metadata)
      return;
    const numFields = metadata[$numFields] ?? -1;
    const skipIndexes = metadata[$fullSyncSkipIndexes];
    const names = tree.encDescriptor.names;
    for (let i = 0; i <= numFields; i++) {
      const name = names[i];
      if (name === void 0)
        continue;
      if (skipIndexes && skipIndexes.includes(i))
        continue;
      const value = ref[name];
      if (value !== void 0 && value !== null)
        cb(ctx, i);
    }
  }
}
function checkIsFiltered(tree, parent, parentIndex, _isNewChangeTree) {
  checkInheritedFlags(tree, parent, parentIndex);
  if (tree.isFullStateOnly)
    return;
  if (tree.has()) {
    tree.root?.enqueueChangeTree(tree);
  }
  if (tree.unreliableRecorder?.has()) {
    tree.root?.enqueueUnreliable(tree);
  }
  if (!tree.has() && !tree.unreliableRecorder?.has()) {
    tree.root?.enqueueChangeTree(tree);
  }
}
function checkInheritedFlags(tree, parent, parentIndex) {
  if (!parent) {
    return;
  }
  const parentChangeTree = parent[$changes];
  const parentIsCollection = !parentChangeTree._isSchema;
  let parentMetadata;
  if (parentIsCollection) {
    parent = parentChangeTree.parent;
    parentIndex = parentChangeTree.parentIndex;
    parentMetadata = parent?.[$changes].metadata;
  } else {
    parentMetadata = parentChangeTree.metadata;
  }
  const fieldBits = (parentMetadata?.[$patchOnlyFieldIndexes]?.includes(parentIndex) ? IS_PATCH_ONLY : 0) | (parentMetadata?.[$fullStateOnlyFieldIndexes]?.includes(parentIndex) ? IS_FULL_STATE_ONLY : 0);
  const inheritedBits = parentChangeTree.flags & INHERITABLE_FLAGS | fieldBits;
  const beforeFlags = tree.flags;
  tree.flags = beforeFlags | inheritedBits;
  const gainedBits = inheritedBits & ~beforeFlags;
  if (gainedBits & IS_FULL_STATE_ONLY) {
    tree.reset();
    tree.unreliableRecorder?.reset();
  }
  const types = tree.root?.types;
  if (!types?.hasFilters)
    return;
  const fieldHasViewTag = parentMetadata?.[$viewFieldIndexes]?.includes(parentIndex) ?? false;
  const fieldHasStream = parentMetadata?.[$streamFieldIndexes]?.includes(parentIndex) ?? false;
  const newFiltered = parentChangeTree.isFiltered || fieldHasViewTag || fieldHasStream;
  tree.isFiltered = newFiltered;
  if (fieldHasStream && !parentIsCollection) {
    tree.isStreamCollection = true;
    const state = ensureStreamState(tree.ref);
    if (state.priority === void 0) {
      const declared = Metadata.getStreamPriority(parentMetadata, parentIndex);
      if (declared !== void 0)
        state.priority = declared;
    }
    tree.root?.registerStream(tree.ref);
  }
  if (newFiltered) {
    const sharesEligible = _sharesEligible(tree);
    tree.isVisibilitySharedWithParent = parentChangeTree.isFiltered && sharesEligible && !fieldHasStream && (!fieldHasViewTag || parentIsCollection && parentMetadata[parentIndex].tag !== DEFAULT_VIEW_TAG);
  }
}
function drainFilterRefresh(root) {
  const list = root.pendingFilterRefresh;
  for (let i = 0; i < list.length; i++) {
    const tree = list[i];
    if ((tree.flags & PENDING_FILTER_REFRESH) === 0)
      continue;
    refreshFilterState(tree);
  }
  list.length = 0;
}
function _sharesEligible(tree) {
  return tree._isSchema || typeof tree.refTarget[$childType] !== "string";
}
function refreshFilterState(tree) {
  tree.flags &= ~PENDING_FILTER_REFRESH;
  const root = tree.root;
  if (root === void 0 || tree.parentRef === void 0)
    return;
  const sharesEligible = _sharesEligible(tree);
  let bits = _edgeBits(tree, tree.parentRef, tree._parentIndex, sharesEligible);
  for (let e = tree.extraParents; e !== void 0 && bits !== EDGE_SATURATED; e = e.next) {
    bits |= _edgeBits(tree, e.ref, e.index, sharesEligible);
  }
  if (bits === 0)
    return;
  tree.isVisibilitySharedWithParent = (bits & EDGE_SHARES) !== 0;
  const newFiltered = (bits & EDGE_PUBLIC) === 0;
  if (newFiltered === tree.isFiltered)
    return;
  tree.isFiltered = newFiltered;
  if (!newFiltered && !tree.isFullStateOnly) {
    tree.forEachLiveWithCtx(tree, restageLiveCb);
    if (tree.has())
      root.enqueueChangeTree(tree);
    if (tree.unreliableRecorder?.has())
      root.enqueueUnreliable(tree);
  }
  tree.forEachChildWithCtx(tree, _cascadeRefreshCb);
}
var EDGE_LIVE = 1;
var EDGE_PUBLIC = 2;
var EDGE_SHARES = 4;
var EDGE_SATURATED = EDGE_LIVE | EDGE_PUBLIC | EDGE_SHARES;
function _edgeBits(tree, parentRef, index, sharesEligible) {
  const parentTree = parentRef[$changes];
  if (parentTree.root !== tree.root || !isEdgeLive(tree, parentTree, index))
    return 0;
  if (parentTree.flags & PENDING_FILTER_REFRESH)
    refreshFilterState(parentTree);
  let bits = EDGE_LIVE;
  if (parentTree._isSchema) {
    const marked = parentTree.encDescriptor.tags[index] !== void 0 || parentTree.isFieldStream(index);
    if (!marked) {
      if (!parentTree.isFiltered)
        bits |= EDGE_PUBLIC;
      else if (sharesEligible)
        bits |= EDGE_SHARES;
    }
  } else if (!parentTree.isFiltered) {
    bits |= EDGE_PUBLIC;
  } else if (sharesEligible && !parentTree.isStreamCollection) {
    const gp = parentTree.parent?.[$changes];
    const tag = gp?._isSchema ? gp.encDescriptor.tags[parentTree.parentIndex] : void 0;
    if (tag !== DEFAULT_VIEW_TAG)
      bits |= EDGE_SHARES;
  }
  return bits;
}
var _cascadeRefreshCb = (_parentTree, child, _index) => {
  refreshFilterState(child);
};
function propagateNewChildToSubscribers(parentTree, childIndex, childRef, root) {
  const subs = parentTree.subscribedViews;
  if (subs === void 0)
    return;
  const isStream = parentTree.isStreamCollection;
  const streamable = isStream ? parentTree.ref : void 0;
  const childTree = isStream ? void 0 : childRef[$changes];
  for (let slot = 0, n = subs.length; slot < n; slot++) {
    let bits = subs[slot];
    while (bits !== 0) {
      const bit = bits & -bits;
      bits ^= bit;
      const viewId = slot * 32 + (31 - Math.clz32(bit));
      const weakRef = root.activeViews.get(viewId);
      const view2 = weakRef?.deref();
      if (view2 === void 0) {
        subs[slot] &= ~bit;
        continue;
      }
      if (isStream) {
        streamEnqueueForView(streamable, viewId, childIndex);
      } else if (childTree !== void 0) {
        view2.markVisible(childTree);
      }
    }
  }
}
function setRoot(tree, root) {
  tree.root = root;
  const isNewChangeTree = root.add(tree);
  checkIsFiltered(tree, tree.parent, tree.parentIndex);
  if (isNewChangeTree) {
    forEachChildWithCtx(tree, root, _setRootChildCb);
  }
}
function setParent(tree, parent, root, parentIndex) {
  tree.addParent(parent, parentIndex);
  if (!root) {
    return;
  }
  const isNewChangeTree = root.add(tree);
  if (root !== tree.root) {
    tree.root = root;
    checkIsFiltered(tree, parent, parentIndex);
  }
  const parentTree = parent?.[$changes];
  if (parentTree !== void 0 && parentTree.subscribedViews !== void 0 && // Collection check: `$childType` on the ref identifies Array/Map/
  // Set/Collection/Stream. Schema-field parents don't have it.
  parent[$childType] !== void 0) {
    propagateNewChildToSubscribers(parentTree, parentIndex, tree.ref, root);
  }
  if (isNewChangeTree) {
    let ctx = _setParentCtxPool[_setParentDepth];
    if (ctx === void 0) {
      ctx = { parentRef: void 0, root: void 0 };
      _setParentCtxPool[_setParentDepth] = ctx;
    }
    ctx.parentRef = tree.ref;
    ctx.root = root;
    _setParentDepth++;
    forEachChildWithCtx(tree, ctx, _setParentChildCb);
    _setParentDepth--;
  }
}
function forEachChild(tree, callback) {
  forEachChildWithCtx(tree, callback, _forEachChildTrampoline);
}
function _forEachChildTrampoline(cb, change, at) {
  cb(change, at);
}
function forEachChildWithCtx(tree, ctx, callback) {
  const ref = tree.refTarget;
  if (ref[$childType]) {
    if (typeof ref[$childType] !== "string") {
      const items = ref.items;
      if (items !== void 0) {
        for (let i = 0, len = items.length; i < len; i++) {
          const value = items[i];
          if (!value) {
            continue;
          }
          callback(ctx, value[$changes], i);
        }
      } else {
        const $items = ref.$items;
        const collectionIndexes = ref._collectionIndexes;
        for (const key of $items.keys()) {
          const value = $items.get(key);
          if (!value) {
            continue;
          }
          callback(ctx, value[$changes], collectionIndexes?.[key] ?? key);
        }
      }
    }
  } else {
    const metadata = tree.metadata;
    const indexes = metadata?.[$refTypeFieldIndexes];
    if (!indexes)
      return;
    const names = tree.encDescriptor.names;
    for (let i = 0, len = indexes.length; i < len; i++) {
      const index = indexes[i];
      const value = ref[names[index]];
      if (!value) {
        continue;
      }
      callback(ctx, value[$changes], index);
    }
  }
}
function _setRootChildCb(root, child, _index) {
  if (child.root !== root) {
    child.setRoot(root);
  } else {
    root.add(child);
  }
}
var _setParentCtxPool = [];
var _setParentDepth = 0;
function _setParentChildCb(ctx, child, index) {
  if (child.root === ctx.root) {
    ctx.root.add(child);
    ctx.root.moveNextToParent(child);
    return;
  }
  child.setParent(ctx.parentRef, ctx.root, index);
}
function readInlineOpByte(low, high, index) {
  const shift = (index & 3) << 3;
  return index < 4 ? low >>> shift & 255 : high >>> shift & 255;
}
var _invokeNoCtx = (cb, index, op) => cb(index, op);
function createChangeTreeList() {
  return { next: void 0, tail: void 0, nextPosition: 0 };
}
var IS_FILTERED = 1;
var IS_VISIBILITY_SHARED = 2;
var IS_NEW = 4;
var IS_UNRELIABLE = 8;
var IS_PATCH_ONLY = 16;
var IS_FULL_STATE_ONLY = 32;
var IS_STREAM_COLLECTION = 64;
var NEEDS_RESTAGE = 128;
var PENDING_FILTER_REFRESH = 256;
var INHERITABLE_FLAGS = IS_PATCH_ONLY | IS_FULL_STATE_ONLY;
var ChangeTree = class {
  ref;
  /**
   * Non-Proxy target of `ref` for encoder hot-path reads. For
   * `ArraySchema`, `ref` is the Proxy users interact with; every property
   * access on it runs through the `get` trap (even for symbol keys, which
   * fall through to `Reflect.get` — one extra hop per lookup). The encoder
   * loop reads `[$getByIndex]`, `[$childType]`, `.items`, `.tmpItems` at
   * high frequency during `encode()` / `encodeAll()`; going through
   * `refTarget` skips all of those traps.
   *
   * For non-proxied types (Schema, MapSchema, SetSchema, CollectionSchema,
   * StreamSchema), `refTarget === ref`. Consumers that need the user-
   * facing identity (debug output, callback parents) keep using `ref`.
   */
  refTarget;
  /**
   * True when `ref` is an ArraySchema — the only proxied type, so its
   * user-facing identity differs from `refTarget`. Canonical predicate for
   * "is this tree's ref an array" without probing `ref` (which would hit
   * the Proxy trap) — two monomorphic loads on the tree itself.
   */
  get isArray() {
    return this.refTarget !== this.ref;
  }
  metadata;
  /**
   * Per-class cache of encoder fn / filter fn / isSchema / metadata /
   * per-field arrays, looked up once at construction. The encode loop reads
   * `tree.encDescriptor` and never touches `ref.constructor` again. See
   * EncodeDescriptor.ts.
   */
  encDescriptor;
  root;
  // Inline single parent (the common case)
  parentRef;
  _parentIndex;
  extraParents;
  // linked list for 2nd+ parents (rare: instance sharing)
  // Packed boolean flags. See IS_* constants above for bit layout.
  flags = IS_NEW;
  /**
   * Per-walk visit stamp written by `Encoder.encodeFullSync`'s DFS. A
   * tree is considered "already visited by the current walk" iff
   * `tree._fullSyncGen === ctx.gen` — the encoder bumps its generation
   * counter once per walk, then stamps each tree with that value on
   * first visit; any later encounter of the same tree (shared refs
   * reachable through multiple parents) short-circuits on the equality
   * check instead of recursing again.
   */
  _fullSyncGen = 0;
  // Schema vs Collection discriminator. Set once in ctor, never changes —
  // per-tree-stable branch for inline ChangeRecorder dispatch.
  _isSchema = false;
  // Inline reliable SchemaChangeRecorder state (valid only if _isSchema).
  dirtyLow = 0;
  dirtyHigh = 0;
  // Inline ops for Schemas with ≤8 fields (4 op-bytes per number).
  // When `ops` is set (>8 fields), reads/writes go through the Uint8Array.
  opsLow = 0;
  opsHigh = 0;
  ops;
  // Inline reliable CollectionChangeRecorder state (valid only if !_isSchema).
  // `collDirty` is allocated in the ctor. `collPureOps` stays undefined
  // until the first CLEAR/REVERSE (most workloads never hit this).
  collDirty;
  collPureOps;
  // Lazy-allocated unreliable-channel recorder (rare — opt-in via @unreliable).
  unreliableRecorder;
  // When true, mutations on the ref are NOT tracked. See pause/resume/untracked.
  paused = false;
  changesNode;
  // Root.changes linked-list node
  unreliableChangesNode;
  // Root.unreliableChanges linked-list node
  // Per-StateView visibility bitmaps. Bit `(viewId & 31)` in slot
  // `(viewId >> 5)` is set iff the view can see this tree. Replaces
  // per-view WeakSet lookups with direct bitwise ops.
  // Lazy: undefined until the tree participates in any view.
  visibleViews;
  // Per-(view, tag) bitmap, indexed by tag. Custom tags only —
  // DEFAULT_VIEW_TAG visibility lives in `visibleViews`.
  tagViews;
  /**
   * Per-view subscription bitmap — same layout as `visibleViews`. Set by
   * `StateView.subscribe(collection)` to mark the view as persistently
   * interested in this collection's contents. When a new child is
   * attached to a subscribed collection (setParent hook), it's
   * auto-propagated to every subscribed view (force-shipped for
   * Array/Map/Set/Collection; enqueued into per-view pending for
   * streams). Undefined until the first subscribe.
   */
  subscribedViews;
  // Accessor properties for flags
  get isFiltered() {
    return (this.flags & IS_FILTERED) !== 0;
  }
  set isFiltered(v) {
    this.flags = v ? this.flags | IS_FILTERED : this.flags & ~IS_FILTERED;
  }
  get isVisibilitySharedWithParent() {
    return (this.flags & IS_VISIBILITY_SHARED) !== 0;
  }
  set isVisibilitySharedWithParent(v) {
    this.flags = v ? this.flags | IS_VISIBILITY_SHARED : this.flags & ~IS_VISIBILITY_SHARED;
  }
  get isNew() {
    return (this.flags & IS_NEW) !== 0;
  }
  set isNew(v) {
    this.flags = v ? this.flags | IS_NEW : this.flags & ~IS_NEW;
  }
  get isUnreliable() {
    return (this.flags & IS_UNRELIABLE) !== 0;
  }
  set isUnreliable(v) {
    this.flags = v ? this.flags | IS_UNRELIABLE : this.flags & ~IS_UNRELIABLE;
  }
  get isPatchOnly() {
    return (this.flags & IS_PATCH_ONLY) !== 0;
  }
  set isPatchOnly(v) {
    this.flags = v ? this.flags | IS_PATCH_ONLY : this.flags & ~IS_PATCH_ONLY;
  }
  get isFullStateOnly() {
    return (this.flags & IS_FULL_STATE_ONLY) !== 0;
  }
  set isFullStateOnly(v) {
    this.flags = v ? this.flags | IS_FULL_STATE_ONLY : this.flags & ~IS_FULL_STATE_ONLY;
  }
  get isStreamCollection() {
    return (this.flags & IS_STREAM_COLLECTION) !== 0;
  }
  set isStreamCollection(v) {
    this.flags = v ? this.flags | IS_STREAM_COLLECTION : this.flags & ~IS_STREAM_COLLECTION;
  }
  get needsRestage() {
    return (this.flags & NEEDS_RESTAGE) !== 0;
  }
  set needsRestage(v) {
    this.flags = v ? this.flags | NEEDS_RESTAGE : this.flags & ~NEEDS_RESTAGE;
  }
  // True iff tree inherits `isFiltered` OR its Schema class declares any
  // @view-tagged fields. StateView.addParentOf uses this to decide whether
  // a parent must be included in a view's bootstrap. Reads the class-level
  // "any viewed field" flag that `EncodeDescriptor` precomputes — same
  // pattern as `hasAnyFullStateOnly` / `hasAnyUnreliable` / `hasAnyStream`.
  get hasFilteredFields() {
    return this.isFiltered || this.encDescriptor.hasAnyView;
  }
  ensureUnreliableRecorder() {
    if (this.unreliableRecorder === void 0) {
      this.unreliableRecorder = this._isSchema ? new SchemaChangeRecorder(this.metadata?.[$numFields] ?? 0) : new CollectionChangeRecorder();
    }
    return this.unreliableRecorder;
  }
  isFieldUnreliable(index) {
    const desc = this.encDescriptor;
    if (!desc.hasAnyUnreliable)
      return false;
    if (index < 32)
      return (desc.unreliableBitmask & 1 << index) !== 0;
    return Metadata.hasUnreliableAtIndex(this.metadata, index);
  }
  // @static fields sync once via full-sync; post-init mutations are ignored
  // by the tracker (the value still lives on the instance).
  isFieldFullStateOnly(index) {
    if (this.isFullStateOnly)
      return true;
    const desc = this.encDescriptor;
    if (!desc.hasAnyFullStateOnly)
      return false;
    if (index < 32)
      return (desc.fullStateOnlyBitmask & 1 << index) !== 0;
    return Metadata.hasFullStateOnlyAtIndex(this.metadata, index);
  }
  // `t.stream(...)` collection fields — encoded via per-view priority/budget
  // gate instead of emitting all dirty ADDs in one tick. Class-level short
  // circuit avoids the metadata chase on schemas that carry no stream fields.
  isFieldStream(index) {
    const desc = this.encDescriptor;
    if (!desc.hasAnyStream)
      return false;
    if (index < 32)
      return (desc.streamBitmask & 1 << index) !== 0;
    return Metadata.hasStreamAtIndex(this.metadata, index);
  }
  constructor(ref, refTarget = ref) {
    this.ref = ref;
    this.refTarget = refTarget;
    const desc = getEncodeDescriptor(ref);
    this.encDescriptor = desc;
    this.metadata = desc.metadata;
    const isSchema = desc.isSchema;
    this._isSchema = isSchema;
    this.ops = void 0;
    this.collDirty = void 0;
    this.collPureOps = void 0;
    if (isSchema) {
      const numFields = this.metadata?.[$numFields] ?? 0;
      if (numFields > 7)
        this.ops = new Uint8Array(numFields + 1);
    } else {
      this.collDirty = /* @__PURE__ */ new Map();
    }
  }
  // ────────────────────────────────────────────────────────────────────
  // Inline ChangeRecorder implementation. Each method branches once on
  // `_isSchema` (per-tree-stable → predictable branch). Kills one
  // CollectionChangeRecorder+Map allocation per Collection tree.
  // ────────────────────────────────────────────────────────────────────
  // Schema-only helpers that own all inline-vs-array dispatch.
  _opAt(index) {
    const ops = this.ops;
    if (ops !== void 0)
      return ops[index];
    const shift = (index & 3) << 3;
    return index < 4 ? this.opsLow >>> shift & 255 : this.opsHigh >>> shift & 255;
  }
  _opPut(index, op) {
    const ops = this.ops;
    if (ops !== void 0) {
      ops[index] = op;
      return;
    }
    const shift = (index & 3) << 3;
    const mask = ~(255 << shift);
    if (index < 4)
      this.opsLow = this.opsLow & mask | op << shift;
    else
      this.opsHigh = this.opsHigh & mask | op << shift;
  }
  _markDirty(index) {
    if (index < 32)
      this.dirtyLow |= 1 << index;
    else
      this.dirtyHigh |= 1 << index - 32;
  }
  record(index, op) {
    if (this._isSchema) {
      const prev = this._opAt(index);
      if (prev === 0)
        this._opPut(index, op);
      else if (prev === OPERATION.DELETE)
        this._opPut(index, OPERATION.DELETE_AND_ADD);
      else if (prev === OPERATION.ADD && op === OPERATION.DELETE_AND_ADD) {
        this._opPut(index, OPERATION.DELETE_AND_ADD);
      }
      this._markDirty(index);
    } else {
      const dirty = this.collDirty;
      const prev = dirty.get(index);
      let finalOp;
      if (prev === void 0)
        finalOp = op;
      else if (prev === OPERATION.DELETE)
        finalOp = OPERATION.DELETE_AND_ADD;
      else if (prev === OPERATION.ADD && op === OPERATION.DELETE_AND_ADD)
        finalOp = OPERATION.DELETE_AND_ADD;
      else
        finalOp = prev;
      dirty.set(index, finalOp);
    }
  }
  recordDelete(index, op) {
    if (this._isSchema) {
      this._opPut(index, op);
      this._markDirty(index);
    } else {
      this.collDirty.set(index, op);
    }
  }
  recordRaw(index, op) {
    if (this._isSchema) {
      this._opPut(index, op);
      this._markDirty(index);
    } else {
      this.collDirty.set(index, op);
    }
  }
  recordPure(op) {
    if (this._isSchema) {
      throw new Error("ChangeTree (Schema): pure operations are not supported");
    }
    (this.collPureOps ??= []).push([this.collDirty.size, op]);
  }
  operationAt(index) {
    if (this._isSchema) {
      const op = this._opAt(index);
      return op === 0 ? void 0 : op;
    }
    return this.collDirty.get(index);
  }
  setOperationAt(index, op) {
    if (this._isSchema) {
      this._opPut(index, op);
    } else {
      const dirty = this.collDirty;
      if (dirty.has(index))
        dirty.set(index, op);
    }
  }
  // Cold-path delegate: all `forEach` callers are debug/dump utilities
  // (Schema.ts debug output, utils.ts change dump, discardAll in tests).
  // The hot encode loop uses `forEachWithCtx` directly. See ChangeRecorder.ts
  // for the same adapter pattern.
  forEach(cb) {
    this.forEachWithCtx(cb, _invokeNoCtx);
  }
  forEachWithCtx(ctx, cb) {
    if (this._isSchema) {
      let low = this.dirtyLow;
      let high = this.dirtyHigh;
      const ops = this.ops;
      if (ops !== void 0) {
        while (low !== 0) {
          const bit = low & -low;
          const fieldIndex = 31 - Math.clz32(bit);
          low ^= bit;
          cb(ctx, fieldIndex, ops[fieldIndex]);
        }
        while (high !== 0) {
          const bit = high & -high;
          const fieldIndex = 31 - Math.clz32(bit) + 32;
          high ^= bit;
          cb(ctx, fieldIndex, ops[fieldIndex]);
        }
      } else {
        const ol = this.opsLow;
        const oh = this.opsHigh;
        while (low !== 0) {
          const bit = low & -low;
          const fieldIndex = 31 - Math.clz32(bit);
          low ^= bit;
          cb(ctx, fieldIndex, readInlineOpByte(ol, oh, fieldIndex));
        }
      }
      return;
    }
    const dirty = this.collDirty;
    const pure = this.collPureOps;
    if (pure !== void 0 && pure.length > 0) {
      let pureIdx = 0, i = 0;
      for (const [index, op] of dirty) {
        while (pureIdx < pure.length && pure[pureIdx][0] <= i) {
          const pureOp = pure[pureIdx++][1];
          cb(ctx, -pureOp, pureOp);
        }
        cb(ctx, index, op);
        i++;
      }
      while (pureIdx < pure.length) {
        const pureOp = pure[pureIdx++][1];
        cb(ctx, -pureOp, pureOp);
      }
    } else {
      for (const [index, op] of dirty)
        cb(ctx, index, op);
    }
  }
  size() {
    if (this._isSchema)
      return popcount32(this.dirtyLow) + popcount32(this.dirtyHigh);
    return this.collDirty.size + (this.collPureOps?.length ?? 0);
  }
  has() {
    if (this._isSchema)
      return (this.dirtyLow | this.dirtyHigh) !== 0;
    return this.collDirty.size > 0 || this.collPureOps !== void 0 && this.collPureOps.length > 0;
  }
  reset() {
    if (this._isSchema) {
      this.dirtyLow = 0;
      this.dirtyHigh = 0;
      if (this.ops !== void 0)
        this.ops.fill(0);
      else {
        this.opsLow = 0;
        this.opsHigh = 0;
      }
      return;
    }
    this.collDirty.clear();
    if (this.collPureOps !== void 0)
      this.collPureOps.length = 0;
  }
  /**
   * Full reset to construction defaults so the owning ref can be returned to
   * a pool and reused for a different logical entity (see encoder/Pool.ts +
   * Schema.reset). Unlike `reset()` / `endEncode()` (which only clear the
   * dirty bucket for the next encode), this also drops parent links, queue
   * nodes and per-view bitmaps, and re-arms IS_NEW.
   *
   * Precondition: the tree must already be detached from the encoder
   * (`root === undefined`) — i.e. the ref was removed from its parent
   * collection/field, which `Root.remove` does before this runs.
   */
  recycle() {
    if (this.root !== void 0) {
      throw new Error(`@colyseus/schema: cannot recycle an attached ChangeTree (${this.ref?.constructor?.name}). Remove the instance from its parent collection before releasing it to a pool.`);
    }
    this.reset();
    this.unreliableRecorder?.reset();
    this.flags = IS_NEW | NEEDS_RESTAGE;
    this._fullSyncGen = 0;
    this.parentRef = void 0;
    this._parentIndex = void 0;
    this.extraParents = void 0;
    this.changesNode = void 0;
    this.unreliableChangesNode = void 0;
    this.paused = false;
    this.visibleViews = void 0;
    this.tagViews = void 0;
    this.subscribedViews = void 0;
  }
  /**
   * ArraySchema insert (unshift / splice with more inserts than deletes):
   * re-key pending ops at or above `at` by `+count`, then record ADDs for
   * the new items at indexes `at..at+count-1`.
   *
   * The rebuilt map's insertion order IS the wire order:
   *   1. ops below `at` — the insert doesn't move them, and an insert of
   *      their own must still be applied before this one (ascending);
   *   2. the new ADDs, ascending — the decoder splice-inserts each one,
   *      which only works lowest-index-first;
   *   3. the re-keyed ops, in their original relative order — their
   *      indexes now address the post-insert layout.
   * See ArraySchema#$setAt.
   */
  insertAt(at, count) {
    if (this._isSchema)
      throw new Error("ChangeTree (Schema): insertAt is not supported");
    const src2 = this.collDirty;
    const dst = /* @__PURE__ */ new Map();
    const track = !this.paused && !this.isFullStateOnly;
    if (at > 0) {
      for (const [idx, val] of src2)
        if (idx < at)
          dst.set(idx, val);
    }
    if (track) {
      for (let i = 0; i < count; i++)
        dst.set(at + i, OPERATION.ADD);
    }
    for (const [idx, val] of src2)
      if (idx >= at)
        dst.set(idx + count, val);
    this.collDirty = dst;
    if (track)
      this.root?.enqueueChangeTree(this);
  }
  /** ArraySchema#unshift(): insert `count` items at the head. */
  unshift(count) {
    this.insertAt(0, count);
  }
  // Tree attachment + child iteration — see ./changeTree/treeAttachment.ts.
  setRoot(root) {
    setRoot(this, root);
  }
  setParent(parent, root, parentIndex) {
    setParent(this, parent, root, parentIndex);
  }
  forEachChild(cb) {
    forEachChild(this, cb);
  }
  forEachChildWithCtx(ctx, cb) {
    forEachChildWithCtx(this, ctx, cb);
  }
  forEachLive(cb) {
    forEachLive(this, cb);
  }
  forEachLiveWithCtx(ctx, cb) {
    forEachLiveWithCtx(this, ctx, cb);
  }
  operation(op) {
    if (this.paused || this.isFullStateOnly)
      return;
    this.recordPure(op);
    this.root?.enqueueChangeTree(this);
  }
  /**
   * Route a field-level mutation to the reliable or unreliable channel
   * and enqueue into the matching queue. Shared by `change` and
   * `indexedOperation`; `raw=true` bypasses DELETE→ADD merge
   * (ArraySchema positional writes), `raw=false` merges inside `record`.
   *
   * Note: record() on both channels handles DELETE→ADD merge internally,
   * so callers do not need to pre-compute the merged op.
   *
   * `@unreliable` is decoration-time-validated to apply only to primitive
   * fields (see annotations.ts), so the per-field unreliable flag here
   * always means "primitive value updates" — the structural-ADD-routes-
   * reliable footgun for ref-type fields can't reach this code path.
   *
   * `!isNew` holds an `@unreliable` field on the RELIABLE channel until this
   * tree's own ADD has shipped there. A decoder can only apply a field write
   * to a ref it already knows, so a value emitted before the ADD is dropped —
   * permanently, if the field is never written again. `isNew` clears in
   * `endEncode()`, i.e. after a reliable pass, and recording reliably is
   * itself what enqueues the tree for that pass; the state is self-clearing
   * and no tree can be stranded on the wrong channel. Mirrors `encodeAll`,
   * which has always seeded these fields for late joiners.
   *
   * Ordering matters: `isFieldUnreliable` short-circuits on the class-level
   * `hasAnyUnreliable`, so schemas without the modifier never read `flags`.
   */
  _routeAndRecord(index, op, raw) {
    if (this.paused || this.isFieldFullStateOnly(index))
      return;
    if (this.isFieldUnreliable(index) && !this.isNew) {
      const r = this.ensureUnreliableRecorder();
      if (raw)
        r.recordRaw(index, op);
      else
        r.record(index, op);
      this.root?.enqueueUnreliable(this);
      return;
    }
    if (raw)
      this.recordRaw(index, op);
    else
      this.record(index, op);
    this.root?.enqueueChangeTree(this);
  }
  change(index, operation = OPERATION.ADD) {
    this._routeAndRecord(index, operation, false);
  }
  indexedOperation(index, operation) {
    this._routeAndRecord(index, operation, true);
  }
  getChange(index) {
    return this.operationAt(index);
  }
  // ────────────────────────────────────────────────────────────────────
  // Change-tracking control API
  // ────────────────────────────────────────────────────────────────────
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
  }
  untracked(fn) {
    const wasPaused = this.paused;
    this.paused = true;
    try {
      return fn();
    } finally {
      this.paused = wasPaused;
    }
  }
  // Manually mark a field dirty for the next encode(). Useful after a
  // paused mutation or a nested mutation that bypassed the setter.
  markDirty(index, operation = OPERATION.ADD) {
    const wasPaused = this.paused;
    this.paused = false;
    try {
      this.change(index, operation);
    } finally {
      this.paused = wasPaused;
    }
  }
  // used during `.encode()` — `isEncodeAll` is only consumed by ArraySchema.
  // Reads via `refTarget` so ArraySchema's Proxy trap is bypassed on the
  // hot per-field encode path.
  getValue(index, isEncodeAll = false) {
    return this.refTarget[$getByIndex](index, isEncodeAll);
  }
  delete(index, operation) {
    if (index === void 0) {
      try {
        throw new Error(`@colyseus/schema ${this.ref.constructor.name}: trying to delete non-existing index '${index}'`);
      } catch (e) {
        console.warn(e);
      }
      return;
    }
    if (this.paused || this.isFieldFullStateOnly(index))
      return this.getValue(index);
    const unreliable2 = this.isFieldUnreliable(index) && !this.isNew;
    if (unreliable2)
      this.ensureUnreliableRecorder().recordDelete(index, operation ?? OPERATION.DELETE);
    else
      this.recordDelete(index, operation ?? OPERATION.DELETE);
    const previousValue = this.getValue(index);
    if (previousValue && previousValue[$changes])
      this.root?.remove(previousValue[$changes]);
    if (unreliable2)
      this.root?.enqueueUnreliable(this);
    else
      this.root?.enqueueChangeTree(this);
    return previousValue;
  }
  // Clear the reliable dirty bucket after a reliable encode pass.
  endEncode() {
    this.reset();
    this.changesNode = void 0;
    if (!this._isSchema)
      this.refTarget[$onEncodeEnd]?.();
    this.isNew = false;
  }
  // Clear the unreliable dirty bucket after an unreliable encode pass.
  endEncodeUnreliable() {
    this.unreliableRecorder?.reset();
    this.unreliableChangesNode = void 0;
    if (!this._isSchema)
      this.refTarget[$onEncodeEnd]?.();
  }
  discard() {
    if (!this._isSchema)
      this.refTarget[$onEncodeEnd]?.();
    this.reset();
    this.unreliableRecorder?.reset();
  }
  // Recursively discard all changes on this + child structures. Tests only.
  discardAll() {
    const discardChild = (index) => {
      if (index < 0)
        return;
      const value = this.getValue(index);
      if (value && value[$changes])
        value[$changes].discardAll();
    };
    this.forEach(discardChild);
    this.unreliableRecorder?.forEach(discardChild);
    this.discard();
  }
  get changed() {
    return this.has() || (this.unreliableRecorder?.has() ?? false);
  }
  // ────────────────────────────────────────────────────────────────────
  // Parent chain — implementations in ./changeTree/parentChain.ts.
  // ────────────────────────────────────────────────────────────────────
  /** Immediate parent (primary). See `extraParents` for the 2nd+ chain. */
  get parent() {
    return this.parentRef;
  }
  get parentIndex() {
    return this._parentIndex;
  }
  addParent(parent, index) {
    addParent(this, parent, index);
  }
  /** Re-point an existing parent's cached index after the parent reindexed. */
  setParentIndex(parent, index) {
    setParentIndex(this, parent, index);
  }
  /** @returns true if parent was found and removed */
  removeParent(parent = this.parent) {
    return removeParent(this, parent);
  }
  findParent(predicate) {
    return findParent(this, predicate);
  }
  hasParent(predicate) {
    return hasParent(this, predicate);
  }
  /** Wire index this tree holds inside `parent`, or undefined if not a parent. */
  indexInParent(parent) {
    return indexInParent(this, parent);
  }
  getAllParents() {
    return getAllParents(this);
  }
};
var UntrackedChangeTree = class {
  ref;
  // Mirror the subset of ChangeTree state that decoder-path readers touch.
  // Everything else is deliberately undefined (matches the shape of a
  // freshly-constructed tree that never participated in a Root).
  root = void 0;
  parentRef = void 0;
  paused = false;
  isNew = false;
  flags = 0;
  constructor(ref) {
    this.ref = ref;
  }
  // Mutation surface — all no-ops.
  change() {
  }
  delete() {
  }
  indexedOperation() {
  }
  operation() {
  }
  setParent() {
  }
  addParent() {
  }
  setParentIndex() {
  }
  removeParent() {
    return false;
  }
  getChange() {
    return 0;
  }
  discard() {
  }
  discardAll() {
  }
  pause() {
  }
  resume() {
  }
  untracked(fn) {
    return fn();
  }
  markDirty() {
  }
  // Tree-walk surface. Mirrors `treeAttachment.forEachChild` so debug tools
  // and `ArraySchema.clear()` can still descend from a tracked root into
  // decoder-built subtrees and read each child's `$changes` (which is
  // itself an UntrackedChangeTree carrying the right `ref`).
  forEachChild(callback) {
    const ref = this.ref;
    if (ref[$childType]) {
      if (typeof ref[$childType] !== "string") {
        for (const [key, value] of ref.entries()) {
          if (!value)
            continue;
          callback(value[$changes], ref._collectionIndexes?.[key] ?? key);
        }
      }
      return;
    }
    const ctor = ref.constructor;
    const metadata = ctor?.[Symbol.metadata];
    if (!metadata)
      return;
    const refFieldIndexes = metadata[$refTypeFieldIndexes] ?? [];
    for (let i = 0; i < refFieldIndexes.length; i++) {
      const index = refFieldIndexes[i];
      const value = ref[metadata[index].name];
      if (!value)
        continue;
      callback(value[$changes], index);
    }
  }
  forEachChildWithCtx(ctx, callback) {
    this.forEachChild((change, at) => callback(ctx, change, at));
  }
  forEachLive() {
  }
  forEachLiveWithCtx() {
  }
  forEach() {
  }
};
function createUntrackedChangeTree(ref) {
  return new UntrackedChangeTree(ref);
}
function installUntrackedChangeTree(target2, publicRef = target2) {
  Object.defineProperty(target2, $changes, {
    value: createUntrackedChangeTree(publicRef),
    enumerable: false,
    writable: true
  });
}
function encodeValue(encoder, bytes, type, value, operation, it, encoderFn) {
  if (encoderFn !== void 0) {
    encoderFn(bytes, value, it);
  } else if (typeof type === "string") {
    encode[type]?.(bytes, value, it);
  } else if (type[Symbol.metadata] != null) {
    encode.number(bytes, value[$refId], it);
    if ((operation & OPERATION.ADD) === OPERATION.ADD) {
      encoder.tryEncodeTypeId(bytes, type, value.constructor, it);
    }
  } else {
    encode.number(bytes, value[$refId], it);
  }
}
var encodeSchemaOperation = function(encoder, bytes, changeTree, index, operation, it, _, __) {
  bytes[it.offset++] = (index | operation) & 255;
  if (operation === OPERATION.DELETE) {
    return;
  }
  const desc = changeTree.encDescriptor;
  const ref = changeTree.ref;
  const value = ref[$values][index] ?? ref[desc.names[index]];
  encodeValue(encoder, bytes, desc.types[index], value, operation, it, desc.encoders[index]);
};
var encodeMapEntry = function(encoder, bytes, changeTree, index, operation, it) {
  bytes[it.offset++] = operation & 255;
  encode.number(bytes, index, it);
  if (operation === OPERATION.DELETE)
    return;
  const ref = changeTree.ref;
  if ((operation & OPERATION.ADD) === OPERATION.ADD) {
    const dynamicIndex = ref["$indexes"].get(index);
    encode.string(bytes, dynamicIndex, it);
  }
  encodeValue(encoder, bytes, ref[$childType], ref[$getByIndex](index), operation, it);
};
var encodeIndexedEntry = function(encoder, bytes, changeTree, index, operation, it) {
  bytes[it.offset++] = operation & 255;
  encode.number(bytes, index, it);
  if (operation === OPERATION.DELETE)
    return;
  const ref = changeTree.ref;
  encodeValue(encoder, bytes, ref[$childType], ref[$getByIndex](index), operation, it);
};
var encodeArray = function(encoder, bytes, changeTree, field, operation, it, isEncodeAll, hasView) {
  const ref = changeTree.refTarget;
  const type = ref[$childType];
  const isSchemaChild = typeof type !== "string";
  const useOperationByRefId = hasView && changeTree.isFiltered && isSchemaChild;
  let refOrIndex;
  if (useOperationByRefId) {
    const item = ref.tmpItems[field];
    if (!item) {
      return;
    }
    refOrIndex = item[$refId];
    if (operation === OPERATION.DELETE) {
      operation = OPERATION.DELETE_BY_REFID;
    } else if ((operation & OPERATION.ADD) === OPERATION.ADD) {
      operation = OPERATION.ADD_BY_REFID;
    } else if ((operation & OPERATION.MOVE) === OPERATION.MOVE) {
      return;
    }
  } else if (operation === OPERATION.DELETE && isSchemaChild) {
    const item = ref.tmpItems[field];
    if (!item) {
      return;
    }
    refOrIndex = item[$refId];
    operation = OPERATION.DELETE_BY_REFID;
  } else {
    refOrIndex = field;
  }
  bytes[it.offset++] = operation & 255;
  encode.number(bytes, refOrIndex, it);
  if (operation === OPERATION.DELETE || operation === OPERATION.DELETE_BY_REFID) {
    return;
  }
  const value = ref[$getByIndex](field, isEncodeAll);
  encodeValue(encoder, bytes, type, value, operation, it);
};
function resyncTouchEntry(decoder2, ref, operation, identity, previousValue, value, allChanges) {
  const visited = decoder2.resyncVisited;
  let set = visited.get(decoder2.currentRefId);
  if (set === void 0) {
    visited.set(decoder2.currentRefId, set = /* @__PURE__ */ new Set());
  }
  set.add(identity);
  if (previousValue !== void 0 && operation === OPERATION.ADD && previousValue !== value) {
    const previousRefId = previousValue[$refId];
    if (previousRefId !== void 0) {
      decoder2.root.removeRef(previousRefId);
      allChanges?.push({
        ref,
        refId: decoder2.currentRefId,
        op: OPERATION.DELETE,
        dynamicIndex: identity,
        value: void 0,
        previousValue
      });
    }
  }
}
function resyncMarkPresent(decoder2, refId) {
  const visited = decoder2.resyncVisited;
  if (!visited.has(refId)) {
    visited.set(refId, /* @__PURE__ */ new Set());
  }
}
function resyncSweep(decoder2, allChanges) {
  if (decoder2.resyncDamaged) {
    console.warn("@colyseus/schema: resync sweep skipped \u2014 parts of the payload could not be decoded. Stale entries may persist until the next resync.");
    return;
  }
  sweepSchema(decoder2, decoder2.state, /* @__PURE__ */ new Set(), allChanges);
}
function sweepSchema(decoder2, ref, seen, allChanges) {
  const refId = ref[$refId];
  if (refId === void 0 || seen.has(refId)) {
    return;
  }
  seen.add(refId);
  const metadata = ref.constructor[Symbol.metadata];
  const refIndexes = metadata?.[$refTypeFieldIndexes];
  if (refIndexes === void 0) {
    return;
  }
  const patchOnly2 = metadata[$patchOnlyFieldIndexes];
  for (let i = 0; i < refIndexes.length; i++) {
    const fieldIndex = refIndexes[i];
    if (patchOnly2 !== void 0 && patchOnly2.includes(fieldIndex)) {
      continue;
    }
    const field = metadata[fieldIndex];
    const value = ref[field.name];
    if (!value) {
      continue;
    }
    if (Schema.is(field.type)) {
      sweepSchema(decoder2, value, seen, allChanges);
    } else {
      sweepCollection(decoder2, value, seen, allChanges);
    }
  }
}
function sweepCollection(decoder2, coll, seen, allChanges) {
  const tgt = coll[$proxyTarget] ?? coll;
  const refId = tgt[$refId];
  if (refId === void 0 || seen.has(refId)) {
    return;
  }
  seen.add(refId);
  const visited = decoder2.resyncVisited.get(refId);
  if (visited === void 0) {
    return;
  }
  const $root = decoder2.root;
  tgt[$resyncPrune](visited, (value, identity) => {
    allChanges?.push({
      ref: coll,
      refId,
      op: OPERATION.DELETE,
      dynamicIndex: identity,
      value: void 0,
      previousValue: value
    });
    const childRefId = value?.[$refId];
    if (childRefId !== void 0) {
      $root.removeRef(childRefId);
    }
  }, (value) => {
    if (Schema.isSchema(value)) {
      sweepSchema(decoder2, value, seen, allChanges);
    }
  });
}
var DEFINITION_MISMATCH = -1;
var CollectionKind = {
  Map: 1,
  Array: 2,
  Set: 3,
  Collection: 4,
  Stream: 5
};
function decodeValue(decoder2, operation, ref, index, previousValue, type, bytes, it, allChanges) {
  const $root = decoder2.root;
  let value;
  if ((operation & OPERATION.DELETE) === OPERATION.DELETE) {
    const previousRefId = previousValue?.[$refId];
    if (previousRefId !== void 0) {
      $root.removeRef(previousRefId);
    }
    if (operation !== OPERATION.DELETE_AND_ADD) {
      ref[$deleteByIndex](index);
    }
    value = void 0;
  }
  if (operation === OPERATION.DELETE) ;
  else if (typeof type === "string") {
    value = decode[type](bytes, it);
  } else if (isQuantizedType(type)) {
    value = decodeQuantized(type.quantized, bytes, it);
  } else if (Schema.is(type)) {
    const refId = decode.number(bytes, it);
    value = $root.refs.get(refId);
    if ((operation & OPERATION.ADD) === OPERATION.ADD) {
      const childType = decoder2.getInstanceType(bytes, it, type);
      if (!value) {
        value = decoder2.createInstanceOfType(childType);
      }
      $root.addRef(refId, value, value !== previousValue || // increment ref count if value has changed
      operation === OPERATION.DELETE_AND_ADD && value === previousValue);
    }
  } else {
    const typeDef = getType(Object.keys(type)[0]);
    const refId = decode.number(bytes, it);
    if (decoder2.resyncVisited !== null) {
      resyncMarkPresent(decoder2, refId);
    }
    const valueRef = $root.refs.has(refId) ? previousValue || $root.refs.get(refId) : typeDef.constructor.initializeForDecoder();
    value = valueRef.clone(true);
    value[$childType] = Object.values(type)[0];
    if (previousValue) {
      let previousRefId = previousValue[$refId];
      if (previousRefId !== void 0 && refId !== previousRefId) {
        if ((operation & OPERATION.DELETE) !== OPERATION.DELETE) {
          $root.removeRef(previousRefId);
        }
        const entries = previousValue.entries();
        let iter;
        while ((iter = entries.next()) && !iter.done) {
          const [key, value2] = iter.value;
          if (typeof value2 === "object") {
            previousRefId = value2[$refId];
          }
          allChanges?.push({
            ref: previousValue,
            refId: previousRefId,
            op: OPERATION.DELETE,
            field: key,
            value: void 0,
            previousValue: value2
          });
        }
      }
    }
    $root.addRef(refId, value, valueRef !== previousValue || operation === OPERATION.DELETE_AND_ADD && valueRef === previousValue);
  }
  return value;
}
var decodeSchemaOperation = function(decoder2, bytes, it, ref, allChanges) {
  const first_byte = bytes[it.offset++];
  const metadata = ref.constructor[Symbol.metadata];
  const operation = first_byte >> 6 << 6;
  const index = first_byte % (operation || 255);
  const field = metadata[index];
  if (field === void 0) {
    console.warn("@colyseus/schema: field not defined at", { index, ref: ref.constructor.name, metadata });
    return DEFINITION_MISMATCH;
  }
  const isDeprecated = field.deprecated === true;
  const previousValue = isDeprecated ? void 0 : ref[$getByIndex](index);
  const value = decodeValue(decoder2, operation, ref, index, previousValue, field.type, bytes, it, allChanges);
  if (isDeprecated) {
    return;
  }
  if (value !== null && value !== void 0) {
    ref[field.name] = value;
  }
  if (previousValue !== value) {
    allChanges?.push({
      ref,
      refId: decoder2.currentRefId,
      op: operation,
      field: field.name,
      value,
      previousValue
    });
  }
};
var decodeKeyValueOperation = function(decoder2, bytes, it, ref, allChanges) {
  const tgt = ref[$proxyTarget] ?? ref;
  const operation = bytes[it.offset++];
  if (operation === OPERATION.CLEAR) {
    decoder2.removeChildRefs(tgt, allChanges);
    tgt.clear();
    return;
  }
  const index = decode.number(bytes, it);
  const type = tgt[$childType];
  const kind = tgt.constructor.COLLECTION_KIND;
  let dynamicIndex;
  if ((operation & OPERATION.ADD) === OPERATION.ADD) {
    if (kind === CollectionKind.Map) {
      dynamicIndex = decode.string(bytes, it);
      tgt.setIndex(index, dynamicIndex);
    } else {
      dynamicIndex = index;
    }
  } else {
    dynamicIndex = tgt.getIndex(index);
  }
  const previousValue = tgt[$getByIndex](index);
  const value = decodeValue(decoder2, operation, ref, index, previousValue, type, bytes, it, allChanges);
  if (decoder2.resyncVisited !== null) {
    resyncTouchEntry(decoder2, ref, operation, dynamicIndex, previousValue, value, allChanges);
  }
  if (value !== null && value !== void 0) {
    switch (kind) {
      case CollectionKind.Map:
        tgt.$items.set(dynamicIndex, value);
        break;
      case CollectionKind.Array:
        tgt.$setAt(index, value, decoder2.resyncVisited !== null && operation === OPERATION.ADD ? OPERATION.REPLACE : operation);
        break;
      // SetSchema / CollectionSchema / StreamSchema — use the wire-
      // index we decoded above so server/client `$items` stay in sync
      // regardless of duplicate emission (e.g. a bootstrap that walks
      // both `encodeAll` and the shared recorder emits the same ADD
      // op twice). Previous implementation called `ref.add(value)`
      // and let the decoder-side `$refId++` allocate a new index per
      // call — which for CollectionSchema (no value-dedup) turned
      // duplicate wire ADDs into duplicate client-side entries.
      case CollectionKind.Set:
      case CollectionKind.Collection:
      case CollectionKind.Stream:
        if (!tgt.$items.has(index)) {
          tgt.$items.set(index, value);
          if (typeof tgt.$refId === "number" && index >= tgt.$refId) {
            tgt.$refId = index + 1;
          }
        }
        break;
      default:
        console.warn(`@colyseus/schema: missing COLLECTION_KIND on ${tgt.constructor?.name} \u2014 item at index ${index} was not stored.`);
        break;
    }
  }
  if (previousValue !== value) {
    allChanges?.push({
      ref,
      refId: decoder2.currentRefId,
      op: operation,
      dynamicIndex,
      value,
      previousValue
    });
  }
};
var decodeArray = function(decoder2, bytes, it, ref, allChanges) {
  const tgt = ref[$proxyTarget] ?? ref;
  let operation = bytes[it.offset++];
  let index;
  if (operation === OPERATION.CLEAR) {
    decoder2.removeChildRefs(tgt, allChanges);
    tgt.clear();
    return;
  } else if (operation === OPERATION.REVERSE) {
    tgt.items.reverse();
    return;
  } else if (operation === OPERATION.DELETE_BY_REFID) {
    const refId = decode.number(bytes, it);
    const previousValue2 = decoder2.root.refs.get(refId);
    if (previousValue2 === void 0) {
      return;
    }
    decoder2.root.removeRef(refId);
    index = tgt.findIndex((value2) => value2 === previousValue2);
    if (index === -1) {
      return;
    }
    tgt[$deleteByIndex](index);
    allChanges?.push({
      ref,
      refId: decoder2.currentRefId,
      op: OPERATION.DELETE,
      dynamicIndex: index,
      value: void 0,
      previousValue: previousValue2
    });
    return;
  } else if (operation === OPERATION.ADD_BY_REFID) {
    const refId = decode.number(bytes, it);
    const itemByRefId = decoder2.root.refs.get(refId);
    if (itemByRefId) {
      index = tgt.findIndex((value2) => value2 === itemByRefId);
    }
    if (index === -1 || index === void 0) {
      index = tgt.length;
    }
  } else {
    index = decode.number(bytes, it);
  }
  const type = tgt[$childType];
  let dynamicIndex = index;
  const previousValue = tgt.items[index];
  const value = decodeValue(decoder2, operation, ref, index, previousValue, type, bytes, it, allChanges);
  if (decoder2.resyncVisited !== null) {
    resyncTouchEntry(decoder2, ref, operation, index, previousValue, value, allChanges);
  }
  if (value !== null && value !== void 0 && value !== previousValue) {
    tgt.$setAt(index, value, decoder2.resyncVisited !== null && operation === OPERATION.ADD ? OPERATION.REPLACE : operation);
  }
  if (previousValue !== value) {
    allChanges?.push({
      ref,
      refId: decoder2.currentRefId,
      op: operation,
      dynamicIndex,
      value,
      previousValue
    });
  }
};
var EncodeSchemaError = class extends Error {
};
function assertInstanceType(value, type, instance, field) {
  if (!(value instanceof type)) {
    throw new EncodeSchemaError(`a '${type.name}' was expected, but '${value && value.constructor.name}' was provided in ${instance.constructor.name}#${field}`);
  }
}
var DEFAULT_SORT = (a, b) => {
  const A = a.toString();
  const B = b.toString();
  if (A < B)
    return -1;
  else if (A > B)
    return 1;
  else
    return 0;
};
var ARRAY_PROXY_HANDLER = {
  get: (obj, prop) => {
    if (typeof prop !== "symbol" && // FIXME: d8 accuses this as low performance
    !isNaN(prop)) {
      return obj.items[prop];
    }
    return Reflect.get(obj, prop);
  },
  set: (obj, key, setValue) => {
    if (typeof key !== "symbol" && !isNaN(key)) {
      if (setValue === void 0 || setValue === null) {
        obj.$deleteAt(key);
      } else {
        let wireIndex;
        if (setValue[$changes]) {
          assertInstanceType(setValue, obj[$childType], obj, key);
          const previousValue = obj.items[key];
          if (!obj.isMovingItems) {
            wireIndex = obj.$changeAt(Number(key), setValue);
          } else {
            wireIndex = obj.$wireIndex(Number(key));
            if (previousValue !== void 0) {
              if (setValue[$changes].isNew) {
                obj[$changes].indexedOperation(wireIndex, OPERATION.MOVE_AND_ADD);
              } else {
                if ((obj[$changes].getChange(wireIndex) & OPERATION.DELETE) === OPERATION.DELETE) {
                  obj[$changes].indexedOperation(wireIndex, OPERATION.DELETE_AND_MOVE);
                } else {
                  obj[$changes].indexedOperation(wireIndex, OPERATION.MOVE);
                }
              }
            } else if (setValue[$changes].isNew) {
              obj[$changes].indexedOperation(wireIndex, OPERATION.ADD);
            }
            setValue[$changes].setParent(obj, obj[$changes].root, wireIndex);
          }
          if (previousValue !== void 0) {
            previousValue[$changes].root?.remove(previousValue[$changes]);
          }
        } else {
          wireIndex = obj.$changeAt(Number(key), setValue);
        }
        obj.items[key] = setValue;
        if (wireIndex !== void 0) {
          obj.tmpItems[wireIndex] = setValue;
        }
      }
      return true;
    }
    return Reflect.set(obj, key, setValue);
  },
  deleteProperty: (obj, prop) => {
    if (typeof prop === "number") {
      obj.$deleteAt(prop);
    } else {
      delete obj[prop];
    }
    return true;
  },
  has: (obj, key) => {
    if (typeof key !== "symbol" && !isNaN(Number(key))) {
      return Reflect.has(obj.items, key);
    }
    return Reflect.has(obj, key);
  }
};
var ArraySchema = class _ArraySchema {
  [$changes];
  [$refId];
  [$proxyTarget];
  [$childType];
  items = [];
  tmpItems = [];
  deletedIndexes = [];
  isMovingItems = false;
  /** Decode-side: `items` has holes (delete or gap-write) — `$onDecodeEnd` must compact. */
  _needsCompaction = false;
  static [$encoder] = encodeArray;
  static [$decoder] = decodeArray;
  /** Integer tag read by `decodeKeyValueOperation` — see `CollectionKind`. */
  static COLLECTION_KIND = CollectionKind.Array;
  /**
   * Determine if a property must be filtered.
   * - If returns false, the property is NOT going to be encoded.
   * - If returns true, the property is going to be encoded.
   *
   * Encoding with "filters" happens in two steps:
   * - First, the encoder iterates over all "not owned" properties and encodes them.
   * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
   */
  static [$filter](ref, index, view2) {
    if (!view2)
      return true;
    const self2 = ref[$proxyTarget] ?? ref;
    return typeof self2[$childType] === "string" || view2.isChangeTreeVisible(self2["tmpItems"][index]?.[$changes]);
  }
  static is(type) {
    return (
      // type format: ["string"]
      Array.isArray(type) || // type format: { array: "string" }
      type["array"] !== void 0
    );
  }
  static from(iterable) {
    return new _ArraySchema(...Array.from(iterable));
  }
  constructor(...items) {
    this[$childType] = void 0;
    this[$proxyTarget] = this;
    const proxy = new Proxy(this, ARRAY_PROXY_HANDLER);
    Object.defineProperty(this, $changes, {
      value: new ChangeTree(proxy, this),
      enumerable: false,
      writable: true
    });
    if (items.length > 0) {
      this.push(...items);
    }
    return proxy;
  }
  /**
   * Decoder-side factory. Skips the `ChangeTree` allocation and
   * replicates the class-field initializers by hand (since `Object.create`
   * bypasses them). Must stay in sync with the class-field declarations
   * and the constructor body above.
   *
   * Pass the Proxy to `installUntrackedChangeTree` as the public identity
   * so children set their parent to the Proxy, not the raw target.
   */
  static initializeForDecoder() {
    const self2 = Object.create(_ArraySchema.prototype);
    self2.items = [];
    self2.isMovingItems = false;
    self2._needsCompaction = false;
    self2[$childType] = void 0;
    self2[$proxyTarget] = self2;
    const proxy = new Proxy(self2, ARRAY_PROXY_HANDLER);
    installUntrackedChangeTree(self2, proxy);
    return proxy;
  }
  set length(newLength) {
    if (newLength === 0) {
      this.clear();
    } else if (newLength < this.items.length) {
      this.splice(newLength, this.length - newLength);
    } else {
      console.warn("ArraySchema: can't set .length to a higher value than its length.");
    }
  }
  get length() {
    return this.items.length;
  }
  // ────── Change tracking control (same API as Schema) ──────
  pauseTracking() {
    this[$changes].pause();
  }
  resumeTracking() {
    this[$changes].resume();
  }
  untracked(fn) {
    return this[$changes].untracked(fn);
  }
  get isTrackingPaused() {
    return this[$changes].paused;
  }
  push(...values) {
    const self2 = this[$proxyTarget];
    const items = self2.items;
    const tmpItems = self2.tmpItems;
    const changeTree = self2[$changes];
    const childType = self2[$childType];
    let length = tmpItems.length;
    for (let i = 0, l = values.length; i < l; i++, length++) {
      const value = values[i];
      if (value === void 0 || value === null) {
        return;
      } else if (typeof value === "object" && childType) {
        assertInstanceType(value, childType, self2, i);
      }
      changeTree.indexedOperation(length, OPERATION.ADD);
      items.push(value);
      tmpItems.push(value);
      value[$changes]?.setParent(this, changeTree.root, length);
    }
    return length;
  }
  /**
   * Removes the last element from an array and returns it.
   */
  pop() {
    const self2 = this[$proxyTarget];
    const tmpItems = self2.tmpItems;
    const deletedIndexes = self2.deletedIndexes;
    let index = -1;
    for (let i = tmpItems.length - 1; i >= 0; i--) {
      if (deletedIndexes[i] !== true) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      return void 0;
    }
    self2[$changes].delete(index);
    deletedIndexes[index] = true;
    return self2.items.pop();
  }
  at(index) {
    if (index < 0)
      index += this.length;
    return this.items[index];
  }
  /**
   * items-index → wire (tmpItems) index. Identity while no deletions are
   * staged this tick; otherwise maps to the index-th live (non-deleted)
   * tmpItems slot — the same live-index walk `splice()` uses. Without the
   * translation, index writes recorded after a same-tick `shift()`/`splice()`
   * land on the wrong wire slots.
   */
  $wireIndex(index) {
    const deletedIndexes = this.deletedIndexes;
    if (deletedIndexes.length === 0) {
      return index;
    }
    const tmpItems = this.tmpItems;
    let live = 0;
    for (let i = 0; i < tmpItems.length; i++) {
      if (deletedIndexes[i] !== true) {
        if (live === index) {
          return i;
        }
        live++;
      }
    }
    return tmpItems.length + (index - live);
  }
  /**
   * Re-point children at their wire slot. `ChangeTree._parentIndex` caches
   * the slot a child holds in `tmpItems`, and StateView addresses per-view
   * ADD/DELETE with it — so a reorder that leaves it behind aims those ops
   * at whichever element inherited the slot (issue #231).
   *
   * The filter check is a correctness boundary, not a tunable: StateView is
   * the only reader and reaches the index only through a filtered array
   * (`addParentOf` bails on `hasFilteredFields`, `remove` on the child's
   * `isFiltered`). Everything else stops at the flag read instead of walking
   * its children every tick.
   *
   * Callers name the lowest slot that moved as `from`. Compaction cannot, so
   * it hands over the pre-compaction layout as `staged` and the unchanged
   * prefix is skipped instead. Either way tail churn walks nothing.
   */
  $reindexChildren(from, staged) {
    if (!this[$changes].hasFilteredFields) {
      return;
    }
    if (typeof this[$childType] === "string") {
      return;
    }
    const tmpItems = this.tmpItems;
    const length = tmpItems.length;
    if (staged !== void 0) {
      while (from < length && tmpItems[from] === staged[from]) {
        from++;
      }
    }
    for (let i = from; i < length; i++) {
      tmpItems[i]?.[$changes]?.setParentIndex(this, i);
    }
  }
  // encoding only. Returns the wire index the change was recorded at
  // (undefined when nothing was recorded).
  $changeAt(index, value) {
    if (value === void 0 || value === null) {
      console.error("ArraySchema items cannot be null nor undefined; Use `splice(index, 1)` instead.");
      return void 0;
    }
    if (this.items[index] === value) {
      return void 0;
    }
    const operation = this.items[index] !== void 0 ? typeof value === "object" ? OPERATION.DELETE_AND_ADD : OPERATION.REPLACE : OPERATION.ADD;
    const wireIndex = this.$wireIndex(index);
    const changeTree = this[$changes];
    changeTree.change(wireIndex, operation);
    value[$changes]?.setParent(this, changeTree.root, wireIndex);
    return wireIndex;
  }
  // encoding only
  $deleteAt(index, operation) {
    this[$changes].delete(this.$wireIndex(index), operation);
  }
  // decoding only
  $setAt(index, value, operation) {
    if (operation === OPERATION.ADD && this.items[index] !== void 0) {
      this.items.splice(index, 0, value);
    } else if (operation === OPERATION.DELETE_AND_MOVE) {
      this.items.splice(index, 1);
      this.items[index] = value;
    } else {
      if (index > this.items.length) {
        this._needsCompaction = true;
      }
      this.items[index] = value;
    }
  }
  clear() {
    const self2 = this[$proxyTarget];
    if (self2.items.length === 0) {
      return;
    }
    const changeTree = self2[$changes];
    changeTree.forEachChild((childChangeTree, _) => {
      changeTree.root?.remove(childChangeTree);
    });
    changeTree.discard();
    changeTree.operation(OPERATION.CLEAR);
    self2.items.length = 0;
    self2.tmpItems.length = 0;
  }
  /**
   * Pool reset: empty this array and recycle its ChangeTree WITHOUT recording
   * any wire op (the parent field's ADD/DELETE owns the wire). Recurses into
   * ref-type children. Called by Schema.reset when a pooled entity has an
   * array field. The instance must already be detached from the encoder.
   */
  [$reset]() {
    const self2 = this[$proxyTarget] ?? this;
    const changeTree = self2[$changes];
    if (changeTree.isStreamCollection) {
      throw new Error(`@colyseus/schema: cannot reset a streamed ArraySchema (pooling not supported).`);
    }
    const items = self2.items;
    for (let i = 0; i < items.length; i++)
      items[i]?.[$reset]?.();
    self2.items.length = 0;
    self2.tmpItems.length = 0;
    self2.deletedIndexes.length = 0;
    changeTree.recycle();
    self2[$refId] = void 0;
  }
  /**
   * Combines two or more arrays.
   * @param items Additional items to add to the end of array1.
   */
  // @ts-ignore
  concat(...items) {
    return new _ArraySchema(...this.items.concat(...items));
  }
  /**
   * Adds all the elements of an array separated by the specified separator string.
   * @param separator A string used to separate one element of an array from the next in the resulting String. If omitted, the array elements are separated with a comma.
   */
  join(separator) {
    return this.items.join(separator);
  }
  /**
   * Reverses the elements in an Array.
   */
  // @ts-ignore
  reverse() {
    const self2 = this[$proxyTarget];
    const changeTree = self2[$changes];
    if (changeTree.has() || self2.deletedIndexes.length > 0) {
      const reversed = self2.items.slice().reverse();
      this.clear();
      this.push(...reversed);
      return this;
    }
    changeTree.operation(OPERATION.REVERSE);
    self2.items.reverse();
    self2.tmpItems.reverse();
    self2.$reindexChildren(0);
    return this;
  }
  /**
   * Removes the first element from an array and returns it.
   */
  shift() {
    const self2 = this[$proxyTarget];
    const items = self2.items;
    if (items.length === 0) {
      return void 0;
    }
    const changeTree = self2[$changes];
    const deletedIndexes = self2.deletedIndexes;
    let index = 0;
    while (deletedIndexes[index] === true) {
      index++;
    }
    changeTree.delete(index, OPERATION.DELETE);
    deletedIndexes[index] = true;
    return items.shift();
  }
  /**
   * Returns a section of an array.
   * @param start The beginning of the specified portion of the array.
   * @param end The end of the specified portion of the array. This is exclusive of the element at the index 'end'.
   */
  slice(start, end) {
    const sliced = new _ArraySchema();
    sliced.push(...this.items.slice(start, end));
    return sliced;
  }
  /**
   * Sorts an array.
   * @param compareFn Function used to determine the order of the elements. It is expected to return
   * a negative value if first argument is less than second argument, zero if they're equal and a positive
   * value otherwise. If omitted, the elements are sorted in ascending, ASCII character order.
   * ```ts
   * [11,2,22,1].sort((a, b) => a - b)
   * ```
   */
  sort(compareFn = DEFAULT_SORT) {
    const self2 = this[$proxyTarget];
    self2.isMovingItems = true;
    const changeTree = self2[$changes];
    const sortedItems = self2.items.sort(compareFn);
    sortedItems.forEach((_, i) => changeTree.change(i, OPERATION.REPLACE));
    self2.tmpItems.sort(compareFn);
    self2.$reindexChildren(0);
    self2.isMovingItems = false;
    return this;
  }
  /**
   * Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.
   * @param start The zero-based location in the array from which to start removing elements.
   * @param deleteCount The number of elements to remove.
   * @param insertItems Elements to insert into the array in place of the deleted elements.
   */
  splice(start, deleteCount, ...insertItems) {
    const self2 = this[$proxyTarget];
    const changeTree = self2[$changes];
    const items = self2.items;
    const tmpItems = self2.tmpItems;
    const deletedIndexes = self2.deletedIndexes;
    const itemsLength = items.length;
    const tmpItemsLength = tmpItems.length;
    const insertCount = insertItems.length;
    const indexes = [];
    for (let i = 0; i < tmpItemsLength; i++) {
      if (deletedIndexes[i] !== true) {
        indexes.push(i);
      }
    }
    if (itemsLength > start) {
      if (deleteCount === void 0) {
        deleteCount = itemsLength - start;
      }
      for (let i = start; i < start + deleteCount; i++) {
        const index = indexes[i];
        changeTree.delete(index, OPERATION.DELETE);
        deletedIndexes[index] = true;
      }
    } else {
      deleteCount = 0;
    }
    if (insertCount > 0) {
      const base = indexes[start] ?? itemsLength;
      const reuse = Math.min(insertCount, deleteCount);
      for (let i = 0; i < reuse; i++) {
        const addIndex = base + i;
        changeTree.indexedOperation(addIndex, deletedIndexes[addIndex] ? OPERATION.DELETE_AND_ADD : OPERATION.ADD);
        tmpItems[addIndex] = insertItems[i];
        deletedIndexes[addIndex] = false;
        insertItems[i][$changes]?.setParent(this, changeTree.root, addIndex);
      }
      const extra = insertCount - reuse;
      if (extra > 0) {
        const at = base + reuse;
        changeTree.insertAt(at, extra);
        for (let i = 0; i < extra; i++) {
          insertItems[reuse + i][$changes]?.setParent(this, changeTree.root, at + i);
        }
        if (deletedIndexes.length > 0) {
          deletedIndexes.splice(at, 0, ...new Array(extra).fill(false));
        }
        tmpItems.splice(at, 0, ...insertItems.slice(reuse));
        self2.$reindexChildren(at + extra);
      }
    }
    changeTree.root?.enqueueChangeTree(changeTree);
    return items.splice(start, deleteCount, ...insertItems);
  }
  /**
   * Inserts new elements at the start of an array.
   * @param items  Elements to insert at the start of the Array.
   */
  unshift(...items) {
    const self2 = this[$proxyTarget];
    const changeTree = self2[$changes];
    changeTree.unshift(items.length);
    for (let i = 0; i < items.length; i++) {
      items[i]?.[$changes]?.setParent(this, changeTree.root, i);
    }
    const deletedIndexes = self2.deletedIndexes;
    if (deletedIndexes.length > 0) {
      deletedIndexes.unshift(...new Array(items.length).fill(false));
    }
    self2.tmpItems.unshift(...items);
    self2.$reindexChildren(items.length);
    return self2.items.unshift(...items);
  }
  /**
   * Returns the index of the first occurrence of a value in an array.
   * @param searchElement The value to locate in the array.
   * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at index 0.
   */
  indexOf(searchElement, fromIndex) {
    return this.items.indexOf(searchElement, fromIndex);
  }
  /**
   * Returns the index of the last occurrence of a specified value in an array.
   * @param searchElement The value to locate in the array.
   * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at the last index in the array.
   */
  lastIndexOf(searchElement, fromIndex = this.length - 1) {
    return this.items.lastIndexOf(searchElement, fromIndex);
  }
  every(callbackfn, thisArg) {
    return this.items.every(callbackfn, thisArg);
  }
  /**
   * Determines whether the specified callback function returns true for any element of an array.
   * @param callbackfn A function that accepts up to three arguments. The some method calls
   * the callbackfn function for each element in the array until the callbackfn returns a value
   * which is coercible to the Boolean value true, or until the end of the array.
   * @param thisArg An object to which the this keyword can refer in the callbackfn function.
   * If thisArg is omitted, undefined is used as the this value.
   */
  some(callbackfn, thisArg) {
    return this.items.some(callbackfn, thisArg);
  }
  /**
   * Performs the specified action for each element in an array.
   * @param callbackfn  A function that accepts up to three arguments. forEach calls the callbackfn function one time for each element in the array.
   * @param thisArg  An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
   */
  forEach(callbackfn, thisArg) {
    return this.items.forEach(callbackfn, thisArg);
  }
  /**
   * Calls a defined callback function on each element of an array, and returns an array that contains the results.
   * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.
   * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
   */
  map(callbackfn, thisArg) {
    return this.items.map(callbackfn, thisArg);
  }
  filter(callbackfn, thisArg) {
    return this.items.filter(callbackfn, thisArg);
  }
  /**
   * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
   * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
   * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
   */
  reduce(callbackfn, initialValue) {
    return this.items.reduce(callbackfn, initialValue);
  }
  /**
   * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
   * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.
   * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
   */
  reduceRight(callbackfn, initialValue) {
    return this.items.reduceRight(callbackfn, initialValue);
  }
  /**
   * Returns the value of the first element in the array where predicate is true, and undefined
   * otherwise.
   * @param predicate find calls predicate once for each element of the array, in ascending
   * order, until it finds one where predicate returns true. If such an element is found, find
   * immediately returns that element value. Otherwise, find returns undefined.
   * @param thisArg If provided, it will be used as the this value for each invocation of
   * predicate. If it is not provided, undefined is used instead.
   */
  find(predicate, thisArg) {
    return this.items.find(predicate, thisArg);
  }
  /**
   * Returns the index of the first element in the array where predicate is true, and -1
   * otherwise.
   * @param predicate find calls predicate once for each element of the array, in ascending
   * order, until it finds one where predicate returns true. If such an element is found,
   * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
   * @param thisArg If provided, it will be used as the this value for each invocation of
   * predicate. If it is not provided, undefined is used instead.
   */
  findIndex(predicate, thisArg) {
    return this.items.findIndex(predicate, thisArg);
  }
  /**
   * Returns the this object after filling the section identified by start and end with value
   * @param value value to fill array section with
   * @param start index to start filling the array at. If start is negative, it is treated as
   * length+start where length is the length of the array.
   * @param end index to stop filling the array at. If end is negative, it is treated as
   * length+end.
   */
  fill(value, start, end) {
    throw new Error("ArraySchema#fill() not implemented");
  }
  /**
   * Returns the this object after copying a section of the array identified by start and end
   * to the same array starting at position target
   * @param target If target is negative, it is treated as length+target where length is the
   * length of the array.
   * @param start If start is negative, it is treated as length+start. If end is negative, it
   * is treated as length+end.
   * @param end If not specified, length of the this object is used as its default value.
   */
  copyWithin(target2, start, end) {
    throw new Error("ArraySchema#copyWithin() not implemented");
  }
  /**
   * Returns a string representation of an array.
   */
  toString() {
    return this.items.toString();
  }
  /**
   * Returns a string representation of an array. The elements are converted to string using their toLocalString methods.
   */
  toLocaleString() {
    return this.items.toLocaleString();
  }
  /** Iterator */
  [Symbol.iterator]() {
    return this.items[Symbol.iterator]();
  }
  static get [Symbol.species]() {
    return _ArraySchema;
  }
  // WORKAROUND for compatibility
  // - TypeScript 4 defines @@unscopables as a function
  // - TypeScript 5 defines @@unscopables as an object
  [Symbol.unscopables];
  /**
   * Returns an iterable of key, value pairs for every entry in the array
   */
  entries() {
    return this.items.entries();
  }
  /**
   * Returns an iterable of keys in the array
   */
  keys() {
    return this.items.keys();
  }
  /**
   * Returns an iterable of values in the array
   */
  values() {
    return this.items.values();
  }
  /**
   * Determines whether an array includes a certain element, returning true or false as appropriate.
   * @param searchElement The element to search for.
   * @param fromIndex The position in this array at which to begin searching for searchElement.
   */
  includes(searchElement, fromIndex) {
    return this.items.includes(searchElement, fromIndex);
  }
  //
  // ES2022
  //
  /**
   * Calls a defined callback function on each element of an array. Then, flattens the result into
   * a new array.
   * This is identical to a map followed by flat with depth 1.
   *
   * @param callback A function that accepts up to three arguments. The flatMap method calls the
   * callback function one time for each element in the array.
   * @param thisArg An object to which the this keyword can refer in the callback function. If
   * thisArg is omitted, undefined is used as the this value.
   */
  // @ts-ignore
  flatMap(callback, thisArg) {
    throw new Error("ArraySchema#flatMap() is not supported.");
  }
  /**
   * Returns a new array with all sub-array elements concatenated into it recursively up to the
   * specified depth.
   *
   * @param depth The maximum recursion depth
   */
  // @ts-ignore
  flat(depth) {
    throw new Error("ArraySchema#flat() is not supported.");
  }
  findLast() {
    return this.items.findLast.apply(this.items, arguments);
  }
  findLastIndex(...args) {
    return this.items.findLastIndex.apply(this.items, arguments);
  }
  //
  // ES2023
  //
  with(index, value) {
    const copy2 = this.items.slice();
    if (index < 0)
      index += this.length;
    copy2[index] = value;
    return new _ArraySchema(...copy2);
  }
  toReversed() {
    return this.items.slice().reverse();
  }
  toSorted(compareFn) {
    return this.items.slice().sort(compareFn);
  }
  // @ts-ignore
  toSpliced(start, deleteCount, ...items) {
    return this.items.toSpliced.apply(copy, arguments);
  }
  shuffle() {
    return this.move((_) => {
      let currentIndex = this.items.length;
      while (currentIndex != 0) {
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [this[currentIndex], this[randomIndex]] = [this[randomIndex], this[currentIndex]];
      }
    });
  }
  /**
   * Allows to move items around in the array.
   *
   * Example:
   *     state.cards.move((cards) => {
   *         [cards[4], cards[3]] = [cards[3], cards[4]];
   *         [cards[3], cards[2]] = [cards[2], cards[3]];
   *         [cards[2], cards[0]] = [cards[0], cards[2]];
   *         [cards[1], cards[1]] = [cards[1], cards[1]];
   *         [cards[0], cards[0]] = [cards[0], cards[0]];
   *     })
   *
   * @param cb
   * @returns
   */
  move(cb) {
    this.isMovingItems = true;
    cb(this);
    this.isMovingItems = false;
    return this;
  }
  /**
   * Encoder-only. Reads the staged-snapshot (`tmpItems`) so the encoder can
   * resolve a wire-index even after the user has mutated `items` mid-tick.
   * The decoder reads `items[index]` directly — see `decodeArray` and
   * `$deleteByIndex` below.
   */
  [$getByIndex](index, isEncodeAll = false) {
    const self2 = this[$proxyTarget] ?? this;
    return isEncodeAll ? self2.items[index] : self2.deletedIndexes[index] ? self2.items[index] : self2.tmpItems[index] || self2.items[index];
  }
  [$deleteByIndex](index) {
    const self2 = this[$proxyTarget] ?? this;
    self2.items[index] = void 0;
    self2._needsCompaction = true;
  }
  [$onEncodeEnd]() {
    const staged = this.tmpItems;
    this.tmpItems = this.items.slice();
    if (this.deletedIndexes.length > 0) {
      this.$reindexChildren(0, staged);
      this.deletedIndexes.length = 0;
    }
  }
  [$onDecodeEnd]() {
    const self2 = this[$proxyTarget] ?? this;
    if (self2._needsCompaction) {
      self2._needsCompaction = false;
      self2.items = self2.items.filter((item) => item !== void 0);
    }
  }
  [$resyncPrune](visited, prune, keep) {
    const self2 = this[$proxyTarget] ?? this;
    const items = self2.items;
    let removed = false;
    for (let i = 0; i < items.length; i++) {
      const value = items[i];
      if (visited.has(i)) {
        keep(value);
        continue;
      }
      removed = true;
      prune(value, i);
      self2[$deleteByIndex](i);
    }
    if (removed) {
      self2[$onDecodeEnd]();
    }
  }
  toArray() {
    return this.items.slice(0);
  }
  toJSON() {
    return this.toArray().map((value) => {
      return typeof value["toJSON"] === "function" ? value["toJSON"]() : value;
    });
  }
  //
  // Decoding utilities
  //
  clone(isDecoding) {
    let cloned;
    if (isDecoding) {
      cloned = new _ArraySchema();
      cloned.push(...this.items);
    } else {
      cloned = new _ArraySchema(...this.map((item) => item[$changes] ? item.clone() : item));
    }
    return cloned;
  }
};
registerType("array", { constructor: ArraySchema });
var MapJournal = class {
  /** index → key (was MapSchema.$indexes). Used by encoder and decoder. */
  keyByIndex = /* @__PURE__ */ new Map();
  /**
   * key → index (was MapSchema._collectionIndexes — forward direction).
   * Server-only. Plain object so MapSchema can expose it via a getter
   * for backwards-compatible `_collectionIndexes?.[key]` access from
   * ChangeTree.forEachChild and similar polymorphic call sites.
   */
  indexByKey = {};
  /** Monotonic counter for assigning new indexes. Server-only. */
  nextIndex = 0;
  /**
   * Snapshot of values at the moment they were deleted. Lazy — only
   * allocated on first delete, since most maps are pure-grow and never
   * touch this. Used by `MapSchema[$filter]` to check view visibility
   * of a value that's already been removed from `$items` but whose
   * DELETE op is still in the encode queue.
   */
  snapshots;
  // ──────────────────────────────────────────────────────────────────
  // Server-side: recording mutations
  // ──────────────────────────────────────────────────────────────────
  /** Get the index assigned to a key, or undefined if never assigned. */
  indexOf(key) {
    const idx = this.indexByKey[key];
    return idx === void 0 ? void 0 : idx;
  }
  /** Assign and return a new wire index for an unseen key. */
  assign(key) {
    const index = this.nextIndex++;
    this.indexByKey[key] = index;
    this.keyByIndex.set(index, key);
    return index;
  }
  /** Stash a value at the moment it's deleted (for filter visibility checks). */
  snapshot(index, value) {
    (this.snapshots ??= /* @__PURE__ */ new Map()).set(index, value);
  }
  /** Discard a snapshot — called when a deleted slot is being re-set. */
  forgetSnapshot(index) {
    this.snapshots?.delete(index);
  }
  /** Look up a snapshot. Returns undefined if no DELETE is pending for this index. */
  snapshotAt(index) {
    return this.snapshots?.get(index);
  }
  // ──────────────────────────────────────────────────────────────────
  // Client-side (decoder): index↔key sync from the wire
  // ──────────────────────────────────────────────────────────────────
  /** Decoder calls this when it sees an ADD/DELETE_AND_ADD on the wire. */
  setIndex(index, key) {
    this.keyByIndex.set(index, key);
    this.indexByKey[key] = index;
  }
  // ──────────────────────────────────────────────────────────────────
  // Lookups (both sides)
  // ──────────────────────────────────────────────────────────────────
  /** Reverse lookup: wire index → key. */
  keyOf(index) {
    return this.keyByIndex.get(index);
  }
  // ──────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────
  /**
   * Called from MapSchema's $onEncodeEnd hook.
   * Cleans up index/key mappings for entries that were deleted in this tick.
   */
  cleanupAfterEncode() {
    if (this.snapshots === void 0)
      return;
    for (const [index] of this.snapshots) {
      const key = this.keyByIndex.get(index);
      if (key !== void 0) {
        delete this.indexByKey[key];
        this.keyByIndex.delete(index);
      }
    }
    this.snapshots.clear();
  }
  /** Reset everything (called on .clear()). */
  reset() {
    this.indexByKey = {};
    this.keyByIndex.clear();
    this.snapshots?.clear();
    this.nextIndex = 0;
  }
};
var MapSchema = class _MapSchema {
  [$changes];
  [$refId];
  childType;
  [$childType];
  $items = /* @__PURE__ */ new Map();
  /**
   * Wire-protocol identity + change-tracking metadata for this map.
   *
   * Owns: index↔key mapping, monotonic index counter, snapshots of removed
   * values for filter visibility checks. Replaces what used to live as three
   * separate fields on this class ($indexes, _collectionIndexes, deletedItems).
   */
  journal = new MapJournal();
  /**
   * Streamable state — lazily allocated by `inheritedFlags` (or the
   * `maxPerTick` setter) when streaming actually activates. `undefined`
   * on every non-streaming MapSchema so the common case pays zero
   * Map/Set allocation. Single slot → hidden-class shape stays stable
   * across streaming and non-streaming instances.
   */
  _stream;
  /** Max ADD ops emitted per tick per view. Ignored outside streaming mode. */
  get maxPerTick() {
    return this._stream?.maxPerTick ?? 32;
  }
  set maxPerTick(n) {
    (this._stream ??= createStreamableState()).maxPerTick = n;
  }
  /**
   * Per-view priority callback for `.stream()` maps. Initialized from the
   * schema declaration (`t.map(X).stream().priority(fn)` or `@type({ map,
   * priority })`); assigning here overrides for this instance. Only fires
   * during `encodeView` — broadcast mode drains FIFO.
   */
  get priority() {
    return this._stream?.priority;
  }
  set priority(fn) {
    (this._stream ??= createStreamableState()).priority = fn;
  }
  /** Backwards-compat alias for `journal.keyByIndex`. */
  get $indexes() {
    return this.journal.keyByIndex;
  }
  /**
   * Backwards-compat alias for `journal.indexByKey`. Plain object so
   * polymorphic call sites like `ref._collectionIndexes?.[key]` keep working.
   */
  get _collectionIndexes() {
    return this.journal.indexByKey;
  }
  static [$encoder] = encodeMapEntry;
  static [$decoder] = decodeKeyValueOperation;
  /** Integer tag read by `decodeKeyValueOperation` — see `CollectionKind`. */
  static COLLECTION_KIND = CollectionKind.Map;
  /**
   * Determine if a property must be filtered.
   * - If returns false, the property is NOT going to be encoded.
   * - If returns true, the property is going to be encoded.
   *
   * Encoding with "filters" happens in two steps:
   * - First, the encoder iterates over all "not owned" properties and encodes them.
   * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
   */
  static [$filter](ref, index, view2) {
    if (!view2 || typeof ref[$childType] === "string")
      return true;
    const value = ref[$getByIndex](index) ?? ref.journal.snapshotAt(index);
    return view2.isChangeTreeVisible(value[$changes]);
  }
  static is(type) {
    return type["map"] !== void 0;
  }
  constructor(initialValues) {
    Object.defineProperty(this, $changes, {
      value: new ChangeTree(this),
      enumerable: false,
      writable: true
    });
    this[$childType] = void 0;
    if (initialValues) {
      if (initialValues instanceof Map || initialValues instanceof _MapSchema) {
        initialValues.forEach((v, k) => this.set(k, v));
      } else {
        for (const k in initialValues) {
          this.set(k, initialValues[k]);
        }
      }
    }
  }
  /**
   * Decoder-side factory. Skips the tracking `ChangeTree` allocation;
   * `Object.create` also bypasses the class-field initializers, so we
   * replicate the minimum slot init here. Must stay in sync with the
   * class-field declarations above and with the constructor body.
   */
  static initializeForDecoder() {
    const self2 = Object.create(_MapSchema.prototype);
    self2.$items = /* @__PURE__ */ new Map();
    self2.journal = new MapJournal();
    self2[$childType] = void 0;
    installUntrackedChangeTree(self2);
    return self2;
  }
  /** Iterator */
  [Symbol.iterator]() {
    return this.$items[Symbol.iterator]();
  }
  get [Symbol.toStringTag]() {
    return this.$items[Symbol.toStringTag];
  }
  static get [Symbol.species]() {
    return _MapSchema;
  }
  set(key, value) {
    if (value === void 0 || value === null) {
      throw new Error(`MapSchema#set('${key}', ${value}): trying to set ${value} value on '${key}'.`);
    } else if (typeof value === "object" && this[$childType]) {
      assertInstanceType(value, this[$childType], this, key);
    }
    key = key.toString();
    const changeTree = this[$changes];
    const isRef = value[$changes] !== void 0;
    const journal = this.journal;
    let index = journal.indexOf(key);
    let operation;
    if (index !== void 0) {
      operation = OPERATION.REPLACE;
      const previousValue = this.$items.get(key);
      if (previousValue === value) {
        return;
      } else if (isRef) {
        operation = OPERATION.DELETE_AND_ADD;
        if (previousValue !== void 0) {
          previousValue[$changes].root?.remove(previousValue[$changes]);
        }
      }
      if (journal.snapshotAt(index) !== void 0) {
        journal.forgetSnapshot(index);
      }
    } else {
      index = journal.assign(key);
      operation = OPERATION.ADD;
    }
    this.$items.set(key, value);
    if (operation === OPERATION.ADD && changeTree.isStreamCollection) {
      if (changeTree.root !== void 0) {
        streamRouteAdd(this, changeTree.root, index);
      }
    } else {
      changeTree.change(index, operation);
    }
    if (isRef) {
      value[$changes].setParent(this, changeTree.root, index);
    }
    return this;
  }
  get(key) {
    return this.$items.get(key);
  }
  /**
   * Returns the value for `key` if present. Otherwise inserts `defaultValue`
   * (tracked as an ADD change, like `set()`) and returns it.
   *
   * Mirrors `Map.prototype.getOrInsert` (TC39 "upsert" proposal, typed in
   * TypeScript 6's standard library).
   */
  getOrInsert(key, defaultValue) {
    if (this.$items.has(key)) {
      return this.$items.get(key);
    }
    this.set(key, defaultValue);
    return defaultValue;
  }
  /**
   * Returns the value for `key` if present. Otherwise computes a value via
   * `callbackfn(key)`, inserts it (tracked as an ADD change, like `set()`)
   * and returns it. The callback is only invoked when the key is missing.
   *
   * Mirrors `Map.prototype.getOrInsertComputed` (TC39 "upsert" proposal,
   * typed in TypeScript 6's standard library).
   */
  getOrInsertComputed(key, callbackfn) {
    if (this.$items.has(key)) {
      return this.$items.get(key);
    }
    const value = callbackfn(key);
    this.set(key, value);
    return value;
  }
  delete(key) {
    if (!this.$items.has(key)) {
      return false;
    }
    const index = this.journal.indexOf(key);
    const previousValue = this.$items.get(key);
    const changeTree = this[$changes];
    if (changeTree.isStreamCollection) {
      const root = changeTree.root;
      let neverSent = false;
      if (root !== void 0) {
        neverSent = streamRouteRemove(this, root, this[$refId], index);
      }
      if (previousValue?.[$changes] !== void 0) {
        root?.remove(previousValue[$changes]);
      }
      this.$items.delete(key);
      if (!neverSent)
        this.journal.snapshot(index, previousValue);
      return true;
    }
    this.journal.snapshot(index, previousValue);
    changeTree.delete(index);
    return this.$items.delete(key);
  }
  clear() {
    const changeTree = this[$changes];
    changeTree.discard();
    changeTree.forEachChild((childChangeTree, _) => {
      changeTree.root?.remove(childChangeTree);
    });
    this.journal.reset();
    this.$items.clear();
    changeTree.operation(OPERATION.CLEAR);
  }
  /**
   * Pool reset: empty this map and recycle its ChangeTree WITHOUT recording
   * any wire op (the parent field's ADD/DELETE owns the wire). Recurses into
   * ref-type children. Called by Schema.reset when a pooled entity has a
   * map field. The instance must already be detached from the encoder.
   */
  [$reset]() {
    const changeTree = this[$changes];
    if (changeTree.isStreamCollection) {
      throw new Error(`@colyseus/schema: cannot reset a streamed MapSchema (pooling not supported).`);
    }
    this.$items.forEach((value) => value?.[$reset]?.());
    this.$items.clear();
    this.journal.reset();
    changeTree.recycle();
    this[$refId] = void 0;
  }
  has(key) {
    return this.$items.has(key);
  }
  forEach(callbackfn) {
    this.$items.forEach(callbackfn);
  }
  entries() {
    return this.$items.entries();
  }
  keys() {
    return this.$items.keys();
  }
  values() {
    return this.$items.values();
  }
  get size() {
    return this.$items.size;
  }
  // ────── Change tracking control (same API as Schema) ──────
  pauseTracking() {
    this[$changes].pause();
  }
  resumeTracking() {
    this[$changes].resume();
  }
  untracked(fn) {
    return this[$changes].untracked(fn);
  }
  get isTrackingPaused() {
    return this[$changes].paused;
  }
  setIndex(index, key) {
    this.journal.setIndex(index, key);
  }
  getIndex(index) {
    return this.journal.keyOf(index);
  }
  [$getByIndex](index) {
    const key = this.journal.keyOf(index);
    return key !== void 0 ? this.$items.get(key) : void 0;
  }
  [$deleteByIndex](index) {
    const key = this.journal.keyOf(index);
    if (key !== void 0) {
      this.$items.delete(key);
      this.journal.keyByIndex.delete(index);
    }
  }
  [$resyncPrune](visited, prune, keep) {
    let deletedKeys = null;
    this.$items.forEach((value, key) => {
      if (visited.has(key)) {
        keep(value);
        return;
      }
      (deletedKeys ??= /* @__PURE__ */ new Set()).add(key);
      prune(value, key);
    });
    if (deletedKeys !== null) {
      deletedKeys.forEach((key) => {
        this.$items.delete(key);
        delete this.journal.indexByKey[key];
      });
      const staleIndexes = [];
      this.journal.keyByIndex.forEach((key, index) => {
        if (deletedKeys.has(key)) {
          staleIndexes.push(index);
        }
      });
      for (let i = 0; i < staleIndexes.length; i++) {
        this.journal.keyByIndex.delete(staleIndexes[i]);
      }
    }
  }
  [$onEncodeEnd]() {
    this.journal.cleanupAfterEncode();
  }
  // ─── Streamable interface (Encoder priority / broadcast pass) ──────
  _dropView(viewId) {
    streamDropView(this, viewId);
  }
  _unregister() {
  }
  toJSON() {
    const map = {};
    this.forEach((value, key) => {
      map[key] = typeof value["toJSON"] === "function" ? value["toJSON"]() : value;
    });
    return map;
  }
  //
  // Decoding utilities
  //
  // @ts-ignore
  clone(isDecoding) {
    let cloned;
    if (isDecoding) {
      cloned = Object.assign(new _MapSchema(), this);
    } else {
      cloned = new _MapSchema();
      this.forEach((value, key) => {
        if (value[$changes]) {
          cloned.set(key, value["clone"]());
        } else {
          cloned.set(key, value);
        }
      });
    }
    return cloned;
  }
};
registerType("map", { constructor: MapSchema });
var CollectionSchema = class _CollectionSchema {
  [$changes];
  [$refId];
  [$childType];
  /** The user-visible data, keyed directly by the wire-protocol index. */
  $items = /* @__PURE__ */ new Map();
  /** Snapshots of values that were deleted this tick (for filter visibility). */
  deletedItems = {};
  /** Monotonic counter for assigning indexes to newly-added items. */
  $refId = 0;
  /**
   * Streamable state — lazily allocated when the field is opted into
   * streaming via `t.collection(X).stream()`. See MapSchema for the
   * same pattern / rationale.
   */
  _stream;
  get maxPerTick() {
    return this._stream?.maxPerTick ?? 32;
  }
  set maxPerTick(n) {
    (this._stream ??= createStreamableState()).maxPerTick = n;
  }
  get priority() {
    return this._stream?.priority;
  }
  set priority(fn) {
    (this._stream ??= createStreamableState()).priority = fn;
  }
  static [$encoder] = encodeIndexedEntry;
  static [$decoder] = decodeKeyValueOperation;
  /** Integer tag read by `decodeKeyValueOperation` — see `CollectionKind`. */
  static COLLECTION_KIND = CollectionKind.Collection;
  /**
   * Determine if a property must be filtered.
   * - If returns false, the property is NOT going to be encoded.
   * - If returns true, the property is going to be encoded.
   *
   * Encoding with "filters" happens in two steps:
   * - First, the encoder iterates over all "not owned" properties and encodes them.
   * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
   */
  static [$filter](ref, index, view2) {
    return !view2 || typeof ref[$childType] === "string" || view2.isChangeTreeVisible((ref[$getByIndex](index) ?? ref.deletedItems[index])[$changes]);
  }
  static is(type) {
    return type["collection"] !== void 0;
  }
  constructor(initialValues) {
    Object.defineProperty(this, $changes, {
      value: new ChangeTree(this),
      enumerable: false,
      writable: true
    });
    this[$childType] = void 0;
    if (initialValues) {
      initialValues.forEach((v) => this.add(v));
    }
  }
  /**
   * Decoder-side factory. Skips the tracking `ChangeTree` allocation;
   * `Object.create` also bypasses the class-field initializers, so we
   * replicate the minimum slot init here. Must stay in sync with the
   * class-field declarations above.
   */
  static initializeForDecoder() {
    const self2 = Object.create(_CollectionSchema.prototype);
    self2.$items = /* @__PURE__ */ new Map();
    self2.deletedItems = {};
    self2.$refId = 0;
    self2[$childType] = void 0;
    installUntrackedChangeTree(self2);
    return self2;
  }
  add(value) {
    const index = this.$refId++;
    const changeTree = this[$changes];
    const isRef = value[$changes] !== void 0;
    if (isRef) {
      value[$changes].setParent(this, changeTree.root, index);
    }
    this.$items.set(index, value);
    if (changeTree.isStreamCollection) {
      if (changeTree.root !== void 0) {
        streamRouteAdd(this, changeTree.root, index);
      }
    } else {
      changeTree.change(index);
    }
    return index;
  }
  at(index) {
    const key = Array.from(this.$items.keys())[index];
    return this.$items.get(key);
  }
  entries() {
    return this.$items.entries();
  }
  delete(item) {
    const entries = this.$items.entries();
    let index;
    let entry;
    while (entry = entries.next()) {
      if (entry.done) {
        break;
      }
      if (item === entry.value[1]) {
        index = entry.value[0];
        break;
      }
    }
    if (index === void 0) {
      return false;
    }
    const changeTree = this[$changes];
    if (changeTree.isStreamCollection) {
      const root = changeTree.root;
      const previousValue = this.$items.get(index);
      if (root !== void 0) {
        streamRouteRemove(this, root, this[$refId], index);
      }
      if (previousValue?.[$changes] !== void 0) {
        root?.remove(previousValue[$changes]);
      }
      this.deletedItems[index] = previousValue;
      return this.$items.delete(index);
    }
    this.deletedItems[index] = changeTree.delete(index);
    return this.$items.delete(index);
  }
  clear() {
    const changeTree = this[$changes];
    changeTree.discard();
    changeTree.forEachChild((childChangeTree, _) => {
      changeTree.root?.remove(childChangeTree);
    });
    this.$items.clear();
    changeTree.operation(OPERATION.CLEAR);
  }
  /**
   * Pool reset: empty this collection and recycle its ChangeTree WITHOUT
   * recording any wire op (the parent field's ADD/DELETE owns the wire).
   * Recurses into ref-type children. Called by Schema.reset when a pooled
   * entity has a collection field. Must already be detached from the encoder.
   */
  [$reset]() {
    const changeTree = this[$changes];
    if (changeTree.isStreamCollection) {
      throw new Error(`@colyseus/schema: cannot reset a streamed CollectionSchema (pooling not supported).`);
    }
    this.$items.forEach((value) => value?.[$reset]?.());
    this.$items.clear();
    this.deletedItems = {};
    this.$refId = 0;
    changeTree.recycle();
    this[$refId] = void 0;
  }
  has(value) {
    return Array.from(this.$items.values()).some((v) => v === value);
  }
  forEach(callbackfn) {
    this.$items.forEach((value, key, _) => callbackfn(value, key, this));
  }
  values() {
    return this.$items.values();
  }
  get size() {
    return this.$items.size;
  }
  // ────── Change tracking control (same API as Schema) ──────
  pauseTracking() {
    this[$changes].pause();
  }
  resumeTracking() {
    this[$changes].resume();
  }
  untracked(fn) {
    return this[$changes].untracked(fn);
  }
  get isTrackingPaused() {
    return this[$changes].paused;
  }
  /** Iterator */
  [Symbol.iterator]() {
    return this.$items.values();
  }
  // ────────────────────────────────────────────────────────────────────
  // Decoder-side index hooks. CollectionSchema's "key" IS the wire index,
  // so these are identity operations. Kept for protocol symmetry with
  // MapSchema (decoder calls them polymorphically).
  // ────────────────────────────────────────────────────────────────────
  setIndex(_index, _key) {
  }
  getIndex(index) {
    return index;
  }
  [$getByIndex](index) {
    return this.$items.get(index);
  }
  [$deleteByIndex](index) {
    this.$items.delete(index);
  }
  [$resyncPrune](visited, prune, keep) {
    let toDelete = null;
    this.$items.forEach((value, index) => {
      if (visited.has(index)) {
        keep(value);
        return;
      }
      (toDelete ??= []).push(index);
      prune(value, index);
    });
    if (toDelete !== null) {
      for (let i = 0; i < toDelete.length; i++) {
        this[$deleteByIndex](toDelete[i]);
      }
    }
  }
  [$onEncodeEnd]() {
    for (const key in this.deletedItems) {
      delete this.deletedItems[key];
    }
  }
  // ─── Streamable interface (Encoder priority / broadcast pass) ──────
  _dropView(viewId) {
    streamDropView(this, viewId);
  }
  _unregister() {
  }
  toArray() {
    return Array.from(this.$items.values());
  }
  toJSON() {
    const values = [];
    this.forEach((value, key) => {
      values.push(typeof value["toJSON"] === "function" ? value["toJSON"]() : value);
    });
    return values;
  }
  //
  // Decoding utilities
  //
  clone(isDecoding) {
    let cloned;
    if (isDecoding) {
      cloned = Object.assign(new _CollectionSchema(), this);
    } else {
      cloned = new _CollectionSchema();
      this.forEach((value) => {
        if (value[$changes]) {
          cloned.add(value["clone"]());
        } else {
          cloned.add(value);
        }
      });
    }
    return cloned;
  }
};
registerType("collection", { constructor: CollectionSchema });
var SetSchema = class _SetSchema {
  [$changes];
  [$refId];
  [$childType];
  /** The user-visible data, keyed directly by the wire-protocol index. */
  $items = /* @__PURE__ */ new Map();
  /** Snapshots of values that were deleted this tick (for filter visibility). */
  deletedItems = {};
  /** Monotonic counter for assigning indexes to newly-added items. */
  $refId = 0;
  /**
   * Streamable state — lazily allocated when the field is opted into
   * streaming via `t.set(X).stream()`. See MapSchema for the same
   * pattern / rationale.
   */
  _stream;
  /** Max ADD ops emitted per tick per view. Ignored outside streaming mode. */
  get maxPerTick() {
    return this._stream?.maxPerTick ?? 32;
  }
  set maxPerTick(n) {
    (this._stream ??= createStreamableState()).maxPerTick = n;
  }
  /** Per-view priority callback — see StreamSchema / MapSchema. */
  get priority() {
    return this._stream?.priority;
  }
  set priority(fn) {
    (this._stream ??= createStreamableState()).priority = fn;
  }
  static [$encoder] = encodeIndexedEntry;
  static [$decoder] = decodeKeyValueOperation;
  /** Integer tag read by `decodeKeyValueOperation` — see `CollectionKind`. */
  static COLLECTION_KIND = CollectionKind.Set;
  /**
   * Determine if a property must be filtered.
   * - If returns false, the property is NOT going to be encoded.
   * - If returns true, the property is going to be encoded.
   *
   * Encoding with "filters" happens in two steps:
   * - First, the encoder iterates over all "not owned" properties and encodes them.
   * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
   */
  static [$filter](ref, index, view2) {
    return !view2 || typeof ref[$childType] === "string" || view2.isVisible((ref[$getByIndex](index) ?? ref.deletedItems[index])[$changes]);
  }
  static is(type) {
    return type["set"] !== void 0;
  }
  constructor(initialValues) {
    Object.defineProperty(this, $changes, {
      value: new ChangeTree(this),
      enumerable: false,
      writable: true
    });
    this[$childType] = void 0;
    if (initialValues) {
      initialValues.forEach((v) => this.add(v));
    }
  }
  /**
   * Decoder-side factory. Skips the tracking `ChangeTree` allocation;
   * `Object.create` also bypasses the class-field initializers, so we
   * replicate the minimum slot init here. Must stay in sync with the
   * class-field declarations above.
   */
  static initializeForDecoder() {
    const self2 = Object.create(_SetSchema.prototype);
    self2.$items = /* @__PURE__ */ new Map();
    self2.deletedItems = {};
    self2.$refId = 0;
    self2[$childType] = void 0;
    installUntrackedChangeTree(self2);
    return self2;
  }
  add(value) {
    if (this.has(value)) {
      return false;
    }
    const index = this.$refId++;
    const changeTree = this[$changes];
    if (value[$changes] !== void 0) {
      value[$changes].setParent(this, changeTree.root, index);
    }
    this.$items.set(index, value);
    if (changeTree.isStreamCollection) {
      if (changeTree.root !== void 0) {
        streamRouteAdd(this, changeTree.root, index);
      }
    } else {
      changeTree.change(index, OPERATION.ADD);
    }
    return index;
  }
  entries() {
    return this.$items.entries();
  }
  delete(item) {
    const entries = this.$items.entries();
    let index;
    let entry;
    while (entry = entries.next()) {
      if (entry.done) {
        break;
      }
      if (item === entry.value[1]) {
        index = entry.value[0];
        break;
      }
    }
    if (index === void 0) {
      return false;
    }
    const changeTree = this[$changes];
    if (changeTree.isStreamCollection) {
      const root = changeTree.root;
      const previousValue = this.$items.get(index);
      if (root !== void 0) {
        streamRouteRemove(this, root, this[$refId], index);
      }
      if (previousValue?.[$changes] !== void 0) {
        root?.remove(previousValue[$changes]);
      }
      this.deletedItems[index] = previousValue;
      return this.$items.delete(index);
    }
    this.deletedItems[index] = changeTree.delete(index);
    return this.$items.delete(index);
  }
  clear() {
    const changeTree = this[$changes];
    changeTree.discard();
    this.$items.clear();
    changeTree.operation(OPERATION.CLEAR);
  }
  /**
   * Pool reset: empty this set and recycle its ChangeTree WITHOUT recording
   * any wire op (the parent field's ADD/DELETE owns the wire). Recurses into
   * ref-type children. Called by Schema.reset when a pooled entity has a set
   * field. The instance must already be detached from the encoder.
   */
  [$reset]() {
    const changeTree = this[$changes];
    if (changeTree.isStreamCollection) {
      throw new Error(`@colyseus/schema: cannot reset a streamed SetSchema (pooling not supported).`);
    }
    this.$items.forEach((value) => value?.[$reset]?.());
    this.$items.clear();
    this.deletedItems = {};
    this.$refId = 0;
    changeTree.recycle();
    this[$refId] = void 0;
  }
  has(value) {
    const values = this.$items.values();
    let has = false;
    let entry;
    while (entry = values.next()) {
      if (entry.done) {
        break;
      }
      if (value === entry.value) {
        has = true;
        break;
      }
    }
    return has;
  }
  forEach(callbackfn) {
    this.$items.forEach((value, key, _) => callbackfn(value, key, this));
  }
  values() {
    return this.$items.values();
  }
  get size() {
    return this.$items.size;
  }
  // ────── Change tracking control (same API as Schema) ──────
  pauseTracking() {
    this[$changes].pause();
  }
  resumeTracking() {
    this[$changes].resume();
  }
  untracked(fn) {
    return this[$changes].untracked(fn);
  }
  get isTrackingPaused() {
    return this[$changes].paused;
  }
  /** Iterator */
  [Symbol.iterator]() {
    return this.$items.values();
  }
  // ────────────────────────────────────────────────────────────────────
  // Decoder-side index hooks. SetSchema's "key" IS the wire index, so
  // these are identity operations. Kept for protocol symmetry with
  // MapSchema (decoder calls them polymorphically).
  // ────────────────────────────────────────────────────────────────────
  setIndex(_index, _key) {
  }
  getIndex(index) {
    return index;
  }
  [$getByIndex](index) {
    return this.$items.get(index);
  }
  [$deleteByIndex](index) {
    this.$items.delete(index);
  }
  [$resyncPrune](visited, prune, keep) {
    let toDelete = null;
    this.$items.forEach((value, index) => {
      if (visited.has(index)) {
        keep(value);
        return;
      }
      (toDelete ??= []).push(index);
      prune(value, index);
    });
    if (toDelete !== null) {
      for (let i = 0; i < toDelete.length; i++) {
        this[$deleteByIndex](toDelete[i]);
      }
    }
  }
  [$onEncodeEnd]() {
    for (const key in this.deletedItems) {
      delete this.deletedItems[key];
    }
  }
  // ─── Streamable interface (Encoder priority / broadcast pass) ──────
  _dropView(viewId) {
    streamDropView(this, viewId);
  }
  _unregister() {
  }
  toArray() {
    return Array.from(this.$items.values());
  }
  toJSON() {
    const values = [];
    this.forEach((value, key) => {
      values.push(typeof value["toJSON"] === "function" ? value["toJSON"]() : value);
    });
    return values;
  }
  //
  // Decoding utilities
  //
  clone(isDecoding) {
    let cloned;
    if (isDecoding) {
      cloned = Object.assign(new _SetSchema(), this);
    } else {
      cloned = new _SetSchema();
      this.forEach((value) => {
        if (value[$changes]) {
          cloned.add(value["clone"]());
        } else {
          cloned.add(value);
        }
      });
    }
    return cloned;
  }
};
registerType("set", { constructor: SetSchema });
var StreamSchema = class _StreamSchema {
  [$changes];
  [$refId];
  [$childType];
  /**
   * Wire-keyed storage: `position → element`. Position is a monotonic
   * counter assigned by `add()` — stable identity even when elements
   * are removed, so pending/sent view state can keep using the same
   * keys across ticks. Map (not Array) so `$items.keys()` / `.values()`
   * skip removed positions without a sparse-slot check.
   */
  $items = /* @__PURE__ */ new Map();
  /** Monotonic position counter. Incremented on every `add()`. */
  $nextPosition = 0;
  /** Reverse lookup for O(1) `remove(el)`. */
  _itemIndex = /* @__PURE__ */ new Map();
  /**
   * Streamable state — holds per-view and broadcast bookkeeping. Lazily
   * allocated when the stream is attached to a Root (or when the user
   * touches `maxPerTick`). `undefined` on detached streams so
   * construction is cheap.
   */
  _stream;
  /** Max element ADDs emitted per encode tick (per view, or broadcast). */
  get maxPerTick() {
    return this._stream?.maxPerTick ?? 32;
  }
  set maxPerTick(n) {
    (this._stream ??= createStreamableState()).maxPerTick = n;
  }
  /**
   * Per-view priority callback. Initialized from the schema declaration
   * (`.priority(fn)` or `@type({ stream, priority })`); assigning here
   * overrides the class-level default for this instance. Only fires
   * during `encodeView` — broadcast mode drains FIFO.
   */
  get priority() {
    return this._stream?.priority;
  }
  set priority(fn) {
    (this._stream ??= createStreamableState()).priority = fn;
  }
  /**
   * Brand used by Root / StateView to detect stream trees without
   * importing this class (avoids circular deps). The `isStreamCollection`
   * ChangeTree flag (set via `inheritedFlags`) is the preferred runtime
   * check — this brand is kept for back-compat.
   */
  static $isStream = true;
  static [$encoder] = encodeIndexedEntry;
  static [$decoder] = decodeKeyValueOperation;
  /** Integer tag read by `decodeKeyValueOperation` — see `CollectionKind`. */
  static COLLECTION_KIND = CollectionKind.Stream;
  /**
   * Element-level visibility. Identical to SetSchema's filter: stream
   * elements are always per-view, the filter just defers to the view's
   * per-tree visibility bitmap.
   */
  static [$filter](ref, index, view2) {
    if (!view2)
      return true;
    const value = ref[$getByIndex](index);
    if (value === void 0)
      return false;
    return view2.isVisible(value[$changes]);
  }
  static is(type) {
    return type && type["stream"] !== void 0;
  }
  constructor() {
    Object.defineProperty(this, $changes, {
      value: new ChangeTree(this),
      enumerable: false,
      writable: true
    });
    this[$childType] = void 0;
  }
  /**
   * Decoder-side factory. Skips the tracking `ChangeTree` allocation;
   * `Object.create` also bypasses the class-field initializers, so we
   * replicate the minimum slot init here. Must stay in sync with the
   * class-field declarations above.
   */
  static initializeForDecoder() {
    const self2 = Object.create(_StreamSchema.prototype);
    self2.$items = /* @__PURE__ */ new Map();
    self2.$nextPosition = 0;
    self2._itemIndex = /* @__PURE__ */ new Map();
    self2[$childType] = void 0;
    installUntrackedChangeTree(self2);
    return self2;
  }
  /**
   * Append an element to the stream. Returns the assigned position,
   * or -1 if the element was already in the stream.
   */
  add(value) {
    if (this._itemIndex.has(value))
      return -1;
    const position3 = this.$nextPosition++;
    this.$items.set(position3, value);
    this._itemIndex.set(value, position3);
    const tree = this[$changes];
    const root = tree.root;
    if (value[$changes] !== void 0) {
      value[$changes].setParent(this, root, position3);
    }
    if (root !== void 0)
      streamRouteAdd(this, root, position3);
    return position3;
  }
  /**
   * Remove an element by reference. If the element was pending (never sent
   * to a view), the pending entry is dropped silently. If already sent,
   * a DELETE op is forced on next `encodeView` for that view.
   */
  remove(value) {
    const position3 = this._itemIndex.get(value);
    if (position3 === void 0)
      return false;
    this._itemIndex.delete(value);
    this.$items.delete(position3);
    const root = this[$changes].root;
    if (root !== void 0) {
      streamRouteRemove(this, root, this[$refId], position3);
      if (value[$changes] !== void 0) {
        root.remove(value[$changes]);
      }
    }
    return true;
  }
  has(value) {
    return this._itemIndex.has(value);
  }
  /** Remove every element; queue DELETE wire ops for already-sent items. */
  clear() {
    const root = this[$changes].root;
    if (root !== void 0) {
      streamRouteClear(this, root, this[$refId]);
      for (const el of this.$items.values()) {
        if (el[$changes] !== void 0) {
          root.remove(el[$changes]);
        }
      }
    }
    this.$items.clear();
    this._itemIndex.clear();
  }
  forEach(callback) {
    for (const [index, value] of this.$items)
      callback(value, index, this);
  }
  values() {
    return this.$items.values();
  }
  /**
   * Iterate `[position, value]` pairs in insertion order. Used by
   * `setParent` recursion when the stream is reassigned to a new parent.
   */
  entries() {
    return this.$items.entries();
  }
  [Symbol.iterator]() {
    return this.$items.values();
  }
  /** Live element count. */
  get size() {
    return this.$items.size;
  }
  /** Alias for `size`. */
  get length() {
    return this.$items.size;
  }
  // ────────────────────────────────────────────────────────────────────
  // Decoder / encoder plumbing — same shape as SetSchema so
  // {encode,decode}KeyValueOperation can route uniformly. StreamSchema
  // keys are identity (wire index === position), so `setIndex`/`getIndex`
  // are no-ops / identity like SetSchema.
  // ────────────────────────────────────────────────────────────────────
  setIndex(_index, _key) {
  }
  getIndex(index) {
    return index;
  }
  [$getByIndex](index) {
    return this.$items.get(index);
  }
  [$deleteByIndex](index) {
    const value = this.$items.get(index);
    if (value !== void 0) {
      this._itemIndex.delete(value);
      this.$items.delete(index);
    }
  }
  [$resyncPrune]() {
  }
  [$onEncodeEnd]() {
  }
  toArray() {
    return Array.from(this.$items.values());
  }
  toJSON() {
    const out = [];
    this.forEach((v) => {
      out.push(typeof v?.toJSON === "function" ? v.toJSON() : v);
    });
    return out;
  }
  clone(isDecoding) {
    if (isDecoding) {
      const cloned2 = Object.assign(new _StreamSchema(), this);
      return cloned2;
    }
    const cloned = new _StreamSchema();
    cloned.maxPerTick = this.maxPerTick;
    this.forEach((v) => {
      cloned.add(typeof v?.clone === "function" ? v.clone() : v);
    });
    return cloned;
  }
  // ─── Streamable interface (Encoder priority / broadcast pass) ──────
  _dropView(viewId) {
    streamDropView(this, viewId);
  }
  /** Called by Root.remove when the stream's refcount hits zero. */
  _unregister() {
  }
};
registerType("stream", { constructor: StreamSchema });
var FieldBuilder = class {
  [$builder] = true;
  // Internal configuration. Declared `private` (soft-private): hidden from
  // editor autocomplete and from normal external `.field` access, but still
  // reachable at runtime via element access (e.g. `builder['_noSync']`) for
  // internal tooling/tests. Not meant to be mutated by end users.
  _type;
  _default = void 0;
  _hasDefault = false;
  _view = void 0;
  _unreliable = false;
  _patchOnly = false;
  _deprecated = false;
  _deprecatedThrows = true;
  _fullStateOnly = false;
  _stream = false;
  _optional = false;
  _noSync = false;
  _streamPriority = void 0;
  constructor(type) {
    this._type = type;
  }
  /**
   * Provide a default value for this field.
   *
   * Pass a **factory function** `() => T` to build a FRESH value per instance
   * (invoked once per construction) instead of sharing a single default — the
   * clean way to default a ref to a plain custom class, or any field that must
   * not share a mutable default across instances:
   *
   * ```ts
   * acc: t.ref(GunAccuracy).noSync().default(() => new GunAccuracy()),
   * ```
   *
   * Schema fields are never function-typed, so a function is always treated as a
   * factory. A non-function value is shared (and cloned per instance if it is
   * clone-able, e.g. a Schema/collection).
   */
  default(value) {
    this._default = value;
    this._hasDefault = true;
    return this;
  }
  /** Tag this field with a view tag (DEFAULT_VIEW_TAG when called without arg). */
  view(tag) {
    this._view = tag ?? -1;
    return this;
  }
  /**
   * Mark this field as unreliable — tick patches emit it on the unreliable
   * transport channel. Still persisted to full-sync snapshots unless also
   * tagged with `.patchOnly()`. Primitive fields only.
   *
   * The field's FIRST value still travels the reliable channel, as part of
   * the owning instance's ADD; only later mutations become unreliable. A
   * decoder cannot apply a write to a ref it has not been told about, so a
   * value emitted ahead of that ADD would be dropped — and lost for good if
   * the field is never written again.
   */
  unreliable() {
    this._unreliable = true;
    return this;
  }
  /**
   * Deliver this field on tick patches ONLY — it is never written to a
   * full-state sync (`encodeAll` / `encodeAllView`). Late-joining clients
   * see the field only after its next mutation is emitted on a patch.
   * The mirror of `.fullStateOnly()`, and orthogonal to `.unreliable()`.
   */
  patchOnly() {
    this._patchOnly = true;
    return this;
  }
  /**
   * Deliver this field in the full state sync ONLY (`encodeAll` /
   * `encodeAllView`) — it never enters a tick patch. A client receives it
   * on join (and again on a resync); writes after that are not tracked.
   * The mirror of `.patchOnly()`.
   *
   * The field itself is NOT frozen — it stays mutable server-side, only
   * its propagation stops. On a stream field (`t.stream(X).fullStateOnly()`)
   * the same rule applies per element: post-add mutations are no-ops.
   */
  fullStateOnly() {
    this._fullStateOnly = true;
    return this;
  }
  /**
   * Mark this field as **local-only** — it is typed and initialized on the
   * instance (so `.default()` and the inferred instance type still apply),
   * but is never registered for synchronization: it never enters change
   * tracking, never goes over the wire, and decoders never receive it.
   *
   * Useful for server-side scratch state, per-peer UI state, or values you
   * want on the class for typing convenience without paying any sync cost.
   *
   * Mutually exclusive with the sync-only modifiers (`.view()`,
   * `.unreliable()`, `.patchOnly()`, `.fullStateOnly()`, `.stream()`) — combining
   * them throws at `schema()` time.
   *
   * ```ts
   * const Player = schema({
   *     hp: t.uint8().default(100),          // synchronized
   *     lastInputTick: t.number().noSync(),  // local-only
   * }, 'Player');
   * ```
   */
  noSync() {
    this._noSync = true;
    return this;
  }
  /**
   * Opt a collection field into priority-batched streaming delivery —
   * ADDs drain at most `maxPerTick` per tick per view (or per broadcast
   * tick without a view). Applies to `t.map(X)` / `t.set(X)` /
   * `t.collection(X)`. Redundant on `t.stream(X)` (the factory already
   * sets this flag).
   *
   * **Not supported on `t.array(X)`.** Array positional operations
   * (`splice`, `unshift`, `reverse`) shift every subsequent index —
   * holding some ADDs back for a later tick while indexes mutate
   * underneath would produce a decoder-side state that doesn't match
   * the server. Use `t.stream(X)` (stable monotonic positions) or
   * `t.map(X).stream()` (keys never shift) instead.
   */
  stream() {
    const t2 = this._type;
    if (t2 && typeof t2 === "object" && t2.array !== void 0) {
      throw new Error(ARRAY_STREAM_NOT_SUPPORTED);
    }
    this._stream = true;
    return this;
  }
  /**
   * Attach a priority callback for per-view `encodeView` delivery. The
   * callback receives the client's StateView and the candidate element;
   * higher return values emit first. Does nothing in broadcast mode
   * (shared `encode()` drains FIFO). Only meaningful on stream fields.
   *
   * `StateView` carries no position of its own — attach whatever the
   * callback needs to sort by (`view` is loosely typed for this).
   *
   * ```ts
   * t.stream(Enemy).priority((view, enemy) =>
   *     -((enemy.x - view.x) ** 2 + (enemy.y - view.y) ** 2)
   * )
   * ```
   */
  priority(fn) {
    this._streamPriority = fn;
    return this;
  }
  /** Mark this field as deprecated. Pass `false` to silence the access error. */
  deprecated(throws = true) {
    this._deprecated = true;
    this._deprecatedThrows = throws;
    return this;
  }
  /**
   * Mark this field as optional — inferred instance type becomes
   * `T | undefined` and the property becomes omittable in initialization
   * props. Skips the auto-instantiation of collection / Schema-ref
   * defaults, so the field starts as `undefined` at runtime.
   */
  optional() {
    this._optional = true;
    return this;
  }
  /**
   * @internal — snapshot of the builder's configuration consumed by
   * `schema()`. `private` keeps it out of autocomplete; internal callers
   * reach it via element access (`builder['toDefinition']()`).
   */
  toDefinition() {
    return {
      type: this._type,
      default: this._default,
      hasDefault: this._hasDefault,
      view: this._view,
      unreliable: this._unreliable,
      patchOnly: this._patchOnly,
      deprecated: this._deprecated,
      deprecatedThrows: this._deprecatedThrows,
      fullStateOnly: this._fullStateOnly,
      stream: this._stream,
      optional: this._optional,
      noSync: this._noSync,
      streamPriority: this._streamPriority
    };
  }
};
function isBuilder(value) {
  return value != null && value[$builder] === true;
}
function primitive(name) {
  return (() => new FieldBuilder(name));
}
function resolveChild(child) {
  if (isBuilder(child)) {
    const inner = child["_type"];
    const hint = typeof inner === "string" ? `use the type name instead: t.array("${inner}")` : `collections accept a Schema class or a primitive type name ("string", "number", \u2026)`;
    throw new Error(`t.array/map/set/collection(): a t.* builder is not a valid element type \u2014 ${hint}.`);
  }
  return child;
}
var arrayFactory = ((child) => new FieldBuilder({ array: resolveChild(child) }));
var mapFactory = ((child) => new FieldBuilder({ map: resolveChild(child) }));
var setFactory = ((child) => new FieldBuilder({ set: resolveChild(child) }));
var collectionFactory = ((child) => new FieldBuilder({ collection: resolveChild(child) }));
var streamFactory = ((child) => {
  const b = new FieldBuilder({ stream: resolveChild(child) });
  b["_stream"] = true;
  return b;
});
var refFactory = ((ctor) => new FieldBuilder(ctor));
function quantizedFactory(opts) {
  return new FieldBuilder({ quantized: resolveQuantize(opts) });
}
var t = Object.freeze({
  // Primitives
  string: primitive("string"),
  number: primitive("number"),
  boolean: primitive("boolean"),
  int8: primitive("int8"),
  uint8: primitive("uint8"),
  int16: primitive("int16"),
  uint16: primitive("uint16"),
  int32: primitive("int32"),
  uint32: primitive("uint32"),
  int64: primitive("int64"),
  uint64: primitive("uint64"),
  float32: primitive("float32"),
  float64: primitive("float64"),
  bigint64: primitive("bigint64"),
  biguint64: primitive("biguint64"),
  /**
   * Reference to a Schema subtype — `t.array(Item)` usually reads better, but
   * this is available when a plain ref is needed.
   *
   * The target may also be a **non-Schema custom class**. A synced ref still
   * requires it to be encodable — a `Schema` subclass, or a class retrofitted
   * with `Metadata.setFields(...)` (both carry `[Symbol.metadata]`); a bare
   * custom class is rejected at `schema()` time. A `.noSync()` (local-only)
   * field accepts ANY zero-arg class and auto-instantiates one per parent.
   */
  ref: refFactory,
  array: arrayFactory,
  map: mapFactory,
  set: setFactory,
  collection: collectionFactory,
  stream: streamFactory,
  /**
   * A bounded float quantized to a fixed-width unsigned int on the wire — half
   * (or a quarter) the bytes of a `float32` at a precision you pick. The field
   * reads/writes the float and only ever yields `dequant(q)`. {@see QuantizeOptions}
   */
  quantized: quantizedFactory,
  /**
   * Sugar for a full-circle wrapping angle in radians:
   * `t.quantized({ min: 0, max: 2π, mode: "wrap", bits })` (default 16-bit,
   * ~0.0055°/step). Any input angle is range-reduced into `[0, 2π)`. Render note:
   * lerp interpolated remotes shortest-arc (`attach({ angle: true })`) — the
   * wrap fixes the WIRE seam, not interpolation (see {@link QuantizeOptions.mode}).
   */
  angle: (opts) => quantizedFactory({ min: 0, max: Math.PI * 2, mode: "wrap", bits: opts?.bits ?? 16 })
});
var DEFAULT_VIEW_TAG = -1;
function view(tag = DEFAULT_VIEW_TAG) {
  return function(target2, fieldName) {
    const metadata = Metadata.initialize(target2.constructor);
    Metadata.setTag(metadata, fieldName, tag);
  };
}
function unreliable(target2, field) {
  const metadata = Metadata.initialize(target2.constructor);
  Metadata.setUnreliable(metadata, field);
}
function patchOnly(target2, field) {
  const metadata = Metadata.initialize(target2.constructor);
  Metadata.setPatchOnly(metadata, field);
}
var PRIMITIVE_TYPEOF = {
  number: "number",
  int8: "number",
  uint8: "number",
  int16: "number",
  uint16: "number",
  int32: "number",
  uint32: "number",
  int64: "number",
  uint64: "number",
  float32: "number",
  float64: "number",
  bigint64: "bigint",
  biguint64: "bigint",
  string: "string",
  boolean: "boolean"
};
function makePrimitiveSetter(fieldName, fieldIndex, type) {
  const typeofTarget = PRIMITIVE_TYPEOF[type];
  const allowNull = type === "string";
  const isBool = type === "boolean";
  return function(value) {
    const values = this[$values];
    const previousValue = values[fieldIndex];
    if (value === previousValue)
      return;
    if (value !== void 0 && value !== null) {
      if (!isBool && typeofTarget !== void 0 && typeof value !== typeofTarget && !(allowNull && value === null)) {
        const ctorSuffix = value && value.constructor ? ` (${value.constructor.name})` : "";
        throw new EncodeSchemaError(`a '${typeofTarget}' was expected, but '${JSON.stringify(value)}'${ctorSuffix} was provided in ${this.constructor.name}#${fieldName}`);
      }
      this.constructor[$track](this[$changes], fieldIndex, OPERATION.ADD);
    } else if (previousValue !== void 0 && previousValue !== null) {
      this[$changes].delete(fieldIndex);
    }
    values[fieldIndex] = value;
  };
}
function makeSchemaRefSetter(fieldName, fieldIndex, type) {
  return function(value) {
    const values = this[$values];
    const previousValue = values[fieldIndex];
    if (value === previousValue)
      return;
    if (value !== void 0 && value !== null) {
      assertInstanceType(value, type, this, fieldName);
      const changeTree = this[$changes];
      const ctor = this.constructor;
      if (previousValue !== void 0 && previousValue !== null && previousValue[$changes]) {
        changeTree.root?.remove(previousValue[$changes]);
        ctor[$track](changeTree, fieldIndex, OPERATION.DELETE_AND_ADD);
      } else {
        ctor[$track](changeTree, fieldIndex, OPERATION.ADD);
      }
      value[$changes]?.setParent(this, changeTree.root, fieldIndex);
    } else if (previousValue !== void 0 && previousValue !== null) {
      this[$changes].delete(fieldIndex);
    }
    values[fieldIndex] = value;
  };
}
function makeCollectionSetter(_fieldName, fieldIndex, type, complexTypeKlass) {
  const isArrayKlass = complexTypeKlass.constructor === ArraySchema;
  const isMapKlass = complexTypeKlass.constructor === MapSchema;
  return function(value) {
    const values = this[$values];
    const previousValue = values[fieldIndex];
    if (value === previousValue)
      return;
    if (value !== void 0 && value !== null) {
      if (isArrayKlass && !(value instanceof ArraySchema)) {
        const array = new ArraySchema();
        array[$childType] = type;
        array.push(...value);
        value = array;
      } else if (isMapKlass && !(value instanceof MapSchema)) {
        const map = new MapSchema();
        map[$childType] = type;
        if (value instanceof Map) {
          value.forEach((v, k) => map.set(k, v));
        } else {
          for (const k in value) {
            map.set(k, value[k]);
          }
        }
        value = map;
      } else {
        value[$childType] = type;
      }
      const changeTree = this[$changes];
      const ctor = this.constructor;
      if (previousValue !== void 0 && previousValue !== null && previousValue[$changes]) {
        changeTree.root?.remove(previousValue[$changes]);
        ctor[$track](changeTree, fieldIndex, OPERATION.DELETE_AND_ADD);
      } else {
        ctor[$track](changeTree, fieldIndex, OPERATION.ADD);
      }
      value[$changes]?.setParent(this, changeTree.root, fieldIndex);
    } else if (previousValue !== void 0 && previousValue !== null) {
      this[$changes].delete(fieldIndex);
    }
    values[fieldIndex] = value;
  };
}
function makeQuantizedSetter(fieldName, fieldIndex, desc) {
  return function(value) {
    const values = this[$values];
    const previousValue = values[fieldIndex];
    if (value !== void 0 && value !== null) {
      if (typeof value !== "number") {
        throw new EncodeSchemaError(`a 'number' was expected, but '${JSON.stringify(value)}' was provided in ${this.constructor.name}#${fieldName}`);
      }
      value = dequantize(desc, quantize(desc, value));
      if (value === previousValue)
        return;
      this.constructor[$track](this[$changes], fieldIndex, OPERATION.ADD);
    } else {
      if (value === previousValue)
        return;
      if (previousValue !== void 0 && previousValue !== null) {
        this[$changes].delete(fieldIndex);
      }
    }
    values[fieldIndex] = value;
  };
}
function getPropertyDescriptor(fieldName, fieldIndex, type, complexTypeKlass) {
  let setter;
  if (complexTypeKlass) {
    setter = makeCollectionSetter(fieldName, fieldIndex, type, complexTypeKlass);
  } else if (typeof type === "string") {
    setter = makePrimitiveSetter(fieldName, fieldIndex, type);
  } else if (isQuantizedType(type)) {
    setter = makeQuantizedSetter(fieldName, fieldIndex, type.quantized);
  } else {
    setter = makeSchemaRefSetter(fieldName, fieldIndex, type);
  }
  return {
    // Quantized stores the already-snapped float, so the getter is the plain
    // $values read — the field yields dequant(q) with no per-read math.
    get: function() {
      return this[$values][fieldIndex];
    },
    set: setter,
    enumerable: true,
    configurable: true
  };
}
function deprecated(throws = true) {
  return function(klass, field) {
    const metadata = Metadata.initialize(klass.constructor);
    Metadata.setDeprecated(metadata, field);
    if (throws) {
      metadata[$descriptors] ??= {};
      metadata[$descriptors][field] = {
        get: function() {
          throw new Error(`${field} is deprecated.`);
        },
        set: function(_value) {
        },
        enumerable: false,
        configurable: true
      };
      Object.defineProperty(klass, field, metadata[$descriptors][field]);
    }
  };
}
function makeAutoDefaultFactory(rawType) {
  if (rawType && typeof rawType === "object") {
    if (rawType.array !== void 0) {
      return () => new ArraySchema();
    }
    if (rawType.map !== void 0) {
      return () => new MapSchema();
    }
    if (rawType.set !== void 0) {
      return () => new SetSchema();
    }
    if (rawType.collection !== void 0) {
      return () => new CollectionSchema();
    }
    if (rawType.stream !== void 0) {
      return () => new StreamSchema();
    }
  } else if (typeof rawType === "function" && Schema.is(rawType)) {
    if (!rawType.prototype.initialize || rawType.prototype.initialize.length === 0) {
      return () => new rawType();
    }
  }
  return void 0;
}
function schema(fieldsAndMethods, name, inherits = Schema) {
  if (fieldsAndMethods == null || typeof fieldsAndMethods !== "object") {
    throw new Error(`schema(): first argument must be a fields object (got ${typeof fieldsAndMethods}).`);
  }
  const fields = {};
  const methods = {};
  const defaultValues = {};
  const defaultFactories = {};
  const assignDefault = (field, value) => {
    if (typeof value === "function") {
      defaultFactories[field] = value;
    } else if (value && typeof value.clone === "function") {
      defaultFactories[field] = () => value.clone();
    } else {
      defaultValues[field] = value;
    }
  };
  const seedDefault = (field, def) => {
    if (def.hasDefault) {
      assignDefault(field, def.default);
    } else if (!def.optional) {
      const factory = makeAutoDefaultFactory(def.type);
      if (factory) {
        defaultFactories[field] = factory;
      }
    }
  };
  const viewTagFields = {};
  const unreliableFields = [];
  const patchOnlyFields = [];
  const deprecatedFields = {};
  const fullStateOnlyFields = [];
  const streamFields = [];
  const streamPriorityFields = {};
  const optionalFields = [];
  for (const fieldName in fieldsAndMethods) {
    const value = fieldsAndMethods[fieldName];
    if (isBuilder(value)) {
      const def = value["toDefinition"]();
      if (def.noSync) {
        if (def.view !== void 0 || def.unreliable || def.patchOnly || def.fullStateOnly || def.stream) {
          throw new Error(`schema(${name ? `'${name}'` : ""}): field '${fieldName}' uses .noSync() together with a sync-only modifier (.view/.unreliable/.patchOnly/.fullStateOnly/.stream). A local-only field cannot be synchronized.`);
        }
        seedDefault(fieldName, def);
        continue;
      }
      if (def.patchOnly && def.fullStateOnly) {
        throw new Error(`schema(${name ? `'${name}'` : ""}): field '${fieldName}' uses .patchOnly() together with .fullStateOnly(). Those are the only two delivery channels, so the field would never reach a client \u2014 use .noSync() if that is intended.`);
      }
      const normalizedType = getNormalizedType(def.type);
      if (typeof normalizedType === "function" && !Schema.is(normalizedType)) {
        throw new Error(`schema(${name ? `'${name}'` : ""}): field '${fieldName}' is a synced ref to non-Schema class '${normalizedType.name || "(anonymous)"}' \u2014 use .noSync(), or Metadata.setFields().`);
      }
      fields[fieldName] = normalizedType;
      if (def.view !== void 0) {
        viewTagFields[fieldName] = def.view;
      }
      if (def.unreliable) {
        unreliableFields.push(fieldName);
      }
      if (def.patchOnly) {
        patchOnlyFields.push(fieldName);
      }
      if (def.deprecated) {
        deprecatedFields[fieldName] = def.deprecatedThrows;
      }
      if (def.fullStateOnly) {
        fullStateOnlyFields.push(fieldName);
      }
      if (def.stream) {
        streamFields.push(fieldName);
      }
      if (def.streamPriority !== void 0) {
        streamPriorityFields[fieldName] = def.streamPriority;
      }
      if (def.optional) {
        optionalFields.push(fieldName);
      }
      seedDefault(fieldName, def);
    } else if (typeof value === "function") {
      if (Schema.is(value)) {
        fields[fieldName] = getNormalizedType(value);
        if (!value.prototype.initialize || value.prototype.initialize.length === 0) {
          defaultFactories[fieldName] = () => new value();
        }
      } else {
        methods[fieldName] = value;
      }
    } else {
      throw new Error(`schema(${name ? `'${name}'` : ""}): field '${fieldName}' must be a t.* builder, Schema subclass, or method (got ${typeof value}).`);
    }
  }
  const applyDefaults = (target2) => {
    for (const fieldName in defaultValues) {
      target2[fieldName] = defaultValues[fieldName];
    }
    for (const fieldName in defaultFactories) {
      target2[fieldName] = defaultFactories[fieldName]();
    }
  };
  const getDefaultValues = () => {
    const defaults = {};
    applyDefaults(defaults);
    return defaults;
  };
  const getParentProps = (props) => {
    const fieldNames = Object.keys(fields);
    const parentProps = {};
    for (const key in props) {
      if (!fieldNames.includes(key)) {
        parentProps[key] = props[key];
      }
    }
    return parentProps;
  };
  const hasInitialize = typeof methods.initialize === "function";
  const initialize = methods.initialize ?? inherits._initialize;
  const klass = class extends inherits {
    constructor(...args) {
      const props = args[0];
      if (props === void 0) {
        super();
        applyDefaults(this);
      } else {
        super(Object.assign(getDefaultValues(), hasInitialize ? getParentProps(props) : props));
      }
      if (initialize && new.target === klass) {
        initialize.apply(this, args);
      }
    }
  };
  if (name) {
    Object.defineProperty(klass, "name", { value: name });
  }
  Metadata.setFields(klass, fields);
  klass._getDefaultValues = getDefaultValues;
  klass._initialize = initialize;
  Object.assign(klass.prototype, methods);
  for (const fieldName in viewTagFields) {
    view(viewTagFields[fieldName])(klass.prototype, fieldName);
  }
  for (const fieldName of unreliableFields) {
    unreliable(klass.prototype, fieldName);
  }
  for (const fieldName of patchOnlyFields) {
    patchOnly(klass.prototype, fieldName);
  }
  for (const fieldName in deprecatedFields) {
    deprecated(deprecatedFields[fieldName])(klass.prototype, fieldName);
  }
  if (fullStateOnlyFields.length > 0 || streamFields.length > 0) {
    const metadata = klass[Symbol.metadata];
    for (const fieldName of fullStateOnlyFields) {
      Metadata.setFullStateOnly(metadata, fieldName);
    }
    for (const fieldName of streamFields) {
      Metadata.setStream(metadata, fieldName);
    }
    for (const fieldName in streamPriorityFields) {
      Metadata.setStreamPriority(metadata, fieldName, streamPriorityFields[fieldName]);
    }
  }
  if (optionalFields.length > 0) {
    const metadata = klass[Symbol.metadata];
    for (const fieldName of optionalFields) {
      metadata[metadata[fieldName]].optional = true;
    }
  }
  klass.extend = (childFields, childName) => schema(childFields, childName, klass);
  return klass;
}
function getIndent(level) {
  return new Array(level).fill(0).map((_, i) => i === level - 1 ? `\u2514\u2500 ` : `   `).join("");
}
var Schema = class _Schema {
  static [$encoder] = encodeSchemaOperation;
  static [$decoder] = decodeSchemaOperation;
  [$refId];
  [$values];
  /**
   * Initialize change tracking on this instance.
   * Field accessor descriptors (getter/setter) live on the prototype,
   * installed once at class-definition time. Per-instance work is limited
   * to allocating a ChangeTree and a values array.
   */
  static initialize(instance) {
    Object.defineProperty(instance, $changes, {
      value: new ChangeTree(instance),
      enumerable: false,
      writable: true
    });
    instance[$values] = [];
  }
  /**
   * Decoder-side factory. Skips the user subclass ctor entirely —
   * decoder-built instances are passive mirrors of server state, so any
   * field initializer / ctor body work would be overwritten by the
   * decoded ADDs immediately after. Assignment order matches
   * {@link Schema.initialize} so V8 assigns the same hidden class
   * ($changes, then $values), keeping decode-path ICs monomorphic even
   * when tracked and untracked instances coexist.
   *
   * The `this:` constraint pins the return type to the concrete subclass
   * when called as `Player.initializeForDecoder()`, not the base Schema.
   */
  static initializeForDecoder() {
    const inst = Object.create(this.prototype);
    installUntrackedChangeTree(inst);
    inst[$values] = [];
    return inst;
  }
  /**
   * Reset a DETACHED instance to construction defaults so it can be returned
   * to a {@link SchemaPool} and reused, avoiding the cost of `new`. Recurses
   * into ref-type fields (child Schemas / collections).
   *
   * Preconditions (enforced):
   * - The instance must be tracked (encoder-side), not a decoder mirror.
   * - The instance must NOT be shared across multiple parents.
   * - The instance must already be removed from its parent collection/field
   *   (so the encoder detached it: `root === undefined`).
   *
   * NOTE: primitive field values are NOT reset to class defaults — re-assign
   * the fields you care about when you reuse the instance (standard
   * object-pool discipline).
   */
  static reset(instance) {
    const changeTree = instance?.[$changes];
    if (changeTree === void 0 || typeof changeTree.recycle !== "function") {
      throw new Error(`@colyseus/schema: Schema.reset() requires a tracked (encoder-side) instance.`);
    }
    if (changeTree.extraParents !== void 0) {
      throw new Error(`@colyseus/schema: cannot reset a shared instance (${instance.constructor.name}) with multiple parents.`);
    }
    instance[$reset]();
  }
  /**
   * Per-instance reset primitive (the recursive worker behind
   * {@link Schema.reset}). Resets ref-type children first (depth-first),
   * then recycles this instance's ChangeTree and drops its `$refId` so a
   * re-add is assigned a fresh refId exactly like a freshly constructed
   * instance. Dropping `$refId` is what makes instance reuse
   * wire-format-identical to `new T()`.
   */
  [$reset]() {
    const metadata = this.constructor[Symbol.metadata];
    const refIndexes = metadata?.[$refTypeFieldIndexes] ?? [];
    const values = this[$values];
    for (let i = 0; i < refIndexes.length; i++) {
      const child = values[refIndexes[i]];
      child?.[$reset]?.();
    }
    this[$changes].recycle();
    this[$refId] = void 0;
  }
  /**
   * Check whether `type` describes a Schema *class* (a subclass
   * constructor carrying `Symbol.metadata`, as installed by `@type`).
   * Returns false for primitive type strings like `"number"`, descriptor
   * objects like `{ map: Player }`, and Schema *instances*.
   *
   * For the instance-level check — "is this value a Schema instance?" —
   * see {@link Schema.isSchema}.
   */
  static is(type) {
    const m = type[Symbol.metadata];
    return typeof m === "object" && m !== null;
  }
  /**
   * Check if a value is an *instance* of Schema. Uses duck-typing on
   * `.assign` to work across multiple `@colyseus/schema` versions that
   * may be loaded in the same process (e.g. bundled server types vs.
   * client types in a p2p setup).
   *
   * For the class-level check — "is this type a Schema subclass?" —
   * see {@link Schema.is}.
   *
   * @param obj Value to check
   * @returns true if the value is a Schema instance
   */
  static isSchema(obj) {
    return typeof obj?.assign === "function";
  }
  /**
   * Track property changes. Exposed as an override point so downstream
   * tools (debuggers, transparent proxies, custom instrumentation) can
   * intercept per-field writes. Hot-path code in `annotations.ts` calls
   * `(this.constructor as typeof Schema)[$track](...)` rather than
   * `changeTree.change(...)` directly so any subclass override wins.
   */
  static [$track](changeTree, index, operation = OPERATION.ADD) {
    changeTree.change(index, operation);
  }
  /**
   * Determine if a property must be filtered.
   * - If returns false, the property is NOT going to be encoded.
   * - If returns true, the property is going to be encoded.
   *
   * Encoding with "filters" happens in two steps:
   * - First, the encoder iterates over all "not owned" properties and encodes them.
   * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
   */
  static [$filter](ref, index, view2) {
    const metadata = ref.constructor[Symbol.metadata];
    const tag = metadata[index]?.tag;
    if (view2 === void 0) {
      return tag === void 0;
    } else if (tag === void 0) {
      return true;
    } else if (tag === DEFAULT_VIEW_TAG) {
      return view2.isChangeTreeVisible(ref[$changes]);
    } else {
      return view2.hasTagOnTree(ref[$changes], tag);
    }
  }
  // allow inherited classes to have a constructor
  constructor(arg) {
    _Schema.initialize(this);
    if (arg) {
      _Schema.assignProps(this, arg);
    }
  }
  /**
   * Assign properties to the instance.
   * @param props Properties to assign to the instance
   * @returns
   */
  assign(props) {
    _Schema.assignProps(this, props);
    return this;
  }
  /**
   * Metadata-driven property assignment.
   * Reads tracked fields via property access (works with prototype accessors),
   * then copies any remaining own properties for non-tracked fields.
   */
  static assignProps(target2, source) {
    const metadata = target2.constructor[Symbol.metadata];
    if (metadata && metadata[$numFields] !== void 0) {
      for (let i = 0; i <= metadata[$numFields]; i++) {
        const field = metadata[i];
        if (!field) {
          continue;
        }
        const value = source[field.name];
        if (value !== void 0) {
          target2[field.name] = value;
        }
      }
    }
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (metadata && metadata[key] !== void 0) {
        continue;
      }
      target2[key] = source[key];
    }
  }
  /**
   * Restore the instance from JSON data.
   * @param jsonData JSON data to restore the instance from
   * @returns
   */
  restore(jsonData) {
    const metadata = this.constructor[Symbol.metadata];
    for (const fieldIndex in metadata) {
      const field = metadata[fieldIndex];
      const fieldName = field.name;
      const fieldType = field.type;
      const value = jsonData[fieldName];
      if (value === void 0 || value === null) {
        continue;
      }
      if (typeof fieldType === "string") {
        this[fieldName] = value;
      } else if (_Schema.is(fieldType)) {
        const instance = new fieldType();
        instance.restore(value);
        this[fieldName] = instance;
      } else if (typeof fieldType === "object") {
        const collectionType = Object.keys(fieldType)[0];
        const childType = fieldType[collectionType];
        if (collectionType === "map") {
          const mapSchema = this[fieldName];
          for (const key in value) {
            if (_Schema.is(childType)) {
              const childInstance = new childType();
              childInstance.restore(value[key]);
              mapSchema.set(key, childInstance);
            } else {
              mapSchema.set(key, value[key]);
            }
          }
        } else if (collectionType === "array") {
          const arraySchema = this[fieldName];
          for (let i = 0; i < value.length; i++) {
            if (_Schema.is(childType)) {
              const childInstance = new childType();
              childInstance.restore(value[i]);
              arraySchema.push(childInstance);
            } else {
              arraySchema.push(value[i]);
            }
          }
        }
      }
    }
    return this;
  }
  /**
   * (Server-side): Flag a property to be encoded for the next patch.
   * @param instance Schema instance
   * @param property string representing the property name, or number representing the index of the property.
   * @param operation OPERATION to perform (detected automatically)
   */
  setDirty(property, operation) {
    const metadata = this.constructor[Symbol.metadata];
    this[$changes].change(metadata[metadata[property]].index, operation);
  }
  // ────────────────────────────────────────────────────────────────────
  // Change-tracking control API
  //
  // By default, every mutation to a @type() property is automatically
  // recorded as a change. These methods let you opt out for bulk-load
  // scenarios or custom batching.
  //
  // @example
  //   // Bulk-load without emitting changes:
  //   player.untracked(() => {
  //     player.hp = 100;
  //     player.name = "alice";
  //   });
  //
  //   // Pause / resume pattern:
  //   player.pauseTracking();
  //   player.hp = 100;   // not tracked
  //   player.resumeTracking();
  //   player.hp = 50;    // tracked
  // ────────────────────────────────────────────────────────────────────
  /** Stop recording mutations until resumeTracking() is called. */
  pauseTracking() {
    this[$changes].pause();
  }
  /** Re-enable automatic change tracking. */
  resumeTracking() {
    this[$changes].resume();
  }
  /**
   * Run `fn` with change tracking paused, then resume.
   * Returns the function's return value. Safe to nest.
   */
  untracked(fn) {
    return this[$changes].untracked(fn);
  }
  /** True while tracking is paused. */
  get isTrackingPaused() {
    return this[$changes].paused;
  }
  clone() {
    const cloned = Object.create(this.constructor.prototype);
    _Schema.initialize(cloned);
    const metadata = this.constructor[Symbol.metadata];
    for (const fieldIndex in metadata) {
      const field = metadata[fieldIndex].name;
      if (typeof this[field] === "object" && typeof this[field]?.clone === "function") {
        cloned[field] = this[field].clone();
      } else {
        cloned[field] = this[field];
      }
    }
    return cloned;
  }
  toJSON() {
    const obj = {};
    const metadata = this.constructor[Symbol.metadata];
    for (const index in metadata) {
      const field = metadata[index];
      const fieldName = field.name;
      if (!field.deprecated && this[fieldName] !== null && typeof this[fieldName] !== "undefined") {
        obj[fieldName] = typeof this[fieldName]["toJSON"] === "function" ? this[fieldName]["toJSON"]() : this[fieldName];
      }
    }
    return obj;
  }
  /**
   * Used in tests only
   * @internal
   */
  discardAllChanges() {
    this[$changes].discardAll();
  }
  [$getByIndex](index) {
    const metadata = this.constructor[Symbol.metadata];
    return this[metadata[index].name];
  }
  [$deleteByIndex](index) {
    const metadata = this.constructor[Symbol.metadata];
    this[metadata[index].name] = void 0;
  }
  /**
   * Inspect the `refId` of all Schema instances in the tree. Optionally display the contents of the instance.
   *
   * @param ref Schema instance
   * @param showContents display JSON contents of the instance
   * @returns
   */
  static debugRefIds(ref, showContents = false, level = 0, decoder2, keyPrefix = "") {
    const contents = showContents ? ` - ${JSON.stringify(ref.toJSON())}` : "";
    const changeTree = ref[$changes];
    const refId = ref[$refId];
    const root = decoder2 ? decoder2.root : changeTree.root;
    const refCount = root?.refCount?.[refId] > 1 ? ` [\xD7${root.refCount[refId]}]` : "";
    let output = `${getIndent(level)}${keyPrefix}${ref.constructor.name} (refId: ${refId})${refCount}${contents}
`;
    changeTree.forEachChild((childChangeTree, indexOrKey) => {
      let key = indexOrKey;
      if (typeof indexOrKey === "number" && ref["$indexes"]) {
        key = ref["$indexes"].get(indexOrKey) ?? indexOrKey;
      }
      const keyPrefix2 = ref["forEach"] !== void 0 && key !== void 0 ? `["${key}"]: ` : "";
      output += this.debugRefIds(childChangeTree.ref, showContents, level + 1, decoder2, keyPrefix2);
    });
    return output;
  }
  /**
   * @param changeSet
   *  - "changes": iterate the current-tick dirty queue (per-tick encode order)
   *  - "allChanges" / "allFilteredChanges" (legacy): structurally walk the
   *    tree in DFS preorder (matches the order in which full-sync emits
   *    trees). The two legacy modes differ by which side of the filter
   *    split they include.
   */
  static debugRefIdEncodingOrder(ref, changeSet = "allChanges") {
    const encodeOrder = [];
    const rootChangeTree = ref[$changes];
    if (changeSet === "changes") {
      let current = rootChangeTree.root.changes?.next;
      while (current) {
        if (current.changeTree) {
          encodeOrder.push(current.changeTree.ref[$refId]);
        }
        current = current.next;
      }
      return encodeOrder;
    }
    const wantFiltered = changeSet === "allFilteredChanges";
    const visited = /* @__PURE__ */ new Set();
    const walk = (changeTree) => {
      if (visited.has(changeTree))
        return;
      visited.add(changeTree);
      if (changeTree.isFiltered === wantFiltered) {
        encodeOrder.push(changeTree.ref[$refId]);
      }
      changeTree.forEachChild((child, _) => walk(child));
    };
    walk(rootChangeTree);
    return encodeOrder;
  }
  static debugRefIdsFromDecoder(decoder2) {
    return this.debugRefIds(decoder2.state, false, 0, decoder2);
  }
  /**
   * Return a string representation of the changes on a Schema instance.
   * The list of changes is cleared after each encode.
   *
   * @param instance Schema instance
   * @param isEncodeAll Return "full encode" instead of current change set.
   * @returns
   */
  static debugChanges(instance, isEncodeAll = false) {
    const changeTree = instance[$changes];
    const label = isEncodeAll ? "allChanges" : "changes";
    let output = `${instance.constructor.name} (${instance[$refId]}) -> .${label}:
`;
    if (isEncodeAll) {
      changeTree.forEachLive((index) => {
        output += `- [${index}]: ADD (${JSON.stringify(changeTree.getValue(Number(index), true))})
`;
      });
    } else {
      changeTree.forEach((index, op) => {
        if (index < 0 || !op)
          return;
        output += `- [${index}]: ${OPERATION[op]} (${JSON.stringify(changeTree.getValue(Number(index), false))})
`;
      });
    }
    return output;
  }
};
shadowMetadata(Schema);
var $refIdDescriptor$1 = { value: 0, enumerable: false, writable: true };
var Root = class {
  types;
  /**
   * Monotonic refId counter. RefIds are never recycled — a refId is a
   * stable identity for the lifetime of the room, so a client that
   * missed DELETEs (reconnect) can never see an old id rebound to a
   * different instance. DevMode reads/writes this across HMR cycles.
   */
  nextUniqueId = 0;
  refCount = {};
  changeTrees = {};
  /**
   * Queue of all ChangeTrees with reliable dirty state. Per-tick encode()
   * walks this queue; per-view encodeView() walks it too (filtering at
   * emission time via tree.isFiltered + per-field @view tag).
   */
  changes = createChangeTreeList();
  /**
   * Queue of all ChangeTrees with unreliable dirty state. Walked by
   * `Encoder.encodeUnreliable` / `encodeUnreliableView`. A tree may live
   * in both queues when the Schema has both reliable and unreliable
   * fields dirty at the same time.
   */
  unreliableChanges = createChangeTreeList();
  /**
   * Trees whose parent-edge set changed this tick (instance sharing
   * gained or lost an edge). The encoder drains this before emission —
   * `inheritedFlags.drainFilterRefresh` re-derives each tree's filter
   * state against the then-settled containers. Only populated when the
   * TypeContext has any @view/@stream field.
   */
  pendingFilterRefresh = [];
  enqueueFilterRefresh(tree) {
    if (!this.types.hasFilters)
      return;
    if (tree.flags & PENDING_FILTER_REFRESH)
      return;
    tree.flags |= PENDING_FILTER_REFRESH;
    this.pendingFilterRefresh.push(tree);
  }
  /**
   * Free-list of ChangeTreeNode objects. Both queues share this pool —
   * a node carries no queue affinity, only `{ changeTree, prev, next, position }`.
   * Reusing nodes turns ~1,250 per-tick allocations (in bench) into 0.
   */
  _nodePool = [];
  /**
   * View ID allocator for StateView visibility bitmaps on ChangeTree.
   * Each new StateView claims the lowest free ID; releaseViewId() puts
   * the ID back. Avoids unbounded bitmap growth across long-running rooms
   * with view churn (clients joining/leaving).
   */
  _nextViewId = 0;
  _freeViewIds = [];
  /** Allocate a fresh view ID (lowest available). */
  acquireViewId() {
    return this._freeViewIds.length > 0 ? this._freeViewIds.pop() : this._nextViewId++;
  }
  /** Return a view ID to the freelist for reuse. */
  releaseViewId(id) {
    this._freeViewIds.push(id);
  }
  /**
   * Currently-bound StateViews, keyed by view ID and held via `WeakRef`
   * so the FinalizationRegistry backstop in StateView still works when
   * the user forgets `dispose()`. Callers must iterate via
   * `forEachActiveView`, which prunes dead entries.
   */
  activeViews = /* @__PURE__ */ new Map();
  /**
   * Streamable collections attached under this Root — `StreamSchema`
   * plus any collection opted into streaming via `.stream()` on the
   * builder. Encoder.encodeView / broadcast pass iterates this set to
   * dispatch per-view / per-tick budget gates.
   */
  streamTrees = /* @__PURE__ */ new Set();
  registerView(view2) {
    this.activeViews.set(view2.id, new WeakRef(view2));
  }
  unregisterView(view2) {
    this.activeViews.delete(view2.id);
    const id = view2.id;
    for (const stream of this.streamTrees) {
      stream._dropView(id);
    }
  }
  /**
   * Iterate all live StateViews bound to this Root. Prunes entries
   * whose underlying view has been garbage collected without an
   * explicit `dispose()`.
   */
  forEachActiveView(cb) {
    for (const [id, ref] of this.activeViews) {
      const view2 = ref.deref();
      if (view2 === void 0) {
        this.activeViews.delete(id);
        for (const stream of this.streamTrees)
          stream._dropView(id);
        continue;
      }
      cb(view2);
    }
  }
  registerStream(stream) {
    this.streamTrees.add(stream);
  }
  unregisterStream(stream) {
    this.streamTrees.delete(stream);
  }
  constructor(types, startRefId = 0) {
    this.types = types;
    this.nextUniqueId = startRefId;
  }
  add(changeTree) {
    const ref = changeTree.ref;
    if (ref[$refId] === void 0) {
      $refIdDescriptor$1.value = this.nextUniqueId++;
      Object.defineProperty(ref, $refId, $refIdDescriptor$1);
    }
    const refId = ref[$refId];
    const isNewChangeTree = this.changeTrees[refId] === void 0;
    if (isNewChangeTree) {
      this.changeTrees[refId] = changeTree;
    }
    const previousRefCount = this.refCount[refId];
    if (previousRefCount === 0 || changeTree.needsRestage) {
      changeTree.needsRestage = false;
      changeTree.forEachLiveWithCtx(changeTree, restageLiveCb);
    }
    this.refCount[refId] = (previousRefCount || 0) + 1;
    if (previousRefCount > 0)
      this.enqueueFilterRefresh(changeTree);
    return isNewChangeTree;
  }
  remove(changeTree) {
    const refId = changeTree.ref[$refId];
    const refCount = this.refCount[refId] - 1;
    if (refCount <= 0) {
      changeTree.root = void 0;
      delete this.changeTrees[refId];
      if (changeTree.isStreamCollection) {
        const streamable = changeTree.ref;
        streamable._unregister?.();
        this.unregisterStream(streamable);
      }
      this.removeFromQueue(changeTree);
      this.removeFromUnreliableQueue(changeTree);
      this.refCount[refId] = 0;
      changeTree.forEachChild((child, _) => {
        if (child.removeParent(changeTree.ref)) {
          if (child.parentRef === void 0 || // no parent, remove it
          child.parentRef && this.refCount[child.ref[$refId]] > 0) {
            this.remove(child);
          } else if (child.parentRef) {
            this.moveNextToParent(child);
          }
        }
      });
    } else {
      this.refCount[refId] = refCount;
      this.enqueueFilterRefresh(changeTree);
      this.recursivelyMoveNextToParent(changeTree);
    }
    return refCount;
  }
  recursivelyMoveNextToParent(changeTree) {
    this.moveNextToParent(changeTree);
    changeTree.forEachChild((child, _) => this.recursivelyMoveNextToParent(child));
  }
  moveNextToParent(changeTree) {
    if (changeTree.changesNode) {
      this._moveNextToParentInList(this.changes, changeTree, changeTree.changesNode, "changesNode");
    }
    if (changeTree.unreliableChangesNode) {
      this._moveNextToParentInList(this.unreliableChanges, changeTree, changeTree.unreliableChangesNode, "unreliableChangesNode");
    }
  }
  _moveNextToParentInList(changeSet, changeTree, node, nodeField) {
    const parent = changeTree.parent;
    if (!parent || !parent[$changes])
      return;
    const parentNode = parent[$changes][nodeField];
    if (!parentNode || parentNode === node)
      return;
    if (node.position > parentNode.position)
      return;
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      changeSet.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      changeSet.tail = node.prev;
    }
    node.prev = changeSet.tail;
    node.next = void 0;
    changeSet.tail.next = node;
    changeSet.tail = node;
    node.position = changeSet.nextPosition++;
  }
  enqueueChangeTree(changeTree, existingNode = changeTree.changesNode) {
    if (existingNode) {
      return;
    }
    changeTree.changesNode = this._appendToList(this.changes, changeTree);
  }
  enqueueUnreliable(changeTree, existingNode = changeTree.unreliableChangesNode) {
    if (existingNode) {
      return;
    }
    changeTree.unreliableChangesNode = this._appendToList(this.unreliableChanges, changeTree);
  }
  _appendToList(list, changeTree) {
    const pool = this._nodePool;
    let node;
    if (pool.length > 0) {
      node = pool.pop();
      node.changeTree = changeTree;
      node.next = void 0;
      node.prev = void 0;
    } else {
      node = { changeTree, next: void 0, prev: void 0, position: 0 };
    }
    if (!list.next) {
      list.nextPosition = 0;
      list.next = node;
      list.tail = node;
    } else {
      node.prev = list.tail;
      list.tail.next = node;
      list.tail = node;
    }
    node.position = list.nextPosition++;
    return node;
  }
  /**
   * Release a detached node back to the free-list. Caller must have
   * already unlinked it from any list and cleared the changeTree's
   * pointer to it. Clears `changeTree`/`prev`/`next` so the pool
   * doesn't retain references through the GC root.
   */
  releaseNode(node) {
    node.changeTree = void 0;
    node.prev = void 0;
    node.next = void 0;
    this._nodePool.push(node);
  }
  removeFromQueue(changeTree) {
    return this._removeNode(this.changes, changeTree, changeTree.changesNode, "changesNode");
  }
  removeFromUnreliableQueue(changeTree) {
    return this._removeNode(this.unreliableChanges, changeTree, changeTree.unreliableChangesNode, "unreliableChangesNode");
  }
  _removeNode(changeSet, changeTree, node, nodeField) {
    if (!node || node.changeTree !== changeTree)
      return false;
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      changeSet.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      changeSet.tail = node.prev;
    }
    changeTree[nodeField] = void 0;
    this.releaseNode(node);
    return true;
  }
};
function spliceOne(arr, index) {
  if (index === -1 || index >= arr.length) {
    return false;
  }
  const len = arr.length - 1;
  for (let i = index; i < len; i++) {
    arr[i] = arr[i + 1];
  }
  arr.length = len;
  return true;
}
function _clearViewBitFromAllTrees(root, slot, bit) {
  const clearMask = ~bit;
  const trees = root.changeTrees;
  for (const refId in trees) {
    const tree = trees[refId];
    const v = tree.visibleViews;
    if (v !== void 0 && slot < v.length)
      v[slot] &= clearMask;
    const s = tree.subscribedViews;
    if (s !== void 0 && slot < s.length)
      s[slot] &= clearMask;
    const t2 = tree.tagViews;
    if (t2 !== void 0) {
      t2.forEach((bitmap) => {
        if (slot < bitmap.length)
          bitmap[slot] &= clearMask;
      });
    }
  }
}
var _disposeRegistry = new FinalizationRegistry(({ root, id, slot, bit }) => {
  _clearViewBitFromAllTrees(root, slot, bit);
  root.releaseViewId(id);
});
var ARRAY_SNAPSHOT = -1;
function ensureStructSwitch(ctx) {
  if (ctx.structSwitchEmitted)
    return;
  if (ctx.shouldEmitSwitch) {
    ctx.buffer[ctx.it.offset++] = SWITCH_TO_STRUCTURE & 255;
    encode.number(ctx.buffer, ctx.ref[$refId], ctx.it);
  }
  ctx.structSwitchEmitted = true;
}
function encodeFullSyncCb(ctx, fieldIndex) {
  encodeChangeCb(ctx, fieldIndex, OPERATION.ADD);
}
function _fullSyncWalk(ctx, changeTree) {
  if (changeTree._fullSyncGen === ctx.gen)
    return;
  changeTree._fullSyncGen = ctx.gen;
  const visibleHere = !ctx.hasView || ctx.view.isChangeTreeVisible(changeTree);
  if (visibleHere) {
    const desc = changeTree.encDescriptor;
    ctx.changeTree = changeTree;
    ctx.ref = changeTree.ref;
    ctx.encoder = desc.encoder;
    ctx.filter = desc.filter;
    ctx.metadata = desc.metadata;
    ctx.treeIsFiltered = changeTree.isFiltered;
    ctx.isSchema = desc.isSchema;
    ctx.filterBitmask = desc.filterBitmask;
    ctx.tags = desc.tags;
    ctx.structSwitchEmitted = false;
    ctx.shouldEmitSwitch = ctx.hasView || ctx.it.offset > ctx.initialOffset || changeTree !== ctx.rootChangeTree;
    forEachLiveWithCtx(changeTree, ctx, encodeFullSyncCb);
  }
  forEachChildWithCtx(changeTree, ctx, _fullSyncWalkChildCb);
}
function _fullSyncWalkChildCb(ctx, child, _index) {
  _fullSyncWalk(ctx, child);
}
function encodeChangeCb(ctx, fieldIndex, op) {
  if (fieldIndex < 0) {
    if (ctx.treeIsFiltered !== ctx.emitFiltered)
      return;
    ensureStructSwitch(ctx);
    ctx.buffer[ctx.it.offset++] = Math.abs(fieldIndex) & 255;
    return;
  }
  const fieldFiltered = ctx.isSchema ? ctx.treeIsFiltered || (fieldIndex < 32 ? (ctx.filterBitmask & 1 << fieldIndex) !== 0 : ctx.tags[fieldIndex] !== void 0) : ctx.treeIsFiltered;
  if (fieldFiltered !== ctx.emitFiltered)
    return;
  const operation = ctx.isEncodeAll ? OPERATION.ADD : op;
  if (operation === void 0)
    return;
  if (ctx.filter !== void 0 && !ctx.filter(ctx.ref, fieldIndex, ctx.view))
    return;
  ensureStructSwitch(ctx);
  ctx.encoder(ctx.self, ctx.buffer, ctx.changeTree, fieldIndex, operation, ctx.it, ctx.isEncodeAll, ctx.hasView, ctx.metadata);
}
function concatBytes(a, b) {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}
var Encoder = class _Encoder {
  /**
   * Per-encoder shared output buffer size. The encoder auto-grows on
   * overflow and logs a one-time warning suggesting a higher value, so
   * the default just needs to comfortably cover typical room state.
   *
   * Sized to fit ~100 items in a `MapSchema<{x,y,z}>` keyed by
   * `nanoid(9)` (~4.5 KB worst-case full encode, float64-heavy) with
   * ~3-4× headroom for surrounding state (player list, world refs,
   * etc.). Raise per app via `Encoder.BUFFER_SIZE = N * 1024` before
   * constructing any Encoder.
   */
  static BUFFER_SIZE = 16 * 1024;
  sharedBuffer = new Uint8Array(_Encoder.BUFFER_SIZE);
  context;
  state;
  root;
  constructor(state, root) {
    this.context = TypeContext.cache(state.constructor);
    this.root = root ?? new Root(this.context);
    this.setState(state);
  }
  setState(state) {
    this.state = state;
    this.state[$changes].setRoot(this.root);
  }
  _encodeCtx = {
    self: void 0,
    buffer: void 0,
    it: void 0,
    changeTree: void 0,
    ref: void 0,
    encoder: void 0,
    filter: void 0,
    metadata: void 0,
    view: void 0,
    isEncodeAll: false,
    hasView: false,
    treeIsFiltered: false,
    isSchema: false,
    emitFiltered: false,
    filterBitmask: 0,
    tags: void 0,
    structSwitchEmitted: false,
    isRootTree: false,
    shouldEmitSwitch: false,
    gen: 0,
    initialOffset: 0,
    rootChangeTree: void 0
  };
  /**
   * Monotonic counter bumped at the start of every `encodeFullSync`
   * call. The new value is copied to `ctx.gen` and stamped into every
   * tree the walk touches (`tree._fullSyncGen = ctx.gen`); subsequent
   * revisits of the same tree detect the equality and return early.
   */
  _fullSyncGen = 0;
  encode(it = { offset: 0 }, view2, buffer = this.sharedBuffer, initialOffset = it.offset) {
    return this._encodeChannel(
      it,
      view2,
      buffer,
      initialOffset,
      /* unreliable */
      false
    );
  }
  /**
   * Per-tick encode of the UNRELIABLE channel. Walks `root.unreliableChanges`
   * and emits each tree's `unreliableRecorder`. Safe to call at a different
   * cadence than `encode()` (e.g. 60Hz vs 20Hz) — the two channels are
   * fully independent.
   */
  encodeUnreliable(it = { offset: 0 }, view2, buffer = this.sharedBuffer, initialOffset = it.offset) {
    return this._encodeChannel(
      it,
      view2,
      buffer,
      initialOffset,
      /* unreliable */
      true
    );
  }
  _encodeChannel(it, view2, buffer, initialOffset, unreliable2) {
    if (this.root.pendingFilterRefresh.length > 0)
      drainFilterRefresh(this.root);
    const hasView = view2 !== void 0;
    const rootChangeTree = this.state[$changes];
    const ctx = this._encodeCtx;
    ctx.self = this;
    ctx.buffer = buffer;
    ctx.it = it;
    ctx.view = view2;
    ctx.isEncodeAll = false;
    ctx.hasView = hasView;
    ctx.emitFiltered = hasView;
    const queue = unreliable2 ? this.root.unreliableChanges : this.root.changes;
    let current = queue;
    while (current = current.next) {
      const changeTree = current.changeTree;
      if (hasView && !view2.isChangeTreeVisible(changeTree)) {
        continue;
      }
      const recorder = unreliable2 ? changeTree.unreliableRecorder : changeTree;
      if (!recorder || !recorder.has()) {
        continue;
      }
      const desc = changeTree.encDescriptor;
      ctx.changeTree = changeTree;
      ctx.ref = changeTree.ref;
      ctx.encoder = desc.encoder;
      ctx.filter = desc.filter;
      ctx.metadata = desc.metadata;
      ctx.treeIsFiltered = changeTree.isFiltered;
      ctx.isSchema = desc.isSchema;
      ctx.filterBitmask = desc.filterBitmask;
      ctx.tags = desc.tags;
      ctx.structSwitchEmitted = false;
      ctx.isRootTree = changeTree === rootChangeTree;
      ctx.shouldEmitSwitch = hasView || it.offset > initialOffset || !ctx.isRootTree;
      recorder.forEachWithCtx(ctx, encodeChangeCb);
    }
    if (!unreliable2 && !hasView && this.root.activeViews.size === 0 && this.root.streamTrees.size > 0) {
      this._emitStreamBroadcast(buffer, it);
    }
    if (it.offset > buffer.byteLength) {
      buffer = this._resizeBuffer(buffer, it.offset);
      it.offset = initialOffset;
      return this._encodeChannel(it, view2, buffer, initialOffset, unreliable2);
    }
    return buffer.subarray(0, it.offset);
  }
  /**
   * Structural DFS walker for full-sync (encodeAll / encodeAllView).
   * Visits each ChangeTree in DFS preorder starting from the state root,
   * emitting ADD operations for every currently-populated index via
   * {@link ChangeTree.forEachLive}.
   */
  encodeFullSync(it, buffer, emitFiltered, view2, initialOffset = it.offset) {
    if (this.root.pendingFilterRefresh.length > 0)
      drainFilterRefresh(this.root);
    const hasView = view2 !== void 0;
    const rootChangeTree = this.state[$changes];
    const ctx = this._encodeCtx;
    ctx.self = this;
    ctx.buffer = buffer;
    ctx.it = it;
    ctx.view = view2;
    ctx.isEncodeAll = true;
    ctx.hasView = hasView;
    ctx.emitFiltered = emitFiltered;
    ctx.gen = ++this._fullSyncGen;
    ctx.initialOffset = initialOffset;
    ctx.rootChangeTree = rootChangeTree;
    _fullSyncWalk(ctx, rootChangeTree);
    if (it.offset > buffer.byteLength) {
      buffer = this._resizeBuffer(buffer, it.offset);
      it.offset = initialOffset;
      return this.encodeFullSync(it, buffer, emitFiltered, view2, initialOffset);
    }
    return buffer.subarray(0, it.offset);
  }
  _resizeBuffer(buffer, usedOffset) {
    const newSize = Math.ceil(usedOffset / _Encoder.BUFFER_SIZE) * _Encoder.BUFFER_SIZE;
    console.warn(`@colyseus/schema buffer overflow. Encoded state is higher than default BUFFER_SIZE. Use the following to increase default BUFFER_SIZE:

    import { Encoder } from "@colyseus/schema";
    Encoder.BUFFER_SIZE = ${Math.round(newSize / 1024)} * 1024; // ${Math.round(newSize / 1024)} KB
`);
    const newBuffer = new Uint8Array(newSize);
    newBuffer.set(buffer);
    if (buffer === this.sharedBuffer) {
      this.sharedBuffer = newBuffer;
    }
    return newBuffer;
  }
  encodeAll(it = { offset: 0 }, buffer = this.sharedBuffer) {
    return this.encodeFullSync(
      it,
      buffer,
      /* emitFiltered */
      false
    );
  }
  encodeAllView(view2, sharedOffset, it, bytes = this.sharedBuffer) {
    const viewOffset = it.offset;
    bytes = this.encodeFullSync(
      it,
      bytes,
      /* emitFiltered */
      true,
      view2,
      viewOffset
    );
    return concatBytes(bytes.subarray(0, sharedOffset), bytes.subarray(viewOffset, it.offset));
  }
  /** Grow `buffer` to keep BUFFER_SIZE free bytes past `offset`, preserving `[0, offset)`. */
  ensureCapacity(buffer, offset) {
    if (offset + _Encoder.BUFFER_SIZE <= buffer.byteLength) {
      return buffer;
    }
    const size = Math.ceil((offset + _Encoder.BUFFER_SIZE) / _Encoder.BUFFER_SIZE) * _Encoder.BUFFER_SIZE;
    const grown = new Uint8Array(size);
    grown.set(buffer.subarray(0, offset));
    if (buffer === this.sharedBuffer) {
      this.sharedBuffer = grown;
    }
    return grown;
  }
  encodeView(view2, sharedOffset, it, bytes = this.sharedBuffer) {
    const viewOffset = it.offset;
    this._emitStreamPriority(view2);
    for (const refId of view2.changes.keys()) {
      const changes = view2.changes.get(refId);
      const changeTree = this.root.changeTrees[refId];
      if (changeTree === void 0) {
        view2.changes.delete(refId);
        continue;
      }
      if (changes.size === 0) {
        continue;
      }
      const desc = changeTree.encDescriptor;
      const encoder = desc.encoder;
      const metadata = desc.metadata;
      const ref = changeTree.ref;
      const refTarget = changeTree.refTarget;
      bytes = this.ensureCapacity(bytes, it.offset);
      bytes[it.offset++] = SWITCH_TO_STRUCTURE & 255;
      encode.number(bytes, ref[$refId], it);
      for (const [key, op] of changes) {
        let index;
        if (key === ARRAY_SNAPSHOT) {
          const tmpItems = refTarget.tmpItems;
          const deletedIndexes = refTarget.deletedIndexes;
          for (let slot = 0; slot < tmpItems.length; slot++) {
            if (tmpItems[slot] === void 0 || deletedIndexes[slot] === true) {
              continue;
            }
            encoder(this, bytes, changeTree, slot, OPERATION.ADD, it, false, true, metadata);
          }
          continue;
        }
        if (typeof key === "number") {
          index = key;
        } else {
          const resolved = key.indexInParent(ref);
          if (resolved === void 0) {
            continue;
          }
          index = resolved;
          if (op === OPERATION.ADD && changeTree.getChange(index) === OPERATION.DELETE) {
            view2.changes.delete(key.ref[$refId]);
            continue;
          }
        }
        const value = refTarget[$getByIndex](index);
        const operation = value !== void 0 && op || OPERATION.DELETE;
        encoder(this, bytes, changeTree, index, operation, it, false, true, metadata);
      }
    }
    view2.changes.clear();
    bytes = this.encode(it, view2, bytes);
    return concatBytes(bytes.subarray(0, sharedOffset), bytes.subarray(viewOffset, it.offset));
  }
  /**
   * Per-view unreliable encode. Walks `root.unreliableChanges` and emits
   * only filtered fields visible to this view. Unlike `encodeView`, this
   * doesn't emit `view.changes` entries — those are used only for
   * reliable view bootstrap (membership ADDs) and are consumed by
   * `encodeView` on the reliable channel.
   */
  encodeUnreliableView(view2, sharedOffset, it, bytes = this.sharedBuffer) {
    const viewOffset = it.offset;
    bytes = this.encodeUnreliable(it, view2, bytes, viewOffset);
    return concatBytes(bytes.subarray(0, sharedOffset), bytes.subarray(viewOffset, it.offset));
  }
  /**
   * Broadcast-mode counterpart to `_emitStreamPriority`. Runs when NO
   * StateViews are registered — streams fall back to broadcast mode
   * where up to `maxPerTick` pending ADDs per stream emit to ALL clients
   * each shared tick. DELETEs always flush (no cap).
   *
   * Emits directly to the shared-encode buffer: stream & element trees
   * are `isFiltered=true` so the main loop would otherwise skip them.
   * Runs AFTER the main loop so state / parent refs are already encoded
   * — stream ADD ops reference element refIds, which must be decodable.
   */
  _emitStreamBroadcast(buffer, it) {
    const streams = this.root.streamTrees;
    for (const stream of streams) {
      const s = stream;
      const tree = s[$changes];
      const streamRefId = s[$refId];
      if (streamRefId === void 0)
        continue;
      const st = s._stream;
      const deletes = st.broadcastDeletes;
      const pending = st.broadcastPending;
      const sent = st.sentBroadcast;
      const hasDeletes = deletes.size > 0;
      const hasAdds = pending.size > 0;
      const desc = tree.encDescriptor;
      const streamEncoder = desc.encoder;
      const streamMetadata = desc.metadata;
      if (hasDeletes || hasAdds) {
        buffer[it.offset++] = SWITCH_TO_STRUCTURE & 255;
        encode.number(buffer, streamRefId, it);
        if (hasDeletes) {
          for (const pos of deletes) {
            streamEncoder(this, buffer, tree, pos, OPERATION.DELETE, it, false, false, streamMetadata);
          }
          deletes.clear();
        }
        const max = st.maxPerTick;
        const emittedElements = [];
        let count = 0;
        const toDelete = [];
        for (const pos of pending) {
          if (count >= max)
            break;
          const element = s[$getByIndex](pos);
          if (element === void 0) {
            toDelete.push(pos);
            continue;
          }
          streamEncoder(this, buffer, tree, pos, OPERATION.ADD, it, false, false, streamMetadata);
          sent.add(pos);
          emittedElements.push(element);
          toDelete.push(pos);
          count++;
        }
        for (const pos of toDelete)
          pending.delete(pos);
        for (const element of emittedElements) {
          const elTree = element[$changes];
          if (elTree === void 0)
            continue;
          const elRefId = element[$refId];
          if (elRefId === void 0)
            continue;
          buffer[it.offset++] = SWITCH_TO_STRUCTURE & 255;
          encode.number(buffer, elRefId, it);
          const elDesc = elTree.encDescriptor;
          const elEncoder = elDesc.encoder;
          const elMetadata = elDesc.metadata;
          elTree.forEachLive((idx) => {
            if (Metadata.hasUnreliableAtIndex(elMetadata, idx))
              return;
            elEncoder(this, buffer, elTree, idx, OPERATION.ADD, it, false, false, elMetadata);
          });
        }
      }
      for (const pos of sent) {
        const element = s[$getByIndex](pos);
        if (element === void 0)
          continue;
        const elTree = element[$changes];
        if (elTree === void 0 || !elTree.has())
          continue;
        const elRefId = element[$refId];
        if (elRefId === void 0)
          continue;
        buffer[it.offset++] = SWITCH_TO_STRUCTURE & 255;
        encode.number(buffer, elRefId, it);
        const elDesc = elTree.encDescriptor;
        const elEncoder = elDesc.encoder;
        const elMetadata = elDesc.metadata;
        elTree.forEach((idx, op) => {
          if (idx < 0)
            return;
          if (Metadata.hasUnreliableAtIndex(elMetadata, idx))
            return;
          elEncoder(this, buffer, elTree, idx, op, it, false, false, elMetadata);
        });
      }
    }
  }
  /**
   * Walk every registered stream, pick up to `maxPerTick` positions from
   * this view's pending backlog (priority-sorted when the view supplies a
   * `streamPriority` callback), and hand each element to `view.add()`.
   * `view.add()` seeds `view.changes` so the subsequent drain emits both
   * the stream-link (position → refId) and the element's field data.
   *
   * Designed to run at the very top of `encodeView`, BEFORE the
   * view.changes drain loop.
   */
  _emitStreamPriority(view2) {
    const streams = this.root.streamTrees;
    if (streams.size === 0)
      return;
    const viewId = view2.id;
    for (const stream of streams) {
      const s = stream;
      const st = s._stream;
      const pending = st.pendingByView.get(viewId);
      if (pending === void 0 || pending.size === 0)
        continue;
      const perView = st.priorityByView?.get(viewId);
      const usePerView = perView !== void 0;
      const priority = st.priority;
      const max = st.maxPerTick;
      const positions = [];
      const stale = [];
      if (usePerView || priority !== void 0) {
        const bestPos = [];
        const bestScore = [];
        let filled = 0;
        for (const pos of pending) {
          const element = s[$getByIndex](pos);
          if (element === void 0) {
            stale.push(pos);
            continue;
          }
          const score = usePerView ? perView(element) : priority(view2, element);
          if (filled < max) {
            let j = filled++;
            while (j > 0 && bestScore[j - 1] < score) {
              bestScore[j] = bestScore[j - 1];
              bestPos[j] = bestPos[j - 1];
              j--;
            }
            bestScore[j] = score;
            bestPos[j] = pos;
          } else if (score > bestScore[max - 1]) {
            let j = max - 1;
            while (j > 0 && bestScore[j - 1] < score) {
              bestScore[j] = bestScore[j - 1];
              bestPos[j] = bestPos[j - 1];
              j--;
            }
            bestScore[j] = score;
            bestPos[j] = pos;
          }
        }
        for (let i = 0; i < filled; i++)
          positions.push(bestPos[i]);
      } else {
        for (const pos of pending) {
          if (positions.length >= max)
            break;
          positions.push(pos);
        }
      }
      for (const pos of stale)
        pending.delete(pos);
      const count = positions.length;
      let sent = st.sentByView.get(viewId);
      if (sent === void 0) {
        sent = /* @__PURE__ */ new Set();
        st.sentByView.set(viewId, sent);
      }
      for (let i = 0; i < count; i++) {
        const pos = positions[i];
        const element = s[$getByIndex](pos);
        if (element === void 0) {
          pending.delete(pos);
          continue;
        }
        view2._addImmediate(element);
        const elTree = element[$changes];
        if (elTree !== void 0) {
          const elRefId = element[$refId];
          let elChanges = view2.changes.get(elRefId);
          if (elChanges === void 0) {
            elChanges = /* @__PURE__ */ new Map();
            view2.changes.set(elRefId, elChanges);
          }
          const elMetadata = elTree.metadata;
          elTree.forEachLive((index) => {
            if (Metadata.hasUnreliableAtIndex(elMetadata, index))
              return;
            elChanges.set(index, OPERATION.ADD);
          });
        }
        pending.delete(pos);
        sent.add(pos);
      }
    }
  }
  discardChanges() {
    const list = this.root.changes;
    let current = list.next;
    const root = this.root;
    while (current) {
      const next = current.next;
      current.changeTree.endEncode();
      root.releaseNode(current);
      current = next;
    }
    list.next = void 0;
    list.tail = void 0;
  }
  discardUnreliableChanges() {
    const list = this.root.unreliableChanges;
    let current = list.next;
    const root = this.root;
    while (current) {
      const next = current.next;
      current.changeTree.endEncodeUnreliable();
      root.releaseNode(current);
      current = next;
    }
    list.next = void 0;
    list.tail = void 0;
  }
  tryEncodeTypeId(bytes, baseType, targetType, it) {
    const baseTypeId = this.context.getTypeId(baseType);
    const targetTypeId = this.context.getTypeId(targetType);
    if (targetTypeId === void 0) {
      console.warn(`@colyseus/schema WARNING: Class "${targetType.name}" is not registered on TypeRegistry - Please either tag the class with @entity or define a @type() field.`);
      return;
    }
    if (baseTypeId !== targetTypeId) {
      bytes[it.offset++] = TYPE_ID & 255;
      encode.number(bytes, targetTypeId, it);
    }
  }
  get hasChanges() {
    return this.root.changes.next !== void 0;
  }
  get hasUnreliableChanges() {
    return this.root.unreliableChanges.next !== void 0;
  }
};
var DecodingWarning = class extends Error {
  constructor(message) {
    super(message);
    this.name = "DecodingWarning";
  }
};
var $refIdDescriptor = { value: 0, enumerable: false, writable: true };
var ReferenceTracker = class {
  //
  // Relation of refId => Schema structure
  // For direct access of structures during decoding time.
  //
  refs = /* @__PURE__ */ new Map();
  refCount = {};
  deletedRefs = /* @__PURE__ */ new Set();
  callbacks = {};
  nextUniqueId = 0;
  getNextUniqueId() {
    return this.nextUniqueId++;
  }
  // for decoding
  addRef(refId, ref, incrementCount = true) {
    this.refs.set(refId, ref);
    if (ref[$refId] === void 0) {
      $refIdDescriptor.value = refId;
      Object.defineProperty(ref, $refId, $refIdDescriptor);
    } else if (ref[$refId] !== refId) {
      ref[$refId] = refId;
    }
    if (incrementCount) {
      this.refCount[refId] = (this.refCount[refId] || 0) + 1;
    }
    if (this.deletedRefs.has(refId)) {
      this.deletedRefs.delete(refId);
    }
  }
  // for decoding
  removeRef(refId) {
    const refCount = this.refCount[refId];
    if (refCount === void 0) {
      try {
        throw new DecodingWarning("trying to remove refId that doesn't exist: " + refId);
      } catch (e) {
        console.warn(e);
      }
      return;
    }
    if (refCount === 0) {
      try {
        const ref = this.refs.get(refId);
        throw new DecodingWarning(`trying to remove refId '${refId}' with 0 refCount (${ref.constructor.name}: ${JSON.stringify(ref)})`);
      } catch (e) {
        console.warn(e);
      }
      return;
    }
    if ((this.refCount[refId] = refCount - 1) <= 0) {
      this.deletedRefs.add(refId);
    }
  }
  clearRefs() {
    this.refs.clear();
    this.deletedRefs.clear();
    this.callbacks = {};
    this.refCount = {};
  }
  // for decoding
  garbageCollectDeletedRefs() {
    this.deletedRefs.forEach((refId) => {
      if (this.refCount[refId] > 0) {
        return;
      }
      const ref = this.refs.get(refId);
      const metadata = ref.constructor[Symbol.metadata];
      if (metadata != null) {
        for (const index in metadata) {
          const field = metadata[index].name;
          const child = ref[field];
          if (typeof child === "object" && child) {
            const childRefId = child[$refId];
            if (childRefId !== void 0 && !this.deletedRefs.has(childRefId)) {
              this.removeRef(childRefId);
            }
          }
        }
      } else {
        if (typeof ref[$childType] === "function") {
          Array.from(ref.values()).forEach((child) => {
            const childRefId = child[$refId];
            if (childRefId !== void 0 && !this.deletedRefs.has(childRefId)) {
              this.removeRef(childRefId);
            }
          });
        }
      }
      this.refs.delete(refId);
      delete this.refCount[refId];
      delete this.callbacks[refId];
    });
    this.deletedRefs.clear();
  }
  addCallback(refId, fieldOrOperation, callback) {
    if (refId === void 0) {
      const name = typeof fieldOrOperation === "number" ? OPERATION[fieldOrOperation] : fieldOrOperation;
      throw new Error(`Can't addCallback on '${name}' (refId is undefined)`);
    }
    if (!this.callbacks[refId]) {
      this.callbacks[refId] = {};
    }
    if (!this.callbacks[refId][fieldOrOperation]) {
      this.callbacks[refId][fieldOrOperation] = [];
    }
    this.callbacks[refId][fieldOrOperation].push(callback);
    return () => this.removeCallback(refId, fieldOrOperation, callback);
  }
  removeCallback(refId, field, callback) {
    const index = this.callbacks?.[refId]?.[field]?.indexOf(callback);
    if (index !== void 0 && index !== -1) {
      spliceOne(this.callbacks[refId][field], index);
    }
  }
};
var Decoder = class {
  context;
  state;
  root;
  currentRefId = 0;
  triggerChanges;
  /**
   * @internal Non-null only while a `decodeResync()` walk is in progress:
   * collection refId → entry identities the payload visited (map string
   * keys; array/set/collection/stream indexes). Written by the collection
   * DecodeOperation functions, read by the post-decode sweep.
   */
  resyncVisited = null;
  /**
   * @internal Set when a structure had to be skipped during a resync
   * decode — visited data is incomplete, so the sweep must not delete.
   */
  resyncDamaged = false;
  constructor(root, context) {
    this.setState(root);
    this.context = context || new TypeContext(root.constructor);
  }
  setState(root) {
    this.state = root;
    this.root = new ReferenceTracker();
    this.root.addRef(0, root);
  }
  decode(bytes, it = { offset: 0 }, ref = this.state) {
    const allChanges = this.triggerChanges !== void 0 ? [] : null;
    const $root = this.root;
    const totalBytes = bytes.byteLength;
    let decoder2 = ref["constructor"][$decoder];
    this.currentRefId = 0;
    while (it.offset < totalBytes) {
      if (bytes[it.offset] == SWITCH_TO_STRUCTURE) {
        it.offset++;
        ref[$onDecodeEnd]?.();
        const nextRefId = decode.number(bytes, it);
        const nextRef = $root.refs.get(nextRefId);
        if (!nextRef) {
          console.error(`"refId" not found: ${nextRefId}`, { previousRef: ref, previousRefId: this.currentRefId });
          console.warn("Please report this issue to the developers.");
          this.skipCurrentStructure(bytes, it, totalBytes);
        } else {
          ref = nextRef;
          decoder2 = ref.constructor[$decoder];
          this.currentRefId = nextRefId;
        }
        continue;
      }
      const result = decoder2(this, bytes, it, ref, allChanges);
      if (result === DEFINITION_MISMATCH) {
        console.warn("@colyseus/schema: definition mismatch");
        this.skipCurrentStructure(bytes, it, totalBytes);
        continue;
      }
    }
    ref[$onDecodeEnd]?.();
    if (this.resyncVisited !== null) {
      resyncSweep(this, allChanges);
    }
    if (allChanges !== null)
      this.triggerChanges?.(allChanges);
    $root.garbageCollectDeletedRefs();
    return allChanges;
  }
  /**
   * Full-snapshot reconciliation ("resync") decode.
   *
   * Behaves exactly like {@link decode}, plus: every collection entry the
   * payload does NOT mention is removed through the regular DELETE path —
   * `onRemove` callbacks fire with the real previous value and released
   * refs are garbage-collected. Use it to apply a rejoin/reconnect full
   * state over an existing decoded tree: DELETEs that happened while the
   * client was off the wire are reconciled as if they had been received,
   * while surviving entries keep their instance identity and callbacks.
   *
   * ONLY valid for full-snapshot payloads (`encodeAll` / `encodeAllView`
   * output). Calling it on an incremental patch would prune everything
   * the patch doesn't touch.
   */
  decodeResync(bytes, it = { offset: 0 }) {
    this.resyncVisited = /* @__PURE__ */ new Map();
    this.resyncDamaged = false;
    try {
      return this.decode(bytes, it);
    } finally {
      this.resyncVisited = null;
    }
  }
  skipCurrentStructure(bytes, it, totalBytes) {
    if (this.resyncVisited !== null) {
      this.resyncDamaged = true;
    }
    const nextIterator = { offset: it.offset };
    while (it.offset < totalBytes) {
      if (bytes[it.offset] === SWITCH_TO_STRUCTURE) {
        nextIterator.offset = it.offset + 1;
        if (this.root.refs.has(decode.number(bytes, nextIterator))) {
          break;
        }
      }
      it.offset++;
    }
  }
  getInstanceType(bytes, it, defaultType) {
    let type;
    if (bytes[it.offset] === TYPE_ID) {
      it.offset++;
      const type_id = decode.number(bytes, it);
      type = this.context.get(type_id);
    }
    return type || defaultType;
  }
  createInstanceOfType(type) {
    return type.initializeForDecoder();
  }
  removeChildRefs(ref, allChanges) {
    const needRemoveRef = typeof ref[$childType] !== "string";
    const refId = ref[$refId];
    ref.forEach((value, key) => {
      allChanges?.push({
        ref,
        refId,
        op: OPERATION.DELETE,
        field: key,
        value: void 0,
        previousValue: value
      });
      if (needRemoveRef) {
        this.root.removeRef(value[$refId]);
      }
    });
  }
};
var QuantizedDescriptor = schema({
  min: t.float64(),
  max: t.float64(),
  bits: t.uint8(),
  mode: t.uint8()
  // 0 = clamp, 1 = wrap
}, "QuantizedDescriptor");
var ReflectionField = schema({
  name: t.string(),
  type: t.string(),
  referencedType: t.number(),
  /** Primitive child of a collection (`array`/`map`/... of "string" etc.) —
   *  its own slot, replacing the legacy `"array:string"` colon packing. */
  childPrimitive: t.string(),
  /** Set only on `t.quantized()` fields (`.optional()` — no auto-instantiated
   *  default; its absence is the "not quantized" signal on decode). */
  quantized: t.ref(QuantizedDescriptor).optional()
}, "ReflectionField");
var ReflectionType = schema({
  id: t.number(),
  extendsId: t.number(),
  fields: t.array(ReflectionField)
}, "ReflectionType");
var Reflection = schema({
  types: t.array(ReflectionType),
  rootType: t.number()
}, "Reflection");
Reflection.encode = function(encoder, it = { offset: 0 }) {
  const context = encoder.context;
  const reflection = new Reflection();
  const reflectionEncoder = new Encoder(reflection);
  const rootType = context.schemas.get(encoder.state.constructor);
  if (rootType > 0) {
    reflection.rootType = rootType;
  }
  const includedTypeIds = /* @__PURE__ */ new Set();
  const pendingReflectionTypes = {};
  const addType = (type) => {
    if (type.extendsId === void 0 || includedTypeIds.has(type.extendsId)) {
      includedTypeIds.add(type.id);
      reflection.types.push(type);
      const deps = pendingReflectionTypes[type.id];
      if (deps !== void 0) {
        delete pendingReflectionTypes[type.id];
        deps.forEach((childType) => addType(childType));
      }
    } else {
      if (pendingReflectionTypes[type.extendsId] === void 0) {
        pendingReflectionTypes[type.extendsId] = [];
      }
      pendingReflectionTypes[type.extendsId].push(type);
    }
  };
  context.schemas.forEach((typeid, klass) => {
    const type = new ReflectionType();
    type.id = Number(typeid);
    const inheritFrom = Object.getPrototypeOf(klass);
    if (inheritFrom !== Schema) {
      type.extendsId = context.schemas.get(inheritFrom);
    }
    const metadata = klass[Symbol.metadata];
    if (metadata !== inheritFrom[Symbol.metadata]) {
      const numFields = metadata[$numFields] ?? -1;
      for (let index = 0; index <= numFields; index++) {
        const field = metadata[index];
        if (field === void 0) {
          continue;
        }
        const fieldName = field.name;
        if (!Object.prototype.hasOwnProperty.call(metadata, fieldName)) {
          continue;
        }
        const reflectionField = new ReflectionField();
        reflectionField.name = fieldName;
        let fieldType;
        if (typeof field.type === "string") {
          fieldType = field.type;
        } else if (isQuantizedType(field.type)) {
          const d = field.type.quantized;
          fieldType = "quantized";
          const desc = new QuantizedDescriptor();
          desc.min = d.min;
          desc.max = d.max;
          desc.bits = d.bits;
          desc.mode = d.wrap ? 1 : 0;
          reflectionField.quantized = desc;
        } else {
          let childTypeSchema;
          if (Schema.is(field.type)) {
            fieldType = "ref";
            childTypeSchema = field.type;
          } else {
            fieldType = Object.keys(field.type)[0];
            if (typeof field.type[fieldType] === "string") {
              reflectionField.childPrimitive = field.type[fieldType];
            } else {
              childTypeSchema = field.type[fieldType];
            }
          }
          reflectionField.referencedType = childTypeSchema ? context.getTypeId(childTypeSchema) : -1;
        }
        reflectionField.type = fieldType;
        type.fields.push(reflectionField);
      }
    }
    addType(type);
  });
  for (const typeid in pendingReflectionTypes) {
    pendingReflectionTypes[typeid].forEach((type) => reflection.types.push(type));
  }
  const buf = reflectionEncoder.encodeAll(it);
  return buf.slice(0, it.offset);
};
Reflection.decode = function(bytes, it) {
  const reflection = new Reflection();
  const reflectionDecoder = new Decoder(reflection);
  reflectionDecoder.decode(bytes, it);
  const typeContext = new TypeContext();
  reflection.types.forEach((reflectionType) => {
    const parentClass = typeContext.get(reflectionType.extendsId) ?? Schema;
    const schema2 = class _ extends parentClass {
    };
    TypeContext.register(schema2);
    typeContext.add(schema2, reflectionType.id);
  }, {});
  const addFields = (metadata, reflectionType, parentFieldIndex) => {
    reflectionType.fields.forEach((field, i) => {
      const fieldIndex = parentFieldIndex + i;
      if (field.quantized !== void 0) {
        const q = field.quantized;
        Metadata.addField(metadata, fieldIndex, field.name, {
          quantized: resolveQuantize({ min: q.min, max: q.max, bits: q.bits, mode: q.mode === 1 ? "wrap" : "clamp" })
        });
      } else if (field.referencedType !== void 0) {
        const fieldType = field.type;
        const refType = typeContext.get(field.referencedType) ?? field.childPrimitive;
        if (fieldType === "ref") {
          Metadata.addField(metadata, fieldIndex, field.name, refType);
        } else {
          Metadata.addField(metadata, fieldIndex, field.name, { [fieldType]: refType });
        }
      } else {
        Metadata.addField(metadata, fieldIndex, field.name, field.type);
      }
    });
  };
  reflection.types.forEach((reflectionType) => {
    const schema2 = typeContext.get(reflectionType.id);
    const metadata = Metadata.initialize(schema2);
    const inheritedTypes = [];
    let parentType = reflectionType;
    do {
      inheritedTypes.push(parentType);
      parentType = reflection.types.find((t2) => t2.id === parentType.extendsId);
    } while (parentType);
    let parentFieldIndex = 0;
    inheritedTypes.reverse().forEach((reflectionType2) => {
      addFields(metadata, reflectionType2, parentFieldIndex);
      parentFieldIndex += reflectionType2.fields.length;
    });
  });
  const state = new (typeContext.get(reflection.rootType || 0))();
  return new Decoder(state, typeContext);
};
Reflection.makeEncodable = function(ctor) {
  const metadata = ctor[Symbol.metadata];
  if (!metadata)
    return ctor;
  const numFields = metadata[$numFields];
  if (numFields === void 0)
    return ctor;
  for (let i = 0; i <= numFields; i++) {
    const field = metadata[i];
    if (!field)
      continue;
    Metadata.defineField(ctor, metadata, i, field.name, field.type);
  }
  if (Object.prototype.hasOwnProperty.call(ctor, $encodeDescriptor)) {
    delete ctor[$encodeDescriptor];
  }
  return ctor;
};
registerType("map", { constructor: MapSchema });
registerType("array", { constructor: ArraySchema });
registerType("set", { constructor: SetSchema });
registerType("collection", { constructor: CollectionSchema });

// ../../node_modules/.pnpm/@colyseus+schema@5.0.27_typescript@5.5.4/node_modules/@colyseus/schema/build/input/index.mjs
var DEFAULT_SLOT_SIZE = 256;
var LENGTH_PREFIX_WORST_CASE = 5;
var InputEncoder = class _InputEncoder {
  instance;
  mode;
  historySize;
  _desc;
  _numFields;
  // Unreliable-mode ring: `_slots`/`_slotLens` hold each snapshot; `_outBuffer` holds the concatenated packet.
  _slots;
  _slotLens;
  _slotHead = 0;
  _slotCount = 0;
  _outBuffer;
  // Monotonic per-tick input seq (unreliable only): ++ per pushed slot. The
  // packet carries the OLDEST slot's seq once; the decoder derives each slot's
  // seq by position (slots are consecutive — every tick pushes). This is the
  // framework-owned seq that drives server-side dedupe of the redundancy ring
  // WITHOUT the user adding a seq field. Monotonic across reset() so a
  // reconnect that reuses the server buffer doesn't replay already-seen seqs.
  _seq = 0;
  // Delta delegate; setters populate its ChangeTree, `encode()` drains dirty fields.
  _encoder;
  constructor(instance, options = {}) {
    this.instance = instance;
    this.mode = options.mode ?? "reliable";
    this.historySize = this.mode === "unreliable" ? Math.max(1, options.historySize ?? 3) : 1;
    this._desc = getEncodeDescriptor(instance);
    const numFields = this._desc.metadata?.[$numFields];
    if (numFields === void 0) {
      throw new Error(`InputEncoder: '${instance.constructor.name}' has no fields`);
    }
    this._numFields = numFields;
    for (let i = 0; i <= numFields; i++) {
      if (this._desc.names[i] !== void 0 && this._desc.encoders[i] === void 0) {
        throw new Error(`InputEncoder: non-primitive field '${this._desc.names[i]}' on '${instance.constructor.name}' is not supported. Use Encoder for state containing refs/collections.`);
      }
    }
    if (this.mode === "unreliable") {
      this._slots = new Array(this.historySize);
      this._slotLens = new Array(this.historySize).fill(0);
      for (let i = 0; i < this.historySize; i++) {
        this._slots[i] = new Uint8Array(DEFAULT_SLOT_SIZE);
      }
      this._outBuffer = new Uint8Array((DEFAULT_SLOT_SIZE + LENGTH_PREFIX_WORST_CASE) * this.historySize);
    }
    this._encoder = new Encoder(instance);
  }
  /**
   * The framework input seq of the most recently encoded tick (unreliable
   * mode): monotonic, ++ per `encode()`, kept across {@link reset}. `0` in
   * reliable mode (which sequences inputs implicitly by message count). The
   * client keys its reconciliation replay ring by this so the server's
   * seq-value ack lines up across packet loss.
   */
  get seq() {
    return this._seq;
  }
  /**
   * Encode the bound instance's delta. Returns a subarray of an internal
   * buffer — copy if retaining across calls.
   *
   * Output shape by mode:
   * - `reliable`: only changed fields, or empty when nothing changed.
   * - `unreliable`: ring of the last `historySize` deltas, length-framed
   *   per slot. A no-change tick pushes an empty (carry-forward) slot but
   *   still re-emits the ring. Empty only until the first slot is pushed.
   *
   * Buffers auto-grow on overflow; a one-time `console.warn` is
   * emitted the first time it happens.
   */
  encode() {
    const blob = this._produceDelta();
    return this.mode === "reliable" ? blob : this._pushAndEmitRing(blob);
  }
  /**
   * Reset the encoder's internal state:
   * - Drops the unreliable ring buffer.
   * - Re-marks every currently populated field as dirty, so the next
   *   `encode()` emits a fresh full snapshot.
   *
   * Useful on disconnect / reconnect / scene transitions.
   */
  reset() {
    this._slotHead = 0;
    this._slotCount = 0;
    this._encoder.discardChanges();
    const tree = this.instance[$changes];
    const values = this.instance[$values];
    for (let i = 0; i <= this._numFields; i++) {
      if (values[i] === void 0 || values[i] === null)
        continue;
      tree.markDirty(i);
    }
  }
  /**
   * Copy the bound instance's field values into `target` (a same-type instance)
   * in place — no allocation, no `Object.keys` (cf. `Schema#assign`) and no
   * `clone()`. For buffering a snapshot of the just-sent input into a reused
   * slot (e.g. a client reconciliation/replay ring) without the transport
   * having to reach into schema internals. The codec owns this because it owns
   * the field representation. The in-place / alloc-free cousin of `clone()`,
   * and the inverse direction of `Schema#assign(source)`.
   */
  copyInto(target2) {
    const src2 = this.instance[$values];
    const dst = target2[$values];
    for (let i = 0; i <= this._numFields; i++)
      dst[i] = src2[i];
  }
  // ────────────────────────────────────────────────────────────────────
  // Delta producer — one diff of the instance; caller routes by mode.
  // ────────────────────────────────────────────────────────────────────
  /** Delegate to the wrapped Encoder, then clear its dirty set. */
  _produceDelta() {
    const bytes = this._encoder.encode();
    this._encoder.discardChanges();
    return bytes;
  }
  // ────────────────────────────────────────────────────────────────────
  // Ring — push blob to current slot, concat oldest→newest, return framed packet.
  // ────────────────────────────────────────────────────────────────────
  _pushAndEmitRing(blob) {
    this._seq++;
    let slot = this._slots[this._slotHead];
    if (blob.length > slot.byteLength) {
      slot = this._slots[this._slotHead] = _InputEncoder._grow(slot, blob.length, "unreliable ring slot");
    }
    slot.set(blob);
    this._slotLens[this._slotHead] = blob.length;
    this._slotHead = (this._slotHead + 1) % this.historySize;
    if (this._slotCount < this.historySize)
      this._slotCount++;
    return this._emitRing();
  }
  _emitRing() {
    const baseSeq = this._seq - this._slotCount + 1;
    let needed = LENGTH_PREFIX_WORST_CASE;
    for (let i = 0; i < this._slotCount; i++) {
      needed += this._slotLens[i] + LENGTH_PREFIX_WORST_CASE;
    }
    let out = this._outBuffer;
    if (needed > out.byteLength) {
      out = this._outBuffer = _InputEncoder._grow(out, needed, "unreliable output packet");
    }
    const outIt = { offset: 0 };
    encode.number(out, baseSeq, outIt);
    const oldest = (this._slotHead - this._slotCount + this.historySize) % this.historySize;
    for (let i = 0; i < this._slotCount; i++) {
      const idx = (oldest + i) % this.historySize;
      const len = this._slotLens[idx];
      encode.number(out, len, outIt);
      out.set(this._slots[idx].subarray(0, len), outIt.offset);
      outIt.offset += len;
    }
    return out.subarray(0, outIt.offset);
  }
  // ────────────────────────────────────────────────────────────────────
  // Buffer growth. Writes past `byteLength` silently drop but `it.offset` still advances, so callers detect overflow via `offset > byteLength` and re-encode into the grown buffer.
  // ────────────────────────────────────────────────────────────────────
  static _warned = false;
  static _grow(buf, needed, where) {
    const newSize = Math.max(needed, buf.byteLength * 2);
    if (!_InputEncoder._warned) {
      _InputEncoder._warned = true;
      console.warn(`@colyseus/schema/input: InputEncoder buffer overflow in ${where}. Growing to ${newSize} bytes.`);
    }
    return new Uint8Array(newSize);
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/core/utils.mjs
function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/debug-channel.mjs
var makeRef = typeof WeakRef !== "undefined" ? (h) => new WeakRef(h) : (h) => ({ deref: () => h });
var MAX_BUFFERED = 64;
function publishDebug(channel, handle) {
  const g = globalThis;
  let reg = g.__colyseusDebug;
  if (!reg) {
    const buffer = [];
    reg = g.__colyseusDebug = {
      __buffer: buffer,
      publish(ch, h) {
        buffer.push([ch, makeRef(h)]);
        if (buffer.length > MAX_BUFFERED) {
          buffer.shift();
        }
      }
    };
  }
  reg.publish(channel, handle);
}
function debugOverlayActive() {
  if (typeof globalThis === "undefined") {
    return false;
  }
  const reg = globalThis.__colyseusDebug;
  return reg != null && reg.__buffer === void 0;
}

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/core/schema-reflect.mjs
var $METADATA = Symbol.metadata ?? /* @__PURE__ */ Symbol.for("Symbol.metadata");
function metadataOf(instance) {
  return instance.constructor[$METADATA];
}

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/input/InputHandle.mjs
var MAX_VARINT = 9;
var RELIABLE_STAMP_MAX = MAX_VARINT;
var ringStampMax = (historySize, both) => (both ? 2 : 1) * (MAX_VARINT + 4 + MAX_VARINT * historySize);
var InputHandleImpl = class _InputHandleImpl {
  data;
  _host;
  _encoder;
  // Reused frame buffer — safe ONLY because every transport copies synchronously
  // on send (browser ws.send snapshots; H3 frame() copies before write). A
  // transport that queued the view uncopied would see it overwritten next send.
  _scratch = new Uint8Array(2048);
  // Cached framed-packet view into `_scratch`; re-made when the packet size
  // changes (delta bodies vary) or `_scratch` grows — so it mostly pays off on
  // steady no-change frames.
  _framed = null;
  // Input round-trip state (one handle per room).
  _sentCount = 0;
  // reliable inputs transmitted
  _lastProcessed = 0;
  // server-acked (consumedCount)
  _epoch = 0;
  // reset counter — see InputHandle.epoch
  // RTT send-time ring (seq % size → send time); avoids per-send Map churn.
  // Sized WITH the replay ring (one seq window — replay and RTT age out together).
  _sendTimes;
  // Sent-input replay ring, mirroring the server's per-client input buffer: each reliable send snapshots
  // `data` into slot `seq % size` via alloc-free `copyInto` so a reconciler can replay unacked inputs.
  // Size = worst-case in-flight = (RTT + patch interval) × input rate. tickRate/patchRate from the
  // handshake (ack rides the patch, so lags up to one interval); RTT is budgeted generously. Floored
  // at 64; grows for high input rates where 64 would silently overflow (aged-out entries warn once).
  static BUFFER_FLOOR = 64;
  static BUFFER_RTT_BUDGET_MS = 1e3;
  static BUFFER_HEADROOM = 1.5;
  _inputBufferSize;
  _inputBuffer = null;
  // lazily allocated (needs data ctor)
  // Per-seq reckonTime stamp (server-clock ms), parallel to _inputBuffer — the
  // reconciler reads it back as ctx.reckonTime on the live step AND on replay, so
  // both hit-test at the exact instant the server rewinds to. Sized = replay ring.
  // Lazily allocated AND only when reckon stamping is on (`_stampReckon`): a room
  // without reckon lag-comp never rewinds to it, so we don't track it (reckonTimeAt
  // then reads 0 and the controller resolves ctx.reckonTime to serverNow()).
  _reckonTimes = null;
  // Reckon instant of the in-flight send() — computed in send() when stamping,
  // stamped on the wire AND recorded into _reckonTimes by _recordSent (same value
  // both). 0 when not stamping.
  _pendingReckon = 0;
  // Running baseline for the DELTA-CODED reliable stamp: the last timeline u32
  // sent. Each stamped send transmits `stamp − _lastStamp` (signed, ≈ one fixed
  // step per tick → ~1 byte vs a raw 4-byte u32); the server mirrors this baseline
  // and reliable+in-order keeps the two locked. reset() re-zeros it so the first
  // delta after a (re)connect carries the absolute, re-syncing with the server's
  // freshly-allocated baseline.
  _lastStamp = 0;
  // Per-seq timeline stamps for the UNRELIABLE ring, indexed `seq % historySize`
  // — exactly the slots a packet carries, so the index can't collide. Lazily
  // allocated, and only when the room asked for stamps. See _writeRingStamps.
  _stampRing = null;
  // Parallel to _stampRing, BOTH mode only: the renderDelta each slot was
  // sampled with, so the block can carry the exact value per slot.
  _renderDeltaRing = null;
  // Slots the encoder's ring currently carries (≤ historySize). Tracked, not
  // derived from `seq`: `reset()` drops the ring but keeps the seq monotonic.
  _ringSlots = 0;
  static _warnedBufferOverflow = false;
  static _warnedAllowRewindIgnored = false;
  // Dev diagnostic (see _warnUnknownFields): unknown data keys already warned.
  _warnedUnknownKeys = null;
  // Lag-comp stamp (server INPUT_OPTIONS handshake): which timeline(s) each
  // reliable input is prefixed with, DELTA-CODED on the wire (see _lastStamp).
  // Both → [varint Δreckon][u16 renderDelta]; reckon-only → [varint Δreckon];
  // render-only → [varint Δrender]; neither → no prefix.
  _stampRender = false;
  _stampReckon = false;
  // Optional per-send gate (app `allowRewind`): when set, only inputs it returns
  // true for carry the stamp — the rest skip it (and the TIMED bit), trimming the
  // timestamp on frames the server won't rewind (e.g. non-firing inputs). The
  // delta baseline (`_lastStamp`) only advances on stamped sends, so it stays
  // locked with the server across the gaps. Absent ⇒ stamp every reliable input.
  _allowRewind;
  // Send observers (the prediction layer subscribes here to step its simulation
  // on each send — see onSend). null until the first subscribe, so a handle used
  // without prediction pays nothing (no allocation, no per-send dispatch).
  // COPY-ON-WRITE: subscribe/unsubscribe replace the array (cold path), so the
  // dispatch loop's captured ref can't skip or double-fire when a listener
  // mutates the list mid-dispatch.
  _sendListeners = null;
  // The app's interpolation buffer (ms) — how far in the past it renders remote
  // entities (e.g. a `Predict` lerp `delay`). The stamp subtracts this AND the
  // one-way latency (smoothedRtt/2) the SDK already tracks, so callers pass only
  // the interp buffer, never the latency. When the app doesn't set it explicitly,
  // `predict.reconciler`/`sim` bind `_renderDelayProvider` to the Predict lerp
  // `delay` (see bindRenderDelay) so the interp buffer and the server's rewind
  // instant stay ONE value — no two-number "keep these equal" footgun.
  _renderDelay = 0;
  _renderDelayExplicit = false;
  _renderDelayProvider;
  // Server-advertised rates: fixed step (Hz), patch interval (ms = reconcile
  // cadence), and physics sub-steps per input tick.
  _tickRate;
  _patchRate;
  _subSteps = 1;
  constructor(host, data, encoder, opts) {
    this._host = host;
    this.data = data;
    this._encoder = encoder;
    this._stampRender = opts?.stampRender ?? false;
    this._stampReckon = opts?.stampReckon ?? false;
    this._allowRewind = opts?.allowRewind;
    if (this._allowRewind !== void 0 && encoder.mode === "unreliable" && !_InputHandleImpl._warnedAllowRewindIgnored) {
      _InputHandleImpl._warnedAllowRewindIgnored = true;
      console.warn(`@colyseus/sdk: \`allowRewind\` is ignored on \`mode:"unreliable"\` \u2014 a packet stamps its whole redundancy ring or none of it, so excluding one input would cost bandwidth rather than save it. Use \`mode:"reliable"\` to gate the lag-comp stamp per input.`);
    }
    this._renderDelay = opts?.renderDelay ?? 0;
    this._renderDelayExplicit = opts?.renderDelay !== void 0;
    this._tickRate = opts?.tickRate;
    this._patchRate = opts?.patchRate;
    this._subSteps = opts?.subSteps ?? 1;
    const stepMs = this._tickRate ? 1e3 / this._tickRate : 1e3 / 60;
    const window2 = _InputHandleImpl.BUFFER_RTT_BUDGET_MS + (this._patchRate ?? 0);
    this._inputBufferSize = Math.max(_InputHandleImpl.BUFFER_FLOOR, Math.ceil(window2 / stepMs * _InputHandleImpl.BUFFER_HEADROOM));
    this._sendTimes = new Float64Array(this._inputBufferSize);
  }
  get mode() {
    return this._encoder.mode;
  }
  get tickRate() {
    return this._tickRate;
  }
  // `1/hz` is correctly-rounded IEEE-754 → bit-identical to the server's stepSeconds.
  get stepSeconds() {
    return this._tickRate ? 1 / this._tickRate : void 0;
  }
  get stepMs() {
    return this._tickRate ? 1e3 / this._tickRate : void 0;
  }
  get patchRate() {
    return this._patchRate;
  }
  get subSteps() {
    return this._subSteps;
  }
  // `(1/hz)/n` — the SAME expression the server's ctx.subDt uses → bit-identical dt.
  get subStepSeconds() {
    return this._tickRate ? 1 / this._tickRate / this._subSteps : void 0;
  }
  get subStepMs() {
    return this._tickRate ? 1e3 / this._tickRate / this._subSteps : void 0;
  }
  get lastProcessed() {
    return this._lastProcessed;
  }
  get sentCount() {
    return this._sentCount;
  }
  get pendingCount() {
    return this._sentCount - this._lastProcessed;
  }
  get replayBufferSize() {
    return this._inputBufferSize;
  }
  get epoch() {
    return this._epoch;
  }
  at(seq) {
    if (this._inputBuffer === null)
      return void 0;
    if (seq <= this._lastProcessed || seq > this._sentCount)
      return void 0;
    if (this._sentCount - seq >= this._inputBufferSize) {
      if (!_InputHandleImpl._warnedBufferOverflow) {
        _InputHandleImpl._warnedBufferOverflow = true;
        console.warn(`@colyseus/sdk: input replay buffer (${this._inputBufferSize}) overflowed \u2014 RTT exceeds its budget at this input rate; reconciliation may drift.`);
      }
      return void 0;
    }
    return this._inputBuffer[seq % this._inputBufferSize];
  }
  reckonTimeAt(seq) {
    if (this._reckonTimes === null)
      return 0;
    if (seq <= this._lastProcessed || seq > this._sentCount)
      return 0;
    if (this._sentCount - seq >= this._inputBufferSize)
      return 0;
    return this._reckonTimes[seq % this._inputBufferSize];
  }
  reset() {
    this._encoder.reset();
    this._sentCount = this._lastProcessed = this._encoder.seq;
    this._framed = null;
    this._lastStamp = 0;
    this._ringSlots = 0;
    this._sendTimes.fill(0);
    this._epoch++;
  }
  /**
   * @internal Bind lag-comp's `renderDelay` to a live provider — the owning
   * Predict's lerp `delay`. Called by `predict.reconciler`/`predict.sim` when
   * they wire this handle, so the remote interp buffer and the server's rewind
   * instant are derived from ONE number and can't drift apart. No-op if the app
   * passed an explicit `renderDelay` to `room.input()` — an explicit value wins.
   */
  bindRenderDelay(provider) {
    if (this._renderDelayExplicit)
      return;
    this._renderDelayProvider = provider;
  }
  /** Effective interp buffer (ms): a bound provider (the Predict lerp `delay`)
   *  when present, else the static value from `room.input()`. */
  _resolveRenderDelay() {
    return this._renderDelayProvider ? this._renderDelayProvider() : this._renderDelay;
  }
  /** Dev diagnostic (debug overlay only). An assignment to an UNDECLARED field
   *  lands as a plain own property — declared fields live behind prototype
   *  setters in the dense `$values` array and never create own keys — so any
   *  own enumerable string key missing from the schema metadata is a write
   *  that will never be encoded. Warn once per key. */
  _warnUnknownFields() {
    const meta = metadataOf(this.data);
    if (!meta)
      return;
    for (const key of Object.keys(this.data)) {
      if (meta[key] !== void 0 || this._warnedUnknownKeys?.has(key))
        continue;
      (this._warnedUnknownKeys ??= /* @__PURE__ */ new Set()).add(key);
      console.warn(`@colyseus/sdk input: "${key}" is not a declared field on ${this.data.constructor.name} \u2014 the write is never encoded or sent. Declare it with @type(...) on the input schema, or remove the write.`);
    }
  }
  send() {
    const conn = this._host.connection;
    if (!conn?.isOpen)
      return 0;
    if (debugOverlayActive())
      this._warnUnknownFields();
    const bytes = this._encoder.encode();
    const reliable = this._encoder.mode === "reliable";
    const stampsEnabled = this._stampReckon || this._stampRender;
    const wantStamp = stampsEnabled && reliable && (this._allowRewind === void 0 || this._allowRewind(this.data));
    const wantRingStamp = stampsEnabled && !reliable;
    const both = this._stampReckon && this._stampRender;
    const stampMax = wantStamp ? RELIABLE_STAMP_MAX + (both ? 2 : 0) : wantRingStamp ? ringStampMax(this._encoder.historySize, both) : 0;
    const totalMax = 1 + stampMax + bytes.length;
    if (totalMax > this._scratch.byteLength) {
      this._scratch = new Uint8Array(Math.max(totalMax, this._scratch.byteLength * 2));
      this._framed = null;
    }
    this._scratch[0] = (reliable ? Protocol.ROOM_INPUT_RELIABLE : Protocol.ROOM_INPUT_UNRELIABLE) | (wantStamp || wantRingStamp ? ProtocolModifier.TIMED : 0);
    const it = { offset: 1 };
    if (wantRingStamp) {
      this._writeRingStamps(it);
    } else if (wantStamp) {
      const { stamp, renderDelta } = this._sampleStamp();
      encode.number(this._scratch, stamp - this._lastStamp, it);
      this._lastStamp = stamp;
      if (both) {
        encode.uint16(this._scratch, renderDelta, it);
      }
    } else {
      this._pendingReckon = 0;
    }
    this._scratch.set(bytes, it.offset);
    const total = it.offset + bytes.length;
    if (this._framed === null || this._framed.byteLength !== total) {
      this._framed = this._scratch.subarray(0, total);
    }
    const framed = this._framed;
    let seq;
    if (reliable) {
      conn.send(framed);
      seq = ++this._sentCount;
    } else {
      conn.sendUnreliable(framed);
      seq = this._sentCount = this._encoder.seq;
    }
    this._recordSent(seq);
    return seq;
  }
  /**
   * @internal Write the unreliable channel's self-contained stamp block, then
   * leave `it` at the start of the ring body.
   *
   *     [varint k][uint32 newest][varint Δ]×(k−1)
   *     [uint16 rdNewest][varint Δrd]×(k−1)        ← BOTH mode only
   *
   * `k` is the slot count of the ring this packet carries (oldest→newest, the
   * order `InputDecoder.decodeAll` yields). `newest` is THIS send's timeline
   * instant, absolute — so a packet is readable on its own and no amount of
   * loss or reordering can desync a baseline. Each Δ walks one slot older
   * (`stamp[i] = stamp[i+1] − Δ`), which is ≈ one fixed step and so ~1 byte
   * through the self-describing number codec.
   *
   * BOTH mode appends the `renderDelta` series in the same shape, so every slot
   * carries the interp buffer + one-way latency it was actually sampled with,
   * rather than the newest slot's value smeared across the ring. Consecutive
   * values differ by ~0–1 ms (`renderDelay` is app-set and constant,
   * `smoothedRtt` is smoothed), which lands in the codec's 1-byte fixnum range —
   * so exactness costs one byte per redundant slot, and a violent RTT swing
   * degrades to at most 3 (the u16 range), never more.
   *
   * All-or-nothing: every slot in the block is stamped, or the room asked for
   * no stamps and there is no block. `allowRewind` does not apply here — the
   * block ships whole, so excluding one slot would save nothing while making
   * its neighbour's delta swing the full absolute value. The one transient
   * exception is the pre-clock-sync window, where the slots genuinely have no
   * known instant and ship as 0 for the server to read live.
   */
  _writeRingStamps(it) {
    const { stamp, renderDelta } = this._sampleStamp();
    const historySize = this._encoder.historySize;
    const seq = this._encoder.seq;
    const k = this._ringSlots = Math.min(this._ringSlots + 1, historySize);
    const ring = this._stampRing ??= new Float64Array(historySize);
    ring[seq % historySize] = stamp;
    encode.number(this._scratch, k, it);
    encode.uint32(this._scratch, stamp, it);
    this._writeSeriesDeltas(ring, seq, k, it);
    if (this._stampReckon && this._stampRender) {
      const rdRing = this._renderDeltaRing ??= new Uint16Array(historySize);
      rdRing[seq % historySize] = renderDelta;
      encode.uint16(this._scratch, renderDelta, it);
      this._writeSeriesDeltas(rdRing, seq, k, it);
    }
  }
  /** Walk `k` ring slots newest→oldest, emitting each step as a signed delta. */
  _writeSeriesDeltas(ring, seq, k, it) {
    const size = ring.length;
    for (let i = 1; i < k; i++) {
      encode.number(this._scratch, ring[(seq - i + 1) % size] - ring[(seq - i) % size], it);
    }
  }
  /**
   * @internal Sample this send's lag-comp instants from the clock, and record
   * the reckon one for {@link reckonTimeAt}.
   *
   * `renderDelta` is the interp buffer (`renderDelay`, app-set) plus the one-way
   * downstream latency (≈ `smoothedRtt/2`, ours). `stamp` is the timeline this
   * room actually rewinds on: reckon rooms ship the estimate directly — the
   * server reads its history at that index, so clock/RTT estimation error
   * cancels (client displayed f(est), server reads f(est)) — while snapshot
   * rooms ship `reckonTime − renderDelta`, the instant lerped remotes were on
   * screen. BOTH ships reckon plus the gap and lets the server subtract.
   *
   * Everything is 0 before the clock syncs, or when `allowRewind` excluded this
   * input: the server then falls back to live positions rather than trusting a
   * bogus instant.
   */
  _sampleStamp() {
    const clock = this._host.clock;
    const synced = (clock?.lastServerTime?.() ?? 0) > 0;
    const rk = synced ? Math.max(0, Math.round(clock.serverNow())) >>> 0 : 0;
    const renderDelta = synced ? Math.min(65535, Math.max(0, Math.round(this._resolveRenderDelay() + (clock.smoothedRtt?.() ?? 0) / 2))) : 0;
    this._pendingReckon = rk;
    return { stamp: this._stampReckon ? rk : rk > renderDelta ? rk - renderDelta : 0, renderDelta };
  }
  /**
   * @internal Snapshot the just-sent input into the replay ring and stamp its
   * send time, keyed by `seq`. Lets a reconciler replay unacked inputs via
   * {@link at} and the TIMED ack sample RTT. The snapshot is alloc-free through
   * the codec's `copyInto` (no `Object.keys`), which stages every field, so
   * each slot is a full snapshot independent of the wire delta encoding.
   */
  _recordSent(seq) {
    if (this._inputBuffer === null) {
      const Ctor = this.data.constructor;
      this._inputBuffer = Array.from({ length: this._inputBufferSize }, () => new Ctor());
    }
    this._encoder.copyInto(this._inputBuffer[seq % this._inputBufferSize]);
    this._sendTimes[seq % this._inputBufferSize] = now();
    if (this._stampReckon) {
      (this._reckonTimes ??= new Float64Array(this._inputBufferSize))[seq % this._inputBufferSize] = this._pendingReckon;
    }
    const ls = this._sendListeners;
    if (ls !== null)
      for (let i = 0; i < ls.length; i++)
        ls[i](seq);
  }
  onSend(listener) {
    const ls = this._sendListeners;
    this._sendListeners = ls !== null ? [...ls, listener] : [listener];
    return () => {
      const cur = this._sendListeners;
      if (cur === null)
        return;
      const i = cur.indexOf(listener);
      if (i < 0)
        return;
      const next = cur.slice();
      next.splice(i, 1);
      this._sendListeners = next.length > 0 ? next : null;
    };
  }
  /**
   * @internal Feed the server's last-PROCESSED input seq (decoded from the
   * TIMED prefix). Advances {@link lastProcessed} (monotonic) and returns the
   * round-trip time sample for that ack (`now − sendTime(seq)`), or `-1` if the
   * send time is unknown. The {@link RoomClockImpl} filters/EMA-smooths the sample.
   */
  ackInput(seq) {
    if (seq <= this._lastProcessed)
      return -1;
    const aged = this._sentCount - seq >= this._inputBufferSize;
    this._lastProcessed = seq;
    if (aged)
      return -1;
    const sentAt = this._sendTimes[seq % this._inputBufferSize];
    return sentAt > 0 ? now() - sentAt : -1;
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/RoomClock.mjs
var NULL_CLOCK = Object.freeze({
  now: () => now(),
  serverNow: () => now(),
  renderNow: () => now(),
  rtt: () => 0,
  smoothedRtt: () => 0,
  jitter: () => 0,
  lastServerTime: () => 0,
  patchInterval: () => 0,
  setPatchInterval: (_ms) => {
  },
  sample: (_sNow, _rttSample) => {
  }
});
var RoomClockImpl = class _RoomClockImpl {
  /** Default exponential-smoothing weight for offset + RTT EMA. */
  static EMA_ALPHA = 0.1;
  /** Default slew time-constant (ms) for {@link renderNow}. ~250 ms: offset
   *  corrections smear over a few frames instead of popping, while the render
   *  timeline still tracks `serverNow()` closely in steady state. */
  static RENDER_TAU = 250;
  /** Gap (ms) past which {@link renderNow} SNAPS to `serverNow()` instead of
   *  slewing. Slewing a large gap (join warmup while the offset EMA is still
   *  converging, a route-change offset jump, a tab-resume stall) would render
   *  a visible standing lag; only wobble-scale gaps get smoothed. */
  static RENDER_SNAP = 250;
  /**
   * RTT samples greater than `outlierFactor × smoothedRtt` are rejected.
   * Catches tab-resume spikes once the smoothed value has converged; the
   * separate `_rttHasSample` seed prevents this from clamping early
   * legitimate samples to a stranded baseline.
   */
  static RTT_OUTLIER_X = 4;
  /** RFC 3550 jitter EMA gain (1/16) — slower than the RTT/offset EMA so the
   *  reported jitter is a steady readout rather than a per-patch flicker. */
  static JITTER_GAIN = 1 / 16;
  /** Arrival gaps beyond `JITTER_STALL_X ×` the cadence (a tab-resume stall), and
   *  sub-cadence bursts (mult 0), are skipped so they don't spike the jitter EMA. */
  static JITTER_STALL_X = 4;
  /**
   * Clock-offset jitter gate. An offset sample is only folded into the EMA when
   * its RTT is within `RTT_GATE_FACTOR ×` the windowed-minimum RTT — i.e. the
   * packet traversed near-empty queues, so its `rtt/2` one-way estimate (and
   * thus the offset) is least corrupted by jitter. Higher-RTT samples carry
   * proportionally more jitter and are dropped (the offset just holds). This is
   * the NTP/QUIC pattern: EMA-smooth the value you report, but filter the input
   * by the low-delay floor — purely a VARIANCE reduction on `serverNow()`, which
   * is what steadies the stamped reckonTime. The held offset's small bias is
   * harmless (it cancels: predict + rewind share the stamped instant).
   */
  static RTT_GATE_FACTOR = 1.2;
  /** Sliding window (ms) over which the RTT floor (gate reference) is tracked.
   *  Long enough to hold a good low-jitter sample; on a route change the stale
   *  floor expires within this horizon and the gate re-opens. */
  static RTT_GATE_WINDOW = 1e4;
  /** Post-reset warmup: the first `RTT_GATE_WARMUP` RTT-valid samples BYPASS the
   *  gate (pure EMA), so the offset converges at baseline speed after a reset /
   *  reconnect. The gate drops samples, which otherwise stretches convergence —
   *  worst at high RTT, where it showed as an inflated offset.std until settled.
   *  ~3× the EMA time-constant (1/α = 10) ⇒ converged before the gate engages for
   *  steady-state variance reduction. `0` disables the warmup (gate from sample 1). */
  static RTT_GATE_WARMUP = 30;
  _clockOffset = 0;
  // serverTime - clientTime at sample time
  _clockHasSample = false;
  _offsetCount = 0;
  // RTT-valid offset samples since reset (gate warmup)
  // Sliding-window-minimum of RTT (monotonic deque: values increasing front→back,
  // front = windowed min). Parallel number arrays → no per-sample object alloc.
  _rttFloorT = [];
  // sample arrival times (tNow), aligned with _rttFloorV
  _rttFloorV = [];
  // RTT values, monotonically increasing
  _rtt = 0;
  // most recent RTT sample (ms)
  _smoothedRtt = 0;
  // EMA over RTT samples
  _rttHasSample = false;
  _jitter = 0;
  // EMA of patch-arrival deviation from the cadence (ms)
  _lastRecvTime = -1;
  // arrival time of the previous patch; -1 until the first
  _lastServerTime = 0;
  // raw sNow of the last patch (snapshot stamp)
  _patchInterval = 0;
  // server patchRate (ms); 0 until advertised
  _renderTau = _RoomClockImpl.RENDER_TAU;
  // slew time-constant (ms); 0 disables
  _renderSn = 0;
  // slew-limited render-clock reading (ms since room start)
  _renderSnAt = 0;
  // local time (now()) the render clock last advanced
  /** Estimated server clock: **milliseconds since room start** (the server's
   *  `clock.elapsedTime`, reconstructed via the wire `sNow` + local offset).
   *  NOT raw `performance.now()` — a portable integer-ms timeline the server's
   *  own time-keyed logic shares, so client-side reckon stays in phase.
   *  Returns the local clock until the first sample lands. */
  serverNow() {
    return now() + this._clockOffset;
  }
  /** Slew-limited render timeline — see {@link RoomClockLike.renderNow}.
   *  Free-runs at 1 ms/ms and servos toward {@link serverNow} with the
   *  time-constant set by {@link setRenderTau} (default {@link RENDER_TAU});
   *  `τ ≤ 0` disables the slew and returns `serverNow()` verbatim. Idempotent
   *  within a frame: it advances only on the first call each frame (guarded on
   *  the local clock), so reading it once per tracked entity doesn't over-step
   *  it. */
  renderNow() {
    const target2 = this.serverNow();
    if (this._renderTau <= 0) {
      return target2;
    }
    const t2 = now();
    if (this._renderSn === 0) {
      this._renderSn = target2;
      this._renderSnAt = t2;
      return this._renderSn;
    }
    const dt = Math.min(t2 - this._renderSnAt, 100);
    if (dt < 0.5) {
      return this._renderSn;
    }
    this._renderSnAt = t2;
    this._renderSn += dt;
    if (Math.abs(target2 - this._renderSn) > _RoomClockImpl.RENDER_SNAP) {
      this._renderSn = target2;
      return this._renderSn;
    }
    this._renderSn += (target2 - this._renderSn) * (1 - Math.exp(-dt / this._renderTau));
    return this._renderSn;
  }
  /** Set the {@link renderNow} slew time-constant (ms). `≤ 0` disables slewing
   *  (renderNow == serverNow). Larger = smoother, but offset corrections lag
   *  longer. */
  setRenderTau(milliseconds) {
    this._renderTau = milliseconds > 0 ? milliseconds : 0;
  }
  /** Local monotonic clock (ms): the client's own reading WITHOUT the server
   *  offset — the base {@link serverNow} adds the offset to. Use it for
   *  self-imposed relative cooldowns (`now() - lastAction >= COOLDOWN_MS`): they
   *  need only a steady rate, not clock sync, so this avoids the offset-EMA
   *  jitter `serverNow()` carries. @see RoomClockLike.now */
  now() {
    return now();
  }
  /** Most recent RTT sample (ms). `0` until the first RTT-valid sample lands. */
  rtt() {
    return this._rtt;
  }
  /** EMA-smoothed RTT (ms). `0` until the first RTT-valid sample lands. Prefer this for forward-prediction. */
  smoothedRtt() {
    return this._smoothedRtt;
  }
  /** Connection jitter (ms): RFC 3550-style interarrival jitter — see
   *  {@link RoomClockLike.jitter}. `0` until the cadence is known and two patches land. */
  jitter() {
    return this._jitter;
  }
  /** Server-encode time (raw `sNow`) of the most recent patch. Pair with
   *  {@link serverNow} for the snapshot age (`serverNow() − lastServerTime()`).
   *  `0` until the first sample. */
  lastServerTime() {
    return this._lastServerTime;
  }
  /** Server snapshot cadence (`patchRate`, ms); `0` until the handshake
   *  advertises it. @see RoomClockLike.patchInterval */
  patchInterval() {
    return this._patchInterval;
  }
  /** Set the server snapshot cadence (ms), from the input handshake's
   *  advertised `patchRate`. Non-positive values clear it back to `0`. */
  setPatchInterval(milliseconds) {
    this._patchInterval = milliseconds > 0 ? milliseconds : 0;
  }
  /**
   * Feed a decoded TIMED sample. The input round-trip lives on the
   * {@link InputHandle} now — the Room hands us a pre-computed RTT sample.
   *
   * @param sNow       Server clock (ms since room start, `clock.elapsedTime`)
   *                   → clock offset.
   * @param rttSample  Round-trip time (ms) for the input ack this packet
   *                   carried, or `< 0` if none (no matching send / no input
   *                   yet). Filtered + EMA-smoothed here.
   */
  sample(sNow, rttSample) {
    const tNow = now();
    const a = _RoomClockImpl.EMA_ALPHA;
    const PI = this._patchInterval;
    if (this._lastRecvTime >= 0 && PI > 0) {
      const gap = tNow - this._lastRecvTime;
      const mult = Math.round(gap / PI);
      if (mult >= 1 && mult <= _RoomClockImpl.JITTER_STALL_X) {
        this._jitter += (Math.abs(gap - mult * PI) - this._jitter) * _RoomClockImpl.JITTER_GAIN;
      }
    }
    this._lastRecvTime = tNow;
    this._lastServerTime = sNow;
    if (rttSample < 0) {
      rttSample = -1;
    } else if (this._smoothedRtt > 0 && rttSample > this._smoothedRtt * _RoomClockImpl.RTT_OUTLIER_X) {
      rttSample = -1;
    }
    const offsetSample = rttSample >= 0 ? sNow + rttSample / 2 - tNow : sNow - tNow;
    if (!this._clockHasSample) {
      this._clockOffset = offsetSample;
      this._clockHasSample = true;
      if (rttSample >= 0) {
        this.pushRttFloor(rttSample, tNow);
        this._offsetCount = 1;
      }
    } else if (rttSample >= 0) {
      const floor = this.pushRttFloor(rttSample, tNow);
      const warming = this._offsetCount < _RoomClockImpl.RTT_GATE_WARMUP;
      this._offsetCount++;
      if (warming || rttSample <= floor * _RoomClockImpl.RTT_GATE_FACTOR) {
        this._clockOffset = this._clockOffset * (1 - a) + offsetSample * a;
      }
    }
    if (rttSample >= 0) {
      this._rtt = rttSample;
      if (!this._rttHasSample) {
        this._smoothedRtt = rttSample;
        this._rttHasSample = true;
      } else {
        this._smoothedRtt = this._smoothedRtt * (1 - a) + rttSample * a;
      }
    }
  }
  /**
   * Push an RTT sample into the sliding-window-minimum deque and return the
   * current windowed-min RTT (the jitter-free floor the offset gate references).
   * Standard monotonic-deque algorithm — O(1) amortized, the deque holds only
   * descending "record-low" candidates (typically 1–few entries).
   */
  pushRttFloor(rttSample, tNow) {
    const T = this._rttFloorT, V = this._rttFloorV;
    while (V.length > 0 && V[V.length - 1] >= rttSample) {
      V.pop();
      T.pop();
    }
    V.push(rttSample);
    T.push(tNow);
    const cutoff = tNow - _RoomClockImpl.RTT_GATE_WINDOW;
    while (T.length > 0 && T[0] < cutoff) {
      T.shift();
      V.shift();
    }
    return V[0];
  }
  /** Reset all state. Useful on reconnect when the room rebuilds context. */
  reset() {
    this._clockOffset = 0;
    this._clockHasSample = false;
    this._offsetCount = 0;
    this._rtt = 0;
    this._smoothedRtt = 0;
    this._rttHasSample = false;
    this._jitter = 0;
    this._lastRecvTime = -1;
    this._lastServerTime = 0;
    this._rttFloorT.length = 0;
    this._rttFloorV.length = 0;
    this._renderSn = 0;
    this._renderSnAt = 0;
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/input/RoomInput.mjs
var RoomInput = class {
  #room;
  // Impl type (not the public interface) so the TIMED decode can feed it the
  // server ack via the internal `ackInput()`.
  #handle;
  // First-call context, kept only to diagnose later room.input(options) calls
  // whose options are ignored (the handle is created once — first call wins).
  #options;
  #encoder;
  #warnedIgnoredOptions = false;
  /**
   * Schema constructor recovered via Reflection from the server's handshake
   * (the `INPUT_REFLECTION` tagged section). Falls back to `undefined` when
   * the server room didn't call `defineInput()`.
   *
   * Typed as `new () => any` (not `Schema`) on purpose — pinning to this
   * SDK's Schema type would clash with user instances coming from a
   * different copy of `@colyseus/schema` under multi-version installs.
   */
  #ctorFromReflection;
  /** `true` when the handshake advertised the SNAPSHOT-timeline stamp
   *  (`INPUT_OPTIONS`, `InputFlags.RENDER_TIME`). */
  #stampRender = false;
  /** `true` when the handshake advertised the RECKON-timeline stamp
   *  (`INPUT_OPTIONS`, `InputFlags.RECKON_TIME`). Set together with
   *  {@link #stampRender} ⇒ the 6-byte `[reckonTime][renderDelta]` prefix. */
  #stampReckon = false;
  /** Server-advertised fixed simulation/input step rate (Hz) from
   *  `defineInput({ tickRate })`. */
  #tickRate;
  /** Server-advertised state-patch interval (ms) = the reconcile cadence. */
  #patchRate;
  /** Server-advertised physics sub-steps per input tick
   *  (`setFixedTimestep(..., { subSteps })`). */
  #subSteps;
  constructor(room) {
    this.#room = room;
  }
  /** Snapshot cadence (ms), so {@link Room} can feed `clock.setPatchInterval`. */
  get patchRate() {
    return this.#patchRate;
  }
  /**
   * Decode the `INPUT_REFLECTION` handshake section: install schema-builder
   * field descriptors on the reconstructed class so {@link InputEncoder} can
   * read its `$values` and emit non-empty packets, then cache the ctor.
   *
   * INPUT_REFLECTION is also the signal that the server called `defineInput()`
   * and will emit TIMED-prefixed state messages — so swap the default stub
   * clock for a real {@link RoomClockImpl} unless the user already replaced
   * `room.clock` with their own. Advances `it`.
   */
  applyReflection(buffer, it, sectionEnd) {
    const inputDecoder = Reflection.decode(buffer.subarray(0, sectionEnd), it);
    Reflection.makeEncodable(inputDecoder.state.constructor);
    this.#ctorFromReflection = inputDecoder.state.constructor;
    if (this.#room.clock === NULL_CLOCK)
      this.#room.clock = new RoomClockImpl();
  }
  /**
   * Decode the `INPUT_OPTIONS` handshake section.
   * `[flags uint8][tickRate varint?][patchRate varint?][subSteps varint?]`,
   * varints in bit order. Advances `it`.
   */
  applyOptions(buffer, it) {
    const flags = buffer[it.offset++];
    this.#stampRender = (flags & InputFlags.RENDER_TIME) !== 0;
    this.#stampReckon = (flags & InputFlags.RECKON_TIME) !== 0;
    if (flags & InputFlags.FIXED_TIMESTEP)
      this.#tickRate = decode.number(buffer, it);
    if (flags & InputFlags.PATCH_RATE)
      this.#patchRate = decode.number(buffer, it);
    if (flags & InputFlags.SUB_STEPS)
      this.#subSteps = decode.number(buffer, it);
  }
  /** Feed the server's last-processed input seq to the handle; returns the RTT
   *  sample (or `-1` before the handle exists / when the seq aged out). */
  ackInput(inputSeq) {
    return this.#handle ? this.#handle.ackInput(inputSeq) : -1;
  }
  /** Reset the input round-trip on reconnect (see {@link Room} reconnection). */
  reset() {
    this.#handle?.reset();
  }
  /**
   * Lazily create and cache the per-room {@link InputHandle}; subsequent calls
   * return the same handle (options on later calls are ignored — a warning
   * fires once if they differ from the constructed handle's). Backs
   * `room.input(...)` — see that method for the full discovery/usage docs.
   */
  handle(options) {
    if (this.#handle) {
      if (options !== void 0)
        this.#warnIfIgnored(options);
      return this.#handle;
    }
    const Ctor = options?.type ?? this.#ctorFromReflection;
    if (!Ctor) {
      throw new Error("room.input(): no input schema available. The server room must call `defineInput(YourInput)`, or you can pass `{ type: YourInput }` explicitly.");
    }
    const instance = new Ctor();
    const encoder = new InputEncoder(instance, options);
    this.#handle = new InputHandleImpl(this.#room, instance, encoder, {
      stampRender: this.#stampRender,
      stampReckon: this.#stampReckon,
      renderDelay: options?.renderDelay,
      allowRewind: options?.allowRewind,
      // app gate: skip the stamp on inputs the server won't rewind
      tickRate: this.#tickRate,
      patchRate: this.#patchRate,
      subSteps: this.#subSteps
    });
    this.#options = options;
    this.#encoder = encoder;
    return this.#handle;
  }
  /** Warn (once) when a later `room.input(options)` call would have produced a
   *  different handle — those options are silently ignored (first call wins),
   *  which is invisible without this. Value fields compare against the RESOLVED
   *  config (ctor/mode/historySize), not the first call's raw options, so a
   *  textually identical second call stays silent. */
  #warnIfIgnored(later) {
    if (this.#warnedIgnoredOptions)
      return;
    const handle = this.#handle;
    const diffs = [];
    if (later.type !== void 0 && later.type !== handle.data?.constructor)
      diffs.push("type");
    if (later.mode !== void 0 && later.mode !== handle.mode)
      diffs.push("mode");
    if (later.historySize !== void 0 && handle.mode === "unreliable" && later.historySize !== this.#encoder.historySize)
      diffs.push("historySize");
    if (later.renderDelay !== void 0 && later.renderDelay !== this.#options?.renderDelay)
      diffs.push("renderDelay");
    if (later.allowRewind !== void 0 !== (this.#options?.allowRewind !== void 0))
      diffs.push("allowRewind");
    if (diffs.length === 0)
      return;
    this.#warnedIgnoredOptions = true;
    console.warn(`@colyseus/sdk: room.input() options ignored \u2014 the input handle was already created by an earlier call (first call wins). Differing: ${diffs.join(", ")}.`);
  }
};

// ../../node_modules/.pnpm/msgpackr@2.1.0/node_modules/msgpackr/unpack.js
var decoder;
try {
  decoder = new TextDecoder();
} catch (error) {
}
var src;
var srcEnd;
var position = 0;
var EMPTY_ARRAY = [];
var strings = EMPTY_ARRAY;
var stringPosition = 0;
var currentUnpackr = {};
var currentStructures;
var srcString;
var srcStringStart = 0;
var srcStringEnd = 0;
var bundledStrings;
var referenceMap;
var currentExtensions = [];
var dataView;
var defaultOptions = {
  useRecords: false,
  mapsAsObjects: true
};
var C1Type = class {
};
var C1 = new C1Type();
C1.name = "MessagePack 0xC1";
var sequentialMode = false;
var inlineObjectReadThreshold = 2;
var Unpackr = class _Unpackr {
  constructor(options) {
    if (options) {
      if (options.useRecords === false && options.mapsAsObjects === void 0)
        options.mapsAsObjects = true;
      if (options.sequential && options.trusted !== false) {
        options.trusted = true;
        if (!options.structures && options.useRecords != false) {
          options.structures = [];
          if (!options.maxSharedStructures)
            options.maxSharedStructures = 0;
        }
      }
      if (options.structures)
        options.structures.sharedLength = options.structures.length;
      else if (options.getStructures) {
        (options.structures = []).uninitialized = true;
        options.structures.sharedLength = 0;
      }
      if (options.int64AsNumber) {
        options.int64AsType = "number";
      }
    }
    Object.assign(this, options);
  }
  unpack(source, options) {
    if (src) {
      return saveState(() => {
        clearSource();
        return this ? this.unpack(source, options) : _Unpackr.prototype.unpack.call(defaultOptions, source, options);
      });
    }
    if (!source.buffer && source.constructor === ArrayBuffer)
      source = typeof Buffer !== "undefined" ? Buffer.from(source) : new Uint8Array(source);
    if (typeof options === "object") {
      srcEnd = options.end || source.length;
      position = options.start || 0;
    } else {
      position = 0;
      srcEnd = options > -1 ? options : source.length;
    }
    stringPosition = 0;
    srcStringEnd = 0;
    srcString = null;
    strings = EMPTY_ARRAY;
    bundledStrings = null;
    src = source;
    try {
      dataView = source.dataView || (source.dataView = new DataView(source.buffer, source.byteOffset, source.byteLength));
    } catch (error) {
      src = null;
      if (source instanceof Uint8Array)
        throw error;
      throw new Error("Source must be a Uint8Array or Buffer but was a " + (source && typeof source == "object" ? source.constructor.name : typeof source));
    }
    if (this instanceof _Unpackr) {
      currentUnpackr = this;
      if (this.structures) {
        currentStructures = this.structures;
        return checkedRead(options);
      } else if (!currentStructures || currentStructures.length > 0) {
        currentStructures = [];
      }
    } else {
      currentUnpackr = defaultOptions;
      if (!currentStructures || currentStructures.length > 0)
        currentStructures = [];
    }
    return checkedRead(options);
  }
  unpackMultiple(source, forEach) {
    let values, lastPosition = 0;
    try {
      sequentialMode = true;
      let size = source.length;
      let value = this ? this.unpack(source, size) : defaultUnpackr.unpack(source, size);
      if (forEach) {
        if (forEach(value, lastPosition, position) === false) return;
        while (position < size) {
          lastPosition = position;
          if (forEach(checkedRead(), lastPosition, position) === false) {
            return;
          }
        }
      } else {
        values = [value];
        while (position < size) {
          lastPosition = position;
          values.push(checkedRead());
        }
        return values;
      }
    } catch (error) {
      error.lastPosition = lastPosition;
      error.values = values;
      throw error;
    } finally {
      sequentialMode = false;
      clearSource();
    }
  }
  _mergeStructures(loadedStructures, existingStructures) {
    if (this._onLoadedStructures)
      loadedStructures = this._onLoadedStructures(loadedStructures);
    loadedStructures = loadedStructures || [];
    if (Object.isFrozen(loadedStructures))
      loadedStructures = loadedStructures.map((structure) => structure.slice(0));
    for (let i = 0, l = loadedStructures.length; i < l; i++) {
      let structure = loadedStructures[i];
      if (structure) {
        structure.isShared = true;
        if (i >= 32)
          structure.highByte = i - 32 >> 5;
      }
    }
    loadedStructures.sharedLength = loadedStructures.length;
    for (let id in existingStructures || []) {
      if (id >= 0) {
        let structure = loadedStructures[id];
        let existing = existingStructures[id];
        if (existing) {
          if (structure)
            (loadedStructures.restoreStructures || (loadedStructures.restoreStructures = []))[id] = structure;
          loadedStructures[id] = existing;
        }
      }
    }
    return this.structures = loadedStructures;
  }
  decode(source, options) {
    return this.unpack(source, options);
  }
};
function checkedRead(options) {
  try {
    if (!currentUnpackr.trusted && !sequentialMode) {
      let sharedLength = currentStructures.sharedLength || 0;
      if (sharedLength < currentStructures.length)
        currentStructures.length = sharedLength;
    }
    let result;
    if (currentUnpackr._readStruct && src[position] < 64 && src[position] >= 32) {
      result = currentUnpackr._readStruct(src, position, srcEnd);
      src = null;
      if (!(options && options.lazy) && result)
        result = result.toJSON();
      position = srcEnd;
    } else
      result = read();
    if (bundledStrings) {
      position = bundledStrings.postBundlePosition;
      bundledStrings = null;
    }
    if (sequentialMode)
      currentStructures.restoreStructures = null;
    if (position == srcEnd) {
      if (currentStructures && currentStructures.restoreStructures)
        restoreStructures();
      currentStructures = null;
      src = null;
      if (referenceMap)
        referenceMap = null;
    } else if (position > srcEnd) {
      throw new Error("Unexpected end of MessagePack data");
    } else if (!sequentialMode) {
      let jsonView;
      try {
        jsonView = JSON.stringify(result, (_, value) => typeof value === "bigint" ? `${value}n` : value).slice(0, 100);
      } catch (error) {
        jsonView = "(JSON view not available " + error + ")";
      }
      throw new Error("Data read, but end of buffer not reached " + jsonView);
    }
    return result;
  } catch (error) {
    if (currentStructures && currentStructures.restoreStructures)
      restoreStructures();
    clearSource();
    if (error instanceof RangeError || error.message.startsWith("Unexpected end of buffer") || position > srcEnd) {
      error.incomplete = true;
    }
    throw error;
  }
}
function restoreStructures() {
  for (let id in currentStructures.restoreStructures) {
    currentStructures[id] = currentStructures.restoreStructures[id];
  }
  currentStructures.restoreStructures = null;
}
function read() {
  let token = src[position++];
  if (token < 160) {
    if (token < 128) {
      if (token < 64)
        return token;
      else {
        let structure = currentStructures[token & 63] || currentUnpackr.getStructures && loadStructures()[token & 63];
        if (structure) {
          if (!structure.read) {
            structure.read = createStructureReader(structure, token & 63);
          }
          return structure.read();
        } else
          return token;
      }
    } else if (token < 144) {
      token -= 128;
      if (currentUnpackr.mapsAsObjects) {
        let object = {};
        for (let i = 0; i < token; i++) {
          let key = readKey();
          if (key === "__proto__")
            key = "__proto_";
          object[key] = read();
        }
        return object;
      } else {
        let map = /* @__PURE__ */ new Map();
        for (let i = 0; i < token; i++) {
          map.set(read(), read());
        }
        return map;
      }
    } else {
      token -= 144;
      let array = new Array(token);
      for (let i = 0; i < token; i++) {
        array[i] = read();
      }
      if (currentUnpackr.freezeData)
        return Object.freeze(array);
      return array;
    }
  } else if (token < 192) {
    let length = token - 160;
    if (srcStringEnd >= position) {
      return srcString.slice(position - srcStringStart, (position += length) - srcStringStart);
    }
    if (srcStringEnd == 0 && srcEnd < 140) {
      let string2 = length < 16 ? shortStringInJS(length) : longStringInJS(length);
      if (string2 != null)
        return string2;
    }
    return readFixedString(length);
  } else {
    let value;
    switch (token) {
      case 192:
        return null;
      case 193:
        if (bundledStrings) {
          value = read();
          if (value > 0)
            return bundledStrings[1].slice(bundledStrings.position1, bundledStrings.position1 += value);
          else
            return bundledStrings[0].slice(bundledStrings.position0, bundledStrings.position0 -= value);
        }
        return C1;
      // "never-used", return special object to denote that
      case 194:
        return false;
      case 195:
        return true;
      case 196:
        value = src[position++];
        if (value === void 0)
          throw new Error("Unexpected end of buffer");
        return readBin(value);
      case 197:
        value = dataView.getUint16(position);
        position += 2;
        return readBin(value);
      case 198:
        value = dataView.getUint32(position);
        position += 4;
        return readBin(value);
      case 199:
        return readExt(src[position++]);
      case 200:
        value = dataView.getUint16(position);
        position += 2;
        return readExt(value);
      case 201:
        value = dataView.getUint32(position);
        position += 4;
        return readExt(value);
      case 202:
        value = dataView.getFloat32(position);
        if (currentUnpackr.useFloat32 > 2) {
          let multiplier = mult10[(src[position] & 127) << 1 | src[position + 1] >> 7];
          position += 4;
          return (multiplier * value + (value > 0 ? 0.5 : -0.5) >> 0) / multiplier;
        }
        position += 4;
        return value;
      case 203:
        value = dataView.getFloat64(position);
        position += 8;
        return value;
      // uint handlers
      case 204:
        return src[position++];
      case 205:
        value = dataView.getUint16(position);
        position += 2;
        return value;
      case 206:
        value = dataView.getUint32(position);
        position += 4;
        return value;
      case 207:
        if (currentUnpackr.int64AsType === "number") {
          value = dataView.getUint32(position) * 4294967296;
          value += dataView.getUint32(position + 4);
        } else if (currentUnpackr.int64AsType === "string") {
          value = dataView.getBigUint64(position).toString();
        } else if (currentUnpackr.int64AsType === "auto") {
          value = dataView.getBigUint64(position);
          if (value <= BigInt(2) << BigInt(52)) value = Number(value);
        } else
          value = dataView.getBigUint64(position);
        position += 8;
        return value;
      // int handlers
      case 208:
        return dataView.getInt8(position++);
      case 209:
        value = dataView.getInt16(position);
        position += 2;
        return value;
      case 210:
        value = dataView.getInt32(position);
        position += 4;
        return value;
      case 211:
        if (currentUnpackr.int64AsType === "number") {
          value = dataView.getInt32(position) * 4294967296;
          value += dataView.getUint32(position + 4);
        } else if (currentUnpackr.int64AsType === "string") {
          value = dataView.getBigInt64(position).toString();
        } else if (currentUnpackr.int64AsType === "auto") {
          value = dataView.getBigInt64(position);
          if (value >= BigInt(-2) << BigInt(52) && value <= BigInt(2) << BigInt(52)) value = Number(value);
        } else
          value = dataView.getBigInt64(position);
        position += 8;
        return value;
      case 212:
        value = src[position++];
        if (value == 114) {
          return recordDefinition(src[position++] & 63);
        } else {
          let extension = currentExtensions[value];
          if (extension) {
            if (extension.read) {
              position++;
              return extension.read(read());
            } else if (extension.noBuffer) {
              position++;
              return extension();
            } else
              return extension(src.subarray(position, ++position));
          } else
            throw new Error("Unknown extension " + value);
        }
      case 213:
        value = src[position];
        if (value == 114) {
          position++;
          return recordDefinition(src[position++] & 63, src[position++]);
        } else
          return readExt(2);
      case 214:
        return readExt(4);
      case 215:
        return readExt(8);
      case 216:
        return readExt(16);
      case 217:
        value = src[position++];
        if (srcStringEnd >= position) {
          return srcString.slice(position - srcStringStart, (position += value) - srcStringStart);
        }
        return readString8(value);
      case 218:
        value = dataView.getUint16(position);
        position += 2;
        if (srcStringEnd >= position) {
          return srcString.slice(position - srcStringStart, (position += value) - srcStringStart);
        }
        return readString16(value);
      case 219:
        value = dataView.getUint32(position);
        position += 4;
        if (srcStringEnd >= position) {
          return srcString.slice(position - srcStringStart, (position += value) - srcStringStart);
        }
        return readString32(value);
      case 220:
        value = dataView.getUint16(position);
        position += 2;
        return readArray(value);
      case 221:
        value = dataView.getUint32(position);
        position += 4;
        return readArray(value);
      case 222:
        value = dataView.getUint16(position);
        position += 2;
        return readMap(value);
      case 223:
        value = dataView.getUint32(position);
        position += 4;
        return readMap(value);
      default:
        if (token >= 224)
          return token - 256;
        if (token === void 0) throw endOfMessagePackError();
        throw new Error("Unknown MessagePack token " + token);
    }
  }
}
var validName = /^[a-zA-Z_$][a-zA-Z\d_$]*$/;
function createStructureReader(structure, firstId) {
  function readObject() {
    if (readObject.count++ > inlineObjectReadThreshold) {
      let optimizedReadObject;
      try {
        optimizedReadObject = structure.read = new Function("r", "return function(){return " + (currentUnpackr.freezeData ? "Object.freeze" : "") + "({" + structure.map((key) => key === "__proto__" ? "__proto_:r()" : validName.test(key) ? key + ":r()" : "[" + JSON.stringify(key) + "]:r()").join(",") + "})}")(read);
      } catch (error) {
        inlineObjectReadThreshold = Infinity;
        return readObject();
      }
      structure.read0 = optimizedReadObject;
      if (structure.highByte === 0)
        structure.read = createSecondByteReader(firstId, structure.read);
      return optimizedReadObject();
    }
    let object = {};
    for (let i = 0, l = structure.length; i < l; i++) {
      let key = structure[i];
      if (key === "__proto__")
        key = "__proto_";
      object[key] = read();
    }
    if (currentUnpackr.freezeData)
      return Object.freeze(object);
    return object;
  }
  readObject.count = 0;
  structure.read0 = readObject;
  if (structure.highByte === 0) {
    return createSecondByteReader(firstId, readObject);
  }
  return readObject;
}
var createSecondByteReader = (firstId, read0) => {
  return function() {
    let highByte = src[position++];
    if (highByte === 0)
      return read0();
    let id = firstId < 32 ? -(firstId + (highByte << 5)) : firstId + (highByte << 5);
    let structure = currentStructures[id] || loadStructures()[id];
    if (!structure) {
      throw new Error("Record id is not defined for " + id);
    }
    if (!structure.read)
      structure.read = createStructureReader(structure, firstId);
    return structure.read();
  };
};
function loadStructures() {
  let loadedStructures = saveState(() => {
    src = null;
    return currentUnpackr.getStructures();
  });
  return currentStructures = currentUnpackr._mergeStructures(loadedStructures, currentStructures);
}
var readFixedString = readStringJS;
var readString8 = readStringJS;
var readString16 = readStringJS;
var readString32 = readStringJS;
function readStringJS(length) {
  let result;
  if (length < 16) {
    if (result = shortStringInJS(length))
      return result;
  }
  if (length > 64 && decoder)
    return decoder.decode(src.subarray(position, position += length));
  const end = position + length;
  const units = [];
  result = "";
  while (position < end) {
    const byte1 = src[position++];
    if ((byte1 & 128) === 0) {
      units.push(byte1);
    } else if ((byte1 & 224) === 192) {
      if (byte1 < 194 || position >= end || (src[position] & 192) !== 128) {
        units.push(65533);
      } else {
        const byte2 = src[position++] & 63;
        units.push((byte1 & 31) << 6 | byte2);
      }
    } else if ((byte1 & 240) === 224) {
      const byte2 = position < end ? src[position] : 0;
      if (position >= end || (byte2 & 192) !== 128 || byte1 === 224 && byte2 < 160 || byte1 === 237 && byte2 >= 160) {
        units.push(65533);
      } else {
        position++;
        if (position >= end || (src[position] & 192) !== 128) {
          units.push(65533);
        } else {
          const byte3 = src[position++] & 63;
          units.push((byte1 & 31) << 12 | (byte2 & 63) << 6 | byte3);
        }
      }
    } else if ((byte1 & 248) === 240) {
      const byte2 = position < end ? src[position] : 0;
      if (byte1 > 244 || position >= end || (byte2 & 192) !== 128 || byte1 === 240 && byte2 < 144 || byte1 === 244 && byte2 >= 144) {
        units.push(65533);
      } else {
        position++;
        if (position >= end || (src[position] & 192) !== 128) {
          units.push(65533);
        } else {
          const byte3 = src[position++] & 63;
          if (position >= end || (src[position] & 192) !== 128) {
            units.push(65533);
          } else {
            const byte4 = src[position++] & 63;
            let unit = (byte1 & 7) << 18 | (byte2 & 63) << 12 | byte3 << 6 | byte4;
            unit -= 65536;
            units.push(unit >>> 10 & 1023 | 55296);
            units.push(56320 | unit & 1023);
          }
        }
      }
    } else {
      units.push(65533);
    }
    if (units.length >= 4096) {
      result += fromCharCode.apply(String, units);
      units.length = 0;
    }
  }
  if (units.length > 0) {
    result += fromCharCode.apply(String, units);
  }
  return result;
}
function endOfMessagePackError() {
  let error = new Error("Unexpected end of MessagePack data");
  error.incomplete = true;
  return error;
}
function readArray(length) {
  if (length > srcEnd - position) throw endOfMessagePackError();
  let array = new Array(length);
  for (let i = 0; i < length; i++) {
    array[i] = read();
  }
  if (currentUnpackr.freezeData)
    return Object.freeze(array);
  return array;
}
function readMap(length) {
  if (length > (srcEnd - position) / 2) throw endOfMessagePackError();
  if (currentUnpackr.mapsAsObjects) {
    let object = {};
    for (let i = 0; i < length; i++) {
      let key = readKey();
      if (key === "__proto__")
        key = "__proto_";
      object[key] = read();
    }
    return object;
  } else {
    let map = /* @__PURE__ */ new Map();
    for (let i = 0; i < length; i++) {
      map.set(read(), read());
    }
    return map;
  }
}
var fromCharCode = String.fromCharCode;
function longStringInJS(length) {
  let start = position;
  let bytes = new Array(length);
  for (let i = 0; i < length; i++) {
    const byte = src[position++];
    if ((byte & 128) > 0) {
      position = start;
      return;
    }
    bytes[i] = byte;
  }
  return fromCharCode.apply(String, bytes);
}
function shortStringInJS(length) {
  if (length < 4) {
    if (length < 2) {
      if (length === 0)
        return "";
      else {
        let a = src[position++];
        if ((a & 128) > 1) {
          position -= 1;
          return;
        }
        return fromCharCode(a);
      }
    } else {
      let a = src[position++];
      let b = src[position++];
      if ((a & 128) > 0 || (b & 128) > 0) {
        position -= 2;
        return;
      }
      if (length < 3)
        return fromCharCode(a, b);
      let c = src[position++];
      if ((c & 128) > 0) {
        position -= 3;
        return;
      }
      return fromCharCode(a, b, c);
    }
  } else {
    let a = src[position++];
    let b = src[position++];
    let c = src[position++];
    let d = src[position++];
    if ((a & 128) > 0 || (b & 128) > 0 || (c & 128) > 0 || (d & 128) > 0) {
      position -= 4;
      return;
    }
    if (length < 6) {
      if (length === 4)
        return fromCharCode(a, b, c, d);
      else {
        let e = src[position++];
        if ((e & 128) > 0) {
          position -= 5;
          return;
        }
        return fromCharCode(a, b, c, d, e);
      }
    } else if (length < 8) {
      let e = src[position++];
      let f = src[position++];
      if ((e & 128) > 0 || (f & 128) > 0) {
        position -= 6;
        return;
      }
      if (length < 7)
        return fromCharCode(a, b, c, d, e, f);
      let g = src[position++];
      if ((g & 128) > 0) {
        position -= 7;
        return;
      }
      return fromCharCode(a, b, c, d, e, f, g);
    } else {
      let e = src[position++];
      let f = src[position++];
      let g = src[position++];
      let h = src[position++];
      if ((e & 128) > 0 || (f & 128) > 0 || (g & 128) > 0 || (h & 128) > 0) {
        position -= 8;
        return;
      }
      if (length < 10) {
        if (length === 8)
          return fromCharCode(a, b, c, d, e, f, g, h);
        else {
          let i = src[position++];
          if ((i & 128) > 0) {
            position -= 9;
            return;
          }
          return fromCharCode(a, b, c, d, e, f, g, h, i);
        }
      } else if (length < 12) {
        let i = src[position++];
        let j = src[position++];
        if ((i & 128) > 0 || (j & 128) > 0) {
          position -= 10;
          return;
        }
        if (length < 11)
          return fromCharCode(a, b, c, d, e, f, g, h, i, j);
        let k = src[position++];
        if ((k & 128) > 0) {
          position -= 11;
          return;
        }
        return fromCharCode(a, b, c, d, e, f, g, h, i, j, k);
      } else {
        let i = src[position++];
        let j = src[position++];
        let k = src[position++];
        let l = src[position++];
        if ((i & 128) > 0 || (j & 128) > 0 || (k & 128) > 0 || (l & 128) > 0) {
          position -= 12;
          return;
        }
        if (length < 14) {
          if (length === 12)
            return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l);
          else {
            let m = src[position++];
            if ((m & 128) > 0) {
              position -= 13;
              return;
            }
            return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m);
          }
        } else {
          let m = src[position++];
          let n = src[position++];
          if ((m & 128) > 0 || (n & 128) > 0) {
            position -= 14;
            return;
          }
          if (length < 15)
            return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n);
          let o = src[position++];
          if ((o & 128) > 0) {
            position -= 15;
            return;
          }
          return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o);
        }
      }
    }
  }
}
function readOnlyJSString() {
  let token = src[position++];
  let length;
  if (token < 192) {
    length = token - 160;
  } else {
    switch (token) {
      case 217:
        length = src[position++];
        break;
      case 218:
        length = dataView.getUint16(position);
        position += 2;
        break;
      case 219:
        length = dataView.getUint32(position);
        position += 4;
        break;
      default:
        throw new Error("Expected string");
    }
  }
  return readStringJS(length);
}
function readBin(length) {
  return currentUnpackr.copyBuffers ? (
    // specifically use the copying slice (not the node one)
    Uint8Array.prototype.slice.call(src, position, position += length)
  ) : src.subarray(position, position += length);
}
function readExt(length) {
  let type = src[position++];
  if (currentExtensions[type]) {
    let end;
    return currentExtensions[type](src.subarray(position, end = position += length), (readPosition) => {
      position = readPosition;
      try {
        return read();
      } finally {
        position = end;
      }
    });
  } else
    throw new Error("Unknown extension type " + type);
}
var keyCache = new Array(4096);
function readKey() {
  let length = src[position++];
  if (length >= 160 && length < 192) {
    length = length - 160;
    if (srcStringEnd >= position)
      return srcString.slice(position - srcStringStart, (position += length) - srcStringStart);
    else if (!(srcStringEnd == 0 && srcEnd < 180))
      return readFixedString(length);
  } else {
    position--;
    return asSafeString(read());
  }
  let key = (length << 5 ^ (length > 1 ? dataView.getUint16(position) : length > 0 ? src[position] : 0)) & 4095;
  let entry = keyCache[key];
  let checkPosition = position;
  let end = position + length - 3;
  let chunk;
  let i = 0;
  if (entry && entry.bytes == length) {
    while (checkPosition < end) {
      chunk = dataView.getUint32(checkPosition);
      if (chunk != entry[i++]) {
        checkPosition = 1879048192;
        break;
      }
      checkPosition += 4;
    }
    end += 3;
    while (checkPosition < end) {
      chunk = src[checkPosition++];
      if (chunk != entry[i++]) {
        checkPosition = 1879048192;
        break;
      }
    }
    if (checkPosition === end) {
      position = checkPosition;
      return entry.string;
    }
    end -= 3;
    checkPosition = position;
  }
  entry = [];
  keyCache[key] = entry;
  entry.bytes = length;
  while (checkPosition < end) {
    chunk = dataView.getUint32(checkPosition);
    entry.push(chunk);
    checkPosition += 4;
  }
  end += 3;
  while (checkPosition < end) {
    chunk = src[checkPosition++];
    entry.push(chunk);
  }
  let string2 = length < 16 ? shortStringInJS(length) : longStringInJS(length);
  if (string2 != null)
    return entry.string = string2;
  return entry.string = readFixedString(length);
}
function asSafeString(property) {
  if (typeof property === "string") return property;
  if (typeof property === "number" || typeof property === "boolean" || typeof property === "bigint") return property.toString();
  if (property == null) return property + "";
  if (currentUnpackr.allowArraysInMapKeys && Array.isArray(property) && property.flat().every((item) => ["string", "number", "boolean", "bigint"].includes(typeof item))) {
    return property.flat().toString();
  }
  throw new Error(`Invalid property type for record: ${typeof property}`);
}
var recordDefinition = (id, highByte) => {
  let structure = read().map(asSafeString);
  let firstByte = id;
  if (highByte !== void 0) {
    id = id < 32 ? -((highByte << 5) + id) : (highByte << 5) + id;
    structure.highByte = highByte;
  }
  let existingStructure = currentStructures[id];
  if (existingStructure && (existingStructure.isShared || sequentialMode)) {
    (currentStructures.restoreStructures || (currentStructures.restoreStructures = []))[id] = existingStructure;
  }
  currentStructures[id] = structure;
  structure.read = createStructureReader(structure, firstByte);
  return (structure.read0 || structure.read)();
};
currentExtensions[0] = () => {
};
currentExtensions[0].noBuffer = true;
currentExtensions[66] = (data) => {
  let headLength = data.byteLength % 8 || 8;
  let head = BigInt(data[0] & 128 ? data[0] - 256 : data[0]);
  for (let i = 1; i < headLength; i++) {
    head <<= BigInt(8);
    head += BigInt(data[i]);
  }
  if (data.byteLength !== headLength) {
    let view2 = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let decode3 = (start, end) => {
      let length = end - start;
      if (length <= 40) {
        let out = view2.getBigUint64(start);
        for (let i = start + 8; i < end; i += 8) {
          out <<= BigInt(64);
          out |= view2.getBigUint64(i);
        }
        return out;
      }
      let middle = start + (length >> 4 << 3);
      let left = decode3(start, middle);
      let right = decode3(middle, end);
      return left << BigInt((end - middle) * 8) | right;
    };
    head = head << BigInt((view2.byteLength - headLength) * 8) | decode3(headLength, view2.byteLength);
  }
  return head;
};
var errors = {
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
  AggregateError: typeof AggregateError === "function" ? AggregateError : null
};
currentExtensions[101] = () => {
  let data = read();
  if (!errors[data[0]]) {
    let error = Error(data[1], { cause: data[2] });
    error.name = data[0];
    return error;
  }
  return errors[data[0]](data[1], { cause: data[2] });
};
currentExtensions[105] = (data) => {
  if (currentUnpackr.structuredClone === false) throw new Error("Structured clone extension is disabled");
  let id = dataView.getUint32(position - 4);
  if (!referenceMap)
    referenceMap = /* @__PURE__ */ new Map();
  let token = src[position];
  let target2;
  if (token >= 144 && token < 160 || token == 220 || token == 221)
    target2 = [];
  else if (token >= 128 && token < 144 || token == 222 || token == 223)
    target2 = /* @__PURE__ */ new Map();
  else if ((token >= 199 && token <= 201 || token >= 212 && token <= 216) && src[position + 1] === 115)
    target2 = /* @__PURE__ */ new Set();
  else
    target2 = {};
  let refEntry = { target: target2 };
  referenceMap.set(id, refEntry);
  let targetProperties = read();
  if (!refEntry.used) {
    return refEntry.target = targetProperties;
  } else {
    Object.assign(target2, targetProperties);
  }
  if (target2 instanceof Map)
    for (let [k, v] of targetProperties.entries()) target2.set(k, v);
  if (target2 instanceof Set)
    for (let i of Array.from(targetProperties)) target2.add(i);
  return target2;
};
currentExtensions[112] = (data) => {
  if (currentUnpackr.structuredClone === false) throw new Error("Structured clone extension is disabled");
  let id = dataView.getUint32(position - 4);
  let refEntry = referenceMap.get(id);
  refEntry.used = true;
  return refEntry.target;
};
currentExtensions[115] = () => new Set(read());
var typedArrays = ["Int8", "Uint8", "Uint8Clamped", "Int16", "Uint16", "Int32", "Uint32", "Float32", "Float64", "BigInt64", "BigUint64"].map((type) => type + "Array");
var glbl = typeof globalThis === "object" ? globalThis : window;
currentExtensions[116] = (data) => {
  let typeCode = data[0];
  let buffer = Uint8Array.prototype.slice.call(data, 1).buffer;
  let typedArrayName = typedArrays[typeCode];
  if (!typedArrayName) {
    if (typeCode === 16) return buffer;
    if (typeCode === 17) return new DataView(buffer);
    throw new Error("Could not find typed array for code " + typeCode);
  }
  return new glbl[typedArrayName](buffer);
};
currentExtensions[120] = () => {
  let data = read();
  return new RegExp(data[0], data[1]);
};
var TEMP_BUNDLE = [];
currentExtensions[98] = (data) => {
  let dataSize = (data[0] << 24) + (data[1] << 16) + (data[2] << 8) + data[3];
  let dataPosition = position;
  position += dataSize - data.length;
  bundledStrings = TEMP_BUNDLE;
  bundledStrings = [readOnlyJSString(), readOnlyJSString()];
  bundledStrings.position0 = 0;
  bundledStrings.position1 = 0;
  bundledStrings.postBundlePosition = position;
  position = dataPosition;
  return read();
};
currentExtensions[255] = (data) => {
  if (data.length == 4)
    return new Date((data[0] * 16777216 + (data[1] << 16) + (data[2] << 8) + data[3]) * 1e3);
  else if (data.length == 8)
    return new Date(
      ((data[0] << 22) + (data[1] << 14) + (data[2] << 6) + (data[3] >> 2)) / 1e6 + ((data[3] & 3) * 4294967296 + data[4] * 16777216 + (data[5] << 16) + (data[6] << 8) + data[7]) * 1e3
    );
  else if (data.length == 12)
    return new Date(
      ((data[0] << 24) + (data[1] << 16) + (data[2] << 8) + data[3]) / 1e6 + ((data[4] & 128 ? -281474976710656 : 0) + data[6] * 1099511627776 + data[7] * 4294967296 + data[8] * 16777216 + (data[9] << 16) + (data[10] << 8) + data[11]) * 1e3
    );
  else
    return /* @__PURE__ */ new Date("invalid");
};
function saveState(callback) {
  if (currentUnpackr && currentUnpackr._onSaveState)
    currentUnpackr._onSaveState();
  let savedSrcEnd = srcEnd;
  let savedPosition = position;
  let savedStringPosition = stringPosition;
  let savedSrcStringStart = srcStringStart;
  let savedSrcStringEnd = srcStringEnd;
  let savedSrcString = srcString;
  let savedStrings = strings;
  let savedReferenceMap = referenceMap;
  let savedBundledStrings = bundledStrings;
  let savedSrc = new Uint8Array(src.slice(0, srcEnd));
  let savedStructures = currentStructures;
  let savedStructuresContents = currentStructures.slice(0, currentStructures.length);
  let savedPackr = currentUnpackr;
  let savedSequentialMode = sequentialMode;
  let value = callback();
  srcEnd = savedSrcEnd;
  position = savedPosition;
  stringPosition = savedStringPosition;
  srcStringStart = savedSrcStringStart;
  srcStringEnd = savedSrcStringEnd;
  srcString = savedSrcString;
  strings = savedStrings;
  referenceMap = savedReferenceMap;
  bundledStrings = savedBundledStrings;
  src = savedSrc;
  sequentialMode = savedSequentialMode;
  currentStructures = savedStructures;
  currentStructures.splice(0, currentStructures.length, ...savedStructuresContents);
  currentUnpackr = savedPackr;
  dataView = new DataView(src.buffer, src.byteOffset, src.byteLength);
  return value;
}
function clearSource() {
  src = null;
  referenceMap = null;
  currentStructures = null;
}
var mult10 = new Array(147);
for (let i = 0; i < 256; i++) {
  mult10[i] = +("1e" + Math.floor(45.15 - i * 0.30103));
}
var defaultUnpackr = new Unpackr({ useRecords: false });
var unpack = defaultUnpackr.unpack;
var unpackMultiple = defaultUnpackr.unpackMultiple;
var decode2 = defaultUnpackr.unpack;
var FLOAT32_OPTIONS = {
  NEVER: 0,
  ALWAYS: 1,
  DECIMAL_ROUND: 3,
  DECIMAL_FIT: 4
};
var f32Array = new Float32Array(1);
var u8Array = new Uint8Array(f32Array.buffer, 0, 4);
Unpackr.SUPPORTS_STRUCT_HOOKS = true;

// ../../node_modules/.pnpm/msgpackr@2.1.0/node_modules/msgpackr/pack.js
var textEncoder2;
try {
  textEncoder2 = new TextEncoder();
} catch (error) {
}
var extensions;
var extensionClasses;
var hasNodeBuffer = typeof Buffer !== "undefined";
var ByteArrayAllocate = hasNodeBuffer ? function(length) {
  return Buffer.allocUnsafeSlow(length);
} : Uint8Array;
var ByteArray = hasNodeBuffer ? Buffer : Uint8Array;
var MAX_BUFFER_SIZE = hasNodeBuffer ? 4294967296 : 2144337920;
var target;
var keysTarget;
var targetView;
var position2 = 0;
var safeEnd;
var bundledStrings2 = null;
var MAX_BUNDLE_SIZE = 21760;
var hasNonLatin = /[\u0080-\uFFFF]/;
var RECORD_SYMBOL = /* @__PURE__ */ Symbol("record-id");
var Packr = class extends Unpackr {
  constructor(options) {
    super(options);
    this.offset = 0;
    let typeBuffer;
    let start;
    let hasSharedUpdate;
    let structures;
    let referenceMap2;
    let encodeUtf8 = ByteArray.prototype.utf8Write ? function(string2, position3) {
      return target.utf8Write(string2, position3, target.byteLength - position3);
    } : textEncoder2 && textEncoder2.encodeInto ? function(string2, position3) {
      return textEncoder2.encodeInto(string2, target.subarray(position3)).written;
    } : false;
    let packr = this;
    if (!options)
      options = {};
    let isSequential = options && options.sequential;
    let hasSharedStructures = options.structures || options.saveStructures;
    let maxSharedStructures = options.maxSharedStructures;
    if (maxSharedStructures == null)
      maxSharedStructures = hasSharedStructures ? 32 : 0;
    if (maxSharedStructures > 8160)
      throw new Error("Maximum maxSharedStructure is 8160");
    if (options.structuredClone && options.moreTypes == void 0) {
      this.moreTypes = true;
    }
    let maxOwnStructures = options.maxOwnStructures;
    if (maxOwnStructures == null)
      maxOwnStructures = hasSharedStructures ? 32 : 64;
    if (!this.structures && options.useRecords != false)
      this.structures = [];
    let useTwoByteRecords = maxSharedStructures > 32 || maxOwnStructures + maxSharedStructures > 64;
    let sharedLimitId = maxSharedStructures + 64;
    let maxStructureId = maxSharedStructures + maxOwnStructures + 64;
    if (maxStructureId > 8256) {
      throw new Error("Maximum maxSharedStructure + maxOwnStructure is 8192");
    }
    let recordIdsToRemove = [];
    let transitionsCount = 0;
    let serializationsSinceTransitionRebuild = 0;
    this.pack = this.encode = function(value, encodeOptions) {
      if (!target) {
        target = new ByteArrayAllocate(8192);
        targetView = target.dataView || (target.dataView = new DataView(target.buffer, 0, 8192));
        position2 = 0;
      }
      safeEnd = target.length - 10;
      if (safeEnd - position2 < 2048) {
        target = new ByteArrayAllocate(target.length);
        targetView = target.dataView || (target.dataView = new DataView(target.buffer, 0, target.length));
        safeEnd = target.length - 10;
        position2 = 0;
      } else
        position2 = position2 + 7 & 2147483640;
      start = position2;
      if (encodeOptions & RESERVE_START_SPACE) position2 += encodeOptions & 255;
      referenceMap2 = packr.structuredClone ? /* @__PURE__ */ new Map() : null;
      if (packr.bundleStrings && typeof value !== "string") {
        bundledStrings2 = [];
        bundledStrings2.size = Infinity;
      } else
        bundledStrings2 = null;
      structures = packr.structures;
      if (structures) {
        if (structures.uninitialized)
          structures = packr._mergeStructures(packr.getStructures());
        let sharedLength = structures.sharedLength || 0;
        if (sharedLength > maxSharedStructures) {
          throw new Error("Shared structures is larger than maximum shared structures, try increasing maxSharedStructures to " + structures.sharedLength);
        }
        if (!structures.transitions) {
          structures.transitions = /* @__PURE__ */ Object.create(null);
          for (let i = 0; i < sharedLength; i++) {
            let keys = structures[i];
            if (!keys)
              continue;
            let nextTransition, transition = structures.transitions;
            for (let j = 0, l = keys.length; j < l; j++) {
              let key = keys[j];
              nextTransition = transition[key];
              if (!nextTransition) {
                nextTransition = transition[key] = /* @__PURE__ */ Object.create(null);
              }
              transition = nextTransition;
            }
            transition[RECORD_SYMBOL] = i + 64;
          }
          this.lastNamedStructuresLength = sharedLength;
        }
        if (!isSequential) {
          structures.nextId = sharedLength + 64;
        }
      }
      if (hasSharedUpdate)
        hasSharedUpdate = false;
      let encodingError;
      try {
        if (packr._writeStruct && value && typeof value === "object") {
          if (value.constructor === Object) writeStruct(value);
          else if (value.constructor !== Map && !Array.isArray(value) && !extensionClasses.some((extClass) => value instanceof extClass)) {
            writeStruct(packr.useToJSON !== false && value.toJSON ? value.toJSON() : value);
          } else pack2(value);
        } else
          pack2(value);
        let lastBundle = bundledStrings2;
        if (bundledStrings2)
          writeBundles(start, pack2, 0);
        if (referenceMap2 && referenceMap2.idsToInsert) {
          let idsToInsert = referenceMap2.idsToInsert.sort((a, b) => a.offset > b.offset ? 1 : -1);
          let i = idsToInsert.length;
          let incrementPosition = -1;
          while (lastBundle && i > 0) {
            let insertionPoint = idsToInsert[--i].offset + start;
            if (insertionPoint < lastBundle.stringsPosition + start && incrementPosition === -1)
              incrementPosition = 0;
            if (insertionPoint > lastBundle.position + start) {
              if (incrementPosition >= 0)
                incrementPosition += 6;
            } else {
              if (incrementPosition >= 0) {
                targetView.setUint32(
                  lastBundle.position + start,
                  targetView.getUint32(lastBundle.position + start) + incrementPosition
                );
                incrementPosition = -1;
              }
              lastBundle = lastBundle.previous;
              i++;
            }
          }
          if (incrementPosition >= 0 && lastBundle) {
            targetView.setUint32(
              lastBundle.position + start,
              targetView.getUint32(lastBundle.position + start) + incrementPosition
            );
          }
          position2 += idsToInsert.length * 6;
          if (position2 > safeEnd)
            makeRoom(position2);
          packr.offset = position2;
          let serialized = insertIds(target.subarray(start, position2), idsToInsert);
          referenceMap2 = null;
          return serialized;
        }
        packr.offset = position2;
        if (encodeOptions & REUSE_BUFFER_MODE) {
          target.start = start;
          target.end = position2;
          return target;
        }
        return target.subarray(start, position2);
      } catch (error) {
        encodingError = error;
        throw error;
      } finally {
        if (structures) {
          resetStructures();
          if (hasSharedUpdate && packr.saveStructures) {
            let sharedLength = structures.sharedLength || 0;
            let returnBuffer = target.subarray(start, position2);
            let newSharedData = (packr._prepareStructures || prepareStructures)(structures, packr);
            if (!encodingError) {
              if (packr.saveStructures(newSharedData, newSharedData.isCompatible) === false) {
                structures.uninitialized = true;
                return packr.pack(value, encodeOptions);
              }
              packr.lastNamedStructuresLength = sharedLength;
              if (target.length > 1073741824) target = null;
              return returnBuffer;
            }
          }
        }
        if (target.length > 1073741824) target = null;
        if (encodeOptions & RESET_BUFFER_MODE)
          position2 = start;
      }
    };
    const resetStructures = () => {
      if (serializationsSinceTransitionRebuild < 10)
        serializationsSinceTransitionRebuild++;
      let sharedLength = structures.sharedLength || 0;
      if (structures.length > sharedLength && !isSequential)
        structures.length = sharedLength;
      if (transitionsCount > 1e4) {
        structures.transitions = null;
        serializationsSinceTransitionRebuild = 0;
        transitionsCount = 0;
        if (recordIdsToRemove.length > 0)
          recordIdsToRemove = [];
      } else if (recordIdsToRemove.length > 0 && !isSequential) {
        for (let i = 0, l = recordIdsToRemove.length; i < l; i++) {
          recordIdsToRemove[i][RECORD_SYMBOL] = 0;
        }
        recordIdsToRemove = [];
      }
    };
    const packArray = (value) => {
      var length = value.length;
      if (length < 16) {
        target[position2++] = 144 | length;
      } else if (length < 65536) {
        target[position2++] = 220;
        target[position2++] = length >> 8;
        target[position2++] = length & 255;
      } else {
        target[position2++] = 221;
        targetView.setUint32(position2, length);
        position2 += 4;
      }
      for (let i = 0; i < length; i++) {
        pack2(value[i]);
      }
    };
    const pack2 = (value) => {
      if (position2 > safeEnd)
        target = makeRoom(position2);
      var type = typeof value;
      var length;
      if (type === "string") {
        let strLength = value.length;
        if (bundledStrings2 && strLength >= 4 && strLength < 4096) {
          if ((bundledStrings2.size += strLength) > MAX_BUNDLE_SIZE) {
            let extStart;
            let maxBytes2 = (bundledStrings2[0] ? bundledStrings2[0].length * 3 + bundledStrings2[1].length : 0) + 10;
            if (position2 + maxBytes2 > safeEnd)
              target = makeRoom(position2 + maxBytes2);
            let lastBundle;
            if (bundledStrings2.position) {
              lastBundle = bundledStrings2;
              target[position2] = 200;
              position2 += 3;
              target[position2++] = 98;
              extStart = position2 - start;
              position2 += 4;
              writeBundles(start, pack2, 0);
              targetView.setUint16(extStart + start - 3, position2 - start - extStart);
            } else {
              target[position2++] = 214;
              target[position2++] = 98;
              extStart = position2 - start;
              position2 += 4;
            }
            bundledStrings2 = ["", ""];
            bundledStrings2.previous = lastBundle;
            bundledStrings2.size = 0;
            bundledStrings2.position = extStart;
          }
          let twoByte = hasNonLatin.test(value);
          bundledStrings2[twoByte ? 0 : 1] += value;
          target[position2++] = 193;
          pack2(twoByte ? -strLength : strLength);
          return;
        }
        let headerSize;
        if (strLength < 32) {
          headerSize = 1;
        } else if (strLength < 256) {
          headerSize = 2;
        } else if (strLength < 65536) {
          headerSize = 3;
        } else {
          headerSize = 5;
        }
        let maxBytes = strLength * 3;
        if (position2 + maxBytes > safeEnd)
          target = makeRoom(position2 + maxBytes);
        if (strLength < 64 || !encodeUtf8) {
          let i, c1, c2, strPosition = position2 + headerSize;
          for (i = 0; i < strLength; i++) {
            c1 = value.charCodeAt(i);
            if (c1 < 128) {
              target[strPosition++] = c1;
            } else if (c1 < 2048) {
              target[strPosition++] = c1 >> 6 | 192;
              target[strPosition++] = c1 & 63 | 128;
            } else if ((c1 & 64512) === 55296 && ((c2 = value.charCodeAt(i + 1)) & 64512) === 56320) {
              c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
              i++;
              target[strPosition++] = c1 >> 18 | 240;
              target[strPosition++] = c1 >> 12 & 63 | 128;
              target[strPosition++] = c1 >> 6 & 63 | 128;
              target[strPosition++] = c1 & 63 | 128;
            } else {
              target[strPosition++] = c1 >> 12 | 224;
              target[strPosition++] = c1 >> 6 & 63 | 128;
              target[strPosition++] = c1 & 63 | 128;
            }
          }
          length = strPosition - position2 - headerSize;
        } else {
          length = encodeUtf8(value, position2 + headerSize);
        }
        if (length < 32) {
          target[position2++] = 160 | length;
        } else if (length < 256) {
          if (headerSize < 2) {
            target.copyWithin(position2 + 2, position2 + 1, position2 + 1 + length);
          }
          target[position2++] = 217;
          target[position2++] = length;
        } else if (length < 65536) {
          if (headerSize < 3) {
            target.copyWithin(position2 + 3, position2 + 2, position2 + 2 + length);
          }
          target[position2++] = 218;
          target[position2++] = length >> 8;
          target[position2++] = length & 255;
        } else {
          if (headerSize < 5) {
            target.copyWithin(position2 + 5, position2 + 3, position2 + 3 + length);
          }
          target[position2++] = 219;
          targetView.setUint32(position2, length);
          position2 += 4;
        }
        position2 += length;
      } else if (type === "number") {
        if (value >>> 0 === value) {
          if (value < 32 || value < 128 && this.useRecords === false || value < 64 && !this._writeStruct) {
            target[position2++] = value;
          } else if (value < 256) {
            target[position2++] = 204;
            target[position2++] = value;
          } else if (value < 65536) {
            target[position2++] = 205;
            target[position2++] = value >> 8;
            target[position2++] = value & 255;
          } else {
            target[position2++] = 206;
            targetView.setUint32(position2, value);
            position2 += 4;
          }
        } else if (value >> 0 === value) {
          if (value >= -32) {
            target[position2++] = 256 + value;
          } else if (value >= -128) {
            target[position2++] = 208;
            target[position2++] = value + 256;
          } else if (value >= -32768) {
            target[position2++] = 209;
            targetView.setInt16(position2, value);
            position2 += 2;
          } else {
            target[position2++] = 210;
            targetView.setInt32(position2, value);
            position2 += 4;
          }
        } else {
          let useFloat32;
          if ((useFloat32 = this.useFloat32) > 0 && value < 4294967296 && value >= -2147483648) {
            target[position2++] = 202;
            targetView.setFloat32(position2, value);
            let xShifted;
            if (useFloat32 < 4 || // this checks for rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
            (xShifted = value * mult10[(target[position2] & 127) << 1 | target[position2 + 1] >> 7]) >> 0 === xShifted) {
              position2 += 4;
              return;
            } else
              position2--;
          }
          target[position2++] = 203;
          targetView.setFloat64(position2, value);
          position2 += 8;
        }
      } else if (type === "object" || type === "function") {
        if (!value)
          target[position2++] = 192;
        else {
          if (referenceMap2) {
            let referee = referenceMap2.get(value);
            if (referee) {
              if (!referee.id) {
                let idsToInsert = referenceMap2.idsToInsert || (referenceMap2.idsToInsert = []);
                referee.id = idsToInsert.push(referee);
              }
              target[position2++] = 214;
              target[position2++] = 112;
              targetView.setUint32(position2, referee.id);
              position2 += 4;
              return;
            } else
              referenceMap2.set(value, { offset: position2 - start });
          }
          let constructor = value.constructor;
          if (constructor === Object) {
            writeObject(value);
          } else if (constructor === Array) {
            packArray(value);
          } else if (constructor === Map) {
            if (this.mapAsEmptyObject) target[position2++] = 128;
            else {
              length = value.size;
              if (length < 16) {
                target[position2++] = 128 | length;
              } else if (length < 65536) {
                target[position2++] = 222;
                target[position2++] = length >> 8;
                target[position2++] = length & 255;
              } else {
                target[position2++] = 223;
                targetView.setUint32(position2, length);
                position2 += 4;
              }
              for (let [key, entryValue] of value) {
                pack2(key);
                pack2(entryValue);
              }
            }
          } else {
            for (let i = 0, l = extensions.length; i < l; i++) {
              let extensionClass = extensionClasses[i];
              if (value instanceof extensionClass) {
                let extension = extensions[i];
                if (extension.write) {
                  if (extension.type) {
                    target[position2++] = 212;
                    target[position2++] = extension.type;
                    target[position2++] = 0;
                  }
                  let writeResult = extension.write.call(this, value);
                  if (writeResult === value) {
                    if (Array.isArray(value)) {
                      packArray(value);
                    } else {
                      writeObject(value);
                    }
                  } else {
                    pack2(writeResult);
                  }
                  return;
                }
                let currentTarget = target;
                let currentTargetView = targetView;
                let currentPosition = position2;
                target = null;
                let result;
                try {
                  result = extension.pack.call(this, value, (size) => {
                    target = currentTarget;
                    currentTarget = null;
                    position2 += size;
                    if (position2 > safeEnd)
                      makeRoom(position2);
                    return {
                      target,
                      targetView,
                      position: position2 - size
                    };
                  }, pack2);
                } finally {
                  if (currentTarget) {
                    target = currentTarget;
                    targetView = currentTargetView;
                    position2 = currentPosition;
                    safeEnd = target.length - 10;
                  }
                }
                if (result) {
                  if (result.length + position2 > safeEnd)
                    makeRoom(result.length + position2);
                  position2 = writeExtensionData(result, target, position2, extension.type);
                }
                return;
              }
            }
            if (Array.isArray(value)) {
              packArray(value);
            } else {
              if (packr.useToJSON !== false && value.toJSON) {
                const json = value.toJSON();
                if (json !== value)
                  return pack2(json);
              }
              if (type === "function")
                return pack2(this.writeFunction && this.writeFunction(value));
              writeObject(value);
            }
          }
        }
      } else if (type === "boolean") {
        target[position2++] = value ? 195 : 194;
      } else if (type === "bigint") {
        if (value < 9223372036854776e3 && value >= -9223372036854776e3) {
          target[position2++] = 211;
          targetView.setBigInt64(position2, value);
        } else if (value < 18446744073709552e3 && value > 0) {
          target[position2++] = 207;
          targetView.setBigUint64(position2, value);
        } else {
          if (this.largeBigIntToFloat) {
            target[position2++] = 203;
            targetView.setFloat64(position2, Number(value));
          } else if (this.largeBigIntToString) {
            return pack2(value.toString());
          } else if (this.useBigIntExtension || this.moreTypes) {
            let empty = value < 0 ? BigInt(-1) : BigInt(0);
            let array;
            if (value >> BigInt(65536) === empty) {
              let mask = BigInt(18446744073709552e3) - BigInt(1);
              let chunks = [];
              while (true) {
                chunks.push(value & mask);
                if (value >> BigInt(63) === empty) break;
                value >>= BigInt(64);
              }
              array = new Uint8Array(new BigUint64Array(chunks).buffer);
              array.reverse();
            } else {
              let invert = value < 0;
              let string2 = (invert ? ~value : value).toString(16);
              if (string2.length % 2) {
                string2 = "0" + string2;
              } else if (parseInt(string2.charAt(0), 16) >= 8) {
                string2 = "00" + string2;
              }
              if (hasNodeBuffer) {
                array = Buffer.from(string2, "hex");
              } else {
                array = new Uint8Array(string2.length / 2);
                for (let i = 0; i < array.length; i++) {
                  array[i] = parseInt(string2.slice(i * 2, i * 2 + 2), 16);
                }
              }
              if (invert) {
                for (let i = 0; i < array.length; i++) array[i] = ~array[i];
              }
            }
            if (array.length + position2 > safeEnd)
              makeRoom(array.length + position2);
            position2 = writeExtensionData(array, target, position2, 66);
            return;
          } else {
            throw new RangeError(value + " was too large to fit in MessagePack 64-bit integer format, use useBigIntExtension, or set largeBigIntToFloat to convert to float-64, or set largeBigIntToString to convert to string");
          }
        }
        position2 += 8;
      } else if (type === "undefined") {
        if (this.encodeUndefinedAsNil)
          target[position2++] = 192;
        else {
          target[position2++] = 212;
          target[position2++] = 0;
          target[position2++] = 0;
        }
      } else {
        throw new Error("Unknown type: " + type);
      }
    };
    const writePlainObject = this.variableMapSize || this.coercibleKeyAsNumber || this.skipValues ? (object) => {
      let keys;
      if (this.skipValues) {
        keys = [];
        for (let key2 in object) {
          if ((typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key2)) && !this.skipValues.includes(object[key2]))
            keys.push(key2);
        }
      } else {
        keys = Object.keys(object);
      }
      let length = keys.length;
      if (length < 16) {
        target[position2++] = 128 | length;
      } else if (length < 65536) {
        target[position2++] = 222;
        target[position2++] = length >> 8;
        target[position2++] = length & 255;
      } else {
        target[position2++] = 223;
        targetView.setUint32(position2, length);
        position2 += 4;
      }
      let key;
      if (this.coercibleKeyAsNumber) {
        for (let i = 0; i < length; i++) {
          key = keys[i];
          let num = Number(key);
          pack2(isNaN(num) ? key : num);
          pack2(object[key]);
        }
      } else {
        for (let i = 0; i < length; i++) {
          pack2(key = keys[i]);
          pack2(object[key]);
        }
      }
    } : (object) => {
      target[position2++] = 222;
      let objectOffset = position2 - start;
      position2 += 2;
      let size = 0;
      for (let key in object) {
        if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key)) {
          pack2(key);
          pack2(object[key]);
          size++;
        }
      }
      if (size > 65535) {
        throw new Error('Object is too large to serialize with fast 16-bit map size, use the "variableMapSize" option to serialize this object');
      }
      target[objectOffset++ + start] = size >> 8;
      target[objectOffset + start] = size & 255;
    };
    const writeRecord = this.useRecords === false ? writePlainObject : options.progressiveRecords && !useTwoByteRecords ? (
      // this is about 2% faster for highly stable structures, since it only requires one for-in loop (but much more expensive when new structure needs to be written)
      (object) => {
        let nextTransition, transition = structures.transitions || (structures.transitions = /* @__PURE__ */ Object.create(null));
        let objectOffset = position2++ - start;
        let wroteKeys;
        for (let key in object) {
          if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key)) {
            nextTransition = transition[key];
            if (nextTransition)
              transition = nextTransition;
            else {
              let keys = Object.keys(object);
              let lastTransition = transition;
              transition = structures.transitions;
              let newTransitions = 0;
              for (let i = 0, l = keys.length; i < l; i++) {
                let key2 = keys[i];
                nextTransition = transition[key2];
                if (!nextTransition) {
                  nextTransition = transition[key2] = /* @__PURE__ */ Object.create(null);
                  newTransitions++;
                }
                transition = nextTransition;
              }
              if (objectOffset + start + 1 == position2) {
                position2--;
                newRecord(transition, keys, newTransitions);
              } else
                insertNewRecord(transition, keys, objectOffset, newTransitions);
              wroteKeys = true;
              transition = lastTransition[key];
            }
            pack2(object[key]);
          }
        }
        if (!wroteKeys) {
          let recordId = transition[RECORD_SYMBOL];
          if (recordId)
            target[objectOffset + start] = recordId;
          else
            insertNewRecord(transition, Object.keys(object), objectOffset, 0);
        }
      }
    ) : (object) => {
      let nextTransition, transition = structures.transitions || (structures.transitions = /* @__PURE__ */ Object.create(null));
      let newTransitions = 0;
      for (let key in object) if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key)) {
        nextTransition = transition[key];
        if (!nextTransition) {
          nextTransition = transition[key] = /* @__PURE__ */ Object.create(null);
          newTransitions++;
        }
        transition = nextTransition;
      }
      let recordId = transition[RECORD_SYMBOL];
      if (recordId) {
        if (recordId >= 96 && useTwoByteRecords) {
          target[position2++] = ((recordId -= 96) & 31) + 96;
          target[position2++] = recordId >> 5;
        } else
          target[position2++] = recordId;
      } else {
        newRecord(transition, transition.__keys__ || Object.keys(object), newTransitions);
      }
      for (let key in object)
        if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key)) {
          pack2(object[key]);
        }
    };
    const checkUseRecords = typeof this.useRecords == "function" && this.useRecords;
    const writeObject = checkUseRecords ? (object) => {
      checkUseRecords(object) ? writeRecord(object) : writePlainObject(object);
    } : writeRecord;
    const writeStruct = (object) => {
      let newPosition = packr._writeStruct(object, target, start, position2, structures, makeRoom, (value, newPosition2, notifySharedUpdate) => {
        if (notifySharedUpdate)
          return hasSharedUpdate = true;
        position2 = newPosition2;
        let startTarget = target;
        pack2(value);
        resetStructures();
        if (startTarget !== target) {
          return { position: position2, targetView, target };
        }
        return position2;
      });
      if (newPosition === 0)
        return writeObject(object);
      position2 = newPosition;
    };
    const makeRoom = (end) => {
      let newSize;
      if (end > 16777216) {
        if (end - start > MAX_BUFFER_SIZE)
          throw new Error("Packed buffer would be larger than maximum buffer size");
        newSize = Math.min(
          MAX_BUFFER_SIZE,
          Math.round(Math.max((end - start) * (end > 67108864 ? 1.25 : 2), 4194304) / 4096) * 4096
        );
      } else
        newSize = (Math.max(end - start << 2, target.length - 1) >> 12) + 1 << 12;
      let newBuffer = new ByteArrayAllocate(newSize);
      targetView = newBuffer.dataView || (newBuffer.dataView = new DataView(newBuffer.buffer, 0, newSize));
      end = Math.min(end, target.length);
      if (target.copy)
        target.copy(newBuffer, 0, start, end);
      else
        newBuffer.set(target.slice(start, end));
      position2 -= start;
      start = 0;
      safeEnd = newBuffer.length - 10;
      return target = newBuffer;
    };
    const newRecord = (transition, keys, newTransitions) => {
      let recordId = structures.nextId;
      if (!recordId)
        recordId = 64;
      if (recordId < sharedLimitId && this.shouldShareStructure && !this.shouldShareStructure(keys)) {
        recordId = structures.nextOwnId;
        if (!(recordId < maxStructureId))
          recordId = sharedLimitId;
        structures.nextOwnId = recordId + 1;
      } else {
        if (recordId >= maxStructureId)
          recordId = sharedLimitId;
        structures.nextId = recordId + 1;
      }
      let highByte = keys.highByte = recordId >= 96 && useTwoByteRecords ? recordId - 96 >> 5 : -1;
      transition[RECORD_SYMBOL] = recordId;
      transition.__keys__ = keys;
      structures[recordId - 64] = keys;
      if (recordId < sharedLimitId) {
        keys.isShared = true;
        structures.sharedLength = recordId - 63;
        hasSharedUpdate = true;
        if (highByte >= 0) {
          target[position2++] = (recordId & 31) + 96;
          target[position2++] = highByte;
        } else {
          target[position2++] = recordId;
        }
      } else {
        if (highByte >= 0) {
          target[position2++] = 213;
          target[position2++] = 114;
          target[position2++] = (recordId & 31) + 96;
          target[position2++] = highByte;
        } else {
          target[position2++] = 212;
          target[position2++] = 114;
          target[position2++] = recordId;
        }
        if (newTransitions)
          transitionsCount += serializationsSinceTransitionRebuild * newTransitions;
        if (recordIdsToRemove.length >= maxOwnStructures)
          recordIdsToRemove.shift()[RECORD_SYMBOL] = 0;
        recordIdsToRemove.push(transition);
        pack2(keys);
      }
    };
    const insertNewRecord = (transition, keys, insertionOffset, newTransitions) => {
      let mainTarget = target;
      let mainPosition = position2;
      let mainSafeEnd = safeEnd;
      let mainStart = start;
      target = keysTarget;
      position2 = 0;
      start = 0;
      if (!target)
        keysTarget = target = new ByteArrayAllocate(8192);
      safeEnd = target.length - 10;
      newRecord(transition, keys, newTransitions);
      keysTarget = target;
      let keysPosition = position2;
      target = mainTarget;
      position2 = mainPosition;
      safeEnd = mainSafeEnd;
      start = mainStart;
      if (keysPosition > 1) {
        let newEnd = position2 + keysPosition - 1;
        if (newEnd > safeEnd)
          makeRoom(newEnd);
        let insertionPosition = insertionOffset + start;
        target.copyWithin(insertionPosition + keysPosition, insertionPosition + 1, position2);
        target.set(keysTarget.slice(0, keysPosition), insertionPosition);
        position2 = newEnd;
      } else {
        target[insertionOffset + start] = keysTarget[0];
      }
    };
  }
  useBuffer(buffer) {
    target = buffer;
    target.dataView || (target.dataView = new DataView(target.buffer, target.byteOffset, target.byteLength));
    targetView = target.dataView;
    position2 = 0;
  }
  set position(value) {
    position2 = value;
  }
  get position() {
    return position2;
  }
  clearSharedData() {
    if (this.structures)
      this.structures = [];
    if (this.typedStructs)
      this.typedStructs = [];
  }
};
extensionClasses = [Date, Set, Error, RegExp, ArrayBuffer, Object.getPrototypeOf(Uint8Array.prototype).constructor, DataView, C1Type];
extensions = [{
  pack(date, allocateForWrite, pack2) {
    let seconds = date.getTime() / 1e3;
    if ((this.useTimestamp32 || date.getMilliseconds() === 0) && seconds >= 0 && seconds < 4294967296) {
      let { target: target2, targetView: targetView2, position: position3 } = allocateForWrite(6);
      target2[position3++] = 214;
      target2[position3++] = 255;
      targetView2.setUint32(position3, seconds);
    } else if (seconds > 0 && seconds < 4294967296) {
      let { target: target2, targetView: targetView2, position: position3 } = allocateForWrite(10);
      target2[position3++] = 215;
      target2[position3++] = 255;
      targetView2.setUint32(position3, date.getMilliseconds() * 4e6 + (seconds / 1e3 / 4294967296 >> 0));
      targetView2.setUint32(position3 + 4, seconds);
    } else if (isNaN(seconds)) {
      if (this.onInvalidDate) {
        allocateForWrite(0);
        return pack2(this.onInvalidDate());
      }
      let { target: target2, targetView: targetView2, position: position3 } = allocateForWrite(3);
      target2[position3++] = 212;
      target2[position3++] = 255;
      target2[position3++] = 255;
    } else {
      let { target: target2, targetView: targetView2, position: position3 } = allocateForWrite(15);
      target2[position3++] = 199;
      target2[position3++] = 12;
      target2[position3++] = 255;
      targetView2.setUint32(position3, date.getMilliseconds() * 1e6);
      targetView2.setBigInt64(position3 + 4, BigInt(Math.floor(seconds)));
    }
  }
}, {
  pack(set, allocateForWrite, pack2) {
    if (this.setAsEmptyObject) {
      allocateForWrite(0);
      return pack2({});
    }
    let array = Array.from(set);
    let { target: target2, position: position3 } = allocateForWrite(this.moreTypes ? 3 : 0);
    if (this.moreTypes) {
      target2[position3++] = 212;
      target2[position3++] = 115;
      target2[position3++] = 0;
    }
    pack2(array);
  }
}, {
  pack(error, allocateForWrite, pack2) {
    let { target: target2, position: position3 } = allocateForWrite(this.moreTypes ? 3 : 0);
    if (this.moreTypes) {
      target2[position3++] = 212;
      target2[position3++] = 101;
      target2[position3++] = 0;
    }
    pack2([error.name, error.message, error.cause]);
  }
}, {
  pack(regex, allocateForWrite, pack2) {
    let { target: target2, position: position3 } = allocateForWrite(this.moreTypes ? 3 : 0);
    if (this.moreTypes) {
      target2[position3++] = 212;
      target2[position3++] = 120;
      target2[position3++] = 0;
    }
    pack2([regex.source, regex.flags]);
  }
}, {
  pack(arrayBuffer, allocateForWrite) {
    if (this.moreTypes)
      writeExtBuffer(arrayBuffer, 16, allocateForWrite);
    else
      writeBuffer(hasNodeBuffer ? Buffer.from(arrayBuffer) : new Uint8Array(arrayBuffer), allocateForWrite);
  }
}, {
  pack(typedArray, allocateForWrite) {
    let constructor = typedArray.constructor;
    if (constructor !== ByteArray && this.moreTypes)
      writeExtBuffer(typedArray, typedArrays.indexOf(constructor.name), allocateForWrite);
    else
      writeBuffer(typedArray, allocateForWrite);
  }
}, {
  pack(arrayBuffer, allocateForWrite) {
    if (this.moreTypes)
      writeExtBuffer(arrayBuffer, 17, allocateForWrite);
    else
      writeBuffer(hasNodeBuffer ? Buffer.from(arrayBuffer) : new Uint8Array(arrayBuffer), allocateForWrite);
  }
}, {
  pack(c1, allocateForWrite) {
    let { target: target2, position: position3 } = allocateForWrite(1);
    target2[position3] = 193;
  }
}];
function writeExtBuffer(typedArray, type, allocateForWrite, encode3) {
  let length = typedArray.byteLength;
  if (length + 1 < 256) {
    var { target: target2, position: position3 } = allocateForWrite(4 + length);
    target2[position3++] = 199;
    target2[position3++] = length + 1;
  } else if (length + 1 < 65536) {
    var { target: target2, position: position3 } = allocateForWrite(5 + length);
    target2[position3++] = 200;
    target2[position3++] = length + 1 >> 8;
    target2[position3++] = length + 1 & 255;
  } else {
    var { target: target2, position: position3, targetView: targetView2 } = allocateForWrite(7 + length);
    target2[position3++] = 201;
    targetView2.setUint32(position3, length + 1);
    position3 += 4;
  }
  target2[position3++] = 116;
  target2[position3++] = type;
  if (!typedArray.buffer) typedArray = new Uint8Array(typedArray);
  target2.set(new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength), position3);
}
function writeBuffer(buffer, allocateForWrite) {
  let length = buffer.byteLength;
  var target2, position3;
  if (length < 256) {
    var { target: target2, position: position3 } = allocateForWrite(length + 2);
    target2[position3++] = 196;
    target2[position3++] = length;
  } else if (length < 65536) {
    var { target: target2, position: position3 } = allocateForWrite(length + 3);
    target2[position3++] = 197;
    target2[position3++] = length >> 8;
    target2[position3++] = length & 255;
  } else {
    var { target: target2, position: position3, targetView: targetView2 } = allocateForWrite(length + 5);
    target2[position3++] = 198;
    targetView2.setUint32(position3, length);
    position3 += 4;
  }
  target2.set(buffer, position3);
}
function writeExtensionData(result, target2, position3, type) {
  let length = result.length;
  switch (length) {
    case 1:
      target2[position3++] = 212;
      break;
    case 2:
      target2[position3++] = 213;
      break;
    case 4:
      target2[position3++] = 214;
      break;
    case 8:
      target2[position3++] = 215;
      break;
    case 16:
      target2[position3++] = 216;
      break;
    default:
      if (length < 256) {
        target2[position3++] = 199;
        target2[position3++] = length;
      } else if (length < 65536) {
        target2[position3++] = 200;
        target2[position3++] = length >> 8;
        target2[position3++] = length & 255;
      } else {
        target2[position3++] = 201;
        target2[position3++] = length >> 24;
        target2[position3++] = length >> 16 & 255;
        target2[position3++] = length >> 8 & 255;
        target2[position3++] = length & 255;
      }
  }
  target2[position3++] = type;
  target2.set(result, position3);
  position3 += length;
  return position3;
}
function insertIds(serialized, idsToInsert) {
  let nextId;
  let distanceToMove = idsToInsert.length * 6;
  let lastEnd = serialized.length - distanceToMove;
  while (nextId = idsToInsert.pop()) {
    let offset = nextId.offset;
    let id = nextId.id;
    serialized.copyWithin(offset + distanceToMove, offset, lastEnd);
    distanceToMove -= 6;
    let position3 = offset + distanceToMove;
    serialized[position3++] = 214;
    serialized[position3++] = 105;
    serialized[position3++] = id >> 24;
    serialized[position3++] = id >> 16 & 255;
    serialized[position3++] = id >> 8 & 255;
    serialized[position3++] = id & 255;
    lastEnd = offset;
  }
  return serialized;
}
function writeBundles(start, pack2, incrementPosition) {
  if (bundledStrings2.length > 0) {
    targetView.setUint32(bundledStrings2.position + start, position2 + incrementPosition - bundledStrings2.position - start);
    bundledStrings2.stringsPosition = position2 - start;
    let writeStrings = bundledStrings2;
    bundledStrings2 = null;
    pack2(writeStrings[0]);
    pack2(writeStrings[1]);
  }
}
function prepareStructures(structures, packr) {
  structures.isCompatible = (existingStructures) => {
    let compatible = !existingStructures || (packr.lastNamedStructuresLength || 0) === existingStructures.length;
    if (!compatible)
      packr._mergeStructures(existingStructures);
    return compatible;
  };
  return structures;
}
Packr.SUPPORTS_STRUCT_HOOKS = true;
var defaultPackr = new Packr({ useRecords: false });
var pack = defaultPackr.pack;
var encode2 = defaultPackr.pack;
var { NEVER, ALWAYS, DECIMAL_ROUND, DECIMAL_FIT } = FLOAT32_OPTIONS;
var REUSE_BUFFER_MODE = 512;
var RESET_BUFFER_MODE = 1024;
var RESERVE_START_SPACE = 2048;

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/transport/H3Transport.mjs
var MAX_LENGTH_PREFIX_BYTES = 9;
var FrameReassembler = class {
  pending = new Uint8Array(0);
  push(chunk) {
    if (!chunk || chunk.byteLength === 0) {
      return [];
    }
    const bytes = this.pending.byteLength === 0 ? chunk : concatBytes2(this.pending, chunk);
    const frames = [];
    let offset = 0;
    while (offset < bytes.byteLength) {
      const it = { offset };
      let length;
      try {
        length = decode.number(bytes, it);
      } catch (e) {
        if (bytes.byteLength - offset <= MAX_LENGTH_PREFIX_BYTES) {
          break;
        }
        throw e;
      }
      const frameEnd = it.offset + length;
      if (frameEnd > bytes.byteLength) {
        break;
      }
      frames.push(bytes.subarray(it.offset, frameEnd));
      offset = frameEnd;
    }
    this.pending = offset < bytes.byteLength ? bytes.slice(offset) : new Uint8Array(0);
    return frames;
  }
};
function concatBytes2(a, b) {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}
var H3TransportTransport = class {
  wt;
  /** Connect URL — exposed so tooling (e.g. the debug panel) can show the
   *  endpoint, mirroring `WebSocketTransport.ws.url`. */
  url;
  isOpen = false;
  events;
  reader;
  writer;
  unreliableReader;
  unreliableWriter;
  lengthPrefixBuffer = new Uint8Array(9);
  // 9 bytes is the maximum length of a length prefix
  reliableReassembler = new FrameReassembler();
  unreliableReassembler = new FrameReassembler();
  constructor(events) {
    this.events = events;
  }
  connect(url, options = {}) {
    this.url = url;
    const wtOpts = options.fingerprint && {
      // requireUnreliable: true,
      // congestionControl: "default", // "low-latency" || "throughput"
      serverCertificateHashes: [{
        algorithm: "sha-256",
        // Pass the Uint8Array VIEW, not `.buffer`: the @fails-components Node client
        // (1.6) rejects a raw ArrayBuffer here, silently failing the cert-hash match
        // → "Opening handshake failed". Browsers accept either; Node wants the view.
        value: new Uint8Array(options.fingerprint)
      }]
    } || void 0;
    this.wt = new WebTransport(url, wtOpts);
    this.wt.ready.then((e) => {
      console.log("WebTransport ready!", e);
      this.isOpen = true;
      this.unreliableReader = this.wt.datagrams.readable.getReader();
      const datagrams = this.wt.datagrams;
      this.unreliableWriter = (datagrams.createWritable ? datagrams.createWritable() : datagrams.writable).getWriter();
      const incomingBidi = this.wt.incomingBidirectionalStreams.getReader();
      incomingBidi.read().then((stream) => {
        this.reader = stream.value.readable.getReader();
        this.writer = stream.value.writable.getWriter();
        this.sendSeatReservation(options.roomId, options.sessionId, options.reconnectionToken, options.skipHandshake);
        this.readIncomingData();
        this.readIncomingUnreliableData();
      }).catch((e2) => {
        console.error("failed to read incoming stream", e2);
        console.error("TODO: close the connection");
      });
    }).catch((e) => {
      console.log("WebTransport not ready!", e);
      this._close();
    });
    this.wt.closed.then((e) => {
      console.log("WebTransport closed w/ success", e);
      this.events.onclose({ code: e.closeCode, reason: e.reason });
    }).catch((e) => {
      console.log("WebTransport closed w/ error", e);
      this.events.onerror(e);
      this.events.onclose({ code: e.closeCode, reason: e.reason });
    }).finally(() => {
      this._close();
    });
  }
  send(data) {
    this.writer.write(this.frame(data));
  }
  sendUnreliable(data) {
    this.unreliableWriter.write(this.frame(data));
  }
  /**
   * Length-prefix a payload for the wire. Normalizes the input to a typed array
   * first: unlike `ws.send()` (which accepts an ArrayBuffer directly), we frame
   * manually — reading `.length` and copying via `.set()` — so a bare ArrayBuffer
   * (e.g. the debug panel's latency-sim clone) must be wrapped, or `.length` is
   * `undefined` and the allocation/copy goes out of bounds.
   */
  frame(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const prefixLength = encode.number(this.lengthPrefixBuffer, bytes.length, { offset: 0 });
    const out = new Uint8Array(prefixLength + bytes.length);
    out.set(this.lengthPrefixBuffer.subarray(0, prefixLength), 0);
    out.set(bytes, prefixLength);
    return out;
  }
  close(code, reason) {
    this.isOpen = false;
    try {
      const ret = this.wt?.close({ closeCode: code, reason });
      if (ret && typeof ret.catch === "function") {
        ret.catch(() => {
        });
      }
    } catch (e) {
    }
  }
  async readIncomingData() {
    let result;
    while (this.isOpen) {
      try {
        result = await this.reader.read();
        if (result.done || !result.value) {
          break;
        }
        for (const frame of this.reliableReassembler.push(result.value)) {
          this.events.onmessage({ data: frame });
        }
      } catch (e) {
        if (e.message.indexOf("session is closed") === -1) {
          console.error("H3Transport: failed to read incoming data", e);
        }
        break;
      }
      if (result.done) {
        break;
      }
    }
  }
  async readIncomingUnreliableData() {
    let result;
    while (this.isOpen) {
      try {
        result = await this.unreliableReader.read();
        if (result.done || !result.value) {
          break;
        }
        for (const frame of this.unreliableReassembler.push(result.value)) {
          this.events.onmessage({ data: frame });
        }
      } catch (e) {
        if (e.message.indexOf("session is closed") === -1) {
          console.error("H3Transport: failed to read incoming data", e);
        }
        break;
      }
      if (result.done) {
        break;
      }
    }
  }
  sendSeatReservation(roomId, sessionId, reconnectionToken, skipHandshake) {
    const it = { offset: 0 };
    const bytes = [];
    encode.string(bytes, roomId, it);
    encode.string(bytes, sessionId, it);
    if (reconnectionToken) {
      encode.string(bytes, reconnectionToken, it);
    }
    if (skipHandshake) {
      encode.boolean(bytes, 1, it);
    }
    this.writer.write(new Uint8Array(bytes).buffer);
  }
  _close() {
    this.isOpen = false;
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/transport/WebSocketTransport.mjs
var import_ws = __toESM(require_ws(), 1);
var WebSocket = globalThis.WebSocket || import_ws.default;
var warnedNoUnreliableChannel = false;
var WebSocketTransport = class {
  ws;
  protocols;
  events;
  constructor(events) {
    this.events = events;
  }
  send(data) {
    this.ws.send(data);
  }
  /**
   * WebSocket has no unreliable channel, so this falls back to the reliable
   * one — which is what every caller is written against (see `sendRequest`,
   * and the input handle's redundancy ring). Dropping instead loses every
   * `mode:"unreliable"` input and request silently: the server never sees
   * them, and the client's pending set grows without bound because nothing
   * is ever acked.
   *
   * The cost of falling back is bandwidth, not correctness — an input ring
   * carries `historySize` redundant slots the ordered channel doesn't need,
   * and the server dedupes them by wire seq exactly as it would over
   * datagrams. Use `@colyseus/h3-transport` for real unreliable delivery.
   */
  sendUnreliable(data) {
    if (!warnedNoUnreliableChannel) {
      warnedNoUnreliableChannel = true;
      console.warn('@colyseus/sdk: the WebSocket transport has no unreliable channel \u2014 sending `mode:"unreliable"` traffic reliably instead. Use @colyseus/h3-transport (WebTransport) for datagram delivery.');
    }
    this.send(data);
  }
  /**
   * @param url URL to connect to
   * @param headers custom headers to send with the connection (only supported in Node.js. Web Browsers do not allow setting custom headers)
   */
  connect(url, headers) {
    try {
      this.ws = new WebSocket(url, { headers, protocols: this.protocols });
    } catch (e) {
      this.ws = new WebSocket(url, this.protocols);
    }
    this.ws.binaryType = "arraybuffer";
    this.ws.onopen = (event) => this.events.onopen?.(event);
    this.ws.onmessage = (event) => this.events.onmessage?.(event);
    this.ws.onclose = (event) => this.events.onclose?.(event);
    this.ws.onerror = (event) => this.events.onerror?.(event);
  }
  close(code, reason) {
    if (code === CloseCode.MAY_TRY_RECONNECT && this.events.onclose) {
      this.ws.onclose = null;
      this.events.onclose({ code, reason });
    }
    this.ws.close(code, reason);
  }
  get isOpen() {
    return this.ws.readyState === WebSocket.OPEN;
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/Connection.mjs
var onOfflineListeners = [];
var hasGlobalEventListeners = typeof addEventListener === "function" && typeof removeEventListener === "function";
if (hasGlobalEventListeners) {
  addEventListener("offline", () => {
    console.warn(`@colyseus/sdk: \u{1F6D1} Network offline. Closing ${onOfflineListeners.length} connection(s)`);
    onOfflineListeners.forEach((listener) => listener());
  }, false);
}
var Connection = class {
  transport;
  events = {};
  url;
  options;
  #_offlineListener = hasGlobalEventListeners ? () => this.close(CloseCode.MAY_TRY_RECONNECT) : null;
  constructor(protocol) {
    switch (protocol) {
      case "h3":
        this.transport = new H3TransportTransport(this.events);
        break;
      default:
        this.transport = new WebSocketTransport(this.events);
        break;
    }
  }
  connect(url, options) {
    if (hasGlobalEventListeners) {
      const onOpen = this.events.onopen;
      this.events.onopen = (ev) => {
        onOfflineListeners.push(this.#_offlineListener);
        onOpen?.(ev);
      };
      const onClose = this.events.onclose;
      this.events.onclose = (ev) => {
        onOfflineListeners.splice(onOfflineListeners.indexOf(this.#_offlineListener), 1);
        onClose?.(ev);
      };
    }
    this.url = url;
    this.options = options;
    this.transport.connect(url, options);
  }
  send(data) {
    this.transport.send(data);
  }
  sendUnreliable(data) {
    this.transport.sendUnreliable(data);
  }
  reconnect(queryParams) {
    if (this.transport instanceof H3TransportTransport) {
      this.transport.connect(this.url, { ...this.options, ...queryParams });
      return;
    }
    const url = new URL(this.url);
    for (const key in queryParams) {
      url.searchParams.set(key, queryParams[key]);
    }
    this.transport.connect(url.toString(), this.options);
  }
  close(code, reason) {
    this.transport.close(code, reason);
  }
  get isOpen() {
    return this.transport.isOpen;
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/serializer/Serializer.mjs
var serializers = {};
function registerSerializer(id, serializer) {
  serializers[id] = serializer;
}
function getSerializer(id) {
  const serializer = serializers[id];
  if (!serializer) {
    throw new Error("missing serializer: " + id);
  }
  return serializer;
}

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/core/nanoevents.mjs
var createNanoEvents = () => ({
  emit(event, ...args) {
    let callbacks = this.events[event] || [];
    for (let i = 0, length = callbacks.length; i < length; i++) {
      callbacks[i](...args);
    }
  },
  events: {},
  on(event, cb) {
    this.events[event]?.push(cb) || (this.events[event] = [cb]);
    return () => {
      this.events[event] = this.events[event]?.filter((i) => cb !== i);
    };
  }
});

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/core/signal.mjs
var EventEmitter = class {
  handlers = [];
  register(cb, once = false) {
    this.handlers.push(cb);
    return this;
  }
  invoke(...args) {
    this.handlers.forEach((handler) => handler.apply(this, args));
  }
  invokeAsync(...args) {
    return Promise.all(this.handlers.map((handler) => handler.apply(this, args)));
  }
  remove(cb) {
    const index = this.handlers.indexOf(cb);
    this.handlers[index] = this.handlers[this.handlers.length - 1];
    this.handlers.pop();
  }
  clear() {
    this.handlers = [];
  }
};
function createSignal() {
  const emitter = new EventEmitter();
  function register(cb) {
    return emitter.register(cb, this === null);
  }
  ;
  register.once = (cb) => {
    const callback = function(...args) {
      cb.apply(this, args);
      emitter.remove(callback);
    };
    emitter.register(callback);
  };
  register.remove = (cb) => emitter.remove(cb);
  register.invoke = (...args) => emitter.invoke(...args);
  register.invokeAsync = (...args) => emitter.invokeAsync(...args);
  register.clear = () => emitter.clear();
  return register;
}

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/serializer/SchemaSerializer.mjs
var SchemaSerializer = class {
  state;
  decoder;
  setState(encodedState, it) {
    if (this.decoder.root.refs.size > 1 && typeof this.decoder.decodeResync === "function") {
      this.decoder.decodeResync(encodedState, it);
    } else {
      this.decoder.decode(encodedState, it);
    }
  }
  getState() {
    return this.state;
  }
  patch(patches, it) {
    return this.decoder.decode(patches, it);
  }
  teardown() {
    this.decoder.root.clearRefs();
  }
  handshake(bytes, it) {
    if (this.state) {
      Reflection.decode(bytes, it);
      this.decoder = new Decoder(this.state);
    } else {
      this.decoder = Reflection.decode(bytes, it);
      this.state = this.decoder.state;
    }
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/Reconnection.mjs
function createReconnection() {
  return {
    enabled: true,
    retryCount: 0,
    maxRetries: 15,
    delay: 100,
    minDelay: 100,
    maxDelay: 5e3,
    minUptime: 5e3,
    backoff: exponentialBackoff,
    maxEnqueuedMessages: 10,
    enqueuedMessages: [],
    isReconnecting: false
  };
}
var exponentialBackoff = (attempt, delay) => {
  return Math.floor(Math.pow(2, attempt) * delay);
};
function enqueueMessage(room, message) {
  room.reconnection.enqueuedMessages.push({ data: message });
  if (room.reconnection.enqueuedMessages.length > room.reconnection.maxEnqueuedMessages) {
    room.reconnection.enqueuedMessages.shift();
  }
}

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/RoomRequest.mjs
function toRequestError(payload, faulted) {
  if (!faulted) {
    const error2 = new Error("request rejected");
    error2.name = "rejected";
    error2.reason = payload;
    return error2;
  }
  const error = new Error(payload?.message ?? "request failed");
  if (payload?.name) {
    error.name = payload.name;
  }
  if (payload?.code !== void 0) {
    error.code = payload.code;
  }
  return error;
}

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/Room.mjs
var Room = class _Room {
  roomId;
  sessionId;
  reconnectionToken;
  name;
  connection;
  // Public signals
  onStateChange = createSignal();
  onError = createSignal();
  onLeave = createSignal();
  onReconnect = createSignal();
  onDrop = createSignal();
  onJoin = createSignal();
  serializerId;
  serializer;
  // reconnection logic
  reconnection = createReconnection();
  joinedAtTime = 0;
  /**
   * Server-time + RTT estimator, driven by the {@link ProtocolModifier.TIMED}
   * prefix that servers emit when `defineInput()` was called.
   *
   * PRESENCE CONTRACT: `clock` is never `undefined` and always satisfies
   * {@link RoomClock} — every member, including `renderNow()`, is callable
   * with no optional chaining and no fallback.
   *
   * - Defaults to a shared frozen {@link NULL_CLOCK} so `room.clock.serverNow()`
   *   always works. The shim returns the client's own `performance.now()` and
   *   reports `0` for RTT. Rooms that never call `defineInput()` keep this
   *   stub for the whole session — zero allocation cost for chat / lobby /
   *   turn-based rooms.
   * - After handshake on an input room, a default {@link RoomClockImpl} is
   *   instantiated. Users can swap their own implementation in via
   *   `room.clock = new MyClock()` between `await joinOrCreate(...)` and
   *   the first state message (any state-message arrival is on a future
   *   microtask, so a synchronous swap is race-free). A custom clock with no
   *   slew state of its own satisfies the `renderNow` guarantee by aliasing:
   *   `renderNow() { return this.serverNow(); }`.
   */
  clock = NULL_CLOCK;
  onMessageHandlers = createNanoEvents();
  packr;
  sharedBuffer;
  #lastPingTime = 0;
  #pingCallback = void 0;
  /**
   * Default time (ms) a `room.request()` / `room.send(..., callback)` waits
   * for a reply before rejecting. Class-level default — tune globally via
   * `Room.defaultRequestTimeout = ms`; override per-call with the `timeout` option.
   */
  static defaultRequestTimeout = 1e4;
  /** Monotonic id correlating a {@link Protocol.ROOM_REQUEST} with its reply. @internal */
  #nextRequestId = 0;
  /**
   * In-flight round-trips awaiting a {@link Protocol.ROOM_RESPONSE}, keyed by the
   * monotonic request id. `onReply` receives the decoded outcome `(ok, payload,
   * faulted)`; `onClose` (optional) rejects on disconnect — its absence drops the
   * registration silently. @internal
   */
  #pending = /* @__PURE__ */ new Map();
  /**
   * Per-room input state — schema ctor, server-advertised stamp/rate flags,
   * and the cached {@link InputHandle} — all grouped in {@link RoomInput}.
   * Lazily created only when the room declares input (an `INPUT_*` handshake
   * section arrives) or `input()` is called; stays `undefined` for chat /
   * lobby / turn-based rooms — zero allocation.
   * @internal
   */
  #input;
  /**
   * Seq of the newest {@link ProtocolModifier.UNRELIABLE} patch applied, so a
   * reordered datagram can be dropped rather than write a stale value. Wraps
   * at 65536; `0` is the post-`ROOM_STATE` baseline. Stays `0` forever on
   * rooms whose state declares no `@unreliable` field.
   * @internal
   */
  #lastUnreliableSeq = 0;
  constructor(name, rootSchema) {
    this.name = name;
    this.packr = new Packr();
    this.sharedBuffer = new Uint8Array(8192);
    if (rootSchema) {
      const serializer = new (getSerializer("schema"))();
      this.serializer = serializer;
      const state = new rootSchema();
      serializer.state = state;
      serializer.decoder = new Decoder(state);
    }
    this.onLeave(() => {
      this.removeAllListeners();
      this.destroy();
    });
  }
  connect(endpoint, options, headers) {
    this.connection = new Connection(options.protocol);
    this.connection.events.onmessage = this.onMessageCallback.bind(this);
    this.connection.events.onclose = (e) => {
      this.#rejectAllPending("connection closed before a response was received.");
      if (this.joinedAtTime === 0) {
        console.warn?.(`Room connection was closed unexpectedly (${e.code}): ${e.reason}`);
        this.onError.invoke(e.code, e.reason);
        return;
      }
      if (e.code === CloseCode.NO_STATUS_RECEIVED || e.code === CloseCode.ABNORMAL_CLOSURE || e.code === CloseCode.GOING_AWAY || e.code === CloseCode.MAY_TRY_RECONNECT) {
        this.onDrop.invoke(e.code, e.reason);
        this.handleReconnection(e.code, e.reason);
      } else {
        this.onLeave.invoke(e.code, e.reason);
      }
    };
    this.connection.events.onerror = (e) => {
      this.onError.invoke(e.code, e.reason);
    };
    const skipHandshake = this.serializer?.getState() !== void 0;
    if (options.protocol === "h3") {
      const url = new URL(endpoint);
      this.connection.connect(url.origin, { ...options, skipHandshake });
    } else {
      this.connection.connect(`${endpoint}${skipHandshake ? "&skipHandshake=1" : ""}`, headers);
    }
  }
  leave(consented = true) {
    return new Promise((resolve) => {
      this.onLeave((code) => resolve(code));
      if (this.connection) {
        if (consented) {
          this.sharedBuffer[0] = Protocol.LEAVE_ROOM;
          this.connection.send(this.sharedBuffer.subarray(0, 1));
        } else {
          this.connection.close();
        }
      } else {
        this.onLeave.invoke(CloseCode.CONSENTED);
      }
    });
  }
  onMessage(type, callback) {
    return this.onMessageHandlers.on(this.getMessageHandlerKey(type), callback);
  }
  ping(callback) {
    if (!this.connection?.isOpen) {
      return;
    }
    this.#lastPingTime = now();
    this.#pingCallback = callback;
    this.sharedBuffer[0] = Protocol.PING;
    this.connection.send(this.sharedBuffer.subarray(0, 1));
  }
  send(messageType, payload, callback) {
    if (callback !== void 0) {
      this.request(messageType, payload).then((response) => callback(response, void 0), (error) => callback(void 0, error));
      return;
    }
    const it = { offset: 1 };
    this.sharedBuffer[0] = Protocol.ROOM_DATA;
    if (typeof messageType === "string") {
      encode.string(this.sharedBuffer, messageType, it);
    } else {
      encode.number(this.sharedBuffer, messageType, it);
    }
    const headerLength = it.offset;
    let data;
    if (payload !== void 0) {
      data = this.packr.pack(payload, RESERVE_START_SPACE | headerLength);
      data.set(this.sharedBuffer.subarray(0, headerLength), 0);
    } else {
      data = this.sharedBuffer.subarray(0, headerLength);
    }
    if (!this.connection.isOpen) {
      enqueueMessage(this, new Uint8Array(data));
    } else {
      this.connection.send(data);
    }
  }
  request(messageType, payload, options) {
    if (!this.connection.isOpen) {
      return Promise.reject(new Error(`cannot send request "${messageType}": connection is not open.`));
    }
    const timeoutMs = options?.timeout ?? _Room.defaultRequestTimeout;
    return new Promise((resolve, reject) => {
      let timer;
      const id = this.sendRequest(messageType, payload, { mode: options?.mode }, (ok, replyPayload, faulted) => {
        clearTimeout(timer);
        if (ok) {
          resolve(replyPayload);
        } else {
          reject(toRequestError(replyPayload, faulted));
        }
      }, (reason) => {
        clearTimeout(timer);
        reject(new Error(reason));
      });
      timer = setTimeout(() => {
        this.cancelRequest(id);
        reject(new Error(`request "${messageType}" timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    });
  }
  /** Next correlation id (uint32) for a round-trip. @internal */
  #mintRequestId() {
    const id = this.#nextRequestId;
    this.#nextRequestId = this.#nextRequestId + 1 >>> 0;
    return id;
  }
  /** Encode a {@link Protocol.ROOM_REQUEST} frame (shared by `request` + `sendRequest`).
   *  The returned buffer aliases `sharedBuffer` for the payload-less case, so
   *  it must be transmitted (or copied) before the next encode. @internal */
  #encodeRequestFrame(requestId, messageType, payload) {
    const it = { offset: 1 };
    this.sharedBuffer[0] = Protocol.ROOM_REQUEST;
    encode.number(this.sharedBuffer, requestId, it);
    if (typeof messageType === "string") {
      encode.string(this.sharedBuffer, messageType, it);
    } else {
      encode.number(this.sharedBuffer, messageType, it);
    }
    const headerLength = it.offset;
    if (payload !== void 0) {
      const data = this.packr.pack(payload, RESERVE_START_SPACE | headerLength);
      data.set(this.sharedBuffer.subarray(0, headerLength), 0);
      return data;
    }
    return this.sharedBuffer.subarray(0, headerLength);
  }
  /**
   * Low-level round-trip primitive: register `onReply` (called once with the
   * decoded outcome when the server replies) and transmit a
   * {@link Protocol.ROOM_REQUEST} (`mode` picks the channel). {@link request}
   * wraps it with a promise + timeout. `onClose` (optional) is invoked on
   * disconnect — omit it to drop the registration silently. Returns the request
   * id, or `-1` if an unreliable send couldn't be transmitted (offline). @internal
   */
  sendRequest(messageType, payload, opts, onReply, onClose) {
    const requestId = this.#mintRequestId();
    const data = this.#encodeRequestFrame(requestId, messageType, payload);
    if (opts.mode === "unreliable") {
      if (!this.connection.isOpen) {
        return -1;
      }
      this.connection.sendUnreliable(data);
    } else if (this.connection.isOpen) {
      this.connection.send(data);
    } else {
      enqueueMessage(this, new Uint8Array(data));
    }
    this.#pending.set(requestId, { onReply, onClose });
    return requestId;
  }
  /** Drop a pending round-trip (request timeout, or the predict layer's TTL/cancel
   *  path). Idempotent. @internal */
  cancelRequest(id) {
    this.#pending.delete(id);
  }
  #rejectAllPending(reason) {
    if (this.#pending.size === 0) {
      return;
    }
    for (const entry of this.#pending.values()) {
      entry.onClose?.(reason);
    }
    this.#pending.clear();
  }
  sendUnreliable(type, message) {
    if (!this.connection.isOpen) {
      return;
    }
    const it = { offset: 1 };
    this.sharedBuffer[0] = Protocol.ROOM_DATA;
    if (typeof type === "string") {
      encode.string(this.sharedBuffer, type, it);
    } else {
      encode.number(this.sharedBuffer, type, it);
    }
    const headerLength = it.offset;
    let data;
    if (message !== void 0) {
      data = this.packr.pack(message, RESERVE_START_SPACE | headerLength);
      data.set(this.sharedBuffer.subarray(0, headerLength), 0);
    } else {
      data = this.sharedBuffer.subarray(0, headerLength);
    }
    this.connection.sendUnreliable(data);
  }
  sendBytes(type, bytes) {
    const it = { offset: 1 };
    this.sharedBuffer[0] = Protocol.ROOM_DATA_BYTES;
    if (typeof type === "string") {
      encode.string(this.sharedBuffer, type, it);
    } else {
      encode.number(this.sharedBuffer, type, it);
    }
    const headerLength = it.offset;
    if (headerLength + bytes.byteLength > this.sharedBuffer.byteLength) {
      const newBuffer = new Uint8Array(headerLength + bytes.byteLength);
      newBuffer.set(this.sharedBuffer.subarray(0, headerLength));
      this.sharedBuffer = newBuffer;
    }
    this.sharedBuffer.set(bytes, headerLength);
    if (!this.connection.isOpen) {
      enqueueMessage(this, this.sharedBuffer.subarray(0, headerLength + bytes.byteLength));
    } else {
      this.connection.send(this.sharedBuffer.subarray(0, headerLength + bytes.byteLength));
    }
  }
  /**
   * Get the per-room input handle. Lazily created on first call and cached;
   * subsequent calls return the same handle (options on later calls are
   * ignored — a warning fires once if they differ from the handle's config).
   *
   * Schema discovery, in order:
   * 1. `options.type` — explicit constructor (overrides everything).
   * 2. Server-sent reflection from the JOIN handshake — populated when the
   *    server room called `defineInput()`. The synthesized class has the
   *    same fields as the server's input schema; `instanceof YourInput`
   *    won't pass on it.
   *
   * Throws if neither source has produced a constructor.
   *
   * Inputs are always delta-encoded; every `send()` transmits one input
   * (a body-less frame when nothing changed). For rollback netcode, prefer
   * `{ mode: "unreliable", historySize: 4 }`: tiny per-tick payloads,
   * redundancy across drops, idempotent under reordering.
   *
   * @example
   * ```typescript
   * const room = await client.joinOrCreate<typeof FpsRoom>("fps");
   * const input = room.input({ mode: "unreliable" });   // type from server
   * // each simulation tick:
   * input.data.seq++;
   * input.data.vx = vx;
   * input.data.vy = vy;
   * input.send();
   * ```
   */
  input(options) {
    return (this.#input ??= new RoomInput(this)).handle(options);
  }
  get state() {
    return this.serializer.getState();
  }
  removeAllListeners() {
    this.onJoin.clear();
    this.onStateChange.clear();
    this.onError.clear();
    this.onLeave.clear();
    this.onReconnect.clear();
    this.onDrop.clear();
    this.onMessageHandlers.events = {};
    if (this.serializer instanceof SchemaSerializer) {
      this.serializer.decoder.root.callbacks = {};
    }
  }
  onMessageCallback(event) {
    this.#dispatchFrame(new Uint8Array(event.data));
  }
  /** Decode + dispatch a single protocol frame. */
  #dispatchFrame(buffer) {
    const it = { offset: 1 };
    const rawByte = buffer[0];
    const code = rawByte & PROTOCOL_CODE_MASK;
    if (rawByte & ProtocolModifier.TIMED) {
      const sNow = decode.uint32(buffer, it);
      const inputSeq = decode.uint32(buffer, it);
      const rttSample = this.#input ? this.#input.ackInput(inputSeq) : -1;
      this.clock.sample(sNow, rttSample);
    }
    if (code === Protocol.JOIN_ROOM) {
      const reconnectionToken = decode.utf8Read(buffer, it, buffer[it.offset++]);
      this.serializerId = decode.utf8Read(buffer, it, buffer[it.offset++]);
      if (!this.serializer) {
        const serializer = getSerializer(this.serializerId);
        this.serializer = new serializer();
      }
      const stateReflectionLen = decode.number(buffer, it);
      if (stateReflectionLen > 0 && this.serializer.handshake) {
        const stateReflectionEnd = it.offset + stateReflectionLen;
        this.serializer.handshake(buffer.subarray(0, stateReflectionEnd), it);
        it.offset = stateReflectionEnd;
      }
      while (it.offset < buffer.byteLength) {
        const tag = buffer[it.offset++];
        const sectionLen = decode.number(buffer, it);
        const sectionEnd = it.offset + sectionLen;
        if (tag === HandshakeSection.INPUT_REFLECTION) {
          (this.#input ??= new RoomInput(this)).applyReflection(buffer, it, sectionEnd);
        } else if (tag === HandshakeSection.INPUT_OPTIONS) {
          (this.#input ??= new RoomInput(this)).applyOptions(buffer, it);
        }
        it.offset = sectionEnd;
      }
      const patchRate = this.#input?.patchRate;
      if (patchRate !== void 0) {
        this.clock.setPatchInterval?.(patchRate);
      }
      if (this.joinedAtTime === 0) {
        this.joinedAtTime = Date.now();
        this.onJoin.invoke();
      } else {
        console.info(`[Colyseus reconnection]: ${String.fromCodePoint(9989)} reconnection successful!`);
        this.reconnection.isReconnecting = false;
        this.onReconnect.invoke();
      }
      this.reconnectionToken = `${this.roomId}:${reconnectionToken}`;
      this.sharedBuffer[0] = Protocol.JOIN_ROOM;
      this.connection.send(this.sharedBuffer.subarray(0, 1));
      if (this.reconnection.enqueuedMessages.length > 0) {
        for (const message of this.reconnection.enqueuedMessages) {
          this.connection.send(message.data);
        }
        this.reconnection.enqueuedMessages = [];
      }
    } else if (code === Protocol.ERROR) {
      const code2 = decode.number(buffer, it);
      const message = decode.string(buffer, it);
      this.onError.invoke(code2, message);
    } else if (code === Protocol.LEAVE_ROOM) {
      this.leave();
    } else if (code === Protocol.ROOM_STATE) {
      this.#lastUnreliableSeq = 0;
      this.serializer.setState(buffer, it);
      this.onStateChange.invoke(this.serializer.getState());
    } else if (code === Protocol.ROOM_STATE_PATCH) {
      if (rawByte & ProtocolModifier.UNRELIABLE) {
        const seq = decode.uint16(buffer, it);
        if (seq - this.#lastUnreliableSeq << 16 >> 16 <= 0) {
          return;
        }
        this.#lastUnreliableSeq = seq;
      }
      this.serializer.patch(buffer, it);
      this.onStateChange.invoke(this.serializer.getState());
    } else if (code === Protocol.ROOM_DATA) {
      const type = decode.stringCheck(buffer, it) ? decode.string(buffer, it) : decode.number(buffer, it);
      const message = buffer.byteLength > it.offset ? unpack(buffer, { start: it.offset }) : void 0;
      this.dispatchMessage(type, message);
    } else if (code === Protocol.ROOM_DATA_BYTES) {
      const type = decode.stringCheck(buffer, it) ? decode.string(buffer, it) : decode.number(buffer, it);
      this.dispatchMessage(type, buffer.subarray(it.offset));
    } else if (code === Protocol.ROOM_RESPONSE) {
      const requestId = decode.number(buffer, it);
      const status = buffer[it.offset++];
      const payload = buffer.byteLength > it.offset ? unpack(buffer, { start: it.offset }) : void 0;
      const entry = this.#pending.get(requestId);
      if (entry !== void 0) {
        this.#pending.delete(requestId);
        entry.onReply(status === ResponseStatus.OK, payload, status === ResponseStatus.ERROR);
      }
    } else if (code === Protocol.PING) {
      this.#pingCallback?.(Math.round(now() - this.#lastPingTime));
      this.#pingCallback = void 0;
    }
  }
  dispatchMessage(type, message) {
    const messageType = this.getMessageHandlerKey(type);
    if (this.onMessageHandlers.events[messageType]) {
      this.onMessageHandlers.emit(messageType, message);
    } else if (this.onMessageHandlers.events["*"]) {
      this.onMessageHandlers.emit("*", type, message);
    } else if (!messageType.startsWith("__")) {
      console.warn?.(`@colyseus/sdk: onMessage() not registered for type '${type}'.`);
    }
  }
  destroy() {
    if (this.serializer) {
      this.serializer.teardown();
    }
  }
  getMessageHandlerKey(type) {
    switch (typeof type) {
      // string
      case "string":
        return type;
      // number
      case "number":
        return `i${type}`;
      default:
        throw new Error("invalid message type.");
    }
  }
  handleReconnection(code, reason) {
    if (!this.reconnection.enabled) {
      this.onLeave.invoke(code, reason);
      return;
    }
    if (Date.now() - this.joinedAtTime < this.reconnection.minUptime) {
      console.info(`[Colyseus reconnection]: ${String.fromCodePoint(10060)} Room has not been up for long enough for automatic reconnection. (min uptime: ${this.reconnection.minUptime}ms)`);
      this.onLeave.invoke(CloseCode.ABNORMAL_CLOSURE, "Room uptime too short for reconnection.");
      return;
    }
    if (!this.reconnection.isReconnecting) {
      this.reconnection.retryCount = 0;
      this.reconnection.isReconnecting = true;
      this.#input?.reset();
    }
    this.retryReconnection();
  }
  retryReconnection() {
    if (this.reconnection.retryCount >= this.reconnection.maxRetries) {
      console.info(`[Colyseus reconnection]: ${String.fromCodePoint(10060)} \u274C Reconnection failed after ${this.reconnection.maxRetries} attempts.`);
      this.reconnection.isReconnecting = false;
      this.onLeave.invoke(CloseCode.FAILED_TO_RECONNECT, "No more retries. Reconnection failed.");
      return;
    }
    this.reconnection.retryCount++;
    const delay = Math.min(this.reconnection.maxDelay, Math.max(this.reconnection.minDelay, this.reconnection.backoff(this.reconnection.retryCount, this.reconnection.delay)));
    console.info(`[Colyseus reconnection]: ${String.fromCodePoint(9203)} will retry in ${(delay / 1e3).toFixed(1)} seconds...`);
    setTimeout(() => {
      try {
        console.info(`[Colyseus reconnection]: ${String.fromCodePoint(128260)} Re-establishing sessionId '${this.sessionId}' with roomId '${this.roomId}'... (attempt ${this.reconnection.retryCount} of ${this.reconnection.maxRetries})`);
        this.connection.reconnect({
          reconnectionToken: this.reconnectionToken.split(":")[1],
          skipHandshake: true
          // we already applied the handshake on first join
        });
      } catch (e) {
        this.retryReconnection();
      }
    }, delay);
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/fetchXHR.mjs
function xhrFetch(url, init) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const method = init?.method || "GET";
    xhr.open(method, url.toString());
    xhr.withCredentials = init?.credentials === "include";
    if (init?.headers) {
      const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers);
      headers.forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });
    }
    xhr.onload = () => {
      const headers = new Headers();
      const rawHeaders = xhr.getAllResponseHeaders().trim();
      if (rawHeaders) {
        for (const line of rawHeaders.split(/[\r\n]+/)) {
          const idx = line.indexOf(": ");
          if (idx > 0) {
            headers.append(line.substring(0, idx), line.substring(idx + 2));
          }
        }
      }
      const responseBody = xhr.response ?? xhr.responseText;
      resolve(new XHRResponse(responseBody, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers
      }));
    };
    xhr.onerror = () => reject(new TypeError("Network request failed"));
    xhr.ontimeout = () => reject(new TypeError("Network request timed out"));
    xhr.send(init?.body ?? null);
  });
}
var XHRResponse = class {
  status;
  statusText;
  headers;
  ok;
  body;
  constructor(body, init) {
    this.body = body;
    this.status = init.status;
    this.statusText = init.statusText;
    this.headers = init.headers;
    this.ok = init.status >= 200 && init.status < 300;
  }
  async json() {
    return typeof this.body === "string" ? JSON.parse(this.body) : this.body;
  }
  async text() {
    return typeof this.body === "string" ? this.body : JSON.stringify(this.body);
  }
  async blob() {
    return new Blob([this.body]);
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/HTTP.mjs
function isJSONSerializable(value) {
  if (value === void 0) {
    return false;
  }
  const t2 = typeof value;
  if (t2 === "string" || t2 === "number" || t2 === "boolean" || t2 === null) {
    return true;
  }
  if (t2 !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return true;
  }
  if (value.buffer) {
    return false;
  }
  return value.constructor && value.constructor.name === "Object" || typeof value.toJSON === "function";
}
function getURLWithQueryParams(url, option) {
  const { params, query } = option || {};
  const [urlPath, urlQuery] = url.split("?");
  let path = urlPath;
  if (params) {
    if (Array.isArray(params)) {
      const paramPaths = path.split("/").filter((p) => p.startsWith(":"));
      for (const [index, key] of paramPaths.entries()) {
        const value = params[index];
        path = path.replace(key, value);
      }
    } else {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`:${key}`, String(value));
      }
    }
  }
  const queryParams = new URLSearchParams(urlQuery);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value == null)
        continue;
      queryParams.set(key, String(value));
    }
  }
  let queryParamString = queryParams.toString();
  queryParamString = queryParamString.length > 0 ? `?${queryParamString}`.replace(/\+/g, "%20") : "";
  return `${path}${queryParamString}`;
}
var HTTP = class {
  authToken;
  options;
  sdk;
  _fetchFn;
  // alias "del()" to "delete()"
  del = this.delete;
  constructor(sdk, baseOptions, fetchFn) {
    this.sdk = sdk;
    this.options = baseOptions;
    this._fetchFn = fetchFn;
  }
  /**
   * Lazily resolve the fetch implementation.
   * Falls back to XMLHttpRequest when fetch is unavailable (e.g. Cocos Creator Native).
   */
  get fetchFn() {
    if (!this._fetchFn) {
      this._fetchFn = typeof globalThis.fetch !== "undefined" ? globalThis.fetch.bind(globalThis) : xhrFetch;
    }
    return this._fetchFn;
  }
  async request(method, path, options) {
    return this.executeRequest(method, path, options);
  }
  get(path, options) {
    return this.request("GET", path, options);
  }
  post(path, options) {
    return this.request("POST", path, options);
  }
  delete(path, options) {
    return this.request("DELETE", path, options);
  }
  patch(path, options) {
    return this.request("PATCH", path, options);
  }
  put(path, options) {
    return this.request("PUT", path, options);
  }
  async executeRequest(method, path, requestOptions) {
    let body = this.options.body ? { ...this.options.body, ...requestOptions?.body || {} } : requestOptions?.body;
    const query = this.options.query ? { ...this.options.query, ...requestOptions?.query || {} } : requestOptions?.query;
    const params = this.options.params ? { ...this.options.params, ...requestOptions?.params || {} } : requestOptions?.params;
    const headers = new Headers(this.options.headers ? { ...this.options.headers, ...requestOptions?.headers || {} } : requestOptions?.headers);
    if (this.authToken && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${this.authToken}`);
    }
    if (isJSONSerializable(body) && typeof body === "object" && body !== null) {
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      for (const [key, value] of Object.entries(body)) {
        if (value instanceof Date) {
          body[key] = value.toISOString();
        }
      }
      body = JSON.stringify(body);
    }
    const mergedOptions = {
      credentials: requestOptions?.credentials || "include",
      ...this.options,
      ...requestOptions,
      query,
      params,
      headers,
      body,
      method
    };
    const url = getURLWithQueryParams(this.sdk["getHttpEndpoint"](path.toString()), mergedOptions);
    let raw;
    try {
      raw = await this.fetchFn(url, mergedOptions);
    } catch (err) {
      if (err.name === "AbortError") {
        throw err;
      }
      const networkError = new ServerError(err.cause?.code || err.code, err.message);
      networkError.response = raw;
      networkError.cause = err.cause;
      throw networkError;
    }
    const contentType = raw.headers.get("content-type");
    let data;
    if (contentType?.includes("json")) {
      data = await raw.json();
    } else if (contentType?.includes("text")) {
      data = await raw.text();
    } else {
      data = await raw.blob();
    }
    if (!raw.ok) {
      throw new ServerError(raw.status, data.message ?? data.error ?? raw.statusText, {
        headers: raw.headers,
        status: raw.status,
        response: raw,
        data
      });
    }
    return {
      raw,
      data,
      headers: raw.headers,
      status: raw.status,
      statusText: raw.statusText
    };
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/Storage.mjs
var storage;
function getStorage() {
  if (!storage) {
    try {
      storage = typeof cc !== "undefined" && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : window.localStorage;
    } catch (e) {
    }
  }
  if (!storage && typeof globalThis.indexedDB !== "undefined") {
    storage = new IndexedDBStorage();
  }
  if (!storage) {
    storage = {
      cache: {},
      setItem: function(key, value) {
        this.cache[key] = value;
      },
      getItem: function(key) {
        return this.cache[key];
      },
      removeItem: function(key) {
        delete this.cache[key];
      }
    };
  }
  return storage;
}
function setItem(key, value) {
  getStorage().setItem(key, value);
}
function removeItem(key) {
  getStorage().removeItem(key);
}
function getItem(key, callback) {
  const value = getStorage().getItem(key);
  if (typeof Promise === "undefined" || // old browsers
  !(value instanceof Promise)) {
    callback(value);
  } else {
    value.then((id) => callback(id));
  }
}
var IndexedDBStorage = class {
  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open("_colyseus_storage", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("store");
    request.onsuccess = () => resolve(request.result);
  });
  async tx(mode, fn) {
    const db = await this.dbPromise;
    const store = db.transaction("store", mode).objectStore("store");
    return fn(store);
  }
  setItem(key, value) {
    return this.tx("readwrite", (store) => store.put(value, key)).then();
  }
  async getItem(key) {
    const request = await this.tx("readonly", (store) => store.get(key));
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
  }
  removeItem(key) {
    return this.tx("readwrite", (store) => store.delete(key)).then();
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/Auth.mjs
var Auth = class {
  settings = {
    path: "/auth",
    key: "colyseus-auth-token"
  };
  #_initialized = false;
  #_signInWindow = null;
  #_events = createNanoEvents();
  http;
  constructor(http) {
    this.http = http;
    getItem(this.settings.key, (token) => this.token = token);
  }
  set token(token) {
    this.http.authToken = token;
  }
  get token() {
    return this.http.authToken;
  }
  onChange(callback) {
    const unbindChange = this.#_events.on("change", callback);
    if (!this.#_initialized) {
      this.getUserData().then((userData) => {
        this.emitChange({ ...userData, token: this.token });
      }).catch((e) => {
        this.emitChange({ user: null, token: void 0 });
      });
    }
    this.#_initialized = true;
    return unbindChange;
  }
  async getUserData() {
    if (this.token) {
      return (await this.http.get(`${this.settings.path}/userdata`)).data;
    } else {
      throw new Error("missing auth.token");
    }
  }
  async registerWithEmailAndPassword(email, password, options) {
    const data = (await this.http.post(`${this.settings.path}/register`, {
      body: { email, password, options }
    })).data;
    this.emitChange(data);
    return data;
  }
  async signInWithEmailAndPassword(email, password) {
    const data = (await this.http.post(`${this.settings.path}/login`, {
      body: { email, password }
    })).data;
    this.emitChange(data);
    return data;
  }
  async signInAnonymously(options) {
    const data = (await this.http.post(`${this.settings.path}/anonymous`, {
      body: { options }
    })).data;
    this.emitChange(data);
    return data;
  }
  async sendPasswordResetEmail(email) {
    return (await this.http.post(`${this.settings.path}/forgot-password`, {
      body: { email }
    })).data;
  }
  async signInWithProvider(providerName, settings = {}) {
    return new Promise((resolve, reject) => {
      const w = settings.width || 480;
      const h = settings.height || 768;
      const upgradingToken = this.token ? `?token=${this.token}` : "";
      const title = `Login with ${providerName[0].toUpperCase() + providerName.substring(1)}`;
      const url = this.http["sdk"]["getHttpEndpoint"](`${settings.prefix || `${this.settings.path}/provider`}/${providerName}${upgradingToken}`);
      const left = screen.width / 2 - w / 2;
      const top = screen.height / 2 - h / 2;
      this.#_signInWindow = window.open(url, title, "toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=" + w + ", height=" + h + ", top=" + top + ", left=" + left);
      const onMessage = (event) => {
        if (event.data.user === void 0 && event.data.token === void 0) {
          return;
        }
        clearInterval(rejectionChecker);
        this.#_signInWindow?.close();
        this.#_signInWindow = null;
        window.removeEventListener("message", onMessage);
        if (event.data.error !== void 0) {
          const err = new Error(String(event.data.error));
          err.code = event.data.error;
          if (event.data.reason !== void 0) {
            err.reason = event.data.reason;
          }
          if (event.data.until !== void 0) {
            err.until = event.data.until;
          }
          reject(err);
        } else {
          resolve(event.data);
          this.emitChange(event.data);
        }
      };
      const rejectionChecker = setInterval(() => {
        if (!this.#_signInWindow || this.#_signInWindow.closed) {
          this.#_signInWindow = null;
          reject("cancelled");
          window.removeEventListener("message", onMessage);
        }
      }, 200);
      window.addEventListener("message", onMessage);
    });
  }
  async signOut() {
    this.emitChange({ user: null, token: null });
  }
  emitChange(authData) {
    if (authData.token !== void 0) {
      this.token = authData.token;
      if (authData.token === null) {
        removeItem(this.settings.key);
      } else {
        setItem(this.settings.key, authData.token);
      }
    }
    this.#_events.emit("change", authData);
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/3rd_party/discord.mjs
function discordURLBuilder(url) {
  const localHostname = window?.location?.hostname || "localhost";
  const remoteHostnameSplitted = url.hostname.split(".");
  const subdomain = !url.hostname.includes("trycloudflare.com") && // ignore cloudflared subdomains
  !url.hostname.includes("discordsays.com") && // ignore discordsays.com subdomains
  remoteHostnameSplitted.length > 2 ? `/${remoteHostnameSplitted[0]}` : "";
  return url.pathname.startsWith("/.proxy") ? `${url.protocol}//${localHostname}${subdomain}${url.pathname}${url.search}` : `${url.protocol}//${localHostname}/.proxy/colyseus${subdomain}${url.pathname}${url.search}`;
}

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/Client.mjs
var DEFAULT_ENDPOINT = typeof window !== "undefined" && typeof window?.location?.hostname !== "undefined" ? `${window.location.protocol.replace("http", "ws")}//${window.location.hostname}${window.location.port && `:${window.location.port}`}` : "ws://127.0.0.1:2567";
var ColyseusSDK = class _ColyseusSDK {
  static VERSION = "0.18";
  /**
   * The HTTP client to make requests to the server.
   */
  http;
  /**
   * The authentication module to authenticate into requests and rooms.
   */
  auth;
  /**
   * The settings used to connect to the server.
   */
  settings;
  urlBuilder;
  constructor(settings = DEFAULT_ENDPOINT, options) {
    if (typeof settings === "string") {
      const url = settings.startsWith("/") ? new URL(settings, DEFAULT_ENDPOINT) : new URL(settings);
      const secure = url.protocol === "https:" || url.protocol === "wss:";
      const port = Number(url.port || (secure ? 443 : 80));
      this.settings = {
        hostname: url.hostname,
        pathname: url.pathname,
        port,
        secure,
        searchParams: url.searchParams.toString() || void 0
      };
    } else {
      if (settings.port === void 0) {
        settings.port = settings.secure ? 443 : 80;
      }
      if (settings.pathname === void 0) {
        settings.pathname = "";
      }
      this.settings = settings;
    }
    if (this.settings.pathname.endsWith("/")) {
      this.settings.pathname = this.settings.pathname.slice(0, -1);
    }
    if (options?.protocol) {
      this.settings.protocol = options.protocol;
    }
    this.http = new HTTP(this, {
      headers: options?.headers || {}
    }, options?.fetchFn);
    this.auth = new Auth(this.http);
    this.urlBuilder = options?.urlBuilder;
    if (!this.urlBuilder && typeof window !== "undefined" && window?.location?.hostname?.includes("discordsays.com")) {
      this.urlBuilder = discordURLBuilder;
      console.log("Colyseus SDK: Discord Embedded SDK detected. Using custom URL builder.");
    }
  }
  /**
   * Select the endpoint with the lowest latency.
   * @param endpoints Array of endpoints to select from.
   * @param options Client options.
   * @param latencyOptions Latency measurement options (protocol, pingCount, timeout) — forwarded to each {@link getLatency} call.
   * @returns The client with the lowest latency.
   */
  static async selectByLatency(endpoints, options, latencyOptions = {}) {
    const clients = endpoints.map((endpoint) => new _ColyseusSDK(endpoint, options));
    const latencies = (await Promise.allSettled(clients.map((client, index) => client.getLatency(latencyOptions).then((latency) => {
      const settings = clients[index].settings;
      console.log(`\u{1F6DC} Endpoint Latency: ${latency}ms - ${settings.hostname}:${settings.port}${settings.pathname}`);
      return [index, latency];
    })))).filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (latencies.length === 0) {
      throw new Error("All endpoints failed to respond");
    }
    return clients[latencies.sort((a, b) => a[1] - b[1])[0][0]];
  }
  // Implementation
  async joinOrCreate(roomName, options = {}, rootSchema) {
    return await this.createMatchMakeRequest("joinOrCreate", roomName, options, rootSchema);
  }
  // Implementation
  async create(roomName, options = {}, rootSchema) {
    return await this.createMatchMakeRequest("create", roomName, options, rootSchema);
  }
  // Implementation
  async join(roomName, options = {}, rootSchema) {
    return await this.createMatchMakeRequest("join", roomName, options, rootSchema);
  }
  // Implementation
  async joinById(roomId, options = {}, rootSchema) {
    return await this.createMatchMakeRequest("joinById", roomId, options, rootSchema);
  }
  // Implementation
  async reconnect(reconnectionToken, rootSchema) {
    if (typeof reconnectionToken === "string" && typeof rootSchema === "string") {
      throw new Error("DEPRECATED: .reconnect() now only accepts 'reconnectionToken' as argument.\nYou can get this token from previously connected `room.reconnectionToken`");
    }
    const [roomId, token] = reconnectionToken.split(":");
    if (!roomId || !token) {
      throw new Error("Invalid reconnection token format.\nThe format should be roomId:reconnectionToken");
    }
    return await this.createMatchMakeRequest("reconnect", roomId, { reconnectionToken: token }, rootSchema);
  }
  async consumeSeatReservation(response, rootSchema) {
    const room = this.createRoom(response.name, rootSchema);
    room.roomId = response.roomId;
    room.sessionId = response.sessionId;
    const options = { sessionId: room.sessionId };
    if (response.reconnectionToken) {
      options.reconnectionToken = response.reconnectionToken;
    }
    room.connect(
      this.buildEndpoint(response, options),
      // `protocol` lives on client settings, not the matchmake response — inject it so
      // Room.connect picks the right transport. Without this it silently falls back to ws.
      { ...response, protocol: this.settings.protocol },
      this.http.options.headers
    );
    return new Promise((resolve, reject) => {
      const onError = (code, message) => reject(new ServerError(code, message));
      room.onError.once(onError);
      room["onJoin"].once(() => {
        room.onError.remove(onError);
        publishDebug("room", room);
        resolve(room);
      });
    });
  }
  /**
   * Create a new connection with the server, and measure the latency.
   *
   * Always settles: resolves with the (average) round-trip time, or rejects on
   * connection error, server-side close before all pongs arrive, or timeout.
   *
   * @param options Latency measurement options (protocol, pingCount, timeout).
   */
  getLatency(options = {}) {
    const protocol = options.protocol ?? "ws";
    const pingCount = options.pingCount ?? 1;
    const timeout = options.timeout ?? 1500;
    return new Promise((resolve, reject) => {
      const conn = new Connection(protocol);
      const latencies = [];
      let pingStart = 0;
      let settled = false;
      let timeoutId;
      const settle = (run) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        try {
          conn.close();
        } catch (e) {
        }
        run();
      };
      const fail = (message) => settle(() => reject(new ServerError(CloseCode.ABNORMAL_CLOSURE, `Failed to get latency: ${message}`)));
      timeoutId = setTimeout(() => fail(`timed out after ${timeout}ms`), timeout);
      conn.events.onopen = () => {
        pingStart = Date.now();
        conn.send(new Uint8Array([Protocol.PING]));
      };
      conn.events.onmessage = (_) => {
        latencies.push(Date.now() - pingStart);
        if (latencies.length < pingCount) {
          pingStart = Date.now();
          conn.send(new Uint8Array([Protocol.PING]));
        } else {
          const average = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
          settle(() => resolve(average));
        }
      };
      conn.events.onclose = (event) => fail(`connection closed${event?.code ? ` (${event.code})` : ""}${event?.reason ? `: ${event.reason}` : ""}`);
      conn.events.onerror = (event) => fail(event.message);
      try {
        conn.connect(this.getHttpEndpoint());
      } catch (e) {
        fail(e?.message ?? "failed to connect");
      }
    });
  }
  async createMatchMakeRequest(method, roomName, options = {}, rootSchema) {
    try {
      if (!roomName) {
        throw new Error("Must provide a room name");
      }
      const httpResponse = await this.http.post(`/matchmake/${method}/${roomName}`, {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: options
      });
      const response = httpResponse.data;
      if (method === "reconnect") {
        response.reconnectionToken = options.reconnectionToken;
      }
      return await this.consumeSeatReservation(response, rootSchema);
    } catch (error) {
      if (error instanceof ServerError) {
        throw new MatchMakeError(error.message, error.code);
      }
      throw error;
    }
  }
  createRoom(roomName, rootSchema) {
    return new Room(roomName, rootSchema);
  }
  buildEndpoint(seatReservation, options = {}) {
    let protocol = this.settings.protocol || "ws";
    let searchParams = this.settings.searchParams || "";
    if (this.http.authToken) {
      options["_authToken"] = this.http.authToken;
    }
    for (const name in options) {
      if (!options.hasOwnProperty(name)) {
        continue;
      }
      searchParams += (searchParams ? "&" : "") + `${name}=${options[name]}`;
    }
    if (protocol === "h3") {
      protocol = "http";
    }
    let endpoint = this.settings.secure ? `${protocol}s://` : `${protocol}://`;
    if (seatReservation.publicAddress) {
      endpoint += `${seatReservation.publicAddress}`;
    } else {
      endpoint += `${this.settings.hostname}${this.getEndpointPort()}${this.settings.pathname}`;
    }
    const endpointURL = `${endpoint}/${seatReservation.processId}/${seatReservation.roomId}?${searchParams}`;
    return this.urlBuilder ? this.urlBuilder(new URL(endpointURL)) : endpointURL;
  }
  getHttpEndpoint(segments = "") {
    const path = segments.startsWith("/") ? segments : `/${segments}`;
    let endpointURL = `${this.settings.secure ? "https" : "http"}://${this.settings.hostname}${this.getEndpointPort()}${this.settings.pathname}${path}`;
    if (this.settings.searchParams) {
      endpointURL += `?${this.settings.searchParams}`;
    }
    return this.urlBuilder ? this.urlBuilder(new URL(endpointURL)) : endpointURL;
  }
  getEndpointPort() {
    return this.settings.port !== 80 && this.settings.port !== 443 ? `:${this.settings.port}` : "";
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/serializer/NoneSerializer.mjs
var NoneSerializer = class {
  setState(rawState) {
  }
  getState() {
    return null;
  }
  patch(patches) {
  }
  teardown() {
  }
  handshake(bytes) {
  }
};

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/predict/Predictor.mjs
var RING_CAP = 16;
var SLOT_RING_BASE = 9;
var SLOT_STRIDE = SLOT_RING_BASE + RING_CAP * 2;

// ../../node_modules/.pnpm/@colyseus+sdk@0.18.2_@colyseus+core@0.18.12_typescript@5.5.4_zod@4.6.1/node_modules/@colyseus/sdk/build/index.mjs
registerSerializer("schema", SchemaSerializer);
registerSerializer("none", NoneSerializer);

// src/net/ws.ts
function buildFarmCmdEnvelope(command, operationId, body) {
  const envelope = {
    v: PROTOCOL_VERSION,
    t: "farm_cmd",
    r: operationId,
    p: { command, operationId, body }
  };
  return envelope;
}
function buildFarmRefreshEnvelope() {
  return { v: PROTOCOL_VERSION, t: "farm_refresh", p: null };
}
function makeOperationId() {
  const cryptoLike = globalThis.crypto;
  if (cryptoLike && typeof cryptoLike.randomUUID === "function") {
    return cryptoLike.randomUUID();
  }
  const rnd = Math.random().toString(36).slice(2, 10);
  return `op_${Date.now().toString(36)}_${rnd}`;
}
function parseWelcomeEnvelope(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const env = raw;
  if (typeof env.v !== "string") return null;
  const major = Number(env.v.split(".")[0]);
  if (!Number.isFinite(major) || major !== PROTOCOL_VERSION_MAJOR) return null;
  if (env.t !== "welcome") return null;
  if (env.p === null || typeof env.p !== "object") return null;
  const p = env.p;
  if (typeof p.serverNow !== "number") return null;
  if (typeof p.roomId !== "string") return null;
  if (p.player === null || typeof p.player !== "object") return null;
  return p;
}
var FarmWsError = class extends Error {
  code;
  operationId;
  constructor(message, opts = {}) {
    super(message);
    this.name = "FarmWsError";
    this.code = opts.code;
    this.operationId = opts.operationId;
  }
};
var DEFAULT_TIMEOUT_MS = 5e3;
var FarmRealtimeClient = class {
  sdk;
  ownerId;
  token;
  timeoutMs;
  room = null;
  disposers = [];
  /** FIFO of resolvers waiting for a `welcome` reply to their own pull. */
  welcomeWaiters = [];
  /** Map of operationId → resolver waiting for a matching `cmd_result` / `error`. */
  cmdWaiters = /* @__PURE__ */ new Map();
  /**
   * If a broadcast welcome arrives while no one is waiting, we stash the
   * payload and hand it to the NEXT refresh() caller instead of pulling a
   * fresh snapshot. Cleared on consume.
   */
  pendingBroadcastWelcome = null;
  plotCb = null;
  goldCb = null;
  welcomeCb = null;
  errorCb = null;
  leaveCb = null;
  constructor(opts) {
    this.sdk = new ColyseusSDK(opts.endpoint);
    this.ownerId = opts.ownerId;
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }
  /**
   * Connect to the farm room and pull the initial snapshot. Per the protocol
   * note in packages/shared/src/protocol/ws.ts the SDK's handler-registration
   * race means we MUST pull via `farm_refresh` rather than relying on the
   * welcome pushed from `onJoin`.
   */
  async join() {
    if (this.room !== null) {
      throw new FarmWsError("already joined \u2014 call leave() first");
    }
    const room = await this.sdk.joinOrCreate("farm", { ownerId: this.ownerId, token: this.token });
    this.room = room;
    this.bindRoomEvents(room);
    return this.refresh();
  }
  /** Re-pull the full snapshot. Resolves with the next `welcome` the server emits. */
  async refresh() {
    const room = this.requireRoom();
    return this.awaitWelcome(room, () => {
      room.send("farm_refresh", buildFarmRefreshEnvelope());
    });
  }
  /**
   * Issue a farm command and resolve with the matching `cmd_result`. The
   * server's `error` envelope, when addressed to this request (its `r` field
   * matches our `operationId`), rejects the returned promise with
   * {@link FarmWsError} instead.
   */
  async cmd(command, body) {
    const room = this.requireRoom();
    const operationId = makeOperationId();
    const envelope = buildFarmCmdEnvelope(command, operationId, body);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cmdWaiters.delete(operationId);
        reject(new FarmWsError(`cmd "${command}" timed out after ${this.timeoutMs}ms`, { operationId }));
      }, this.timeoutMs);
      this.cmdWaiters.set(operationId, (msg) => {
        clearTimeout(timer);
        this.cmdWaiters.delete(operationId);
        if (msg.t === "__reject__") {
          reject(msg.p instanceof Error ? msg.p : new FarmWsError(String(msg.p)));
          return;
        }
        if (msg.t === "error") {
          const errLike = msg.p ?? null;
          const code = errLike !== null && "code" in errLike ? errLike.code : void 0;
          const message = errLike !== null && "message" in errLike ? String(errLike.message ?? "ws error") : "ws error";
          reject(new FarmWsError(message, { code, operationId }));
          return;
        }
        resolve(msg.p);
      });
      room.send("farm_cmd", envelope);
    });
  }
  async leave() {
    const room = this.room;
    if (room === null) return;
    this.room = null;
    this.clearDisposers();
    this.failAllWaiters(new FarmWsError("room left"));
    try {
      await room.leave(true);
    } catch {
    }
  }
  // ── Event registration ──
  onPlotUpdated(cb) {
    this.plotCb = cb;
  }
  onGoldUpdated(cb) {
    this.goldCb = cb;
  }
  onWelcome(cb) {
    this.welcomeCb = cb;
  }
  onError(cb) {
    this.errorCb = cb;
  }
  onLeave(cb) {
    this.leaveCb = cb;
  }
  // ── Internals ──
  requireRoom() {
    if (this.room === null) throw new FarmWsError("not joined \u2014 call join() first");
    return this.room;
  }
  bindRoomEvents(room) {
    this.disposers.push(
      room.onMessage("*", (type, payload) => {
        this.dispatch(String(type), payload);
      })
    );
    const onLeaveCb = (code, reason) => {
      this.clearDisposers();
      this.failAllWaiters(new FarmWsError(`room left (code=${code})`));
      this.leaveCb?.(code, reason);
    };
    room.onLeave(onLeaveCb);
    this.disposers.push(() => {
      room.onLeave.remove(onLeaveCb);
    });
  }
  clearDisposers() {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
  }
  failAllWaiters(err) {
    const queued = this.welcomeWaiters.splice(0);
    for (const r of queued) r({ t: "__reject__", p: err });
    this.cmdWaiters.forEach((r, opId) => {
      r({ t: "__reject__", p: new FarmWsError(`${err.message} (op=${opId})`, { operationId: opId }) });
    });
    this.cmdWaiters.clear();
  }
  /**
   * Drive a request/response cycle on the `welcome` channel: if a broadcast
   * welcome was stashed (revision watcher fired while nobody was waiting),
   * deliver it; otherwise register a one-shot waiter and call `send`.
   */
  awaitWelcome(room, send) {
    if (this.pendingBroadcastWelcome !== null) {
      const buffered = this.pendingBroadcastWelcome;
      this.pendingBroadcastWelcome = null;
      return Promise.resolve(buffered);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.welcomeWaiters.indexOf(resolver);
        if (idx >= 0) this.welcomeWaiters.splice(idx, 1);
        reject(new FarmWsError(`welcome timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      const resolver = (msg) => {
        clearTimeout(timer);
        if (msg.t === "__reject__") {
          reject(msg.p instanceof Error ? msg.p : new FarmWsError(String(msg.p)));
          return;
        }
        const parsed = parseWelcomeEnvelope({
          v: PROTOCOL_VERSION,
          t: "welcome",
          p: msg.p
        });
        if (parsed === null) {
          reject(new FarmWsError("welcome payload failed validation"));
          return;
        }
        resolve(parsed);
      };
      this.welcomeWaiters.push(resolver);
      try {
        send();
      } catch (err) {
        const idx = this.welcomeWaiters.indexOf(resolver);
        if (idx >= 0) this.welcomeWaiters.splice(idx, 1);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new FarmWsError(`send failed: ${String(err)}`));
      }
    });
  }
  dispatch(type, raw) {
    const env = raw !== null && typeof raw === "object" ? raw : {};
    const payload = env.p;
    const requestId = typeof env.r === "string" ? env.r : void 0;
    if (type === "welcome") {
      const waiter = this.welcomeWaiters.shift();
      if (waiter !== void 0) {
        waiter({ t: type, p: payload });
        return;
      }
      const parsed = parseWelcomeEnvelope({
        v: PROTOCOL_VERSION,
        t: "welcome",
        p: payload
      });
      if (parsed !== null) {
        this.pendingBroadcastWelcome = parsed;
        this.welcomeCb?.(parsed);
      }
      return;
    }
    if (type === "cmd_result") {
      if (requestId !== void 0) {
        const waiter = this.cmdWaiters.get(requestId);
        if (waiter !== void 0) {
          waiter({ t: type, p: payload });
          return;
        }
      }
      return;
    }
    if (type === "error") {
      if (requestId !== void 0) {
        const waiter = this.cmdWaiters.get(requestId);
        if (waiter !== void 0) {
          waiter({ t: type, p: payload });
          return;
        }
      }
      this.errorCb?.(payload);
      return;
    }
    if (type === "plot_updated") {
      this.plotCb?.(payload);
      return;
    }
    if (type === "gold_updated") {
      this.goldCb?.(payload);
      return;
    }
  }
};

// src/runtime/online.ts
var MAX_RECONNECT_ATTEMPTS = 5;
var RECONNECT_BASE_MS = 1e3;
var OnlineGameApp = class {
  http;
  wechatCode;
  wsEndpoint;
  /** Realtime client; recreated on each reconnect attempt. */
  rt = null;
  /** Most recent PlayerSave snapshot from the server. */
  player = null;
  /** Most recent room id (set by welcome). */
  roomId = null;
  /** Wallclock skew: serverNow - Date.now(). Updated on every welcome / cmd_result. */
  serverNowOffsetMs = 0;
  /** Connection state for the latest view. */
  connected = false;
  /** Connection-change listeners. */
  connectionCbs = /* @__PURE__ */ new Set();
  /** Stopped by `stop()` — suppresses further reconnect attempts. */
  stopped = false;
  /** In-flight reconnect chain (so we don't fan out). */
  reconnectChain = null;
  /** Pending reconnect attempts; reset on a successful connect. */
  reconnectAttempts = 0;
  /** Reconnect timer handle (cleared on stop / on success). */
  reconnectTimer = null;
  constructor(opts) {
    this.http = opts.httpClient ?? new FarmHttpClient({ baseUrl: opts.baseUrl });
    this.wsEndpoint = opts.wsEndpoint;
    this.wechatCode = opts.wechatCode ?? `mock_dev_${makeOperationId().slice(0, 8)}`;
    if (opts.realtimeClient) this.rt = opts.realtimeClient;
  }
  // ── Lifecycle ───────────────────────────────────────────────
  /**
   * Boot sequence: login → fetch crop configs → join realtime → apply the
   * welcome snapshot. Throws on any unrecoverable failure.
   */
  async start() {
    const login = await this.http.loginWeChat(this.wechatCode);
    this.applyServerClock(login.serverNow);
    this.player = login.player;
    this.roomId = null;
    await this.http.getCropConfigs();
    const rt = this.rt ?? new FarmRealtimeClient({
      endpoint: this.wsEndpoint,
      ownerId: login.player.playerId,
      token: this.http.token
    });
    this.rt = rt;
    this.bindRealtimeHandlers(rt);
    const welcome = await rt.join();
    this.applyWelcome(welcome);
  }
  /** Tear down: leave the room and disable auto-reconnect. */
  async stop() {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const rt = this.rt;
    this.rt = null;
    if (rt !== null) await rt.leave().catch(() => void 0);
    if (this.connected) this.setConnected(false);
  }
  /** Re-pull the full snapshot via `farm_refresh`. */
  async refresh() {
    const rt = this.requireRt();
    const welcome = await rt.refresh();
    this.applyWelcome(welcome);
  }
  /**
   * Force-sync the local clock to a server-provided epoch. Exposed for
   * tests that simulate time travel; production code receives the value
   * implicitly through welcome / cmd_result / login responses.
   */
  syncServerClock(serverNow) {
    this.applyServerClock(serverNow);
  }
  // ── Commands (optimistic) ───────────────────────────────────
  async plant(plotIndex, cropId) {
    const before = this.requirePlayer();
    const cfg = getCrop(cropId);
    if (cfg === void 0) throw new Error(`unknown crop: ${cropId}`);
    const plot = before.plots[plotIndex];
    if (!plot) throw new Error(`plot ${plotIndex} out of range`);
    if (!plot.unlocked) throw new Error(`plot ${plotIndex} is locked`);
    if (plot.status !== "empty") throw new Error(`plot ${plotIndex} is ${plot.status}, not empty`);
    if (before.gold < cfg.seedPrice) throw new Error(`insufficient gold: have ${before.gold}, need ${cfg.seedPrice}`);
    this.requireRt();
    const snapshot = this.captureSnapshot();
    const plantedAt = this.serverNow();
    const matureAt = plantedAt + cfg.growthDuration * 1e3;
    this.patchPlayer((p) => {
      p.gold -= cfg.seedPrice;
      const target2 = p.plots[plotIndex];
      target2.status = "growing";
      target2.cropId = cropId;
      target2.plantedAt = plantedAt;
      target2.matureAt = matureAt;
      target2.waterCount = 0;
    });
    EventBus.emit(GameEvent.CoinsChanged, this.player.gold);
    EventBus.emit(GameEvent.PlotStateChanged, plotIndex);
    await this.runCmd("plant", { plotIndex, cropId }, () => {
      this.replaceAndEmit(snapshot);
      void this.refresh().catch(() => void 0);
    });
  }
  async water(plotIndex) {
    const before = this.requirePlayer();
    const plot = before.plots[plotIndex];
    if (!plot) throw new Error(`plot ${plotIndex} out of range`);
    if (plot.status !== "growing") throw new Error(`plot ${plotIndex} is ${plot.status}, not growing`);
    if (plot.cropId === void 0) throw new Error(`plot ${plotIndex} has no crop`);
    const cfg = getCrop(plot.cropId);
    if (cfg === void 0) throw new Error(`unknown crop: ${plot.cropId}`);
    if (plot.matureAt === void 0) throw new Error(`plot ${plotIndex} missing matureAt`);
    if (plot.waterCount >= cfg.maxWater) throw new Error(`plot ${plotIndex} reached max water`);
    this.requireRt();
    const snapshot = this.captureSnapshot();
    const now2 = this.serverNow();
    const remaining = plot.matureAt - now2;
    if (remaining <= 0) throw new Error(`plot ${plotIndex} is already ripe`);
    const discounted = Math.ceil(remaining * 0.95);
    const newMatureAt = now2 + discounted;
    const newCount = plot.waterCount + 1;
    this.patchPlayer((p) => {
      const target2 = p.plots[plotIndex];
      target2.matureAt = newMatureAt;
      target2.waterCount = newCount;
    });
    EventBus.emit(GameEvent.PlotStateChanged, plotIndex);
    await this.runCmd("water", { plotIndex }, () => {
      this.replaceAndEmit(snapshot);
      void this.refresh().catch(() => void 0);
    });
  }
  async harvest(plotIndex) {
    const before = this.requirePlayer();
    const plot = before.plots[plotIndex];
    if (!plot) throw new Error(`plot ${plotIndex} out of range`);
    if (plot.status !== "ripe" && !(plot.status === "growing" && this.deriveRipe(plot))) {
      throw new Error(`plot ${plotIndex} not ripe`);
    }
    if (plot.cropId === void 0) throw new Error(`plot ${plotIndex} has no crop`);
    const cfg = getCrop(plot.cropId);
    if (cfg === void 0) throw new Error(`unknown crop: ${plot.cropId}`);
    this.requireRt();
    const snapshot = this.captureSnapshot();
    this.patchPlayer((p) => {
      p.gold += cfg.sellPrice;
      const target2 = p.plots[plotIndex];
      target2.status = "empty";
      target2.cropId = void 0;
      target2.plantedAt = void 0;
      target2.matureAt = void 0;
      target2.waterCount = 0;
    });
    EventBus.emit(GameEvent.CoinsChanged, this.player.gold);
    EventBus.emit(GameEvent.CropHarvested, { plotIndex, cropId: cfg.id });
    EventBus.emit(GameEvent.PlotStateChanged, plotIndex);
    await this.runCmd("harvest", { plotIndex }, () => {
      this.replaceAndEmit(snapshot);
      void this.refresh().catch(() => void 0);
    });
  }
  async unlock(plotIndex) {
    const before = this.requirePlayer();
    const plot = before.plots[plotIndex];
    if (!plot) throw new Error(`plot ${plotIndex} out of range`);
    if (plot.unlocked) throw new Error(`plot ${plotIndex} already unlocked`);
    this.requireRt();
    const snapshot = this.captureSnapshot();
    this.patchPlayer((p) => {
      const target2 = p.plots[plotIndex];
      target2.unlocked = true;
      target2.status = "empty";
      target2.waterCount = 0;
    });
    EventBus.emit(GameEvent.PlotStateChanged, plotIndex);
    await this.runCmd("unlock", { plotIndex }, () => {
      this.replaceAndEmit(snapshot);
      void this.refresh().catch(() => void 0);
    });
  }
  // ── Subscriptions ───────────────────────────────────────────
  onConnectionChange(cb) {
    this.connectionCbs.add(cb);
  }
  /** Snapshot view of the current state (UI binding). */
  state() {
    const player = this.requirePlayer();
    const now2 = this.serverNow();
    const plots = player.plots.map((plot) => ({
      ...plot,
      derivedRipe: this.deriveRipe(plot, now2)
    }));
    return {
      playerId: player.playerId,
      gold: player.gold,
      gems: player.gems,
      plots,
      revision: player.revision,
      connected: this.connected,
      serverNowOffsetMs: this.serverNowOffsetMs
    };
  }
  // ── Internals ───────────────────────────────────────────────
  /** Authoritative server-now = local clock + skew. */
  serverNow() {
    return Date.now() + this.serverNowOffsetMs;
  }
  /** True iff a growing plot has crossed its matureAt under server clock. */
  deriveRipe(plot, now2 = this.serverNow()) {
    return plot.status === "growing" && plot.matureAt !== void 0 && now2 >= plot.matureAt;
  }
  applyServerClock(serverNow) {
    this.serverNowOffsetMs = serverNow - Date.now();
  }
  setConnected(value) {
    if (this.connected === value) return;
    this.connected = value;
    if (value) EventBus.emit(GameEvent.ServerConnected);
    else EventBus.emit(GameEvent.ServerDisconnected);
    this.connectionCbs.forEach((cb) => {
      try {
        cb(value);
      } catch (err) {
        console.error("[OnlineGameApp] connectionChange handler threw", err);
      }
    });
  }
  requirePlayer() {
    if (this.player === null) {
      throw new Error("OnlineGameApp not started \u2014 call start() first");
    }
    return this.player;
  }
  requireRt() {
    if (this.rt === null) {
      throw new Error("OnlineGameApp not joined \u2014 call start() first");
    }
    return this.rt;
  }
  /** True when `after` is older than the newest authoritative snapshot we
   *  hold (ADR-0003 D18 — clients must ignore older revisions). Optimistic
   *  patches never bump `revision`, so `this.player.revision` is always the
   *  last authoritative revision seen. */
  isStale(after) {
    return this.player !== null && after.revision < this.player.revision;
  }
  /** Apply a welcome snapshot: replace player, update roomId + clock,
   *  re-emit the canonical diff so any stale UI catches up. */
  applyWelcome(welcome) {
    const before = this.player;
    this.applyServerClock(welcome.serverNow);
    this.roomId = welcome.roomId;
    this.setConnected(true);
    this.reconnectAttempts = 0;
    if (before !== null && welcome.player.revision < before.revision) {
      return;
    }
    const after = welcome.player;
    this.player = after;
    if (before === null) {
      EventBus.emit(GameEvent.AuthLoggedIn, { playerId: after.playerId });
      EventBus.emit(GameEvent.CoinsChanged, after.gold);
      EventBus.emit(GameEvent.DiamondsChanged, after.gems);
      for (const plot of after.plots) {
        EventBus.emit(GameEvent.PlotStateChanged, plot.index);
      }
      return;
    }
    this.diffAndEmit(before, after);
  }
  /** Replace the local player with `after` and emit minimal event set. */
  replaceAndEmit(after) {
    if (this.isStale(after)) return;
    const before = this.player;
    this.player = after;
    if (before === null) {
      EventBus.emit(GameEvent.CoinsChanged, after.gold);
      EventBus.emit(GameEvent.DiamondsChanged, after.gems);
      for (const plot of after.plots) {
        EventBus.emit(GameEvent.PlotStateChanged, plot.index);
      }
      return;
    }
    this.diffAndEmit(before, after);
  }
  /** Emit only the events whose values actually changed. */
  diffAndEmit(before, after) {
    if (before.gold !== after.gold) {
      EventBus.emit(GameEvent.CoinsChanged, after.gold);
    }
    if (before.gems !== after.gems) {
      EventBus.emit(GameEvent.DiamondsChanged, after.gems);
    }
    const len = Math.min(before.plots.length, after.plots.length);
    for (let i = 0; i < len; i += 1) {
      const a = before.plots[i];
      const b = after.plots[i];
      if (a.unlocked !== b.unlocked || a.status !== b.status || a.cropId !== b.cropId || a.plantedAt !== b.plantedAt || a.matureAt !== b.matureAt || a.waterCount !== b.waterCount) {
        EventBus.emit(GameEvent.PlotStateChanged, i);
      }
    }
  }
  /** Apply a synchronous mutation to the local player snapshot. */
  patchPlayer(mutator) {
    if (this.player === null) {
      throw new Error("OnlineGameApp not started \u2014 call start() first");
    }
    mutator(this.player);
  }
  /** JSON clone of the current player for optimistic rollback. PlayerSave is
   *  a small flat document (< 5 KB), so a stringify round-trip is fine and
   *  avoids structuredClone availability questions on WeChat. */
  captureSnapshot() {
    return JSON.parse(JSON.stringify(this.requirePlayer()));
  }
  /** Wrap a `FarmRealtimeClient.cmd()` call with uniform error handling. */
  async runCmd(command, body, onFailure) {
    let result;
    try {
      result = await this.requireRt().cmd(command, body);
    } catch (err) {
      onFailure();
      throw err;
    }
    this.applyServerClock(result.serverNow);
    this.replaceAndEmit(result.player);
  }
  // ── Realtime wiring ─────────────────────────────────────────
  bindRealtimeHandlers(rt) {
    rt.onPlotUpdated(({ plot }) => {
      if (this.player === null) return;
      const idx = plot.index;
      if (idx < 0 || idx >= this.player.plots.length) return;
      this.player.plots[idx] = { ...plot };
      EventBus.emit(GameEvent.PlotStateChanged, idx);
    });
    rt.onGoldUpdated(({ gold }) => {
      if (this.player === null) return;
      if (this.player.gold !== gold) {
        this.player.gold = gold;
        EventBus.emit(GameEvent.CoinsChanged, gold);
      }
    });
    rt.onError((err) => {
      console.error("[OnlineGameApp] server error", err);
    });
    rt.onLeave(() => {
      if (this.stopped) return;
      this.setConnected(false);
      this.scheduleReconnect();
    });
  }
  // ── Reconnect ───────────────────────────────────────────────
  scheduleReconnect() {
    if (this.stopped) return;
    if (this.reconnectChain !== null) return;
    if (this.reconnectTimer !== null) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    if (this.rt === null) return;
    if (this.http.token === null) return;
    this.reconnectAttempts += 1;
    const delay = RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts - 1);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectChain = this.doReconnect().finally(() => {
        this.reconnectChain = null;
      });
      void this.reconnectChain;
    }, delay);
  }
  async doReconnect() {
    if (this.stopped) return;
    if (this.http.token === null) return;
    const ownerId = this.player?.playerId;
    if (ownerId === void 0) return;
    const rt = new FarmRealtimeClient({
      endpoint: this.wsEndpoint,
      ownerId,
      token: this.http.token
    });
    this.rt = rt;
    this.bindRealtimeHandlers(rt);
    try {
      const welcome = await rt.join();
      this.applyWelcome(welcome);
    } catch (err) {
      console.error("[OnlineGameApp] reconnect failed", err);
      this.reconnectChain = null;
      this.scheduleReconnect();
    }
  }
};

// src/cocos-entry.ts
var MinigameHeaders = class _MinigameHeaders {
  map = /* @__PURE__ */ new Map();
  constructor(init) {
    if (init instanceof _MinigameHeaders) {
      init.forEach((v, k) => this.append(k, v));
    } else if (Array.isArray(init)) {
      for (const [k, v] of init) this.append(k, v);
    } else if (init !== void 0) {
      for (const [k, v] of Object.entries(init)) this.append(k, v);
    }
  }
  append(name, value) {
    const key = name.toLowerCase();
    this.map.set(key, (this.map.get(key) ?? []).concat(value));
  }
  set(name, value) {
    this.map.set(name.toLowerCase(), [value]);
  }
  get(name) {
    const vs = this.map.get(name.toLowerCase());
    return vs === void 0 ? null : vs.join(", ");
  }
  has(name) {
    return this.map.has(name.toLowerCase());
  }
  forEach(cb) {
    this.map.forEach((vs, k) => cb(vs.join(", "), k));
  }
  entries() {
    const out = [];
    this.map.forEach((vs, k) => out.push([k, vs.join(", ")]));
    return out;
  }
};
var MinigameResponse = class {
  status;
  statusText;
  headers;
  body;
  constructor(body, init) {
    this.body = body;
    this.status = init.status;
    this.statusText = init.statusText ?? "";
    this.headers = init.headers ?? new MinigameHeaders();
  }
  get ok() {
    return this.status >= 200 && this.status < 300;
  }
  async json() {
    if (this.body instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(this.body));
    return JSON.parse(this.body);
  }
  async text() {
    return this.body instanceof ArrayBuffer ? new TextDecoder().decode(this.body) : this.body;
  }
  // Matchmake responses are JSON, so this path should not fire; return the
  // raw body shaped like a Blob just in case.
  async blob() {
    const buf = this.body instanceof ArrayBuffer ? this.body : new TextEncoder().encode(this.body).buffer;
    return { arrayBuffer: async () => buf, size: buf.byteLength, type: "" };
  }
};
var MinigameURLSearchParams = class _MinigameURLSearchParams {
  map = /* @__PURE__ */ new Map();
  constructor(init) {
    if (typeof init === "string") {
      for (const pair of init.replace(/^\?/, "").split("&")) {
        if (pair === "") continue;
        const eq = pair.indexOf("=");
        const k = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
        const v = eq < 0 ? "" : decodeURIComponent(pair.slice(eq + 1));
        this.append(k, v);
      }
    } else if (init instanceof _MinigameURLSearchParams) {
      init.forEach((v, k) => this.append(k, v));
    } else if (init !== void 0) {
      for (const [k, v] of Object.entries(init)) this.set(k, v);
    }
  }
  append(name, value) {
    this.map.set(name, [...this.map.get(name) ?? [], value]);
  }
  set(name, value) {
    this.map.set(name, [value]);
  }
  get(name) {
    return this.map.get(name)?.[0] ?? null;
  }
  has(name) {
    return this.map.has(name);
  }
  delete(name) {
    this.map.delete(name);
  }
  forEach(cb) {
    this.map.forEach((vs, k) => {
      for (let i = 0; i < vs.length; i += 1) cb(vs[i], k);
    });
  }
  toString() {
    const enc = (s) => encodeURIComponent(s).replace(/%20/g, "+");
    const out = [];
    this.map.forEach((vs, k) => {
      for (let i = 0; i < vs.length; i += 1) out.push(`${enc(k)}=${enc(vs[i])}`);
    });
    return out.join("&");
  }
};
var MinigameURL = class {
  protocol;
  hostname;
  port;
  pathname;
  search;
  hash;
  searchParams;
  constructor(raw) {
    const str = String(raw);
    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(str);
    this.protocol = schemeMatch ? `${schemeMatch[1].toLowerCase()}:` : "";
    const rest = schemeMatch ? str.slice(schemeMatch[0].length) : str;
    const hashIdx = rest.indexOf("#");
    const noHash = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
    this.hash = hashIdx >= 0 ? rest.slice(hashIdx) : "";
    const qIdx = noHash.indexOf("?");
    const authorityPath = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
    const query = qIdx >= 0 ? noHash.slice(qIdx + 1) : "";
    const slashIdx = authorityPath.indexOf("/");
    const authority = slashIdx >= 0 ? authorityPath.slice(0, slashIdx) : authorityPath;
    const pathOnly = slashIdx >= 0 ? authorityPath.slice(slashIdx) : "/";
    const atIdx = authority.lastIndexOf("@");
    const hostPart = atIdx >= 0 ? authority.slice(atIdx + 1) : authority;
    const colon = hostPart.lastIndexOf(":");
    if (colon > hostPart.lastIndexOf("]")) {
      this.hostname = hostPart.slice(0, colon);
      this.port = hostPart.slice(colon + 1);
    } else {
      this.hostname = hostPart;
      this.port = "";
    }
    this.pathname = pathOnly;
    this.search = query ? `?${query}` : "";
    this.searchParams = new MinigameURLSearchParams(query);
  }
  get origin() {
    const portPart = this.port ? `:${this.port}` : "";
    return `${this.protocol}//${this.hostname}${portPart}`;
  }
  get host() {
    return `${this.hostname}${this.port ? `:${this.port}` : ""}`;
  }
  toString() {
    const base = `${this.origin}${this.pathname}`;
    const search = this.searchParams.toString();
    return `${base}${search ? `?${search}` : ""}${this.hash}`;
  }
};
function installMinigameFetchShims() {
  const g = globalThis;
  const wxRequest = g.wx?.request;
  if (typeof wxRequest !== "function") return;
  if (typeof g.Headers === "undefined") g.Headers = MinigameHeaders;
  if (typeof g.Response === "undefined") g.Response = MinigameResponse;
  if (typeof g.URLSearchParams === "undefined") g.URLSearchParams = MinigameURLSearchParams;
  if (typeof g.URL === "undefined") g.URL = MinigameURL;
  if (typeof g.fetch === "undefined") {
    g.fetch = (input, init) => new Promise((resolve, reject) => {
      try {
        const url = typeof input === "string" ? input : input.url;
        const headerEntries = new MinigameHeaders(init?.headers).entries();
        wxRequest({
          url,
          method: init?.method ?? "GET",
          header: Object.fromEntries(headerEntries),
          data: init?.body,
          responseType: "text",
          dataType: "text",
          success: (res) => resolve(new MinigameResponse(res.data, {
            status: res.statusCode,
            headers: new MinigameHeaders(res.header)
          })),
          fail: (err) => reject(new Error(`wx.request failed: ${err?.errMsg ?? String(err)}`))
        });
      } catch (err) {
        console.error("[fetch-shim] sync throw:", err?.stack ?? err);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}
installMinigameFetchShims();
export {
  CROPS,
  EventBus,
  FarmApiError,
  FarmWsError,
  GameEvent,
  OnlineGameApp,
  getCrop,
  makeOperationId
};
