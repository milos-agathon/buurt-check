import { expect, test } from '@playwright/test';
import { installMockAddressFlow } from './helpers/mockApi';
import { DOSSIER_SEED, openSeededDossier, seedDossier } from './helpers/seedState';

test.describe('whole-app performance gates', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  });

  test('[viewer-3d] performance-ready 390x844 en light', async ({ page }) => {
    await openSeededDossier(page, DOSSIER_SEED);

    const viewer = page.getByTestId('viewer-3d');
    await viewer.scrollIntoViewIfNeeded();
    const viewerCanvas = page.getByTestId('viewer-3d-canvas');

    const startedAt = performance.now();
    await expect(viewerCanvas).toHaveAttribute('data-render-state', 'scene-rendered', { timeout: 4_000 });
    const elapsedMs = performance.now() - startedAt;

    const firstMeaningfulRenderMs = Number(await viewerCanvas.getAttribute('data-first-meaningful-render-ms'));
    const surroundingCount = Number(await viewerCanvas.getAttribute('data-surrounding-count'));

    expect(elapsedMs, `3D scene state took ${Math.round(elapsedMs)}ms`).toBeLessThan(4_000);
    expect(firstMeaningfulRenderMs).toBeGreaterThan(0);
    expect(firstMeaningfulRenderMs).toBeLessThan(4_000);
    expect(await viewerCanvas.getAttribute('data-target-rendered')).toBe('true');
    expect(surroundingCount).toBeGreaterThanOrEqual(4);
  });

  test('[viewer-3d] context-loss 390x844 en light', async ({ page }) => {
    await openSeededDossier(page, DOSSIER_SEED);
    await page.getByTestId('viewer-3d').scrollIntoViewIfNeeded();
    const viewerCanvas = page.getByTestId('viewer-3d-canvas');
    await expect(viewerCanvas).toHaveAttribute('data-render-state', 'scene-rendered', { timeout: 20_000 });

    const hadLoseContext = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="viewer-3d-canvas"] canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const extension = gl?.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      extension.loseContext();
      window.setTimeout(() => extension.restoreContext(), 120);
      return true;
    });

    test.skip(!hadLoseContext, 'WEBGL_lose_context is unavailable in this browser context');

    await expect.poll(async () => viewerCanvas.getAttribute('data-context-loss-state'), {
      timeout: 3_000,
    }).toMatch(/lost|restored|fallback/);

    await expect.poll(async () => viewerCanvas.getAttribute('data-context-loss-state'), {
      timeout: 5_000,
    }).toMatch(/restored|fallback/);
  });

  test('[recovery] shared-pack 390x844 en light', async ({ page }) => {
    await installMockAddressFlow(page);
    await seedDossier(page, DOSSIER_SEED);

    let startedAt = performance.now();
    await page.goto(`/?shared-valid=${Date.now()}#/shared-pack/demo-token`);
    await expect(page.getByTestId('pack-view')).toBeVisible();
    let elapsedMs = performance.now() - startedAt;
    expect(elapsedMs, `valid shared pack route took ${Math.round(elapsedMs)}ms`).toBeLessThan(3_000);

    await seedDossier(page, DOSSIER_SEED);
    startedAt = performance.now();
    await page.goto(`/?shared-revoked=${Date.now()}#/shared/revoked-token`);
    await expect(page.getByTestId('shared-prebid-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: /revoked/i })).toBeVisible();
    elapsedMs = performance.now() - startedAt;
    expect(elapsedMs, `shared recovery route took ${Math.round(elapsedMs)}ms`).toBeLessThan(3_000);
  });

  test('[recovery] app-not-found 390x844 en light', async ({ page }) => {
    const startedAt = performance.now();
    await page.goto('/#/unknown/route');
    await expect(page.getByTestId('not-found-screen')).toBeVisible();
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs, `not-found route took ${Math.round(elapsedMs)}ms`).toBeLessThan(2_000);
  });
});
