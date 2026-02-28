import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
// Default to loopback; Playwright starts backend on 127.0.0.1:8000.
// Override via VITE_DEV_API_PROXY_TARGET for LAN/mobile testing.
const devApiProxyTarget =
  process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
  },
  server: {
    proxy: {
      '/api': devApiProxyTarget,
    },
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        passes: 3,
        module: true,
        toplevel: true,
        pure_getters: true,
      },
      mangle: {
        module: true,
        toplevel: true,
        safari10: true,
      },
      format: {
        comments: false,
      },
    },
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          const path = id.replace(/\\/g, '/');
          if (
            path.includes('/node_modules/react/')
            || path.includes('/node_modules/react-dom/')
          ) {
            return 'vendor-react';
          }
          if (
            path.includes('/node_modules/react-i18next/')
            || path.includes('/node_modules/i18next/')
            || path.includes('/node_modules/framer-motion/')
          ) {
            return 'vendor-ui-i18n';
          }
          if (path.includes('/node_modules/three/') || path.includes('/node_modules/suncalc/')) {
            return 'vendor-three';
          }
          if (path.includes('/src/i18n/')) {
            return 'i18n-resources';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    css: false,
  },
})
