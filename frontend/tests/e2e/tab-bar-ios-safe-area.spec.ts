import { expect, test, devices } from '@playwright/test';
import { openSeededDossier } from './helpers/seedState';

interface TabGeometry {
  text: string;
  outsideBarTop: boolean;
  outsideBarBottom: boolean;
  outsideInnerTop: boolean;
  outsideInnerBottom: boolean;
}

test.use({
  browserName: 'webkit',
  ...devices['iPhone 13'],
});

test.describe('iOS tab bar safe-area stability', () => {
  test('keeps every tab inside the bar when the bottom inset grows during dossier scrolling', async ({ page }) => {
    await openSeededDossier(page);

    await page.addStyleTag({
      content: '.tab-bar { padding-bottom: 34px !important; }',
    });
    await page.evaluate(() => {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      if (!(scrollingElement instanceof HTMLElement)) {
        return;
      }

      if (typeof scrollingElement.scrollTo === 'function') {
        scrollingElement.scrollTo({ top: scrollingElement.scrollHeight });
      } else {
        scrollingElement.scrollTop = scrollingElement.scrollHeight;
      }
    });
    await page.waitForTimeout(200);

    const geometry = await page.evaluate(() => {
      const bar = document.querySelector('.tab-bar');
      const inner = document.querySelector('.tab-bar__inner');
      const tabs = Array.from(document.querySelectorAll('.tab-bar__tab'));

      if (!(bar instanceof HTMLElement) || !(inner instanceof HTMLElement)) {
        return null;
      }

      const barRect = bar.getBoundingClientRect();
      const innerRect = inner.getBoundingClientRect();
      const tabBarHeightVar = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--tab-bar-height'),
      );

      return {
        barHeight: barRect.height,
        innerHeight: innerRect.height,
        tabBarHeightVar,
        tabs: tabs.map((tab) => {
          if (!(tab instanceof HTMLElement)) {
            return null;
          }

          const rect = tab.getBoundingClientRect();
          return {
            text: tab.innerText,
            outsideBarTop: rect.top < barRect.top,
            outsideBarBottom: rect.bottom > barRect.bottom,
            outsideInnerTop: rect.top < innerRect.top,
            outsideInnerBottom: rect.bottom > innerRect.bottom,
          };
        }).filter((tab): tab is TabGeometry => tab !== null),
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry?.barHeight).toBeGreaterThan(56);
    expect(Math.round(geometry?.innerHeight ?? 0)).toBe(Math.round(geometry?.tabBarHeightVar ?? 0));

    for (const tab of geometry?.tabs ?? []) {
      expect(tab.outsideBarTop, `${tab.text} escaped above the tab bar`).toBe(false);
      expect(tab.outsideBarBottom, `${tab.text} escaped below the tab bar`).toBe(false);
      expect(tab.outsideInnerTop, `${tab.text} escaped above the inner tab row`).toBe(false);
      expect(tab.outsideInnerBottom, `${tab.text} escaped below the inner tab row`).toBe(false);
    }
  });
});
