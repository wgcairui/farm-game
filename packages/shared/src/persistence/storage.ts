/**
 * Storage interface — abstracts local persistence so client-mini (Cocos → localStorage)
 * and client-app (RN → AsyncStorage) can swap implementations without changing
 * business code in packages/shared.
 */

export interface KeyValueStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Web/Cocos-H5 localStorage adapter — synchronous. */
export class LocalStorageAdapter implements KeyValueStorage {
  getItem(key: string): string | null {
    if (typeof globalThis.localStorage === 'undefined') return null;
    return globalThis.localStorage.getItem(key);
  }
  setItem(key: string, value: string): void {
    if (typeof globalThis.localStorage === 'undefined') return;
    globalThis.localStorage.setItem(key, value);
  }
  removeItem(key: string): void {
    if (typeof globalThis.localStorage === 'undefined') return;
    globalThis.localStorage.removeItem(key);
  }
}

/** In-memory adapter — used by Jest/Node tests; never written to disk. */
export class MemoryStorageAdapter implements KeyValueStorage {
  private readonly _map = new Map<string, string>();
  getItem(key: string): string | null { return this._map.get(key) ?? null; }
  setItem(key: string, value: string): void { this._map.set(key, value); }
  removeItem(key: string): void { this._map.delete(key); }
  /** Test helper — number of keys currently stored. */
  size(): number { return this._map.size; }
}