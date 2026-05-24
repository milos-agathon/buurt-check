import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// Default to loopback; Playwright starts backend on 127.0.0.1:8000.
// Override via VITE_DEV_API_PROXY_TARGET for LAN/mobile testing.
const devApiProxyTarget =
  process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'logos/buurt-check-favicon.svg',
        'logos/app_icons/pwa-192x192.png',
        'logos/app_icons/pwa-192x192-maskable.png',
        'logos/app_icons/pwa-512x512.png',
        'logos/app_icons/pwa-512x512-maskable.png',
        'legal.css',
        'offline.html',
        'privacy.html',
        'terms.html',
        '.well-known/assetlinks.json',
        '.well-known/apple-app-site-association',
      ],
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
  },
  server: {
    proxy: {
      '/api': devApiProxyTarget,
    },
  },
  preview: {
    proxy: {
      '/api': devApiProxyTarget,
    },
  },
  build: {
    modulePreload: {
      resolveDependencies: (_filename, deps, context) => {
        if (context.hostType !== 'html') return deps;
        return deps.filter((dep) => !dep.includes('vendor-three'));
      },
    },
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
          if (path.includes('/node_modules/@sentry/')) {
            return 'vendor-sentry';
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
