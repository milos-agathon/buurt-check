import { expect, test } from '@playwright/test';
import {
  completeMatchQuiz,
  expectMobileViewport,
  seedEnglish,
  useMobileViewport,
} from './helpers/matchFlow';

test.beforeEach(async ({ page }) => {
  await useMobileViewport(page);
  await seedEnglish(page);
});

test('[match] alerts FR10 390x844 en light', async ({ page }) => {
  await completeMatchQuiz(page);
  await expectMobileViewport(page);
  await page.getByRole('button', { name: 'Alerts' }).click();
  await expect(page.getByRole('heading', { name: 'Create and manage alerts' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Purchase budget')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Purchase budget').fill('625000');
  await expect(page.getByLabel('Property type')).toBeVisible();
  await page.getByRole('button', { name: 'Create alert' }).click();
  await expect(page.getByText('Mock notification recorded')).toBeVisible({ timeout: 20_000 });
});

test('[match] listings FR9 390x844 en light', async ({ page }) => {
  await page.goto('/#/match/listings');
  await expectMobileViewport(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Homes on the market' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Mock provider')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/MOCK DATA|not live market supply/i).first()).toBeVisible({ timeout: 20_000 });
});

test('[match] admin FR14 390x844 en light', async ({ page }) => {
  await page.goto('/#/match/admin');
  await expectMobileViewport(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Admin data dashboard' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Data freshness')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Product metrics')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/ListingProvider/).first()).toBeVisible({ timeout: 20_000 });
});
