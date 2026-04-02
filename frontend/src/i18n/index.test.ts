import { afterEach, describe, expect, it, vi } from 'vitest';

describe('i18n bootstrap', () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('uses the cached language on reload', async () => {
    localStorage.setItem('i18nextLng', 'en');

    const { default: i18n } = await import('./index');

    expect(i18n.resolvedLanguage).toBe('en');
  });
});
