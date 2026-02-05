import { expect, test } from '@playwright/test';

test('F3 happy path: risk cards render after address selection', async ({ page }) => {
  await page.goto('/');

  // Select an address (same pattern as F1 E2E)
  await page.locator('input.address-search__input').fill('Kalverstraat 1 Amsterdam');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();

  // Wait for the risk cards section to appear (may take a few seconds for API calls)
  const riskSection = page.locator('.risk-cards');
  await expect(riskSection).toBeVisible({ timeout: 30000 });

  // Should show the section title
  await expect(page.getByRole('heading', { name: /Environmental Risk Cards|Milieu-risicokaarten/ })).toBeVisible();

  // Should show 3 risk cards (noise, air, climate)
  const cards = page.locator('.risk-card');
  await expect(cards).toHaveCount(3);

  // Each card should have a badge (risk level)
  const badges = page.locator('.risk-card__badge');
  await expect(badges).toHaveCount(3);

  // Each badge should show a valid risk level text
  for (let i = 0; i < 3; i++) {
    const badgeText = await badges.nth(i).textContent();
    expect(badgeText).toMatch(/Low risk|Medium risk|High risk|Data unavailable|Laag risico|Gemiddeld risico|Hoog risico|Data niet beschikbaar/);
  }

  // Should show disclaimer
  await expect(page.locator('.risk-cards__disclaimer')).toBeVisible();

  // Should show source + date for each card
  const sources = page.locator('.risk-card__source');
  await expect(sources).toHaveCount(3);
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
  await expect(page.getByRole('heading', { name: 'Building Facts' })).toBeVisible({ timeout: 30000 });

  // The risk cards section should NOT appear (silently failed)
  // Wait a reasonable time and verify it's not there
  await page.waitForTimeout(3000);
  await expect(page.locator('.risk-cards')).not.toBeVisible();

  // The page should NOT show a generic error message
  await expect(page.getByText('Something went wrong')).not.toBeVisible();
});
