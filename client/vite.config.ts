import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// tracker-ui ships its blue accent as hardcoded literals, so remap them to this
// app's orange accent wherever its stylesheet is processed. The hue slider is
// skipped because its blue is a spectrum stop, not the accent.
const TRACKER_UI_ACCENT_REMAP: [RegExp, string][] = [
  [/#2563eb/gi, '#ea580c'], // blue-600 → orange-600
  [/#1d4ed8/gi, '#c2410c'], // blue-700 → orange-700
  [/#93c5fd/gi, '#fdba74'], // blue-300 → orange-300
  [/rgba\(37,\s*99,\s*235,/gi, 'rgba(234, 88, 12,'],
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@jerecocc/tracker-ui'],
    include: [
      'classnames',
      '@tiptap/react > use-sync-external-store/shim/index.js',
      '@tiptap/react > use-sync-external-store/shim/with-selector.js',
    ],
  },
  css: {
    postcss: {
      plugins: [
        {
          postcssPlugin: 'tracker-ui-accent',
          Declaration(decl) {
            if (!decl.source?.input.file?.includes('tracker-ui')) return;
            const { parent } = decl;
            if (parent && 'selector' in parent && parent.selector.includes('hueSlider')) return;
            decl.value = TRACKER_UI_ACCENT_REMAP.reduce(
              (value, [pattern, replacement]) => value.replace(pattern, replacement),
              decl.value,
            );
          },
        },
      ],
    },
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        loadPaths: [
          path.resolve(rootDir, './src'),
        ],
      },
    },
  },
  server: {
    port: 5177,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5004',
        changeOrigin: true,
      },

    },
  },
})
