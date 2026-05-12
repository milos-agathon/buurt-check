import { expect, test } from '@playwright/test';
import { expectMobileViewport, seedEnglish, useMobileViewport } from './helpers/matchFlow';

test.beforeEach(async ({ page }) => {
  await useMobileViewport(page);
  await seedEnglish(page);
});

test('[match] comparison FR6 390x844 en light', async ({ page }) => {
  await page.goto('/#/match/compare');
  await expectMobileViewport(page);
  await expect(page.getByRole('heading', { name: 'Neighborhood comparison' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('3 neighborhoods selected')).toBeVisible();
  await expect(page.getByText(/confidence/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/freshness/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/MOCK DATA|No source/i).first()).toBeVisible();
});

test('[match] similar FR7 390x844 en light', async ({ page }) => {
  await page.goto('/#/match/similar');
  await expectMobileViewport(page);
  await expect(page.getByRole('heading', { name: 'Find similar neighborhoods' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Find alternatives' }).click();
  await expect(page.getByText(/Similarity \d+\/100/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Confidence \d+\/100/).first()).toBeVisible({ timeout: 20_000 });
});

test('[match] map FR8 390x844 en light', async ({ page }) => {
  await page.goto('/#/match/map');
  await expectMobileViewport(page);
  await expect(page.getByRole('heading', { name: 'Map view' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Match score')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Confidence')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('img', { name: 'Recommended neighborhood map' })).toBeVisible();
});
