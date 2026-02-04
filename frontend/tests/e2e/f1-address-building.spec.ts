import { expect, test } from '@playwright/test';

test('F1 flow: search address and render building facts + footprint', async ({ page }) => {
  await page.goto('/');

  await page.locator('input.address-search__input').fill('Kalverstraat 1 Amsterdam');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();

  await expect(page.getByRole('heading', { name: 'Building Facts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Building Footprint' })).toBeVisible();

  await expect(page.locator('.building-card__mono')).toHaveText(/\d{16}/);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
});
