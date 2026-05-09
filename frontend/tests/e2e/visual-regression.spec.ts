import { expect, test } from '@playwright/test';
import { installMockAddressFlow } from './helpers/mockApi';
import { openSeededDossier, seedShortlist, SHORTLIST_SEED_VISUAL_REGRESSION } from './helpers/seedState';

const APP_ENTRY = '/';

test.describe('Phase 5 Visual Regression - Mobile Light', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  });

  test('[search] empty 390x844 en light', async ({ page }) => {
    await installMockAddressFlow(page);
    await page.goto(APP_ENTRY);
    await expect(page).toHaveScreenshot('search-screen.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('[saved] populated 390x844 en light', async ({ page }) => {
    await seedShortlist(page, SHORTLIST_SEED_VISUAL_REGRESSION, 'light');
    await page.goto(APP_ENTRY);
    await page.getByRole('tab', { name: /Saved|Opgeslagen/ }).click();
    await expect(page.getByTestId('shortlist-screen')).toBeVisible();

    await expect(page).toHaveScreenshot('saved-screen-mobile-light.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('[compare] three-home 390x844 en light', async ({ page }) => {
    await seedShortlist(page, SHORTLIST_SEED_VISUAL_REGRESSION, 'light');
    await page.goto(APP_ENTRY);
    await page.getByRole('tab', { name: /Saved|Opgeslagen/ }).click();
    await expect(page.getByRole('button', { name: /Compare|Vergelijk/ })).toBeVisible();
    await page.getByRole('button', { name: /Compare|Vergelijk/ }).click();
    await expect(page.getByRole('heading', { name: /Compare|Vergelijk/ })).toBeVisible();

    await expect(page).toHaveScreenshot('compare-screen-mobile-light.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('[dossier] loaded 390x844 en light', async ({ page }) => {
    await openSeededDossier(page, undefined, 'light');
    await expect(page).toHaveScreenshot('dossier-screen-mobile-light.png', {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('[settings] main 390x844 en light', async ({ page }) => {
    await page.goto(APP_ENTRY);
    await page.getByRole('button', { name: /Settings|Instellingen/ }).click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();

    await expect(page).toHaveScreenshot('settings-screen-mobile-light.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Phase 5 Visual Regression - Mobile Dark', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });

  test('[saved] populated 390x844 en dark', async ({ page }) => {
    await seedShortlist(page, SHORTLIST_SEED_VISUAL_REGRESSION, 'dark');
    await page.goto(APP_ENTRY);
    await page.getByRole('tab', { name: /Saved|Opgeslagen/ }).click();
    await expect(page.getByTestId('shortlist-screen')).toBeVisible();

    await expect(page).toHaveScreenshot('saved-screen-mobile-dark.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('[dossier] loaded 390x844 en dark', async ({ page }) => {
    await openSeededDossier(page, undefined, 'dark');
    await expect(page).toHaveScreenshot('dossier-screen-mobile-dark.png', {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('[search] empty 390x844 en dark', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('buurt-check-theme', 'dark');
    });
    await installMockAddressFlow(page);
    await page.goto(APP_ENTRY);
    await expect(page).toHaveScreenshot('search-screen-mobile-dark.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('[compare] three-home 390x844 en dark', async ({ page }) => {
    await seedShortlist(page, SHORTLIST_SEED_VISUAL_REGRESSION, 'dark');
    await page.goto(APP_ENTRY);
    await page.getByRole('tab', { name: /Saved|Opgeslagen/ }).click();
    await expect(page.getByRole('button', { name: /Compare|Vergelijk/ })).toBeVisible();
    await page.getByRole('button', { name: /Compare|Vergelijk/ }).click();
    await expect(page.getByRole('heading', { name: /Compare|Vergelijk/ })).toBeVisible();

    await expect(page).toHaveScreenshot('compare-screen-mobile-dark.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Phase 5 Visual Regression - Desktop Light', () => {
  test.use({
    viewport: { width: 1366, height: 900 },
    colorScheme: 'light',
  });

  test('[search] empty 1366x900 en light', async ({ page }) => {
    await installMockAddressFlow(page);
    await page.goto(APP_ENTRY);
    await expect(page).toHaveScreenshot('search-screen-desktop-light.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
