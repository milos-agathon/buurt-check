import type { TFunction } from 'i18next';
import {
  isAppleBillingContextAvailableSync,
  presentAppleBillingPdfShareSheet,
} from './appleBilling';

vi.mock('./appleBilling', () => ({
  isAppleBillingContextAvailableSync: vi.fn(() => false),
  presentAppleBillingPdfShareSheet: vi.fn(),
}));

import {
  ApiError,
  checkEntitlement,
  verifyAppleAppStorePurchase,
  createCheckoutSession,
  createShortReport,
  downloadPdfBlob,
  exportBriefing,
  fetchWeatherTmy,
  getBuildingFacts,
  getLivability,
  getNeighborhood3D,
  getNeighborhoodStats,
  getPropertyWarnings,
  getRiskComparisons,
  getRiskCards,
  getTierBData,
  lookupAddress,
  mapApiError,
  submitSunlightAnalysis,
  suggestAddresses,
  verifyGooglePlayPurchase,
} from './api';

// Minimal stand-in TFunction for mapApiError unit tests — returns the key unchanged.
// Cast needed because TFunction carries a branded type not satisfiable by a plain lambda.
const t = ((key: string) => key) as unknown as TFunction;

const mockFetch = vi.fn();
const mockIsAppleBillingContextAvailableSync = vi.mocked(isAppleBillingContextAvailableSync);
const mockPresentAppleBillingPdfShareSheet = vi.mocked(presentAppleBillingPdfShareSheet);
beforeEach(() => {
  mockFetch.mockReset();
  mockIsAppleBillingContextAvailableSync.mockReset();
  mockPresentAppleBillingPdfShareSheet.mockReset();
  mockIsAppleBillingContextAvailableSync.mockReturnValue(false);
  globalThis.fetch = mockFetch;
});

function okResponse(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) } as Response;
}

function errorResponse(status: number) {
  return { ok: false, status } as Response;
}

// ─── mapApiError ─────────────────────────────────────────────────────────────

describe('mapApiError', () => {
  it('returns error.timeout for AbortError (DOMException)', () => {
    const abortErr = new DOMException('The user aborted a request.', 'AbortError');
    expect(mapApiError(abortErr, t)).toBe('error.timeout');
  });

  it('returns error.network for TypeError (network failure)', () => {
    const networkErr = new TypeError('Failed to fetch');
    expect(mapApiError(networkErr, t)).toBe('error.network');
  });

  it('returns error.data_source for ApiError with 4xx key', () => {
    const apiErr = new ApiError('error.data_source', 404);
    expect(mapApiError(apiErr, t)).toBe('error.data_source');
  });

  it('returns error.server for ApiError with 5xx key', () => {
    const apiErr = new ApiError('error.server', 503);
    expect(mapApiError(apiErr, t)).toBe('error.server');
  });

  it('returns error.generic for unknown errors', () => {
    expect(mapApiError(new Error('something weird'), t)).toBe('error.generic');
    expect(mapApiError('string error', t)).toBe('error.generic');
    expect(mapApiError(null, t)).toBe('error.generic');
    expect(mapApiError(undefined, t)).toBe('error.generic');
  });
});

// ─── ApiError class ──────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('stores errorKey and httpStatus', () => {
    const err = new ApiError('error.server', 502);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.errorKey).toBe('error.server');
    expect(err.httpStatus).toBe(502);
    expect(err.name).toBe('ApiError');
  });

  it('works without httpStatus', () => {
    const err = new ApiError('error.generic');
    expect(err.httpStatus).toBeUndefined();
  });
});

// ─── HTTP error mapping ───────────────────────────────────────────────────────

describe('HTTP status → ApiError mapping', () => {
  it('maps 4xx responses to error.data_source', async () => {
    mockFetch.mockResolvedValue(errorResponse(404));
    const err = await lookupAddress('bad-id').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.errorKey).toBe('error.data_source');
    expect(err.httpStatus).toBe(404);
  });

  it('maps 5xx responses to error.server', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    const err = await getBuildingFacts('vbo-1').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.errorKey).toBe('error.server');
    expect(err.httpStatus).toBe(502);
  });

  it('maps 401 responses to error.data_source', async () => {
    mockFetch.mockResolvedValue(errorResponse(401));
    const err = await suggestAddresses('test').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.errorKey).toBe('error.data_source');
    expect(err.httpStatus).toBe(401);
  });

  it('maps 500 responses to error.server', async () => {
    mockFetch.mockResolvedValue(errorResponse(500));
    const err = await getLivability('vbo-1', 121286, 487296).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.errorKey).toBe('error.server');
    expect(err.httpStatus).toBe(500);
  });
});

// ─── suggestAddresses ─────────────────────────────────────────────────────────

describe('suggestAddresses', () => {
  it('sends GET with query and limit params', async () => {
    mockFetch.mockResolvedValue(okResponse({ suggestions: [] }));
    await suggestAddresses('amsterdam', 5);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/address/suggest?');
    expect(url).toContain('q=amsterdam');
    expect(url).toContain('limit=5');
  });

  it('defaults limit to 7', async () => {
    mockFetch.mockResolvedValue(okResponse({ suggestions: [] }));
    await suggestAddresses('test');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('limit=7');
  });

  it('passes AbortSignal to fetch', async () => {
    mockFetch.mockResolvedValue(okResponse({ suggestions: [] }));
    const controller = new AbortController();
    await suggestAddresses('test', 7, controller.signal);

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.signal).toBe(controller.signal);
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(500));
    await expect(suggestAddresses('test')).rejects.toBeInstanceOf(ApiError);
    await expect(suggestAddresses('test')).rejects.toMatchObject({
      errorKey: 'error.server',
      httpStatus: 500,
    });
  });
});

// ─── lookupAddress ────────────────────────────────────────────────────────────

describe('lookupAddress', () => {
  it('sends GET with id param', async () => {
    mockFetch.mockResolvedValue(okResponse({ id: 'x', display_name: 'x' }));
    await lookupAddress('adr-123');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/address/lookup?');
    expect(url).toContain('id=adr-123');
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(404));
    await expect(lookupAddress('bad-id')).rejects.toBeInstanceOf(ApiError);
    await expect(lookupAddress('bad-id')).rejects.toMatchObject({
      errorKey: 'error.data_source',
      httpStatus: 404,
    });
  });
});

// ─── getBuildingFacts ─────────────────────────────────────────────────────────

describe('getBuildingFacts', () => {
  it('sends GET with vboId in path and no query params', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1' }));
    await getBuildingFacts('vbo-1');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/address/vbo-1/building');
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(getBuildingFacts('vbo-1')).rejects.toBeInstanceOf(ApiError);
    await expect(getBuildingFacts('vbo-1')).rejects.toMatchObject({
      errorKey: 'error.server',
      httpStatus: 502,
    });
  });
});

// ─── getNeighborhood3D ────────────────────────────────────────────────────────

describe('getNeighborhood3D', () => {
  it('sends GET with vboId in path and query params', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1', buildings: [] }));
    await getNeighborhood3D('vbo-1', 'pand-1', 121286, 487296, 52.372, 4.892);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/address/vbo-1/neighborhood3d?');
    expect(url).toContain('pand_id=pand-1');
    expect(url).toContain('rd_x=121286');
    expect(url).toContain('rd_y=487296');
    expect(url).toContain('lat=52.372');
    expect(url).toContain('lng=4.892');
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(
      getNeighborhood3D('vbo-1', 'pand-1', 121286, 487296, 52.372, 4.892),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      getNeighborhood3D('vbo-1', 'pand-1', 121286, 487296, 52.372, 4.892),
    ).rejects.toMatchObject({ errorKey: 'error.server', httpStatus: 502 });
  });

  it('sends AbortSignal for timeout', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1', buildings: [] }));
    await getNeighborhood3D('vbo-1', 'pand-1', 121286, 487296, 52.372, 4.892);

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts fetch after 90s timeout', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | null | undefined;
    mockFetch.mockImplementation((_url: string, opts?: RequestInit) => {
      capturedSignal = opts?.signal;
      return new Promise<Response>(() => {});
    });

    const promise = getNeighborhood3D('vbo-1', 'pand-1', 121286, 487296, 52.372, 4.892);

    expect(capturedSignal?.aborted).toBe(false);
    vi.advanceTimersByTime(90000);
    expect(capturedSignal?.aborted).toBe(true);

    vi.useRealTimers();
    promise.catch(() => {});
  });
});

// ─── getRiskCards ─────────────────────────────────────────────────────────────

describe('getRiskCards', () => {
  it('sends GET with vboId in path and location query params', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1' }));
    await getRiskCards('vbo-1', 121286, 487296, 52.372, 4.892);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/address/vbo-1/risks?');
    expect(url).toContain('rd_x=121286');
    expect(url).toContain('rd_y=487296');
    expect(url).toContain('lat=52.372');
    expect(url).toContain('lng=4.892');
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(
      getRiskCards('vbo-1', 121286, 487296, 52.372, 4.892),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      getRiskCards('vbo-1', 121286, 487296, 52.372, 4.892),
    ).rejects.toMatchObject({ errorKey: 'error.server', httpStatus: 502 });
  });

  it('sends AbortSignal for timeout', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1' }));
    await getRiskCards('vbo-1', 121286, 487296, 52.372, 4.892);

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts fetch after 20s timeout', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | null | undefined;
    mockFetch.mockImplementation((_url: string, opts?: RequestInit) => {
      capturedSignal = opts?.signal;
      return new Promise<Response>(() => {});
    });

    const promise = getRiskCards('vbo-1', 121286, 487296, 52.372, 4.892);

    // Before timeout, signal should not be aborted
    expect(capturedSignal?.aborted).toBe(false);

    // Advance past 20s timeout
    vi.advanceTimersByTime(20000);

    // Signal should now be aborted
    expect(capturedSignal?.aborted).toBe(true);

    vi.useRealTimers();
    // The promise will never resolve/reject in this test since the mock
    // never settles, but we've verified the abort signal fires correctly.
    // Suppress unhandled rejection from the dangling promise.
    promise.catch(() => {});
  });
});

// ─── submitSunlightAnalysis ───────────────────────────────────────────────────

describe('submitSunlightAnalysis', () => {
  it('posts mapped payload to sunlight endpoint', async () => {
    mockFetch.mockResolvedValue(okResponse({ status: 'ok', cached: true }));

    await submitSunlightAnalysis('vbo-1', {
      winter: 3.1,
      equinox: 7.2,
      summer: 10.8,
      annualAverage: 6.7,
      analysisYear: 2026,
      svf: 0.55,
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/address/vbo-1/sunlight');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      winter_hours: 3.1,
      equinox_hours: 7.2,
      summer_hours: 10.8,
      analysis_year: 2026,
      svf: 0.55,
      annual_average: 6.7,
    });
  });

  it('includes report_id query parameter when provided', async () => {
    mockFetch.mockResolvedValue(okResponse({ status: 'ok', cached: true }));

    await submitSunlightAnalysis('vbo-1', {
      winter_hours: 2.4,
      equinox_hours: 6.4,
      summer_hours: 9.6,
      analysis_year: 2026,
    }, 'rpt-123');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/address/vbo-1/sunlight?report_id=rpt-123');
  });

  it('maps extended SunlightResult fields (facade, ground, anisotropic SVF, irradiance)', async () => {
    mockFetch.mockResolvedValue(okResponse({ status: 'ok', cached: true }));

    await submitSunlightAnalysis('vbo-1', {
      winter: 2.5,
      equinox: 6.0,
      summer: 10.0,
      annualAverage: 5.8,
      analysisYear: 2026,
      svf: 0.60,
      svfAnisotropic: 0.55,
      groundAnnualAverage: 4.2,
      irradianceKwhM2: 920.5,
      facadeResults: [
        { orientation: 'south', heightLabel: '3m', winterHours: 3.0, summerHours: 11.0, annualAverage: 7.0 },
        { orientation: 'north', heightLabel: '3m', winterHours: 0.5, summerHours: 4.0, annualAverage: 2.0 },
      ],
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.annual_average).toBe(5.8);
    expect(body.ground_annual_average).toBe(4.2);
    expect(body.svf_anisotropic).toBe(0.55);
    expect(body.irradiance_kwh_m2).toBe(920.5);
    expect(body.facade_results).toEqual([
      { orientation: 'south', height_label: '3m', winter_hours: 3.0, summer_hours: 11.0, annual_average: 7.0 },
      { orientation: 'north', height_label: '3m', winter_hours: 0.5, summer_hours: 4.0, annual_average: 2.0 },
    ]);
  });

  it('returns backend acknowledgement details for export gating', async () => {
    mockFetch.mockResolvedValue(okResponse({
      status: 'ok',
      score: 47,
      severity: 'moderate',
      cached: false,
    }));

    await expect(
      submitSunlightAnalysis('vbo-1', {
        winter_hours: 2.4,
        equinox_hours: 6.4,
        summer_hours: 9.6,
        analysis_year: 2026,
      }),
    ).resolves.toEqual({
      status: 'ok',
      score: 47,
      severity: 'moderate',
      cached: false,
    });
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(500));
    await expect(
      submitSunlightAnalysis('vbo-1', {
        winter_hours: 2.4,
        equinox_hours: 6.4,
        summer_hours: 9.6,
        analysis_year: 2026,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      submitSunlightAnalysis('vbo-1', {
        winter_hours: 2.4,
        equinox_hours: 6.4,
        summer_hours: 9.6,
        analysis_year: 2026,
      }),
    ).rejects.toMatchObject({ errorKey: 'error.server', httpStatus: 500 });
  });
});

// ─── getNeighborhoodStats ─────────────────────────────────────────────────────

describe('getNeighborhoodStats', () => {
  it('sends GET with vboId in path and lat/lng params', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1' }));
    await getNeighborhoodStats('vbo-1', 52.372, 4.892);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/address/vbo-1/neighborhood?');
    expect(url).toContain('lat=52.372');
    expect(url).toContain('lng=4.892');
  });

  it('includes buurt_code when provided', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1' }));
    await getNeighborhoodStats('vbo-1', 52.372, 4.892, 'BU0363AD07');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('buurt_code=BU0363AD07');
  });

  it('omits buurt_code when not provided', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1' }));
    await getNeighborhoodStats('vbo-1', 52.372, 4.892);

    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain('buurt_code');
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(
      getNeighborhoodStats('vbo-1', 52.372, 4.892),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      getNeighborhoodStats('vbo-1', 52.372, 4.892),
    ).rejects.toMatchObject({ errorKey: 'error.server', httpStatus: 502 });
  });

  it('sends AbortSignal for timeout', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1' }));
    await getNeighborhoodStats('vbo-1', 52.372, 4.892);

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts fetch after 15s timeout', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | null | undefined;
    mockFetch.mockImplementation((_url: string, opts?: RequestInit) => {
      capturedSignal = opts?.signal;
      return new Promise<Response>(() => {});
    });

    const promise = getNeighborhoodStats('vbo-1', 52.372, 4.892);

    // Before timeout, signal should not be aborted
    expect(capturedSignal?.aborted).toBe(false);

    // Advance past 15s timeout
    vi.advanceTimersByTime(15000);

    // Signal should now be aborted
    expect(capturedSignal?.aborted).toBe(true);

    vi.useRealTimers();
    // The promise will never resolve/reject in this test since the mock
    // never settles, but we've verified the abort signal fires correctly.
    // Suppress unhandled rejection from the dangling promise.
    promise.catch(() => {});
  });
});

// ─── getRiskComparisons ───────────────────────────────────────────────────────

describe('getRiskComparisons', () => {
  it('sends GET with risk-comparisons endpoint and buurt_code', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1' }));
    await getRiskComparisons('vbo-1', 121286, 487296, 52.372, 4.892, 'BU0363AD07');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/address/vbo-1/risk-comparisons?');
    expect(url).toContain('rd_x=121286');
    expect(url).toContain('rd_y=487296');
    expect(url).toContain('lat=52.372');
    expect(url).toContain('lng=4.892');
    expect(url).toContain('buurt_code=BU0363AD07');
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(
      getRiskComparisons('vbo-1', 121286, 487296, 52.372, 4.892),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      getRiskComparisons('vbo-1', 121286, 487296, 52.372, 4.892),
    ).rejects.toMatchObject({ errorKey: 'error.server', httpStatus: 502 });
  });
});

// ─── getTierBData ─────────────────────────────────────────────────────────────

describe('getTierBData', () => {
  it('sends GET with tier-b query params', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1', crime: {} }));
    await getTierBData('vbo-1', {
      buurtCode: 'BU0363AD07',
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/address/vbo-1/tier-b?');
    expect(url).toContain('buurt_code=BU0363AD07');
  });
});

// ─── exportBriefing ───────────────────────────────────────────────────────────

describe('exportBriefing', () => {
  it('passes selected template and canonical export fields to export endpoint', async () => {
    const expectedBlob = new Blob(['pdf']);
    mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(expectedBlob) } as Response);

    const blob = await exportBriefing({
      vboId: 'vbo-1',
      rdX: 1,
      rdY: 2,
      lat: 3,
      lng: 4,
      address: 'Test',
      template: 'full_dossier',
      shadowImageB64: 'AAAA',
      shadowEquinoxB64: 'BBBB',
      shadowSummerB64: 'CCCC',
      shadowImages: [
        {
          hour: 12,
          label: 'top',
          image_b64: 'DDDD',
          viewpoint: 'top',
        },
      ],
      buurtCode: 'BU0363AD07',
      postcode: '1012NX',
      houseNumber: '1',
      houseLetter: 'A',
      addition: '2',
      sunlightPayload: {
        winter_hours: 3.1,
        summer_hours: 6.2,
        equinox_hours: 4.5,
        analysis_year: 2026,
        svf: 0.63,
        irradiance_kwh_m2: 948.4,
      },
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/address/vbo-1/export');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.template).toBe('full_dossier');
    expect(body.shadow_image_b64).toBe('AAAA');
    expect(body.shadow_equinox_b64).toBe('BBBB');
    expect(body.shadow_summer_b64).toBe('CCCC');
    expect(body.shadow_images).toEqual([
      {
        hour: 12,
        label: 'top',
        image_b64: 'DDDD',
        viewpoint: 'top',
      },
    ]);
    expect(body.buurt_code).toBe('BU0363AD07');
    expect(body.postcode).toBe('1012NX');
    expect(body.house_number).toBe('1');
    expect(body.house_letter).toBe('A');
    expect(body.addition).toBe('2');
    expect(body.sunlight_submission).toEqual({
      winter_hours: 3.1,
      summer_hours: 6.2,
      equinox_hours: 4.5,
      analysis_year: 2026,
      svf: 0.63,
      irradiance_kwh_m2: 948.4,
    });
    expect(body.rd_x).toBe(1);
    expect(body.lat).toBe(3);
    expect(blob).toBe(expectedBlob);
  });

  it('omits shadow triptych payload for quick_brief exports', async () => {
    const expectedBlob = new Blob(['pdf']);
    mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(expectedBlob) } as Response);

    await exportBriefing({
      vboId: 'vbo-1',
      rdX: 1,
      rdY: 2,
      lat: 3,
      lng: 4,
      address: 'Test',
      template: 'quick_brief',
      shadowImageB64: 'AAAA',
      shadowImages: [
        {
          hour: 12,
          label: 'top',
          image_b64: 'DDDD',
          viewpoint: 'top',
        },
      ],
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.shadow_image_b64).toBe('AAAA');
    expect(body.shadow_images).toBeUndefined();
  });

  it('includes report_id when provided for full_dossier entitlement checks', async () => {
    const expectedBlob = new Blob(['pdf']);
    mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(expectedBlob) } as Response);

    await exportBriefing({
      vboId: 'vbo-1',
      rdX: 1,
      rdY: 2,
      lat: 3,
      lng: 4,
      address: 'Test',
      template: 'full_dossier',
      reportId: 'report-123',
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.report_id).toBe('report-123');
  });

  it('uses a longer timeout for quick_brief exports (90s default)', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | null | undefined;
    mockFetch.mockImplementation((_url: string, opts?: RequestInit) => {
      capturedSignal = opts?.signal;
      return new Promise<Response>(() => {});
    });

    const promise = exportBriefing({
      vboId: 'vbo-1',
      rdX: 1,
      rdY: 2,
      lat: 3,
      lng: 4,
      address: 'Test',
      template: 'quick_brief',
    });

    expect(capturedSignal?.aborted).toBe(false);
    vi.advanceTimersByTime(89_999);
    expect(capturedSignal?.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(capturedSignal?.aborted).toBe(true);

    vi.useRealTimers();
    promise.catch(() => {});
  });

  it('uses a longer timeout for full_dossier exports (180s default)', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | null | undefined;
    mockFetch.mockImplementation((_url: string, opts?: RequestInit) => {
      capturedSignal = opts?.signal;
      return new Promise<Response>(() => {});
    });

    const promise = exportBriefing({
      vboId: 'vbo-1',
      rdX: 1,
      rdY: 2,
      lat: 3,
      lng: 4,
      address: 'Test',
      template: 'full_dossier',
    });

    expect(capturedSignal?.aborted).toBe(false);
    vi.advanceTimersByTime(179_999);
    expect(capturedSignal?.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(capturedSignal?.aborted).toBe(true);

    vi.useRealTimers();
    promise.catch(() => {});
  });
});

// ─── reports + billing (monetization) ───────────────────────────────────────

describe('createShortReport', () => {
  it('posts vbo_id and address_key', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        report_id: '7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de',
        report_type: 'short',
        already_purchased: false,
      }),
    );

    const result = await createShortReport('0363100012345678', 'Keizersgracht 1, Amsterdam');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/reports/short');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      vbo_id: '0363100012345678',
      address_key: 'Keizersgracht 1, Amsterdam',
    });
    expect(result.report_id).toBe('7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de');
  });
});

describe('checkEntitlement', () => {
  it('fetches entitlement by report id', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        report_id: '7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de',
        entitled: true,
        report_type: 'short',
      }),
    );

    const result = await checkEntitlement('7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/reports/7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de/entitlement');
    expect(result.entitled).toBe(true);
  });
});

describe('createCheckoutSession', () => {
  it('posts report_id and returns checkout_url', async () => {
    mockFetch.mockResolvedValue(
      okResponse({ checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_123' }),
    );

    const result = await createCheckoutSession('7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/billing/checkout-session');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      report_id: '7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de',
    });
    expect(result.checkout_url).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
  });
});

describe('verifyGooglePlayPurchase', () => {
  it('posts the report ID, purchase token, and product ID', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        report_id: '7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de',
        entitled: true,
        provider: 'google_play',
        consumed: true,
      }),
    );

    const result = await verifyGooglePlayPurchase(
      '7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de',
      'purchase-token-123',
      'full_dossier_unlock',
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/billing/google-play/verify');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      report_id: '7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de',
      purchase_token: 'purchase-token-123',
      product_id: 'full_dossier_unlock',
    });
    expect(result.provider).toBe('google_play');
    expect(result.consumed).toBe(true);
  });
});

describe('verifyAppleAppStorePurchase', () => {
  it('posts the report ID, signed transaction, and product ID', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        report_id: '7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de',
        entitled: true,
        provider: 'apple_app_store',
        transaction_id: '2000000678901234',
      }),
    );

    const result = await verifyAppleAppStorePurchase(
      '7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de',
      'signed-jws-payload',
      'full_dossier_unlock',
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/billing/apple-app-store/verify');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      report_id: '7b8e8d39-0ad2-4c1e-8f06-b93be11ed9de',
      signed_transaction_info: 'signed-jws-payload',
      product_id: 'full_dossier_unlock',
    });
    expect(result.provider).toBe('apple_app_store');
    expect(result.transaction_id).toBe('2000000678901234');
  });
});

// ─── downloadPdfBlob ──────────────────────────────────────────────────────────

describe('downloadPdfBlob', () => {
  function mockNavigatorForIOS() {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.0.0 Mobile/15E148 Safari/604.1',
    );
  }

  it('creates and clicks a download link', async () => {
    vi.useFakeTimers();
    const appendChildSpy = vi.spyOn(document.body, 'appendChild');
    const removeChildSpy = vi.spyOn(document.body, 'removeChild');
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window);
    const originalCreateElement = document.createElement.bind(document);
    const anchor = originalCreateElement('a');
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'a') {
        return anchor;
      }
      return originalCreateElement(tagName);
    });
    appendChildSpy.mockImplementation(() => ({}) as Node);
    removeChildSpy.mockImplementation(() => ({}) as Node);
    const originalDownload = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'download');
    Object.defineProperty(HTMLAnchorElement.prototype, 'download', {
      configurable: true,
      writable: true,
      value: '',
    });

    await downloadPdfBlob(new Blob(['pdf']), 'test.pdf');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    // Revocation is delayed for Safari iOS compatibility
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);

    if (originalDownload) {
      Object.defineProperty(HTMLAnchorElement.prototype, 'download', originalDownload);
    } else {
      Reflect.deleteProperty(HTMLAnchorElement.prototype, 'download');
    }
    openSpy.mockRestore();
    clickSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    vi.useRealTimers();
  });

  it('opens blob in a new tab on iOS instead of anchor download', async () => {
    vi.useFakeTimers();
    mockNavigatorForIOS();
    const appendChildSpy = vi.spyOn(document.body, 'appendChild');
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window);

    await downloadPdfBlob(new Blob(['pdf']), 'test.pdf');

    expect(openSpy).toHaveBeenCalledWith('blob:test', '_blank', 'noopener,noreferrer');
    expect(appendChildSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);

    openSpy.mockRestore();
    appendChildSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    vi.useRealTimers();
  });

  it('uses the native Apple share sheet inside the iOS app wrapper', async () => {
    mockIsAppleBillingContextAvailableSync.mockReturnValue(true);

    await downloadPdfBlob(new Blob(['pdf']), 'test.pdf');

    expect(mockPresentAppleBillingPdfShareSheet).toHaveBeenCalledWith(
      expect.any(Blob),
      'test.pdf',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── getPropertyWarnings ──────────────────────────────────────────────────────

describe('getPropertyWarnings', () => {
  it('sends GET with required params', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        address_id: 'vbo-123',
        foundation_risk: { level: 'low', messages: [] },
        erfpacht: { detected: false, messages: [] },
        vve: { is_apartment: false, messages: [] },
        asbestos: { flagged: false, messages: [] },
        attention_summary: {
          flag_count: 0,
          flags: [],
          risk_categories_assessed: 4,
          risk_categories_total: 4,
        },
      }),
    );
    const result = await getPropertyWarnings('0363200000000001', 121000, 487000);
    expect(result.address_id).toBe('vbo-123');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/property-warnings?');
    expect(url).toContain('rd_x=121000');
  });

  it('sends optional params when provided', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-123' }));
    await getPropertyWarnings('0363200000000001', 121000, 487000, {
      constructionYear: 1952,
      numUnits: 8,
      municipality: 'Amsterdam',
    });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('construction_year=1952');
    expect(url).toContain('num_units=8');
    expect(url).toContain('municipality=Amsterdam');
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(
      getPropertyWarnings('0363200000000001', 121000, 487000),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      getPropertyWarnings('0363200000000001', 121000, 487000),
    ).rejects.toMatchObject({ errorKey: 'error.server', httpStatus: 502 });
  });
});

// ─── getLivability ────────────────────────────────────────────────────────────

describe('getLivability', () => {
  it('sends GET with rd_x and rd_y params', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        available: true,
        buurt_code: 'BU0363AB10',
        buurt_name: 'Testbuurt',
        gemeente: 'Amsterdam',
        year: '2024',
        overall_score: 7,
        overall_normalized: 75,
        dimensions: [],
        trend: [],
        comparison: [],
        source: 'Leefbaarometer 3.0',
        messages: [],
      }),
    );
    const result = await getLivability('0363200000000001', 121286, 487296);
    expect(result).not.toBeNull();
    expect(result!.available).toBe(true);
    if (result && result.available) {
      expect(result.overall_normalized).toBe(75);
    }
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/address/0363200000000001/livability?');
    expect(url).toContain('rd_x=121286');
    expect(url).toContain('rd_y=487296');
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(500));
    await expect(
      getLivability('0363200000000001', 121286, 487296),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      getLivability('0363200000000001', 121286, 487296),
    ).rejects.toMatchObject({ errorKey: 'error.server', httpStatus: 500 });
  });

  it('returns response with available:false when backend says unavailable', async () => {
    mockFetch.mockResolvedValue(
      okResponse({ available: false, message: 'LIVABILITY_NO_DATA' }),
    );
    const result = await getLivability('0363200000000001', 121286, 487296);
    expect(result).not.toBeNull();
    expect(result!.available).toBe(false);
  });

  it('passes AbortSignal for timeout', async () => {
    mockFetch.mockResolvedValue(
      okResponse({ available: false, message: 'LIVABILITY_NO_DATA' }),
    );
    await getLivability('vbo-1', 121286, 487296);
    const [, init] = mockFetch.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

// ─── fetchWeatherTmy ──────────────────────────────────────────────────────────

describe('fetchWeatherTmy', () => {
  it('includes report_id and parses weather records', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: [
          {
            date: '20050101:0030',
            minute_of_day: 30,
            dni_w_m2: 450,
            dhi_w_m2: 120,
            ghi_w_m2: 570,
          },
        ],
      }),
    );

    const result = await fetchWeatherTmy(
      '0363010000696734',
      52.37,
      4.9,
      undefined,
      'report-123',
    );

    expect(result).toEqual([
      {
        date: '20050101:0030',
        minuteOfDay: 30,
        dni_w_m2: 450,
        dhi_w_m2: 120,
        ghi_w_m2: 570,
      },
    ]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/weather-tmy?');
    expect(url).toContain('report_id=report-123');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns null on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(402));

    const result = await fetchWeatherTmy('0363010000696734', 52.37, 4.9);

    expect(result).toBeNull();
  });
});
