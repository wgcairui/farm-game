import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Per ADR-0006 D45 / docs/admin-integration.md v2 §2: admin-web is a
// standalone npm package served on its own port (5173 in dev). Nginx
// (Stage F) terminates the public-facing origin and forwards both
// /admin-ops/* (API) and /admin/* (this app's static assets) to the
// right upstream. In `vite dev` we proxy /admin-ops to the Fastify
// port so the SPA can call the API without CORS gymnastics.

const API_PORT = process.env.VITE_API_PORT ?? '3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/admin-ops': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
