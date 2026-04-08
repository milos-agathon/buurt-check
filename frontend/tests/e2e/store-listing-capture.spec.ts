import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.resolve(__dirname, '../../../android/store-listing/01_search.png');

const RECENT_SEARCHES_SEED = [
  {
    id: 'recent-1',
    display_name: 'Prinsengracht 1, Amsterdam',
    timestamp: Date.UTC(2026, 3, 8, 8, 0, 0),
  },
  {
    id: 'recent-2',
    display_name: 'Keizersgracht 1, Amsterdam',
    timestamp: Date.UTC(2026, 3, 7, 20, 30, 0),
  },
];

test.use({
  viewport: { width: 360, height: 640 },
  colorScheme: 'light',
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
});

test('captures the clean search screen after clearing recent searches', async ({ page }) => {
  await page.addInitScript(({ recentSearches }) => {
    window.localStorage.clear();
    window.localStorage.setItem('i18nextLng', 'nl');
    window.localStorage.setItem('buurt-check-theme', 'light');
    window.localStorage.setItem('buurtcheck_analytics_consent', 'denied');
    window.localStorage.setItem('buurt-check-recent-searches', JSON.stringify(recentSearches));
  }, { recentSearches: RECENT_SEARCHES_SEED });

  await page.goto('/');
  await expect(page.getByTestId('recent-searches')).toBeVisible();

  await page.locator('.top-bar__settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();

  await page.getByRole('button', { name: /Clear recent searches|Recente zoekopdrachten wissen/i }).click();
  await expect(page.getByTestId('confirm-sheet')).toBeVisible();
  await page.getByRole('button', { name: /Clear now|Nu wissen/i }).click();

  await page.getByRole('tab', { name: /Home/i }).click();
  await expect(page.getByTestId('value-props')).toBeVisible();
  await expect(page.getByTestId('recent-searches')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 6000 });

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await page.screenshot({
    path: OUTPUT_PATH,
    animations: 'disabled',
  });
});
