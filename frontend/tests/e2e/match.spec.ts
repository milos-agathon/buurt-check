import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'en');
  });
});

async function completeQuiz(page: Page) {
  await page.goto('/#/match');
  await page.locator('#match-language').selectOption('nl');
  await expect(page.getByRole('heading', { name: 'Vind waar je leven past' })).toBeVisible();
  await page.locator('#match-language').selectOption('en');
  await page.getByRole('button', { name: 'Find my best neighborhoods' }).click();
  await page.getByLabel('Journey').getByText('Buy').click();
  await page.getByLabel('Maximum purchase budget').fill('625000');
  await page.getByRole('radio', { name: 'Family', exact: true }).click();
  await page.getByLabel('Current city or preferred anchor').fill('Amsterdam');
  await page.getByLabel('Maximum commute time').fill('45');
  await page.getByLabel('Must-haves').getByText('Green space').click();
  await page.getByLabel('Nice-to-haves').getByText('Train nearby').click();
  await page.getByLabel('Property type').getByText('Apartment').click();
  await page.getByLabel('Lifestyle priorities').getByText('Green space').click();
  await page.getByLabel('Lifestyle priorities').getByText('Family fit').click();
  await page.getByLabel('Lifestyle priorities').getByText('Mobility').click();
  await page.getByRole('button', { name: 'Create my preference profile' }).click();
  await expect(page.getByRole('heading', { name: 'Your ranked neighborhood matches' })).toBeVisible({ timeout: 20_000 });
}

test('[match] landing, quiz, ranking, report, sources, feedback and save flow', async ({ page }) => {
  await completeQuiz(page);

  await expect(page.getByRole('heading', { name: 'Top matches' })).toBeVisible();
  await expect(page.getByText(/Match score:/).first()).toBeVisible();
  await expect(page.getByText(/Data confidence:/).first()).toBeVisible();
  await expect(page.getByText(/Sources:/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Neighborhood report' })).toBeVisible();
  await expect(page.getByText('Deterministic fallback used')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Maybe' }).first().click();
  await expect(page.getByText('Updated recommendations reflect your stated feedback.')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Save neighborhood' }).first().click();
  await page.getByRole('button', { name: 'Saved' }).click();
  await expect(page.getByRole('heading', { name: 'Saved neighborhoods and reports' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save report' })).toBeEnabled();
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
  await expect(page.getByText(/confidence/i).first()).toBeVisible();

  await page.goto('/#/match/similar');
  await expect(page.getByRole('heading', { name: 'Find similar neighborhoods' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Find alternatives' }).click();
  await expect(page.getByText(/Similarity \d+\/100/).first()).toBeVisible({ timeout: 20_000 });

  await page.goto('/#/match/map');
  await expect(page.getByRole('heading', { name: 'Map view' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Match score')).toBeVisible();
});

test('[match] listings, alerts and admin screens are reachable in the integrated app', async ({ page }) => {
  await completeQuiz(page);

  await page.getByRole('button', { name: 'Alerts' }).click();
  await expect(page.getByRole('heading', { name: 'Create and manage alerts' })).toBeVisible();
  await page.getByLabel('Purchase budget').fill('625000');
  await page.getByRole('button', { name: 'Create alert' }).click();
  await expect(page.getByText('Mock notification recorded')).toBeVisible();

  await page.goto('/#/match/listings');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Homes on the market' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Mock provider')).toBeVisible();

  await page.goto('/#/match/admin');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Admin data dashboard' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Data freshness')).toBeVisible();
  await expect(page.getByText('Product metrics')).toBeVisible();
});
