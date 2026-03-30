import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('pricing config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses env fallback before API response', async () => {
    vi.stubEnv('VITE_DOSSIER_PRICE_EUR', '3.99');

    const { getDossierPrice, getDossierPriceDisplay } = await import('./pricing');

    expect(getDossierPrice()).toBe('3.99');
    expect(getDossierPriceDisplay()).toBe('€3.99');
  });

  it('updates cached price from /api/pricing', async () => {
    vi.stubEnv('VITE_DOSSIER_PRICE_EUR', '3.99');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        price_eur: '19.99',
        web_checkout_available: false,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const {
      fetchPrice,
      getDossierPrice,
      getDossierPriceDisplay,
      isWebCheckoutAvailable,
    } = await import('./pricing');
    const fetched = await fetchPrice();

    expect(fetchMock).toHaveBeenCalledWith('/api/pricing');
    expect(fetched).toBe('19.99');
    expect(getDossierPrice()).toBe('19.99');
    expect(getDossierPriceDisplay()).toBe('€19.99');
    expect(isWebCheckoutAvailable()).toBe(false);
  });

  it('keeps fallback when API returns invalid price', async () => {
    vi.stubEnv('VITE_DOSSIER_PRICE_EUR', '3.99');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ price_eur: 'free' }),
    }));

    const { fetchPrice } = await import('./pricing');

    await expect(fetchPrice()).resolves.toBe('3.99');
  });
});

