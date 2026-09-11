/**
 * EventBus — minimal pub/sub, used identically by Cocos client (replacing cc.EventTarget),
 * RN client, and Fastify server. Same instance contract everywhere so we can mirror
 * server-pushed events into the client's local event stream.
 */

type Handler<T = unknown> = (arg?: T) => void;

class EventBusImpl {
  private readonly _listeners = new Map<string, Set<Handler<any>>>();

  on<T = unknown>(event: string, handler: Handler<T>): void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(handler as Handler<any>);
  }

  off<T = unknown>(event: string, handler: Handler<T>): void {
    const set = this._listeners.get(event);
    if (!set) return;
    set.delete(handler as Handler<any>);
    if (set.size === 0) this._listeners.delete(event);
  }

  emit<T = unknown>(event: string, arg?: T): void {
    const set = this._listeners.get(event);
    if (!set) return;
    // Snapshot to allow off() during dispatch.
    for (const handler of [...set]) {
      try {
        handler(arg);
      } catch (err) {
        // Phase 1: log and continue; production wires pino.
        // eslint-disable-next-line no-console
        console.error(`[EventBus] handler for "${event}" threw`, err);
      }
    }
  }

  /** Number of listeners currently registered for `event` (test helper). */
  listenerCount(event: string): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  /** Remove every listener — call between test cases. */
  clear(): void {
    this._listeners.clear();
  }
}

/** Module-level singleton. Both server and clients share the same dispatch semantics. */
export const EventBus = new EventBusImpl();