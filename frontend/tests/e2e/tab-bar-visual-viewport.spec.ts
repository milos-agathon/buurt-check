import { expect, test, devices } from '@playwright/test';

declare global {
  interface Window {
    __setMockVisualViewport?: (metrics: { layoutHeight: number; height: number; offsetTop?: number }) => void;
  }
}

test.use({
  browserName: 'webkit',
  ...devices['iPhone 13'],
});

async function installMockVisualViewport(page: Parameters<typeof test>[0]['page']) {
  await page.addInitScript(() => {
    const target = new EventTarget();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    };

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });

    window.__setMockVisualViewport = ({ layoutHeight, height, offsetTop = 0 }) => {
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        writable: true,
        value: layoutHeight,
      });

      viewport.height = height;
      viewport.offsetTop = offsetTop;
      target.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
    };
  });
}

test.describe('tab bar visual viewport offset', () => {
  test('keeps the tab bar aligned to the visible viewport when browser chrome returns', async ({ page }) => {
    await installMockVisualViewport(page);
    await page.goto('/');

    const layoutHeight = await page.evaluate(() => window.innerHeight);

    await page.evaluate((measuredLayoutHeight) => {
      window.__setMockVisualViewport?.({
        layoutHeight: measuredLayoutHeight,
        height: measuredLayoutHeight - 100,
      });
    }, layoutHeight);

    await page.waitForTimeout(100);

    const geometry = await page.evaluate(() => {
      const bar = document.querySelector('.tab-bar');
      const inner = document.querySelector('.tab-bar__inner');
      const tabs = Array.from(document.querySelectorAll('.tab-bar__tab'));
      const cssVar = getComputedStyle(document.documentElement)
        .getPropertyValue('--viewport-bottom-offset')
        .trim();

      if (!(bar instanceof HTMLElement) || !(inner instanceof HTMLElement)) {
        return null;
      }

      const barRect = bar.getBoundingClientRect();
      const innerRect = inner.getBoundingClientRect();

      return {
        cssVar,
        barBottom: Math.round(barRect.bottom),
        visibleViewportBottom: Math.round(window.innerHeight - Number.parseFloat(cssVar || '0')),
        tabsWithinBar: tabs.every((tab) => {
          if (!(tab instanceof HTMLElement)) {
            return false;
          }

          const rect = tab.getBoundingClientRect();
          return rect.top >= innerRect.top && rect.bottom <= barRect.bottom;
        }),
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry?.cssVar).toBe('100px');
    expect(geometry?.barBottom).toBe(geometry?.visibleViewportBottom);
    expect(geometry?.tabsWithinBar).toBe(true);
  });
});
