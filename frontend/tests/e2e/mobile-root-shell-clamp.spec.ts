import { devices, expect, test } from '@playwright/test';
import {
  DOSSIER_SEED,
  openSeededDossier,
  seedShortlist,
  SHORTLIST_SEED_COMPARE_THREE,
} from './helpers/seedState';

const ACTION_BAR_DOSSIER_SEED = {
  ...DOSSIER_SEED,
  viewingQuestions: {
    address_id: DOSSIER_SEED.viewingQuestions.address_id,
    categories: [
      {
        name: 'Noise',
        name_nl: 'Geluid',
        severity: 'moderate',
        questions: [
          { text_en: 'Can you hear traffic with windows closed?', text_nl: 'Hoor je verkeer met gesloten ramen?' },
          { text_en: 'Do the bedroom windows face the street?', text_nl: 'Kijken de slaapkamerramen uit op straat?' },
          { text_en: 'Are there nightlife venues nearby?', text_nl: 'Zijn er horecazaken of uitgaanslocaties in de buurt?' },
          { text_en: 'Does noise increase during rush hour?', text_nl: 'Neemt het geluid toe tijdens de spits?' },
        ],
      },
      {
        name: 'Climate',
        name_nl: 'Klimaat',
        severity: 'moderate',
        questions: [
          { text_en: 'Is there evidence of summer overheating?', text_nl: 'Is er bewijs van oververhitting in de zomer?' },
          { text_en: 'Can you open windows on opposite facades?', text_nl: 'Kun je ramen openen aan tegenoverliggende gevels?' },
          { text_en: 'Are there shutters, trees, or awnings for shade?', text_nl: 'Zijn er luiken, bomen of zonwering voor schaduw?' },
          { text_en: 'Is rainwater drainage visible around the building?', text_nl: 'Is regenwaterafvoer rondom het gebouw zichtbaar?' },
        ],
      },
    ],
  },
};

test.use({
  browserName: 'webkit',
  ...devices['iPhone 13'],
});

test.describe('mobile root shell clamp', () => {
  test('keeps the search route horizontally clamped at the page shell', async ({ page }) => {
    await page.goto('/#/search');

    const clampState = await page.evaluate(() => {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      if (!(scrollingElement instanceof HTMLElement)) {
        return null;
      }

      window.scrollTo({ left: 80 });
      scrollingElement.scrollLeft = 80;

      return {
        htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        windowScrollX: window.scrollX,
        scrollingElementScrollLeft: scrollingElement.scrollLeft,
      };
    });

    expect(clampState).not.toBeNull();
    expect(clampState?.htmlOverflowX).toBe('hidden');
    expect(clampState?.bodyOverflowX).toBe('hidden');
    expect(clampState?.windowScrollX).toBe(0);
    expect(clampState?.scrollingElementScrollLeft).toBe(0);
  });

  test('keeps the dossier action bar visible from the top of the dossier viewport', async ({ page }) => {
    await openSeededDossier(page, ACTION_BAR_DOSSIER_SEED);
    await expect(page.getByTestId('viewing-checklist')).toBeVisible();
    await expect(page.getByTestId('next-steps')).toBeVisible();

    const actionBar = page.getByTestId('action-bar');
    expect(await actionBar.getAttribute('aria-hidden')).toBeNull();
    await expect(actionBar).toBeInViewport();

    const geometry = await page.evaluate(() => {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      const bar = document.querySelector('[data-testid="action-bar"]');

      if (
        !(scrollingElement instanceof HTMLElement)
        || !(bar instanceof HTMLElement)
      ) {
        return null;
      }

      const rect = bar.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        viewportWidth: window.innerWidth,
        scrollTop: scrollingElement.scrollTop,
        windowScrollX: window.scrollX,
        scrollingElementScrollLeft: scrollingElement.scrollLeft,
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry?.left).toBeGreaterThanOrEqual(-1);
    expect(geometry?.right).toBeLessThanOrEqual((geometry?.viewportWidth ?? 0) + 1);
    expect(geometry?.scrollTop).toBeLessThanOrEqual(1);
    expect(geometry?.windowScrollX).toBe(0);
    expect(geometry?.scrollingElementScrollLeft).toBe(0);

    await page.getByTestId('action-bar-primary').click();
    await expect(page.getByTestId('export-sheet')).toBeVisible();
  });

  test('preserves local compare scrolling without moving the page shell laterally', async ({ page }) => {
    await seedShortlist(page, SHORTLIST_SEED_COMPARE_THREE);
    await page.goto('/');
    await page.getByRole('tab', { name: /Saved|Opgeslagen/ }).click();
    await page.getByRole('button', { name: /Compare|Vergelijk/ }).click();
    await expect(page.getByTestId('compare-screen')).toBeVisible();

    const scrolled = await page.evaluate(() => {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      const container = document.querySelector('.compare-screen__snap-columns');
      const columns = Array.from(document.querySelectorAll('.compare-screen__snap-column'));

      if (
        !(scrollingElement instanceof HTMLElement)
        || !(container instanceof HTMLElement)
        || columns.length < 2
        || !(columns[1] instanceof HTMLElement)
      ) {
        return null;
      }

      container.scrollLeft = columns[1].offsetLeft;
      container.dispatchEvent(new Event('scroll'));

      return {
        containerScrollLeft: container.scrollLeft,
        targetOffsetLeft: columns[1].offsetLeft,
        windowScrollX: window.scrollX,
        scrollingElementScrollLeft: scrollingElement.scrollLeft,
      };
    });

    expect(scrolled).not.toBeNull();

    await expect.poll(async () => {
      return page.locator('.compare-screen__snap-column').nth(1).getAttribute('aria-current');
    }).toBe('true');

    const settledState = await page.evaluate(() => {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      const container = document.querySelector('.compare-screen__snap-columns');
      const liveRegion = document.querySelector('#compare-current-column');

      if (
        !(scrollingElement instanceof HTMLElement)
        || !(container instanceof HTMLElement)
        || !(liveRegion instanceof HTMLElement)
      ) {
        return null;
      }

      return {
        containerScrollLeft: container.scrollLeft,
        liveRegionText: liveRegion.textContent,
        windowScrollX: window.scrollX,
        scrollingElementScrollLeft: scrollingElement.scrollLeft,
      };
    });

    expect(settledState).not.toBeNull();
    expect(settledState?.containerScrollLeft).toBeGreaterThan(0);
    expect(settledState?.liveRegionText ?? '').toContain(SHORTLIST_SEED_COMPARE_THREE[1].address);
    expect(settledState?.windowScrollX).toBe(0);
    expect(settledState?.scrollingElementScrollLeft).toBe(0);
  });
});
