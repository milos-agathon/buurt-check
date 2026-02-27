import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackEvent } from './analytics';

describe('trackEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
