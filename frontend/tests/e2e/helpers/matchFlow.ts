import { expect, type Page } from '@playwright/test';

export async function seedEnglish(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'en');
  });
}

export async function useMobileViewport(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
}

export async function expectMobileViewport(page: Page) {
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(viewport).toEqual({ width: 390, height: 844 });
}

export async function completeMatchQuiz(page: Page) {
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
  await expect(page.getByRole('heading', { name: 'Your ranked neighborhood matches' })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole('heading', { name: 'Top matches' })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(/Match score:/).first()).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('.match-report__status')).toBeVisible({ timeout: 40_000 });
}
