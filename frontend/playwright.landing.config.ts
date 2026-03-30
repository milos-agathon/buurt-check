import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'landing-page.spec.ts',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    headless: true,
    locale: 'nl-NL',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
      },
    },
    {
      name: 'desktop',
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: 'node ./scripts/serve-landing.mjs',
    cwd: '..',
    port: 4174,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
