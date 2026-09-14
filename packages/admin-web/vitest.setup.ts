/**
 * Vitest setup — fills in browser globals that jsdom skips (Node 26
 * changed localStorage from a stub-by-default to a node-only
 * experimental feature). The authProvider code talks to
 * `localStorage` directly (no `window.localStorage` indirection)
 * so we attach a tiny shim to `globalThis`.
 */

const store = new Map<string, string>();

const memoryStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};

(globalThis as unknown as { localStorage: typeof memoryStorage }).localStorage = memoryStorage;
