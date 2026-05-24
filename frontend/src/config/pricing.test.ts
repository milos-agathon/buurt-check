import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('pricing config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses env fallback before API response', async () => {
    vi.stubEnv('VITE_DOSSIER_PRICE_EUR', '3.99');

    const { getDossierPrice } = await import('./pricing');

    expect(getDossierPrice()).toBe('3.99');
  });

  it('updates cached price and server-render availability from /api/pricing', async () => {
    vi.stubEnv('VITE_DOSSIER_PRICE_EUR', '3.99');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        price_eur: '19.99',
        server_render_available: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const {
      fetchPrice,
      getDossierPrice,
      isServerRenderAvailable,
    } = await import('./pricing');
    const fetched = await fetchPrice();

    expect(fetchMock).toHaveBeenCalledWith('/api/pricing');
    expect(fetched).toBe('19.99');
    expect(getDossierPrice()).toBe('19.99');
    expect(isServerRenderAvailable()).toBe(true);
  });

  it('keeps hosted web pricing requests first-party when VITE_API_BASE is cross-origin', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://buurt-check.onrender.com/api');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ price_eur: '3.99' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const apiBase = await import('./apiBase');
    apiBase.setPrimaryApiBaseTestRuntime({
      protocol: 'https:',
      hostname: 'app.buurt-check.nl',
      origin: 'https://app.buurt-check.nl',
    });
    const { fetchPrice } = await import('./pricing');

    await fetchPrice();

    expect(fetchMock).toHaveBeenCalledWith('/api/pricing');
  });

  it('honors an explicit absolute pricing API base on localhost runtimes', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://buurt-check.onrender.com/api');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ price_eur: '3.99' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const apiBase = await import('./apiBase');
    apiBase.setPrimaryApiBaseTestRuntime({
      protocol: 'http:',
      hostname: 'localhost',
      origin: 'http://localhost:4173',
    });
    const { fetchPrice } = await import('./pricing');

    await fetchPrice();

    expect(fetchMock).toHaveBeenCalledWith('https://buurt-check.onrender.com/api/pricing');
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

