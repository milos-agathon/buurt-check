import { expect, test } from '@playwright/test';
import { installMockAddressFlow } from './helpers/mockApi';

test.describe('Phase 4 Performance Budgets', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  });

  test('initial shell renders under budget', async ({ page }) => {
    await installMockAddressFlow(page);

    const start = Date.now();
    await page.goto('/');
    await expect(page.locator('input.address-search__input')).toBeVisible();
    const elapsedMs = Date.now() - start;

    expect(elapsedMs, `initial shell exceeded budget (${elapsedMs}ms)`).toBeLessThan(1500);
  });

  test('address suggest feedback appears under budget', async ({ page }) => {
    await installMockAddressFlow(page, { suggest: 120 });
    await page.goto('/');

    const start = Date.now();
    await page.locator('input.address-search__input').fill('Keizersgracht 100 Amsterdam');
    await expect(page.getByRole('option').first()).toBeVisible();
    const elapsedMs = Date.now() - start;

    expect(elapsedMs, `suggest interaction exceeded budget (${elapsedMs}ms)`).toBeLessThan(1500);
  });
});
