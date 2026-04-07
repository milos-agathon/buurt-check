import { expect, test } from '@playwright/test';

test('F3 happy path: risk cards render after address selection', async ({ page }) => {
  await page.goto('/');

  // Select an address (same pattern as F1 E2E)
  await page.locator('input.address-search__input').fill('Kalverstraat 1 Amsterdam');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();

  await expect(page.getByRole('heading', { name: /Building Facts|Gebouwgegevens/ })).toBeVisible({
    timeout: 30000,
  });

  const noiseTile = page.getByTestId('risk-tile-noise');
  const airTile = page.getByTestId('risk-tile-air');
  const climateTile = page.getByTestId('risk-tile-climate');

  await expect(noiseTile).toBeVisible();
  await expect(airTile).toBeVisible();
  await expect(climateTile).toBeVisible();

  await expect(noiseTile).toContainText(/Road Traffic Noise|Wegverkeersgeluid/);
  await expect(airTile).toContainText(/Air Quality|Luchtkwaliteit/);
  await expect(climateTile).toContainText(/Climate Risk|Klimaatrisico/);

  await expect(noiseTile.locator('.severity-badge__label')).toBeVisible();
  await expect(airTile.locator('.severity-badge__label')).toBeVisible();
  await expect(climateTile.locator('.severity-badge__label')).toBeVisible();
});

test('F3 degraded path: dossier stays usable when risk API fails', async ({ page }) => {
  // Intercept risk cards API to simulate failure
  await page.route('**/api/address/*/risks*', (route) => {
    route.abort('failed');
  });

  await page.goto('/');

  // Select an address
  await page.locator('input.address-search__input').fill('Kalverstraat 1 Amsterdam');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();

  // Building facts should still render (F1 unaffected by F3 failure)
  await expect(page.getByRole('heading', { name: /Building Facts|Gebouwgegevens/ })).toBeVisible({
    timeout: 30000,
  });

  const noiseTile = page.getByTestId('risk-tile-noise');
  const airTile = page.getByTestId('risk-tile-air');
  const climateTile = page.getByTestId('risk-tile-climate');

  await expect(noiseTile).toBeVisible({ timeout: 10000 });
  await expect(airTile).toBeVisible();
  await expect(climateTile).toBeVisible();

  await expect(noiseTile).toContainText('--');
  await expect(airTile).toContainText('--');
  await expect(climateTile).toContainText('--');

  // The page should NOT show a generic error message
  await expect(page.getByText('Something went wrong')).not.toBeVisible();
});
