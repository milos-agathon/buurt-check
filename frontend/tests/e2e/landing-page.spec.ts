import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

const APP_URL = process.env.BUURTCHECK_LANDING_APP_URL ?? 'http://127.0.0.1:5173/#/search';
const LANDING_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'landing');
const require = createRequire(import.meta.url);
const AXE_SOURCE_PATH = require.resolve('axe-core/axe.min.js');

type LandingEvent = {
  name: string;
  payload: Record<string, string | number>;
};

type LandingGeometry = {
  viewport_width_px: number;
  viewport_height_px: number;
  nav_height_px: number | null;
  nav_bottom_px: number | null;
  visible_hero_real_estate_px: number | null;
  hero_preview_top_px: number | null;
  hero_preview_bottom_px: number | null;
  hero_preview_visible_height_px: number | null;
  nav_cta_left_px: number | null;
  nav_cta_right_px: number | null;
  nav_cta_top_px: number | null;
  nav_cta_bottom_px: number | null;
  nav_link_rects: Array<{
    text: string;
    top: number;
    bottom: number;
    left: number;
    right: number;
  }>;
  nav_height_token_value: string;
};

async function getGridColumnCount(page: Page, selector: string) {
  return page.locator(selector).evaluate((node) =>
    getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
  );
}

async function getElementHeight(page: Page, selector: string) {
  return page.locator(selector).evaluate((node) => Math.round(node.getBoundingClientRect().height));
}

async function getComputedNumber(page: Page, selector: string, property: keyof CSSStyleDeclaration) {
  return page.locator(selector).evaluate(
    (node, styleProperty) => Number.parseFloat(getComputedStyle(node)[styleProperty]),
    property,
  );
}

async function getGridColumnWidths(page: Page, selector: string) {
  return page.locator(selector).evaluate((node) =>
    getComputedStyle(node).gridTemplateColumns
      .split(/\s+/)
      .map((value) => Number.parseFloat(value))
      .filter((value) => Number.isFinite(value)),
  );
}

async function getRect(page: Page, selector: string) {
  return page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      bottom: Math.round(rect.bottom),
      top: Math.round(rect.top),
    };
  });
}

async function readLandingGeometry(page: Page): Promise<LandingGeometry> {
  return page.evaluate(() => {
    const nav = document.querySelector('.nav')?.getBoundingClientRect() ?? null;
    const preview = document.querySelector('.hero__preview')?.getBoundingClientRect() ?? null;
    const navCta = document.querySelector('.nav__cta')?.getBoundingClientRect() ?? null;

    return {
      viewport_width_px: window.innerWidth,
      viewport_height_px: window.innerHeight,
      nav_height_px: nav ? Math.round(nav.height) : null,
      nav_bottom_px: nav ? Math.round(nav.bottom) : null,
      visible_hero_real_estate_px: nav ? window.innerHeight - Math.round(nav.bottom) : null,
      hero_preview_top_px: preview ? Math.round(preview.top) : null,
      hero_preview_bottom_px: preview ? Math.round(preview.bottom) : null,
      hero_preview_visible_height_px: preview
        ? Math.max(0, Math.min(window.innerHeight, Math.round(preview.bottom)) - Math.max(0, Math.round(preview.top)))
        : null,
      nav_cta_left_px: navCta ? Math.round(navCta.left) : null,
      nav_cta_right_px: navCta ? Math.round(navCta.right) : null,
      nav_cta_top_px: navCta ? Math.round(navCta.top) : null,
      nav_cta_bottom_px: navCta ? Math.round(navCta.bottom) : null,
      nav_link_rects: Array.from(document.querySelectorAll('.nav__controls .nav__cta')).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      }),
      nav_height_token_value: getComputedStyle(document.documentElement)
        .getPropertyValue('--landing-nav-height')
        .trim(),
    };
  });
}

test('renders the PRD section order and preserves CTA/legal routes', async ({ page }) => {
  await page.goto('/');

  const sectionOrder = await page.locator('main > [id]').evaluateAll((nodes) =>
    nodes.map((node) => node.id),
  );
  expect(sectionOrder).toEqual([
    'hero',
    'differentiators',
    'how-it-works',
    'showcase',
    'pricing',
    'trust',
    'faq',
    'final-cta',
  ]);

  const ctaHrefs = await page.locator('[data-cta-placement]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('href')),
  );
  expect(ctaHrefs).toEqual([APP_URL, APP_URL, APP_URL, APP_URL]);

  await expect(page.locator('.nav__brand')).toBeVisible();
  await expect(page.locator('footer a[href="/privacy.html"]')).toBeVisible();
  await expect(page.locator('footer a[href="/terms.html"]')).toBeVisible();
  await expect(page.locator('footer a[href*="mailto:"]')).toBeVisible();

  const isDesktop = test.info().project.name === 'desktop';
  expect(await getGridColumnCount(page, '.hero__layout')).toBe(isDesktop ? 2 : 1);
  expect(await getGridColumnCount(page, '.differentiators__grid')).toBe(isDesktop ? 2 : 1);
  expect(await getGridColumnCount(page, '.steps')).toBe(isDesktop ? 3 : 1);
});

test('keeps key hierarchy ratios and spacing rules aligned with the PRD', async ({ page }) => {
  await page.goto('/');

  const isDesktop = test.info().project.name === 'desktop';
  const differentiatorColumns = await getGridColumnWidths(page, '.differentiators__grid');
  expect(differentiatorColumns).toHaveLength(isDesktop ? 2 : 1);

  if (isDesktop) {
    const ratio = differentiatorColumns[0] / (differentiatorColumns[0] + differentiatorColumns[1]);
    expect(ratio).toBeGreaterThan(0.56);
    expect(ratio).toBeLessThan(0.60);
  }

  const priceSize = await getComputedNumber(page, '.pricing-card__price', 'fontSize');
  const pricingSupportSize = await getComputedNumber(page, '.pricing-card__label', 'fontSize');
  expect(priceSize / pricingSupportSize).toBeGreaterThanOrEqual(isDesktop ? 1.75 : 1.5);

  expect(await getComputedNumber(page, '.final-cta', 'paddingTop')).toBe(isDesktop ? 80 : 48);
  expect(await getComputedNumber(page, '.final-cta', 'paddingBottom')).toBe(isDesktop ? 80 : 48);

  const heroCtaRect = await getRect(page, '.hero__cta');
  const heroBadgeRect = await getRect(page, '.hero__badge');
  expect(heroBadgeRect.top).toBeGreaterThanOrEqual(heroCtaRect.bottom);
});

test('persists language selection and swaps visible content in place', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.locator('.hero__title [data-lang="nl"]')).toBeVisible();
  await expect(page.locator('.hero__title [data-lang="en"]')).toBeHidden();
  await expect(page.locator('.hero__preview img[data-lang="nl"]')).toBeVisible();
  await expect(page.locator('.hero__preview img[data-lang="en"]')).toBeHidden();
  await expect(page.locator('.hero__preview img[data-lang="nl"]')).toHaveAttribute('src', 'og-image.svg');

  await page.locator('button[data-language-choice="en"]').click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('body')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.hero__title [data-lang="en"]')).toBeVisible();
  await expect(page.locator('.hero__title [data-lang="nl"]')).toBeHidden();
  await expect(page.locator('.hero__subtitle [data-lang="en"]')).toBeVisible();
  await expect(page.locator('.hero__subtitle [data-lang="nl"]')).toBeHidden();
  await expect(page.locator('.pricing-card__price [data-lang="en"]')).toContainText('€3.99');
  await expect(page.locator('.pricing-card__price [data-lang="nl"]')).toBeHidden();
  await expect(page.locator('.hero__preview img[data-lang="en"]')).toBeVisible();
  await expect(page.locator('.hero__preview img[data-lang="nl"]')).toBeHidden();
  await expect(page.locator('.hero__preview img[data-lang="en"]')).toHaveAttribute('src', 'og-image-en.svg');

  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.hero__title [data-lang="en"]')).toBeVisible();
  await expect(page.locator('.hero__preview img[data-lang="en"]')).toBeVisible();

  const storedLanguage = await page.evaluate(() => localStorage.getItem('buurtcheck_lang'));
  expect(storedLanguage).toBe('en');
});

test('offers a working skip link and keeps smooth scrolling enabled by default', async ({ page }) => {
  await page.goto('/');

  const scrollBehavior = await page.locator('html').evaluate((node) => getComputedStyle(node).scrollBehavior);
  expect(scrollBehavior).toBe('smooth');

  await page.keyboard.press('Tab');
  const skipLink = page.locator('[data-skip-link]');
  await expect(skipLink).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('keeps the FAQ collapsed by default and supports keyboard-only accordion control', async ({ page }) => {
  await page.goto('/');
  await page.locator('#faq').scrollIntoViewIfNeeded();

  const faqButtons = page.locator('[data-faq-trigger]');
  const faqPanels = page.locator('.faq-item__panel');

  await expect(faqButtons).toHaveCount(4);
  await expect(faqPanels).toHaveCount(4);

  for (let index = 0; index < 4; index += 1) {
    await expect(faqButtons.nth(index)).toHaveAttribute('aria-expanded', 'false');
    await expect(faqPanels.nth(index)).toHaveAttribute('aria-hidden', 'true');
  }

  await faqButtons.nth(0).focus();
  await expect(faqButtons.nth(0)).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(faqButtons.nth(0)).toHaveAttribute('aria-expanded', 'true');
  await expect(faqPanels.nth(0)).toHaveAttribute('aria-hidden', 'false');

  await page.keyboard.press('ArrowDown');
  await expect(faqButtons.nth(1)).toBeFocused();

  await page.keyboard.press('Space');
  await expect(faqButtons.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await expect(faqPanels.nth(1)).toHaveAttribute('aria-hidden', 'false');
  await expect(faqButtons.nth(0)).toHaveAttribute('aria-expanded', 'false');
  await expect(faqPanels.nth(0)).toHaveAttribute('aria-hidden', 'true');

  await page.keyboard.press('ArrowUp');
  await expect(faqButtons.nth(0)).toBeFocused();

  await page.keyboard.press('End');
  await expect(faqButtons.nth(3)).toBeFocused();

  await page.keyboard.press('Home');
  await expect(faqButtons.nth(0)).toBeFocused();
});

test('keeps sticky-nav controls keyboard reachable and records landing analytics events', async ({ page }) => {
  await page.goto('/');

  expect(await getElementHeight(page, 'button[data-language-choice="nl"]')).toBeGreaterThanOrEqual(44);
  expect(await getElementHeight(page, 'button[data-language-choice="en"]')).toBeGreaterThanOrEqual(44);

  await page.keyboard.press('Tab');
  await expect(page.locator('[data-skip-link]')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.locator('.nav__brand')).toBeFocused();

  await page.keyboard.press('Tab');
  const nlButton = page.locator('button[data-language-choice="nl"]');
  const enButton = page.locator('button[data-language-choice="en"]');
  await expect(nlButton).toBeFocused();
  await expect(nlButton).toHaveAttribute('aria-checked', 'true');
  await expect(nlButton).toHaveAttribute('tabindex', '0');
  await expect(enButton).toHaveAttribute('tabindex', '-1');

  await page.evaluate(() => {
    (window as Window & { __landingAnalyticsEvents: LandingEvent[] }).__landingAnalyticsEvents = [];
  });

  await page.keyboard.press('ArrowRight');
  await expect(enButton).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('body')).toHaveAttribute('lang', 'en');
  await expect(enButton).toHaveAttribute('aria-checked', 'true');
  await expect(enButton).toHaveAttribute('tabindex', '0');
  await expect(nlButton).toHaveAttribute('aria-checked', 'false');
  await expect(nlButton).toHaveAttribute('tabindex', '-1');

  await page.keyboard.press('Home');
  await expect(nlButton).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.locator('body')).toHaveAttribute('lang', 'nl');
  await expect(nlButton).toHaveAttribute('aria-checked', 'true');
  await expect(nlButton).toHaveAttribute('tabindex', '0');

  await page.keyboard.press('Tab');
  await expect(page.locator('.nav__cta')).toBeFocused();

  await expect(page.locator('.nav__controls .nav__cta')).toHaveCount(1);

  await page.locator('#pricing').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.locator('#faq').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);

  await page.locator('a[data-cta-placement="hero"]').evaluate((node) => {
    node.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await page.locator('a[data-cta-placement="hero"]').click();

  const events = await page.evaluate(() =>
    (window as Window & { __landingAnalyticsEvents: LandingEvent[] }).__landingAnalyticsEvents,
  );
  const eventNames = events.map((event) => event.name);

  expect(eventNames).toContain('landing_language_toggle');
  expect(eventNames).toContain('landing_section_view');
  expect(eventNames).toContain('landing_cta_click');

  const sectionViews = events
    .filter((event) => event.name === 'landing_section_view')
    .map((event) => event.payload.section);
  expect(sectionViews).toEqual(expect.arrayContaining(['pricing', 'faq']));

  const heroClick = events.find(
    (event) => event.name === 'landing_cta_click' && event.payload.placement === 'hero',
  );
  expect(heroClick?.payload.href).toBe(APP_URL);

  const languageToggle = events.find(
    (event) => event.name === 'landing_language_toggle' && event.payload.to === 'en',
  );
  expect(languageToggle?.payload.from).toBe('nl');
});

test('keeps the mobile CTA visible in the fixed header row and exposes the hero preview on first load', async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile first-load geometry is only asserted on the mobile project');
  await page.goto('/');

  const after = await readLandingGeometry(page);

  if (
    after.nav_bottom_px === null ||
    after.nav_cta_left_px === null ||
    after.nav_cta_right_px === null ||
    after.nav_cta_top_px === null ||
    after.nav_cta_bottom_px === null ||
    after.hero_preview_top_px === null ||
    after.hero_preview_visible_height_px === null
  ) {
    throw new Error('Landing geometry probe did not find the nav CTA or hero preview');
  }

  expect(after.nav_cta_left_px).toBeGreaterThanOrEqual(0);
  expect(after.nav_cta_right_px).toBeLessThanOrEqual(after.viewport_width_px);
  expect(after.nav_cta_top_px).toBeGreaterThanOrEqual(0);
  expect(after.nav_cta_bottom_px).toBeLessThanOrEqual(after.nav_bottom_px);
  expect(after.hero_preview_top_px).toBeLessThan(after.viewport_height_px);
  expect(after.hero_preview_visible_height_px).toBeGreaterThanOrEqual(96);

  const controlsStyle = await page.locator('.nav__controls').evaluate((node) => {
    const style = getComputedStyle(node);
    return { display: style.display, gap: style.gap };
  });
  expect(controlsStyle.display).toContain('flex');
  const navHeaderLayout = await page.evaluate(() => {
    const brand = document.querySelector('.nav__brand')?.getBoundingClientRect() ?? null;
    const controls = document.querySelector('.nav__controls')?.getBoundingClientRect() ?? null;
    const brandLockup = document.querySelector('.nav__brand-lockup');
    const brandMark = document.querySelector('.nav__brand-mark');

    return {
      brandRight: brand ? Math.round(brand.right) : null,
      controlsLeft: controls ? Math.round(controls.left) : null,
      lockupDisplay: brandLockup ? getComputedStyle(brandLockup).display : null,
      markDisplay: brandMark ? getComputedStyle(brandMark).display : null,
    };
  });
  expect(navHeaderLayout.lockupDisplay).not.toBe('none');
  expect(navHeaderLayout.markDisplay).toBe('none');
  expect(navHeaderLayout.brandRight).not.toBeNull();
  expect(navHeaderLayout.controlsLeft).not.toBeNull();
  expect(navHeaderLayout.brandRight).toBeLessThanOrEqual(navHeaderLayout.controlsLeft!);
  expect(await getElementHeight(page, '.nav__cta')).toBeGreaterThanOrEqual(44);
  await expect(page.locator('.nav__controls .nav__cta')).toHaveCount(1);
  expect(
    after.nav_link_rects.every((rect) => after.nav_cta_top_px !== null && Math.abs(rect.top - after.nav_cta_top_px) <= 4),
  ).toBe(true);

  const languageButtonHeights = await page.locator('button[data-language-choice]').evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
  );
  expect(languageButtonHeights.every((height) => height >= 44)).toBe(true);
});

test('places the dossier showcase before pricing and renders all showcase cards', async ({ page }) => {
  await page.goto('/');

  const sectionOrder = await page.locator('main > [id]').evaluateAll((nodes) =>
    nodes.map((node) => node.id),
  );
  expect(sectionOrder.indexOf('showcase')).toBeGreaterThan(-1);
  expect(sectionOrder.indexOf('showcase')).toBeLessThan(sectionOrder.indexOf('pricing'));

  const showcase = page.locator('#showcase');
  await expect(showcase).toBeVisible();
  await expect(showcase.locator('.showcase-card')).toHaveCount(3);
  await expect(showcase.locator('img[alt="Buurt Check risk comparison dossier page"]')).toBeVisible();
  await expect(showcase.locator('img[alt="Buurt Check shadow analysis dossier page"]')).toBeVisible();
  await expect(showcase.locator('img[alt="Buurt Check neighborhood context dossier page"]')).toBeVisible();
});

test('bootstraps Google Analytics 4 when a measurement id is configured', async ({ page }) => {
  await page.route('https://www.googletagmanager.com/gtag/js*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: '',
    });
  });

  await page.addInitScript(() => {
    (
      window as Window & {
        BUURTCHECK_GA_MEASUREMENT_ID?: string;
      }
    ).BUURTCHECK_GA_MEASUREMENT_ID = 'G-TEST1234';
  });

  await page.goto('/');

  await page.locator('a[data-cta-placement="hero"]').evaluate((node) => {
    node.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await page.locator('a[data-cta-placement="hero"]').click();

  const gaState = await page.evaluate(() => {
    const win = window as Window & {
      __landingGaMeasurementId?: string;
      dataLayer?: Array<ArrayLike<unknown>>;
    };
    const providerScript = document.querySelector('script[data-analytics-provider="google-analytics"]');
    const dataLayer = Array.isArray(win.dataLayer)
      ? win.dataLayer.map((entry) => Array.from(entry))
      : [];

    return {
      dataLayer,
      measurementId: win.__landingGaMeasurementId ?? null,
      scriptMeasurementId: providerScript?.getAttribute('data-measurement-id') ?? null,
      scriptSrc: providerScript?.getAttribute('src') ?? null,
    };
  });

  expect(gaState.measurementId).toBe('G-TEST1234');
  expect(gaState.scriptMeasurementId).toBe('G-TEST1234');
  expect(gaState.scriptSrc).toContain('G-TEST1234');

  const consentCall = gaState.dataLayer.find((entry) => entry[0] === 'consent' && entry[1] === 'default');
  expect(consentCall?.[2]).toMatchObject({
    ad_personalization: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
  });

  const configCall = gaState.dataLayer.find((entry) => entry[0] === 'config' && entry[1] === 'G-TEST1234');
  expect(configCall?.[2]).toMatchObject({
    anonymize_ip: true,
    send_page_view: true,
  });

  const eventCall = gaState.dataLayer.find(
    (entry) => entry[0] === 'event' && entry[1] === 'landing_cta_click',
  );
  expect(eventCall?.[2]).toMatchObject({
    href: APP_URL,
    language: 'nl',
    placement: 'hero',
  });
});

test('serves legal pages from the landing bundle', async ({ page }) => {
  expect(existsSync(resolve(LANDING_DIR, 'privacy.html'))).toBe(true);
  expect(existsSync(resolve(LANDING_DIR, 'terms.html'))).toBe(true);
  expect(existsSync(resolve(LANDING_DIR, 'legal.css'))).toBe(true);
  expect(existsSync(resolve(LANDING_DIR, 'legal.js'))).toBe(true);
  expect(existsSync(resolve(LANDING_DIR, 'logos', 'buurt-check-lockup-horizontal.svg'))).toBe(true);
  expect(existsSync(resolve(LANDING_DIR, 'logos', 'buurt-check-lockup-horizontal-reverse.svg'))).toBe(true);
  expect(existsSync(resolve(LANDING_DIR, 'logos', 'buurt-check-favicon.svg'))).toBe(true);
  expect(existsSync(resolve(LANDING_DIR, 'images', 'showcase-risk-details.webp'))).toBe(true);
  expect(existsSync(resolve(LANDING_DIR, 'images', 'showcase-sunlight.webp'))).toBe(true);

  await page.goto('/privacy.html');
  await expect(page).toHaveTitle('Buurt Check Privacybeleid');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.getByRole('radiogroup', { name: 'Taal' })).toBeVisible();
  await expect(page.locator('.legal-page__brand-text')).toHaveText('Buurt Check');
  await expect(page.getByRole('heading', { level: 1, name: 'Hoe Buurt Check met gegevens omgaat' })).toBeVisible();
  await expect(page.locator(`a[href="${APP_URL}"]:visible`).first()).toBeVisible();
  await expect(page.locator('a[href="mailto:support@buurt-check.nl"]:visible').first()).toBeVisible();
  await page.locator('button[data-language-choice="en"]').click();
  await expect(page).toHaveTitle('Buurt Check Privacy Policy');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('radiogroup', { name: 'Language' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'How Buurt Check handles data' })).toBeVisible();

  await page.goto('/terms.html');
  await expect(page).toHaveTitle('Buurt Check Terms of Use');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('radiogroup', { name: 'Language' })).toBeVisible();
  await expect(page.locator('.legal-page__brand-text')).toHaveText('Buurt Check');
  await expect(page.getByRole('heading', { level: 1, name: 'Terms for using Buurt Check' })).toBeVisible();
  await expect(page.locator(`a[href="${APP_URL}"]:visible`).first()).toBeVisible();
  await expect(page.locator('a[href="mailto:support@buurt-check.nl"]:visible').first()).toBeVisible();
  await expect(page.locator('a[href="/privacy.html"]:visible').first()).toBeVisible();
  await page.locator('button[data-language-choice="nl"]').click();
  await expect(page).toHaveTitle('Buurt Check Gebruiksvoorwaarden');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.getByRole('radiogroup', { name: 'Taal' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Voorwaarden voor Buurt Check' })).toBeVisible();
});

test('keeps the landing footer focused on support and legal links', async ({ page }) => {
  await page.goto('/');

  const footer = page.locator('footer');
  await expect(footer.locator('a[href="mailto:support@buurt-check.nl"]')).toBeVisible();
  await expect(footer.locator('a[href="/privacy.html"]')).toBeVisible();
  await expect(footer.locator('a[href="/terms.html"]')).toBeVisible();
});

test('has no serious or critical axe violations on the landing page', async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({ path: AXE_SOURCE_PATH });

  const violations = await page.evaluate(async () => {
    const axeWindow = window as Window & {
      axe: {
        run: (
          node: Document,
          options: unknown,
        ) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: unknown[] }> }>;
      };
    };
    const results = await axeWindow.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa'],
      },
    });

    return results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
      }));
  });

  expect(violations).toEqual([]);
});
