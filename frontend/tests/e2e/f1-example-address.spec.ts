import { expect, test } from '@playwright/test';

test('F1 flow: example address opens briefing without a source error', async ({ page }) => {
  await page.goto('/');

  await page.locator('.address-search__example-link').click();

  await expect(page).toHaveURL(/#\/briefing/);
  await expect(page.getByRole('heading', { name: /Building Facts|Gebouwgegevens/ })).toBeVisible();
  await expect(
    page.getByText(/We couldn't load data from this source right now|We konden deze databron nu niet laden/u),
  ).toHaveCount(0);

  const recents = await page.evaluate(() => window.localStorage.getItem('buurt-check-recent-searches'));
  expect(recents).not.toContain('adr-d3836e3ae5e5c07f18109908abba6dab');
});
