import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/react';
import { trackEvent } from './analytics';

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn(),
}));

describe('trackEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(Sentry.addBreadcrumb).mockReset();
  });

  it('logs to console in dev mode', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    trackEvent('upgrade_cta_clicked', { report_id: 'abc-123' });
    expect(spy).toHaveBeenCalledWith(
      '[analytics]',
      'upgrade_cta_clicked',
      { report_id: 'abc-123' },
    );
  });

  it('does not throw when called with no properties', () => {
    expect(() => trackEvent('address_search_submitted')).not.toThrow();
  });

  it('adds Sentry breadcrumb with event data', () => {
    trackEvent('checkout_completed', { report_id: 'r-1', amount: 995 });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'analytics',
      message: 'checkout_completed',
      data: { report_id: 'r-1', amount: 995 },
      level: 'info',
    });
  });

  it('does not throw when Sentry.addBreadcrumb throws', () => {
    vi.mocked(Sentry.addBreadcrumb).mockImplementation(() => {
      throw new Error('Sentry not initialized');
    });
    expect(() => trackEvent('checkout_failed')).not.toThrow();
  });
});
