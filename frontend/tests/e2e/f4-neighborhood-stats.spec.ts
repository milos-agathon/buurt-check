import { expect, test } from '@playwright/test';

test('F4 happy path: neighborhood card appears after address selection', async ({ page }) => {
  await page.goto('/');

  // Select Amsterdam address
  await page.locator('input.address-search__input').fill('Keizersgracht 100 Amsterdam');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();

  // Wait for the neighborhood stats card to appear
  const neighborhoodCard = page.locator('.neighborhood-card');
  await expect(neighborhoodCard).toBeVisible({ timeout: 30000 });

  // Should show title (English or Dutch)
  await expect(
    page.getByRole('heading', { name: /Neighborhood Snapshot|Buurtprofiel/ }),
  ).toBeVisible();

  // Should show loading state first, then data
  // (This assertion may pass too fast if API is cached, but validates the card appears)
  await expect(neighborhoodCard).toContainText(/Loading|laden|Centrum|Amsterdam/, {
    timeout: 20000,
  });
});

test('F4 buurt name displays in subtitle', async ({ page }) => {
  await page.goto('/');

  await page.locator('input.address-search__input').fill('Kalverstraat 1 Amsterdam');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();

  const neighborhoodCard = page.locator('.neighborhood-card');
  await expect(neighborhoodCard).toBeVisible({ timeout: 30000 });

  // Should show buurt name + gemeente name in subtitle
  const subtitle = page.locator('.neighborhood-card__subtitle');
  await expect(subtitle).toBeVisible();
  const text = await subtitle.textContent();
  expect(text).toMatch(/Amsterdam/i);
});

test('F4 age distribution bars render', async ({ page }) => {
  await page.goto('/');

  await page.locator('input.address-search__input').fill('Keizersgracht 100 Amsterdam');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();

  const neighborhoodCard = page.locator('.neighborhood-card');
  await expect(neighborhoodCard).toBeVisible({ timeout: 30000 });

  // Should show age bars
  const ageBars = page.locator('.neighborhood-card__age-bars');
  await expect(ageBars).toBeVisible();

  // Should show 3 age bands
  const ageRows = page.locator('.neighborhood-card__age-row');
  await expect(ageRows).toHaveCount(3);

  // Each row should have a label, bar, and percentage
  for (let i = 0; i < 3; i++) {
    const row = ageRows.nth(i);
    await expect(row.locator('.neighborhood-card__age-label')).toBeVisible();
    await expect(row.locator('.neighborhood-card__age-bar-fill')).toBeVisible();
    await expect(row.locator('.neighborhood-card__age-pct')).toBeVisible();
  }
});

test('F4 unavailable indicators show fallback', async ({ page }) => {
  await page.goto('/');

  // Use Rotterdam address (more likely to have suppressed data)
  await page.locator('input.address-search__input').fill('Coolsingel 1 Rotterdam');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();

  const neighborhoodCard = page.locator('.neighborhood-card');
  await expect(neighborhoodCard).toBeVisible({ timeout: 30000 });

  // Check if any unavailable indicators exist
  const unavailableCount = await page
    .locator('.neighborhood-card__indicator-value--unavailable')
    .count();

  // Should have at least data rendered (available or unavailable)
  const allIndicators = await page.locator('.neighborhood-card__indicator').count();
  expect(allIndicators).toBeGreaterThan(0);

  // If unavailable indicators exist, verify they show correct text
  if (unavailableCount > 0) {
    await expect(
      page.locator('.neighborhood-card__indicator-value--unavailable').first(),
    ).toContainText(/Data not available|Data niet beschikbaar/);
  }
});

test('F4 error state renders on timeout', async ({ page }) => {
  // Intercept neighborhood API to simulate failure
  await page.route('**/api/address/*/neighborhood*', (route) => {
    route.abort('timedout');
  });

  await page.goto('/');

  await page.locator('input.address-search__input').fill('Kalverstraat 1 Amsterdam');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();

  // Building facts should still render (other features unaffected)
  await expect(page.getByRole('heading', { name: /Building Facts|Gebouwfeiten/ })).toBeVisible({
    timeout: 30000,
  });

  // Neighborhood card should appear with error message
  const neighborhoodCard = page.locator('.neighborhood-card');
  await expect(neighborhoodCard).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByText(/Neighborhood data could not be loaded|Buurtgegevens konden niet/),
  ).toBeVisible();
});

test('F4 bilingual support (Dutch)', async ({ page }) => {
  await page.goto('/');

  // Switch to Dutch
  await page.locator('.language-toggle').click();

  await page.locator('input.address-search__input').fill('Keizersgracht 100 Amsterdam');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();

  const neighborhoodCard = page.locator('.neighborhood-card');
  await expect(neighborhoodCard).toBeVisible({ timeout: 30000 });

  // Should show Dutch title
  await expect(page.getByRole('heading', { name: 'Buurtprofiel' })).toBeVisible();

  // Should show Dutch urbanization badge if available
  const badge = page.locator('.neighborhood-card__badge');
  if ((await badge.count()) > 0) {
    const badgeText = await badge.textContent();
    expect(badgeText).toMatch(
      /Zeer sterk stedelijk|Sterk stedelijk|Matig stedelijk|Weinig stedelijk|Niet stedelijk/,
    );
  }

  // Should show Dutch group titles
  await expect(page.getByRole('heading', { name: 'Mensen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wonen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bereikbaarheid' })).toBeVisible();
});
