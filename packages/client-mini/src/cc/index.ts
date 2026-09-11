/**
 * Cocos Creator (cc) namespace stub — Phase 1 only.
 *
 * This module exists so the business code under packages/client-mini/src/cocos/**
 * can import from './cc' and compile in Phase 1 without the real Cocos engine.
 *
 * Phase 2: replace these stubs by re-pointing every `./cc` to the real `cc`
 * package (see docs/cocos-integration.md). No business code changes.
 */

import { EventBus } from '@farm-game/shared';

/** Decorator registry — stores class metadata for the engine to consume later. */
export const classRegistry = new Map<string, new (...args: any[]) => any>();

/** Mock @ccclass('ClassName') decorator. Records name but otherwise returns target unchanged. */
export function ccclass(name: string): <T extends new (...args: any[]) => any>(target: T) => T {
  return (target) => {
    classRegistry.set(name, target as unknown as new (...args: any[]) => any);
    return target;
  };
}

/** Mock _decorator namespace — only ccclass is used in Phase 1 business code. */
export const _decorator = { ccclass };

/** Base Component class — minimal surface for headless run + decorator. */
export class Component {
  /** Cocos schedule(fn, interval). Phase 1: setInterval; Phase 2: replace with real scheduler. */
  schedule(fn: () => void, interval: number): ReturnType<typeof setInterval> {
    return setInterval(fn, interval * 1000);
  }
  /** Inverse of schedule. */
  unschedule(handle: ReturnType<typeof setInterval>): void {
    clearInterval(handle);
  }
  /** Lifecycle hook — subclasses override. Phase 1 stub. */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onLoad(): void {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onDestroy(): void {}
}

/** Mock Node — empty class; scenes/prefabs are out of Phase 1 scope. */
export class Node {}

/** Mock sys.localStorage; falls through to globalThis.localStorage (browser only). */
export const sys = {
  get localStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
    return typeof globalThis !== 'undefined' && typeof (globalThis as { localStorage?: Storage }).localStorage !== 'undefined'
      ? (globalThis as { localStorage: Storage }).localStorage
      : null;
  },
};

/** Mock EventTarget — forwards to shared EventBus so business code keeps cc.EventBus semantics. */
export class EventTarget {
  on(event: string, handler: (...args: unknown[]) => void): void { EventBus.on(event, handler as (arg?: unknown) => void); }
  off(event: string, handler: (...args: unknown[]) => void): void { EventBus.off(event, handler as (arg?: unknown) => void); }
  emit(event: string, arg?: unknown): void { EventBus.emit(event, arg); }
}

/** Aggregation — `import * as cc from './cc'` yields all of the above. */
export default { ccclass, _decorator, Component, Node, sys, EventTarget };