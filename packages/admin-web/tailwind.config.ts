import type { Config } from 'tailwindcss';

// Minimal Tailwind theme — admin tools are not consumer-facing and
// don't need elaborate design tokens. Slate + indigo mirrors the
// visual language of the existing farm-game reference UI (per
// docs/scene-spec-v24.md) without depending on a full design system.

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
