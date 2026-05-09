import { expect, test, type Page } from '@playwright/test';
import { installMockAddressFlow } from './helpers/mockApi';

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      viewport: window.innerWidth,
      documentWidth: root.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      scrollX: window.scrollX,
    };
  });

  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.scrollX).toBe(0);
}

async function openSuggestions(page: Page) {
  await installMockAddressFlow(page);
  await page.goto('/#/search');
  await page.getByRole('combobox').fill('Keizersgracht 100 Amsterdam');
  await expect(page.getByRole('option')).toHaveCount(3);
}

test.describe('search route geometry gates', () => {
  const viewports = [
    { name: 'narrow-mobile', width: 320, height: 700 },
    { name: 'standard-mobile', width: 390, height: 844 },
    { name: 'large-mobile-dutch', width: 430, height: 932, language: 'nl' },
    { name: 'tablet-portrait', width: 768, height: 1024 },
    { name: 'tablet-landscape', width: 1024, height: 768 },
    { name: 'compact-desktop', width: 1024, height: 900 },
    { name: 'medium-desktop', width: 1180, height: 900 },
    { name: 'large-desktop', width: 1440, height: 1100 },
  ];

  for (const viewport of viewports) {
    test(`[search] suggestions-${viewport.name} ${viewport.width}x${viewport.height} ${viewport.language ?? 'en'} light`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (viewport.language) {
        await page.addInitScript((language) => {
          window.localStorage.setItem('i18nextLng', language);
        }, viewport.language);
      }

      await openSuggestions(page);
      await assertNoHorizontalOverflow(page);

      const geometry = await page.evaluate(() => {
        const input = document.querySelector('.address-search__input')?.getBoundingClientRect() ?? null;
        const list = document.querySelector('#address-suggestions')?.getBoundingClientRect() ?? null;
        const nav = document.querySelector('.tab-bar')?.getBoundingClientRect() ?? null;
        const evidence = document.querySelector('.address-search__desktop-evidence')?.getBoundingClientRect() ?? null;
        const options = Array.from(document.querySelectorAll('[role="option"]')).map((node) =>
          node.getBoundingClientRect(),
        );

        return {
          inputBottom: input?.bottom ?? null,
          listTop: list?.top ?? null,
          listBottom: list?.bottom ?? null,
          listLeft: list?.left ?? null,
          listRight: list?.right ?? null,
          navTop: nav?.top ?? window.innerHeight,
          evidenceVisible: evidence ? evidence.width > 64 && evidence.height > 64 : false,
          optionHeights: options.map((rect) => rect.height),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      });

      expect(geometry.inputBottom).not.toBeNull();
      expect(geometry.listTop).not.toBeNull();
      expect(geometry.listBottom).not.toBeNull();
      expect(geometry.listLeft).toBeGreaterThanOrEqual(0);
      expect(geometry.listRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
      if (viewport.width < 960) {
        expect(geometry.listTop).toBeGreaterThanOrEqual((geometry.inputBottom ?? 0) - 1);
      }
      expect(geometry.listBottom).toBeLessThanOrEqual(Math.min(geometry.navTop, geometry.viewportHeight) + 1);
      expect(geometry.optionHeights.every((height) => height >= 44)).toBe(true);

      if (viewport.width >= 1024) {
        expect(geometry.evidenceVisible).toBe(true);
      }
    });
  }

  test('[search] navigation 390x844 en light', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/search');

    const selectedTabs = page.locator('.tab-bar__tab--active[aria-selected="true"]');
    await expect(selectedTabs).toHaveCount(1);
    await expect(selectedTabs).toContainText(/Search|Zoeken/);
  });

  test('[search] forced-colors 390x844 en forced-colors', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.setViewportSize({ width: 390, height: 844 });
    await openSuggestions(page);

    await expect(page.getByRole('combobox')).toBeVisible();
    await expect(page.getByRole('option').first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
