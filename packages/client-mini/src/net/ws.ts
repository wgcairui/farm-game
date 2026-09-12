/**
 * Farm realtime client — thin wrapper over @colyseus/sdk that speaks the G2
 * farm protocol (see packages/shared/src/protocol/ws.ts).
 *
 * Why wrap the SDK instead of speaking Colyseus' raw protocol directly:
 *  - The SDK already handles handshake, reconnection tokens, msgpack framing,
 *    and the binary ROOM_DATA layout. Re-implementing it for "just the WeChat
 *    adapter" would be a multi-week project (see ADR-0003 D23).
 *  - The WeChat mini-program uses `wx.connectSocket`, which does not expose
 *    binary frames. The SDK sends msgpack over the socket, so a wx shim is
 *    non-trivial — we expose {@link wxWebSocketFactory} as an opt-in seam but
 *    do NOT enable it by default (status: experimental, untested on a real
 *    device).
 *
 * The class deliberately does NOT implement reconnection: W2 (the runtime
 * engineer) owns the lease / reconnect logic.
 */

import {
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAJOR,
  type ClientFarmCmd,
  type ClientFarmRefresh,
  type FarmCmdName,
  type PlayerSave,
  type PlotState,
} from '@farm-game/shared';
// MUST stay the first import: patches the WeChat WebSocket before
// @colyseus/sdk captures globalThis.WebSocket at module-eval time.
import './wx-compat.js';
import { ColyseusSDK, type Room } from '@colyseus/sdk';

// ── Public payload types (re-exported from shared where possible) ──

export type WelcomePayload = {
  serverNow: number;
  roomId: string;
  player: PlayerSave;
};

export type CmdResultPayload = {
  operationId: string;
  serverNow: number;
  revision: number;
  player: PlayerSave;
  payload?: unknown;
};

// ── Pure helpers — exported for tests and for callers that prefer to drive
//    the SDK Room directly (e.g. the cocos runtime). ──

/**
 * Build a `farm_cmd` envelope. The `r` and the inner `operationId` are the
 * same value so the server can correlate `cmd_result` / `error` responses
 * with the originating request via either field (the server echoes both).
 */
export function buildFarmCmdEnvelope(
  command: FarmCmdName,
  operationId: string,
  body: unknown,
): ClientFarmCmd {
  // The shared FarmCmdPayload is a discriminated union — one body per command.
  // We widen the caller's `unknown` body here because the server re-validates
  // per the registered schema; static narrowing at the call-site is the SDK
  // caller's job (see smoke-realtime.ts for the established pattern).
  const envelope: ClientFarmCmd = {
    v: PROTOCOL_VERSION,
    t: 'farm_cmd',
    r: operationId,
    p: { command, operationId, body } as ClientFarmCmd['p'],
  };
  return envelope;
}

/** Build a `farm_refresh` envelope (full snapshot pull). */
export function buildFarmRefreshEnvelope(): ClientFarmRefresh {
  return { v: PROTOCOL_VERSION, t: 'farm_refresh', p: null };
}

/**
 * Generate a request id. Prefers `crypto.randomUUID()` (Node 19+, modern
 * browsers, and the WeChat mini-program runtime all expose it); falls back
 * to a Math.random-derived string for environments that lack both Web
 * Crypto and Node's `node:crypto` (mostly very old test runners).
 */
export function makeOperationId(): string {
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoLike && typeof cryptoLike.randomUUID === 'function') {
    return cryptoLike.randomUUID();
  }
  const rnd = Math.random().toString(36).slice(2, 10);
  return `op_${Date.now().toString(36)}_${rnd}`;
}

/**
 * Validate and unwrap a `welcome` envelope. Returns `null` for any envelope
 * that fails the major-version check or is missing required fields — never
 * throws. Used both internally (to dispatch `onWelcome` and resolve
 * `join`/`refresh`) and by tests as a permissive guard.
 */
export function parseWelcomeEnvelope(raw: unknown): WelcomePayload | null {
  if (raw === null || typeof raw !== 'object') return null;
  const env = raw as { v?: unknown; t?: unknown; p?: unknown };
  if (typeof env.v !== 'string') return null;
  const major = Number(env.v.split('.')[0]);
  if (!Number.isFinite(major) || major !== PROTOCOL_VERSION_MAJOR) return null;
  if (env.t !== 'welcome') return null;
  if (env.p === null || typeof env.p !== 'object') return null;
  const p = env.p as { serverNow?: unknown; roomId?: unknown; player?: unknown };
  if (typeof p.serverNow !== 'number') return null;
  if (typeof p.roomId !== 'string') return null;
  if (p.player === null || typeof p.player !== 'object') return null;
  return p as WelcomePayload;
}

// ── WebSocket injection ──

/**
 * Experimental WeChat `wx.connectSocket` shim. The SDK's WebSocketTransport
 * picks `globalThis.WebSocket` first and falls back to the `ws` Node package;
 * assigning this factory's output to `globalThis.WebSocket` *should* route
 * Colyseus through wx sockets on a real device.
 *
 * CAVEATS (status: NOT VERIFIED ON A REAL DEVICE):
 *  - `wx.connectSocket` does not expose binary frames — the SDK encodes every
 *    send as msgpack, so this WILL NOT WORK out of the box on WeChat. W2 will
 *    need to either (a) upgrade to the SDK's H3/WebTransport path (no browser
 *    support on the WeChat WebView at time of writing) or (b) implement a
 *    binary frame shim using `wx.sendSocketMessage` with ArrayBuffer.
 *  - This function exists as a forward-looking hook; it deliberately throws
 *    so the bundler doesn't complain on platforms without `wx` AND so callers
 *    can't accidentally enable an untested code path.
 */
export function wxWebSocketFactory(): unknown {
  const wx = (globalThis as { wx?: { connectSocket?: (opts: unknown) => unknown } }).wx;
  if (typeof wx === 'undefined' || typeof wx.connectSocket !== 'function') {
    throw new Error('wxWebSocketFactory: globalThis.wx.connectSocket is unavailable');
  }
  throw new Error('wxWebSocketFactory: not implemented — see CAVEATS in ws.ts (binary frames unsupported on WeChat)');
}

// ── Errors ──

/** Thrown when the realtime client can't satisfy a request within its budget. */
export class FarmWsError extends Error {
  readonly code: number | string | undefined;
  readonly operationId: string | undefined;

  constructor(message: string, opts: { code?: number | string; operationId?: string } = {}) {
    super(message);
    this.name = 'FarmWsError';
    this.code = opts.code;
    this.operationId = opts.operationId;
  }
}

// ── Client ──

export interface FarmRealtimeClientOptions {
  endpoint: string;
  ownerId: string;
  token: string;
  /** Override the per-request timeout (default 5000ms). */
  timeoutMs?: number;
}

type PlotUpdatedPayload = { plot: PlotState };
type GoldUpdatedPayload = { gold: number };
type ErrorPayload = { code: number | string; message: string };

/**
 * Resolver contract: receives `{t,p,r}` where t is the message type, p is
 * the payload, and r is the optional request id. Internal sentinel type
 * `'__reject__'` is used by {@link FarmRealtimeClient.failAllWaiters} to
 * reject pending waiters without faking a real envelope.
 */
type PendingResolver = (msg: { t: string; p: unknown; r?: string }) => void;

const DEFAULT_TIMEOUT_MS = 5000;

export class FarmRealtimeClient {
  private readonly sdk: ColyseusSDK;
  private readonly ownerId: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private room: Room | null = null;
  private disposers: Array<() => void> = [];

  /** FIFO of resolvers waiting for a `welcome` reply to their own pull. */
  private welcomeWaiters: PendingResolver[] = [];
  /** Map of operationId → resolver waiting for a matching `cmd_result` / `error`. */
  private cmdWaiters: Map<string, PendingResolver> = new Map();
  /**
   * If a broadcast welcome arrives while no one is waiting, we stash the
   * payload and hand it to the NEXT refresh() caller instead of pulling a
   * fresh snapshot. Cleared on consume.
   */
  private pendingBroadcastWelcome: WelcomePayload | null = null;

  private plotCb: ((p: PlotUpdatedPayload) => void) | null = null;
  private goldCb: ((p: GoldUpdatedPayload) => void) | null = null;
  private welcomeCb: ((p: WelcomePayload) => void) | null = null;
  private errorCb: ((p: ErrorPayload) => void) | null = null;
  private leaveCb: ((code: number, reason?: string) => void) | null = null;

  constructor(opts: FarmRealtimeClientOptions) {
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
  async join(): Promise<WelcomePayload> {
    if (this.room !== null) {
      throw new FarmWsError('already joined — call leave() first');
    }
    const room = await this.sdk.joinOrCreate('farm', { ownerId: this.ownerId, token: this.token });
    this.room = room;
    this.bindRoomEvents(room);
    return this.refresh();
  }

  /** Re-pull the full snapshot. Resolves with the next `welcome` the server emits. */
  async refresh(): Promise<WelcomePayload> {
    const room = this.requireRoom();
    return this.awaitWelcome(room, () => {
      room.send('farm_refresh', buildFarmRefreshEnvelope() as unknown as Record<string, unknown>);
    });
  }

  /**
   * Issue a farm command and resolve with the matching `cmd_result`. The
   * server's `error` envelope, when addressed to this request (its `r` field
   * matches our `operationId`), rejects the returned promise with
   * {@link FarmWsError} instead.
   */
  async cmd(command: FarmCmdName, body: unknown): Promise<CmdResultPayload> {
    const room = this.requireRoom();
    const operationId = makeOperationId();
    const envelope = buildFarmCmdEnvelope(command, operationId, body);
    return new Promise<CmdResultPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cmdWaiters.delete(operationId);
        reject(new FarmWsError(`cmd "${command}" timed out after ${this.timeoutMs}ms`, { operationId }));
      }, this.timeoutMs);
      this.cmdWaiters.set(operationId, (msg) => {
        clearTimeout(timer);
        this.cmdWaiters.delete(operationId);
        if (msg.t === '__reject__') {
          reject(msg.p instanceof Error ? msg.p : new FarmWsError(String(msg.p)));
          return;
        }
        if (msg.t === 'error') {
          const errLike = (msg.p as { code?: unknown; message?: unknown } | null) ?? null;
          const code = errLike !== null && 'code' in errLike ? (errLike.code as number | string) : undefined;
          const message = errLike !== null && 'message' in errLike ? String(errLike.message ?? 'ws error') : 'ws error';
          reject(new FarmWsError(message, { code, operationId }));
          return;
        }
        resolve(msg.p as CmdResultPayload);
      });
      room.send('farm_cmd', envelope as unknown as Record<string, unknown>);
    });
  }

  async leave(): Promise<void> {
    const room = this.room;
    if (room === null) return;
    this.room = null;
    this.clearDisposers();
    this.failAllWaiters(new FarmWsError('room left'));
    try {
      await room.leave(true);
    } catch {
      // leave() rejects on already-closed rooms; swallow.
    }
  }

  // ── Event registration ──

  onPlotUpdated(cb: (p: PlotUpdatedPayload) => void): void { this.plotCb = cb; }
  onGoldUpdated(cb: (p: GoldUpdatedPayload) => void): void { this.goldCb = cb; }
  onWelcome(cb: (p: WelcomePayload) => void): void { this.welcomeCb = cb; }
  onError(cb: (p: ErrorPayload) => void): void { this.errorCb = cb; }
  onLeave(cb: (code: number, reason?: string) => void): void { this.leaveCb = cb; }

  // ── Internals ──

  private requireRoom(): Room {
    if (this.room === null) throw new FarmWsError('not joined — call join() first');
    return this.room;
  }

  private bindRoomEvents(room: Room): void {
    // `room.onMessage(type, cb)` (nanoevents) returns a `() => void` disposer
    // — keep it so a future leave() can drop the listener deterministically.
    this.disposers.push(
      room.onMessage('*', (type: string | number, payload: unknown) => {
        this.dispatch(String(type), payload);
      }),
    );
    // `room.onLeave(cb)` is a signal — it returns a chainable EventEmitter,
    // not a disposer, so we hold onto the bound callback and remove it
    // explicitly via `signal.remove`.
    const onLeaveCb = (code: number, reason?: string): void => {
      this.clearDisposers();
      this.failAllWaiters(new FarmWsError(`room left (code=${code})`));
      this.leaveCb?.(code, reason);
    };
    room.onLeave(onLeaveCb);
    this.disposers.push(() => { room.onLeave.remove(onLeaveCb); });
  }

  private clearDisposers(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
  }

  private failAllWaiters(err: FarmWsError): void {
    const queued = this.welcomeWaiters.splice(0);
    for (const r of queued) r({ t: '__reject__', p: err });
    // Map.forEach rather than for-of entries — WeChat DevTools' babel enhance
    // breaks iterator protocols (see EventBus.emit).
    this.cmdWaiters.forEach((r, opId) => {
      r({ t: '__reject__', p: new FarmWsError(`${err.message} (op=${opId})`, { operationId: opId }) });
    });
    this.cmdWaiters.clear();
  }

  /**
   * Drive a request/response cycle on the `welcome` channel: if a broadcast
   * welcome was stashed (revision watcher fired while nobody was waiting),
   * deliver it; otherwise register a one-shot waiter and call `send`.
   */
  private awaitWelcome(room: Room, send: () => void): Promise<WelcomePayload> {
    if (this.pendingBroadcastWelcome !== null) {
      const buffered = this.pendingBroadcastWelcome;
      this.pendingBroadcastWelcome = null;
      return Promise.resolve(buffered);
    }
    return new Promise<WelcomePayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.welcomeWaiters.indexOf(resolver);
        if (idx >= 0) this.welcomeWaiters.splice(idx, 1);
        reject(new FarmWsError(`welcome timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      const resolver: PendingResolver = (msg) => {
        clearTimeout(timer);
        if (msg.t === '__reject__') {
          reject(msg.p instanceof Error ? msg.p : new FarmWsError(String(msg.p)));
          return;
        }
        // dispatch() already unwrapped the WsEnvelope, so msg.p is the bare
        // {serverNow, roomId, player} payload; re-wrap it for validation.
        const parsed = parseWelcomeEnvelope({
          v: PROTOCOL_VERSION,
          t: 'welcome',
          p: msg.p,
        });
        if (parsed === null) {
          reject(new FarmWsError('welcome payload failed validation'));
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

  private dispatch(type: string, raw: unknown): void {
    // The SDK delivers every server message as the full WsEnvelope
    // ({v, t, r?, p, ts}) — smoke-realtime.ts's waitForMessage('welcome')
    // returning `{ p: {...} }` is the reference. Unwrap once here so every
    // branch below sees the bare payload plus the envelope-level request id.
    const env = (raw !== null && typeof raw === 'object' ? raw : {}) as { p?: unknown; r?: unknown };
    const payload = env.p;
    const requestId = typeof env.r === 'string' ? env.r : undefined;

    // ── welcome: prefer pending request/response match ──
    if (type === 'welcome') {
      const waiter = this.welcomeWaiters.shift();
      if (waiter !== undefined) {
        waiter({ t: type, p: payload });
        return;
      }
      // No pending request — this is a broadcast (revision watcher). Stash
      // for the next refresh() AND fire the user callback for live UI.
      const parsed = parseWelcomeEnvelope({
        v: PROTOCOL_VERSION,
        t: 'welcome',
        p: payload,
      });
      if (parsed !== null) {
        this.pendingBroadcastWelcome = parsed;
        this.welcomeCb?.(parsed);
      }
      return;
    }

    // ── cmd_result: route to the waiter matching `r`. ──
    if (type === 'cmd_result') {
      if (requestId !== undefined) {
        const waiter = this.cmdWaiters.get(requestId);
        if (waiter !== undefined) {
          waiter({ t: type, p: payload });
          return;
        }
      }
      // No waiter — out-of-band cmd_result, ignore.
      return;
    }

    // ── error: route to the waiter matching `r` if present, else callback. ──
    if (type === 'error') {
      if (requestId !== undefined) {
        const waiter = this.cmdWaiters.get(requestId);
        if (waiter !== undefined) {
          waiter({ t: type, p: payload });
          return;
        }
      }
      this.errorCb?.(payload as ErrorPayload);
      return;
    }

    // ── Broadcasts: plot_updated / gold_updated. ──
    if (type === 'plot_updated') {
      this.plotCb?.(payload as PlotUpdatedPayload);
      return;
    }
    if (type === 'gold_updated') {
      this.goldCb?.(payload as GoldUpdatedPayload);
      return;
    }

    // crop_stolen and anything else: silently ignored (reserved for social phase).
  }
}
