import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import os from 'node:os'

function resolveDevApiProxyTarget(): string {
  // Allow explicit override for custom local setups.
  if (process.env.VITE_DEV_API_PROXY_TARGET) {
    return process.env.VITE_DEV_API_PROXY_TARGET
  }

  // Prefer a concrete LAN IPv4 to avoid ambiguous localhost listeners.
  const interfaces = os.networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return `http://${entry.address}:8000`
      }
    }
  }

  return 'http://localhost:8000'
}

const devApiProxyTarget = resolveDevApiProxyTarget()

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': devApiProxyTarget,
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-i18next', 'i18next', 'framer-motion'],
          'vendor-map': ['leaflet', 'react-leaflet'],
          'vendor-three': ['three', 'suncalc'],
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
