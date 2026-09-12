/**
 * Bundle the client-mini runtime for the Cocos Creator project.
 *
 * Output: assets/scripts/vendor/farm-online.js (single ESM file) so the
 * in-editor game script (assets/scripts/OnlineFarm.ts) never has to resolve
 * workspace packages — Cocos' build pipeline can't follow pnpm workspace
 * imports outside assets/.
 *
 * Node-only deps pulled in by @colyseus/sdk (ws, node builtins) are stubbed:
 * the SDK picks globalThis.WebSocket first, which exists in the WeChat
 * devtools runtime and on real devices (wx.connectSocket shim comes later).
 *
 * Run: pnpm --filter @farm-game/client-mini build:cocos
 */
import { build } from 'esbuild';

const stubNamespace = 'node-stub';
const stubbedModules = [
  'ws', 'net', 'tls', 'http', 'https', 'fs', 'path', 'os', 'zlib',
  'crypto', 'child_process', 'dns', 'stream', 'url', 'util', 'events',
];

const stubPlugin = {
  name: 'stub-node-modules',
  setup(build) {
    build.onResolve({ filter: new RegExp(`^(${stubbedModules.join('|')})$`) }, (args) => ({
      path: args.path,
      namespace: stubNamespace,
    }));
    build.onLoad({ filter: /.*/, namespace: stubNamespace }, (args) => ({
      contents: `module.exports = {};`,
      loader: 'js',
    }));
  },
};

const result = await build({
  entryPoints: ['src/cocos-entry.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  outfile: 'assets/scripts/vendor/farm-online.js',
  plugins: [stubPlugin],
  // Leave Cocos' own TS transform out — the bundle is precompiled JS.
  logLevel: 'info',
  metafile: true,
});

const sizes = Object.entries(result.metafile.outputs).map(([file, out]) => `${file}: ${(out.bytes / 1024).toFixed(1)} KB`);
console.log(sizes.join('\n'));
