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

test('[match] language FR12 390x844 nl light', async ({ page }) => {
  await page.goto('/#/match');
  await expectMobileViewport(page);
  await page.locator('#match-language').selectOption('nl');
  await expect(page.getByRole('heading', { name: 'Vind waar je leven past' })).toBeVisible();
});

test('[match] feedback FR13 390x844 en light', async ({ page }) => {
  await completeMatchQuiz(page);
  await expectMobileViewport(page);
  await page.getByRole('button', { name: 'Maybe' }).first().click();
  await expect(page.getByText('Updated recommendations reflect your stated feedback.')).toBeVisible({ timeout: 20_000 });
});

test('[match] save-share-export FR11 390x844 en light', async ({ page }) => {
  await completeMatchQuiz(page);
  await expectMobileViewport(page);
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
  await expect(page.getByText(/source|freshness|confidence|limitations/i).first()).toBeVisible();
});
