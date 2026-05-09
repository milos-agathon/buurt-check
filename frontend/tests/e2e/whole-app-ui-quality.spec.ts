import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  DOSSIER_SEED,
  openSeededDossier,
  seedShortlist,
  SHORTLIST_SEED_COMPARE_THREE,
} from './helpers/seedState';

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

async function distinctVisibleColors(locator: Locator) {
  const buffer = await locator.screenshot({ animations: 'disabled' });
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors = new Set<string>();
  const stride = Math.max(1, Math.floor((info.width * info.height) / 8000));

  for (let pixel = 0; pixel < info.width * info.height; pixel += stride) {
    const index = pixel * 4;
    const alpha = data[index + 3];
    if (alpha === 0) continue;
    colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
    if (colors.size > 12) break;
  }

  return colors.size;
}

test.describe('whole-app route-family UI gates', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  });

  test('[minimalist] metadata 390x844 en light', async () => {
    const grammar = /^\[(search|prebid|risk-card|risk-detail|dossier|viewer-3d|saved|compare|export|settings|legal|consent|recovery|landing|accessibility|minimalist)\] [a-z0-9-]+ [0-9]{3,4}x[0-9]{3,4} (en|nl) (light|dark|forced-colors|reduced-motion)$/;
    const screenshotPrefixes: Record<string, string> = {
      search: 'search-',
      prebid: 'prebid-',
      'risk-card': 'risk-card-',
      'risk-detail': 'risk-detail-',
      dossier: 'dossier-',
      'viewer-3d': 'viewer-3d-',
      saved: 'saved-',
      compare: 'compare-',
      export: 'export-',
      settings: 'settings-',
      legal: 'legal-',
      consent: 'consent-',
      recovery: 'recovery-',
      landing: 'landing-',
      accessibility: 'accessibility-',
      minimalist: 'minimalist-',
    };
    const specPaths = [
      'tests/e2e/visual-regression.spec.ts',
      'tests/e2e/whole-app-ui-quality.spec.ts',
      'tests/e2e/whole-app-performance.spec.ts',
      'tests/e2e/search-ui-geometry.spec.ts',
      'tests/e2e/search-led-ui-quality.spec.ts',
      'tests/e2e/search-led-performance.spec.ts',
      'tests/e2e/dossier-section-order.spec.ts',
      'tests/e2e/stripe-return-download.spec.ts',
      'tests/e2e/landing-page.spec.ts',
    ];

    const violations: string[] = [];
    for (const specPath of specPaths) {
      const source = readFileSync(resolve(process.cwd(), specPath), 'utf-8');
      const literalTitleMatches = source.matchAll(/\btest\(\s*(['"`])([^'"`$]+)\1/g);
      for (const match of literalTitleMatches) {
        const title = match[2];
        if (!grammar.test(title)) {
          violations.push(`${specPath}: noncanonical title "${title}"`);
        }
      }

      const screenshotMatches = source.matchAll(/test\(\s*['"`]([^'"`]+)['"`][\s\S]*?toHaveScreenshot\(\s*['"`]([^'"`]+)['"`]/g);
      for (const match of screenshotMatches) {
        const [, title, screenshotName] = match;
        const family = title.match(/^\[([^\]]+)\]/)?.[1];
        const prefix = family ? screenshotPrefixes[family] : undefined;
        if (!prefix || !screenshotName.startsWith(prefix)) {
          violations.push(`${specPath}: screenshot "${screenshotName}" does not match title "${title}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('[risk-card] source-aware 390x844 en light', async ({ page }) => {
    await openSeededDossier(page, DOSSIER_SEED);

    await expect(page.locator('.risk-tile')).toHaveCount(3);
    await expect(page.getByTestId('risk-tile-noise')).toContainText(/Source|RIVM/i);
    await expect(page.getByTestId('risk-tile-air')).toBeVisible();
    await expect(page.getByTestId('risk-tile-climate')).toBeVisible();
    await expect(page.getByTestId('risk-tile-sunlight')).toHaveCount(0);

    await page.getByTestId('risk-tile-noise').click();
    await expect(page.getByTestId('risk-detail-noise')).toBeVisible();
    await expect(page.getByTestId('risk-detail-noise')).toContainText(/Hoor je verkeer|Can you hear traffic/i);
    await expect(page.getByTestId('risk-detail-noise')).toContainText(/Bron|Source/i);
    await page.keyboard.press('Escape');

    const viewer = page.getByTestId('viewer-3d');
    await viewer.scrollIntoViewIfNeeded();
    const viewerCanvas = page.getByTestId('viewer-3d-canvas');
    await expect(viewerCanvas).toHaveAttribute('data-render-state', 'scene-rendered', { timeout: 20_000 });
    await expect(viewerCanvas).toHaveAttribute('data-target-rendered', 'true');

    const surroundingCount = Number(await viewerCanvas.getAttribute('data-surrounding-count'));
    expect(surroundingCount).toBeGreaterThanOrEqual(4);
    expect(await distinctVisibleColors(viewerCanvas)).toBeGreaterThan(4);
    await assertNoHorizontalOverflow(page);
  });

  test('[saved] populated 390x844 en light', async ({ page }) => {
    await seedShortlist(page, SHORTLIST_SEED_COMPARE_THREE);
    await page.goto('/#/search');

    await page.getByRole('tab', { name: /Saved|Opgeslagen/ }).click();
    await expect(page.getByTestId('shortlist-screen')).toBeVisible();
    await expect(page.getByRole('button', { name: /Compare|Vergelijk/ })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.getByRole('button', { name: /Compare|Vergelijk/ }).click();
    await expect(page.getByTestId('compare-screen')).toBeVisible();
    await expect(page.locator('.compare-screen__snap-column')).toHaveCount(3);
    await assertNoHorizontalOverflow(page);

    await page.getByRole('button', { name: /Settings|Instellingen/ }).click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    await expect(
      page.locator('.settings-screen__label').filter({ hasText: /^(Language|Taal)$/ }),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await openSeededDossier(page, DOSSIER_SEED);
    await page.getByTestId('action-bar-primary').click();
    const exportSheet = page.getByTestId('export-sheet');
    await expect(exportSheet).toBeVisible();
    await expect(exportSheet).toContainText(/Full dossier/i);
    await expect(page.locator('body')).not.toContainText(/Pre-Bid Evidence & Questions Pack|Questions Pack|10\+ pages/);
    await assertNoHorizontalOverflow(page);
  });

  test('[accessibility] forced-colors 390x844 en forced-colors', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/#/missing/route');
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });

    await expect(page.getByTestId('not-found-screen')).toBeVisible();
    await expect(page.getByRole('button', { name: /Search an address/i })).toBeVisible();
  });

  test('[recovery] static-404 390x844 en light', async ({ page }) => {
    await page.goto('/404.html');

    await expect(page.getByRole('heading', { name: /could not find|niet vinden/i }).first()).toBeVisible();
    await expect(page.locator('a[href="/privacy.html"]').first()).toBeVisible();
    await expect(page.locator('a[href="/terms.html"]').first()).toBeVisible();
    await expect(page.locator('a[href^="mailto:"]').first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
