import { expect, test } from '@playwright/test';
import { installMockAddressFlow } from './helpers/mockApi';

/**
 * E2E integration test: dossier section order (v7 canonical).
 *
 * Complements the unit-level test in App.test.tsx which uses mocked components.
 * This test uses real rendered components against the live backend.
 *
 * v7 canonical order:
 *   AttentionSummary → combined AddressHeader/BuildingFacts → RiskTiles →
 *   Livability → 3D Viewer → NeighborhoodStats → ViewingChecklist → ActionBar
 *
 * Not all sections may render (3D/sunlight depend on 3DBAG availability).
 * The test verifies that whichever sections DO appear maintain correct
 * relative DOM order — no section appears before a section that should precede it.
 *
 * NOTE: Uses compareDocumentPosition (DOM tree order), NOT bounding-box y.
 * Bounding-box assertions break with fixed/sticky elements (e.g., ActionBar).
 */

// Map from selector to canonical position index
const CANONICAL_ORDER: { selector: string; name: string }[] = [
  { selector: '[data-testid="attention-summary"]', name: 'AttentionSummary' },
  { selector: '.building-card', name: 'BuildingFacts' },
  { selector: '.risk-tiles-grid', name: 'RiskTiles' },
  { selector: '[data-testid="livability-card"]', name: 'LivabilityCard' },
  { selector: '.viewer-3d', name: '3DViewer' },
  { selector: '.neighborhood-card', name: 'NeighborhoodStats' },
  { selector: '[data-testid="viewing-checklist"]', name: 'ViewingChecklist' },
  { selector: '[data-testid="action-bar"]', name: 'ActionBar' },
];

test.use({
  viewport: { width: 390, height: 844 },
  colorScheme: 'light',
});

test('[dossier] canonical-order 390x844 en light', async ({ page }) => {
  await installMockAddressFlow(page);
  await page.goto('/');

  // Select an address
  await page.locator('input.address-search__input').fill('Kalverstraat 1 Amsterdam');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();

  // Wait for the dossier to load — BuildingFacts is the first data-dependent section
  await expect(page.locator('.building-card').first()).toBeVisible({ timeout: 30000 });

  // Give additional time for async sections to stream in
  // (risk cards, neighborhood stats, property warnings, livability)
  await page.waitForTimeout(5000);

  // Find the dossier sheet container
  const dossier = page.locator('[data-testid="dossier-sheet"]');
  await expect(dossier).toBeVisible();

  // Collect all present (visible) sections
  const presentSections: { name: string; canonicalIndex: number }[] = [];

  for (let i = 0; i < CANONICAL_ORDER.length; i++) {
    const { selector, name } = CANONICAL_ORDER[i];
    const locator = dossier.locator(selector).first();
    const count = await locator.count();
    if (count > 0 && await locator.isVisible()) {
      presentSections.push({ name, canonicalIndex: i });
    }
  }

  // Must have at least 5 sections rendered to make a meaningful order assertion
  // (combined AddressHeader/BuildingFacts, and a few async sections)
  expect(presentSections.length).toBeGreaterThanOrEqual(5);

  // Verify sections are in canonical order by checking DOM tree order
  // via compareDocumentPosition (immune to fixed/sticky positioning)
  for (let j = 1; j < presentSections.length; j++) {
    const prev = presentSections[j - 1];
    const curr = presentSections[j];

    // Canonical index must be increasing (sections don't appear out of order)
    expect(curr.canonicalIndex).toBeGreaterThan(prev.canonicalIndex);

    // DOM order: prev section must precede curr section in the document tree
    const prevSelector = CANONICAL_ORDER[prev.canonicalIndex].selector;
    const currSelector = CANONICAL_ORDER[curr.canonicalIndex].selector;

    const isBeforeInDom = await dossier.evaluate(
      (container, [sel1, sel2]) => {
        const el1 = container.querySelector(sel1);
        const el2 = container.querySelector(sel2);
        if (!el1 || !el2) return false;
        // DOCUMENT_POSITION_FOLLOWING (4) means el2 follows el1 in DOM
        return (el1.compareDocumentPosition(el2) & 4) !== 0;
      },
      [prevSelector, currSelector] as [string, string],
    );

    expect(isBeforeInDom,
      `Expected ${prev.name} to appear before ${curr.name} in DOM order`,
    ).toBe(true);
  }
});
