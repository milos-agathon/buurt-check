import { expect, test } from '@playwright/test';
import { installMockAddressFlow } from './helpers/mockApi';
import { openSeededDossier } from './helpers/seedState';

test.describe('search-led performance gates', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  });

  test('[search] performance-empty 390x844 en light', async ({ page }) => {
    await installMockAddressFlow(page);
    await page.goto('/#/search');
    await expect(page.getByRole('combobox')).toBeVisible();

    const startedAt = performance.now();
    await page.reload();
    await expect(page.getByRole('combobox')).toBeVisible();
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs, `search shell took ${Math.round(elapsedMs)}ms`).toBeLessThan(1500);
  });

  test('[search] performance-suggestions 390x844 en light', async ({ page }) => {
    await installMockAddressFlow(page, { suggest: 120 });
    await page.goto('/#/search');

    const startedAt = performance.now();
    await page.getByRole('combobox').fill('Keizersgracht 100 Amsterdam');
    await expect(page.getByRole('option').first()).toBeVisible();
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs, `suggestions took ${Math.round(elapsedMs)}ms`).toBeLessThan(1500);
  });

  test('[prebid] performance-loading 390x844 en light', async ({ page }) => {
    await installMockAddressFlow(page, {
      building: 200,
      risks: 200,
      neighborhood: 200,
      viewingQuestions: 200,
    });
    await page.goto('/#/search');
    await page.getByRole('combobox').fill('Keizersgracht 100 Amsterdam');

    const startedAt = performance.now();
    await page.getByRole('option').first().click();
    await expect(page.locator('.app[data-screen="dossier"]')).toBeVisible();
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs, `dossier flow entry took ${Math.round(elapsedMs)}ms`).toBeLessThan(1200);
  });

  test('[prebid] performance-pack 390x844 en light', async ({ page }) => {
    await installMockAddressFlow(page);
    await openSeededDossier(page);

    const startedAt = performance.now();
    await page.evaluate(() => {
      window.location.hash = '#/pack/0363010000696734/report-1';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await expect(page.getByTestId('pack-view')).toBeVisible();
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs, `pack route took ${Math.round(elapsedMs)}ms`).toBeLessThan(3500);
  });
});
