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

test('[match] guided quiz and report FR1 FR2 FR3 FR4 FR5 390x844 en light', async ({ page }) => {
  await expectMobileViewport(page);
  await completeMatchQuiz(page);

  await expect(page.getByRole('heading', { name: 'Top matches' })).toBeVisible();
  await expect(page.getByText(/Match score:/).first()).toBeVisible();
  await expect(page.getByText('Method: deterministic scoring from curated data').first()).toBeVisible();
  await expect(page.getByText(/Data confidence:/).first()).toBeVisible();
  await expect(page.getByText(/Freshness:/).first()).toBeVisible();
  await expect(page.getByText(/Sources:/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Neighborhood report' })).toBeVisible();
  await expect(page.getByText('Deterministic fallback used')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Maybe' }).first().click();
  await expect(page.getByText('Updated recommendations reflect your stated feedback.')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Save neighborhood' }).first().click();
  await page.getByRole('button', { name: 'Saved' }).click();
  await expect(page.getByRole('heading', { name: 'Saved neighborhoods and reports' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save report' })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Save report' }).click();
  await page.getByLabel('I agree to create a scoped share link').check();
  await page.getByRole('button', { name: 'Share with partner or family' }).click();
  await expect(page.getByText(/Share link ready:/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Export JSON' }).click();
  await expect(page.getByText('Export is ready.')).toBeVisible({ timeout: 20_000 });
});

test('[match] comparison, similar search and map screens render seeded recommendations', async ({ page }) => {
  await page.goto('/#/match/compare');
  await expect(page.getByRole('heading', { name: 'Neighborhood comparison' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/confidence/i).first()).toBeVisible({ timeout: 20_000 });

  await page.goto('/#/match/similar');
  await expect(page.getByRole('heading', { name: 'Find similar neighborhoods' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Find alternatives' }).click();
  await expect(page.getByText(/Similarity \d+\/100/).first()).toBeVisible({ timeout: 20_000 });

  await page.goto('/#/match/map');
  await expect(page.getByRole('heading', { name: 'Map view' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Match score')).toBeVisible({ timeout: 20_000 });
});

test('[match] listings, alerts and admin screens are reachable in the integrated app', async ({ page }) => {
  await completeMatchQuiz(page);

  await page.getByRole('button', { name: 'Alerts' }).click();
  await expect(page.getByRole('heading', { name: 'Create and manage alerts' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Purchase budget').fill('625000');
  await page.getByRole('button', { name: 'Create alert' }).click();
  await expect(page.getByText('Mock notification recorded')).toBeVisible({ timeout: 20_000 });

  await page.goto('/#/match/listings');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Homes on the market' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Mock provider')).toBeVisible({ timeout: 20_000 });

  await page.goto('/#/match/admin');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Admin data dashboard' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Data freshness')).toBeVisible();
  await expect(page.getByText('Product metrics')).toBeVisible();
});
