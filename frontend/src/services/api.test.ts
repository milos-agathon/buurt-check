import {
  downloadPdfBlob,
  exportBriefing,
  getBuildingFacts,
  getNeighborhood3D,
  getNeighborhoodStats,
  getRiskComparisons,
  getRiskCards,
  getTierBData,
  lookupAddress,
  suggestAddresses,
} from './api';

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
});

function okResponse(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) } as Response;
}

function errorResponse(status: number) {
  return { ok: false, status } as Response;
}

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

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(500));
    await expect(suggestAddresses('test')).rejects.toThrow('Suggest failed: 500');
  });
});

describe('lookupAddress', () => {
  it('sends GET with id param', async () => {
    mockFetch.mockResolvedValue(okResponse({ id: 'x', display_name: 'x' }));
    await lookupAddress('adr-123');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/address/lookup?');
    expect(url).toContain('id=adr-123');
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(404));
    await expect(lookupAddress('bad-id')).rejects.toThrow('Lookup failed: 404');
  });
});

describe('getBuildingFacts', () => {
  it('sends GET with vboId in path and no query params', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1' }));
    await getBuildingFacts('vbo-1');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/address/vbo-1/building');
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(getBuildingFacts('vbo-1')).rejects.toThrow('Building facts failed: 502');
  });
});

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

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(
      getNeighborhood3D('vbo-1', 'pand-1', 121286, 487296, 52.372, 4.892),
    ).rejects.toThrow('Neighborhood 3D failed: 502');
  });

  it('sends AbortSignal for timeout', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1', buildings: [] }));
    await getNeighborhood3D('vbo-1', 'pand-1', 121286, 487296, 52.372, 4.892);

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });
});

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

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(
      getRiskCards('vbo-1', 121286, 487296, 52.372, 4.892),
    ).rejects.toThrow('Risk cards failed: 502');
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

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(
      getNeighborhoodStats('vbo-1', 52.372, 4.892),
    ).rejects.toThrow('Neighborhood stats failed: 502');
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

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(
      getRiskComparisons('vbo-1', 121286, 487296, 52.372, 4.892),
    ).rejects.toThrow('Risk comparisons failed: 502');
  });
});

describe('getTierBData', () => {
  it('sends GET with tier-b query params', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-1', energy_label: {}, crime: {} }));
    await getTierBData('vbo-1', {
      buurtCode: 'BU0363AD07',
      postcode: '1012NX',
      houseNumber: '1',
      houseLetter: 'A',
      addition: '1',
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/address/vbo-1/tier-b?');
    expect(url).toContain('buurt_code=BU0363AD07');
    expect(url).toContain('postcode=1012NX');
    expect(url).toContain('house_number=1');
    expect(url).toContain('house_letter=A');
    expect(url).toContain('addition=1');
  });
});

describe('exportBriefing', () => {
  it('passes selected template to export endpoint', async () => {
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
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('template=full_dossier');
    expect(blob).toBe(expectedBlob);
  });
});

describe('downloadPdfBlob', () => {
  it('creates and clicks a download link', () => {
    const appendChildSpy = vi.spyOn(document.body, 'appendChild');
    const removeChildSpy = vi.spyOn(document.body, 'removeChild');
    const createElementSpy = vi.spyOn(document, 'createElement');
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.fn();
    createElementSpy.mockReturnValue({ click } as unknown as HTMLAnchorElement);
    appendChildSpy.mockImplementation(() => ({}) as Node);
    removeChildSpy.mockImplementation(() => ({}) as Node);

    downloadPdfBlob(new Blob(['pdf']), 'test.pdf');

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });
});
