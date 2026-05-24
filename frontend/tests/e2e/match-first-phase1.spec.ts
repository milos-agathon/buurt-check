import { expect, test } from '@playwright/test';

test('Phase 1 match-first shell works on mobile with reduced motion', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto('/#/match');
  await page.getByRole('button', { name: /English|Engels/i }).click();

  await expect(page.getByRole('heading', { name: 'Find your dream neighborhood.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find my dream neighborhood' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Already have an address?' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Search' })).toHaveCount(0);

  await page.getByRole('button', { name: /Dutch|Nederlands/i }).click();
  await expect(page.getByRole('heading', { name: 'Vind je droombuurt.' })).toBeVisible();
  await page.getByRole('button', { name: /English|Engels/i }).click();

  await page.getByRole('button', { name: 'Find my dream neighborhood' }).click();
  await expect(page).toHaveURL(/#\/match\/session\/match-[^/]+\/intro$/);
  await expect(page.getByRole('heading', { name: 'First, we need to understand how you want to live.' })).toBeVisible();

  await page.getByRole('button', { name: 'Start the match' }).click();
  await expect(page.getByRole('heading', { name: 'Are you looking to buy, rent, or both?' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Question 1 of 1' })).toBeVisible();

  await page.getByRole('button', { name: 'Review answer' }).click();
  await expect(page.getByRole('alert')).toContainText('Choose one answer to continue.');

  await page.getByRole('radio', { name: 'Both' }).check();
  await page.getByRole('button', { name: 'Review answer' }).click();
  await expect(page.getByRole('heading', { name: 'Ready to find your best neighborhoods?' })).toBeVisible();

  await page.getByRole('button', { name: 'Show my matches' }).click();
  await expect(page).toHaveURL(/#\/match\/session\/match-[^/]+\/run$/);
  await expect(page.getByRole('status')).toContainText('Your answers are saved.');
});
