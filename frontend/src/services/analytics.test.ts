import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn(),
}));

async function loadAnalyticsModule() {
  vi.resetModules();
  return import('./analytics');
}

function clearAnalyticsGlobals() {
  document.head
    .querySelectorAll('script[data-analytics-provider="google-analytics"]')
    .forEach((node) => node.remove());
  document.cookie = 'buurtcheck_analytics_consent=; Max-Age=0; Path=/';
  localStorage.clear();
  delete window.gtag;
  delete window.dataLayer;
  delete window.__buurtCheckGaMeasurementId;
}

describe('analytics service', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.mocked(Sentry.addBreadcrumb).mockReset();
    clearAnalyticsGlobals();
  });

  it('does not initialize Google Analytics when no measurement id is configured', async () => {
    const { initAnalytics, isAnalyticsEnabled } = await loadAnalyticsModule();

    expect(isAnalyticsEnabled()).toBe(false);
    initAnalytics();

    expect(window.gtag).toBeUndefined();
    expect(
      document.querySelector('script[data-analytics-provider="google-analytics"]'),
    ).toBeNull();
  });

  it('bootstraps Google Analytics 4 with manual SPA pageviews and cross-domain linker', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-test1234');
    const { initAnalytics, isAnalyticsEnabled } = await loadAnalyticsModule();

    expect(isAnalyticsEnabled()).toBe(true);
    initAnalytics();

    const gaScript = document.querySelector<HTMLScriptElement>(
      'script[data-analytics-provider="google-analytics"]',
    );
    expect(gaScript?.dataset.measurementId).toBe('G-TEST1234');
    expect(gaScript?.src).toContain('G-TEST1234');
    expect(window.__buurtCheckGaMeasurementId).toBe('G-TEST1234');

    expect(window.dataLayer).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(['consent', 'default']),
        expect.arrayContaining(['js']),
        [
          'config',
          'G-TEST1234',
          {
            anonymize_ip: true,
            send_page_view: false,
            linker: {
              domains: ['buurt-check.nl', 'app.buurt-check.nl'],
            },
          },
        ],
      ]),
    );
  });

  it('persists analytics consent and updates Google consent mode', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST1234');
    const { initAnalytics, getAnalyticsConsent, setAnalyticsConsent } = await loadAnalyticsModule();

    initAnalytics();
    setAnalyticsConsent('granted');

    expect(getAnalyticsConsent()).toBe('granted');
    expect(localStorage.getItem('buurtcheck_analytics_consent')).toBe('granted');
    expect(document.cookie).toContain('buurtcheck_analytics_consent=granted');
    expect(window.dataLayer).toContainEqual([
      'consent',
      'update',
      {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        functionality_storage: 'granted',
        security_storage: 'granted',
      },
    ]);
  });

  it('sends sanitized event payloads to GA while keeping raw Sentry breadcrumbs', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST1234');
    const { initAnalytics, trackEvent } = await loadAnalyticsModule();

    initAnalytics();
    trackEvent('checkout_completed', {
      report_id: 'report-123',
      amount: 995,
      provider: 'stripe',
      checkout_url: 'https://app.buurt-check.nl/#/search?report=report-123',
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'analytics',
      message: 'checkout_completed',
      data: {
        report_id: 'report-123',
        amount: 995,
        provider: 'stripe',
        checkout_url: 'https://app.buurt-check.nl/#/search?report=report-123',
      },
      level: 'info',
    });

    expect(window.dataLayer).toContainEqual([
      'event',
      'checkout_completed',
      {
        amount: 995,
        provider: 'stripe',
        checkout_url: 'https://app.buurt-check.nl/#/search',
      },
    ]);
  });

  it('tracks manual SPA pageviews and deduplicates by signature, not by sanitized URL', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST1234');
    const { initAnalytics, trackPageView } = await loadAnalyticsModule();

    initAnalytics();
    trackPageView({
      pageLocation: 'https://app.buurt-check.nl/#/address',
      pageTitle: 'Buurt Check briefing',
      signature: 'dossier:vbo-123',
      language: 'en',
    });
    trackPageView({
      pageLocation: 'https://app.buurt-check.nl/#/address',
      pageTitle: 'Buurt Check briefing',
      signature: 'dossier:vbo-123',
      language: 'en',
    });
    trackPageView({
      pageLocation: 'https://app.buurt-check.nl/#/address',
      pageTitle: 'Buurt Check briefing',
      signature: 'dossier:vbo-456',
      language: 'en',
    });

    const pageViews = window.dataLayer?.filter(
      (entry) => entry[0] === 'event' && entry[1] === 'page_view',
    ) ?? [];

    expect(pageViews).toHaveLength(2);
    expect(pageViews[0]).toEqual([
      'event',
      'page_view',
      {
        page_location: 'https://app.buurt-check.nl/#/address',
        page_title: 'Buurt Check briefing',
        language: 'en',
      },
    ]);
    expect(pageViews[1]).toEqual([
      'event',
      'page_view',
      {
        page_location: 'https://app.buurt-check.nl/#/address',
        page_title: 'Buurt Check briefing',
        page_referrer: 'https://app.buurt-check.nl/#/address',
        language: 'en',
      },
    ]);
  });

  it('does not throw when Sentry breadcrumbs fail', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST1234');
    vi.mocked(Sentry.addBreadcrumb).mockImplementation(() => {
      throw new Error('Sentry unavailable');
    });
    const { initAnalytics, trackEvent } = await loadAnalyticsModule();

    initAnalytics();
    expect(() => trackEvent('checkout_failed')).not.toThrow();
  });
});
