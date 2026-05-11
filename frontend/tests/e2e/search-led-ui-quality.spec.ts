import { expect, test, type Page } from '@playwright/test';
import { installMockAddressFlow } from './helpers/mockApi';
import { DOSSIER_SEED, openSeededDossier, seedDossier } from './helpers/seedState';

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      viewport: window.innerWidth,
      documentWidth: root.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    };
  });

  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function openQuestionsPack(page: Page) {
  await page.evaluate(() => {
    window.location.hash = '#/pack/0363010000696734/report-1';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

test.describe('search-led UI quality gates', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  });

  test('[prebid] loading 390x844 en light', async ({ page }) => {
    let sourceRequestsAfterSelection = 0;
    page.on('request', (request) => {
      const url = request.url();
      if (
        url.includes('/api/address/')
        && !url.includes('/suggest')
        && !url.includes('/lookup')
      ) {
        sourceRequestsAfterSelection += 1;
      }
    });

    await installMockAddressFlow(page);
    await page.goto('/#/search');
    await page.getByRole('combobox').fill('Keizersgracht 100 Amsterdam');
    await page.getByRole('option').first().click();

    await expect(page.getByTestId('prebid-address-confirmation')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Confirm the property/i })).toHaveCount(0);
    await expect(page.locator('.address-header')).toBeVisible({ timeout: 20_000 });
    expect(sourceRequestsAfterSelection).toBeGreaterThan(0);
    await expect(page.getByTestId('prebid-briefing-panel')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Open source coverage/i })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
  });

  test('[prebid] source-coverage 390x844 en light', async ({ page }) => {
    await installMockAddressFlow(page);
    await openSeededDossier(page);

    await expect(page.getByTestId('prebid-briefing-panel')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Open source coverage/i })).toHaveCount(0);

    await openQuestionsPack(page);
    await expect(page.getByTestId('pack-view')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Pre-Bid Evidence & Questions Pack/i })).toBeVisible();
    await expect(page.getByText(/Bilingual questions by recipient/i)).toBeVisible();
    await page.getByRole('button', { name: /Open evidence detail/i }).first().click();
    const detail = page.getByTestId('verification-action-detail');
    await expect(detail).toBeVisible();
    await expect(detail.getByText(/Why it matters/i)).toBeVisible();
    await expect(detail.getByText(/Ask this/i)).toBeVisible();
    await expect(detail.getByText(/Who to ask/i)).toBeVisible();
    await expect(detail.getByText(/Limitation/i)).toBeVisible();
    await page.getByRole('button', { name: /Close/i }).click();

    await page.getByRole('button', { name: /Show source appendix/i }).click();
    const coverage = page.getByTestId('source-coverage-panel');
    await expect(coverage).toBeVisible();
    await expect(coverage.getByText(/RIVM|Klimaateffectatlas|CBS|BAG/).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Full Dossier|Volledig dossier|10\+ pages/);
    await assertNoHorizontalOverflow(page);
  });

  test('[export] share-recovery 390x844 en light', async ({ page }) => {
    await installMockAddressFlow(page);
    await openSeededDossier(page);
    await openQuestionsPack(page);
    await expect(page.getByTestId('pack-view')).toBeVisible();

    await page.getByRole('button', { name: /Share pack/i }).click();
    await expect(page.getByTestId('share-pack-sheet')).toBeVisible();
    await expect(page.getByText(/does not expose a raw report ID/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Copy scoped link/i })).toBeVisible();
    await page.getByRole('button', { name: /Close/i }).click();

    await page.getByRole('button', { name: /Delete or revoke/i }).click();
    await expect(page.getByText(/Deleted/i)).toBeVisible();

    await seedDossier(page, DOSSIER_SEED);
    await page.goto(`/?shared-recovery=${Date.now()}#/shared-pack/deleted-token`);
    await expect(page.getByTestId('shared-prebid-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: /deleted/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Search an address/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open saved homes/i })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('[recovery] app-unknown 390x844 en light', async ({ page }) => {
    await page.goto('/#/missing/route');
    await expect(page.getByTestId('not-found-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: /We could not find that page/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Search an address/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open saved homes/i })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
