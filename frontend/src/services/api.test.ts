import {
  downloadPdfBlob,
  exportBriefing,
  getBuildingFacts,
  getLivability,
  getNeighborhood3D,
  getNeighborhoodStats,
  getPropertyWarnings,
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

  it('aborts fetch after 45s timeout', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | null | undefined;
    mockFetch.mockImplementation((_url: string, opts?: RequestInit) => {
      capturedSignal = opts?.signal;
      return new Promise<Response>(() => {});
    });

    const promise = getNeighborhood3D('vbo-1', 'pand-1', 121286, 487296, 52.372, 4.892);

    expect(capturedSignal?.aborted).toBe(false);
    vi.advanceTimersByTime(45000);
    expect(capturedSignal?.aborted).toBe(true);

    vi.useRealTimers();
    promise.catch(() => {});
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
      buurtCode: 'BU0363AD07',
      postcode: '1012NX',
      houseNumber: '1',
      houseLetter: 'A',
      addition: '2',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/address/vbo-1/export');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.template).toBe('full_dossier');
    expect(body.shadow_image_b64).toBe('AAAA');
    expect(body.buurt_code).toBe('BU0363AD07');
    expect(body.postcode).toBe('1012NX');
    expect(body.house_number).toBe('1');
    expect(body.house_letter).toBe('A');
    expect(body.addition).toBe('2');
    expect(body.rd_x).toBe(1);
    expect(body.lat).toBe(3);
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

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(
      getPropertyWarnings('0363200000000001', 121000, 487000),
    ).rejects.toThrow('Property warnings failed: 502');
  });
});

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
    expect(result.available).toBe(true);
    expect(result.overall_normalized).toBe(75);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/address/0363200000000001/livability?');
    expect(url).toContain('rd_x=121286');
    expect(url).toContain('rd_y=487296');
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(500));
    await expect(
      getLivability('0363200000000001', 121286, 487296),
    ).rejects.toThrow('Livability failed: 500');
  });

  it('passes AbortSignal for timeout', async () => {
    mockFetch.mockResolvedValue(
      okResponse({ available: false, buurt_code: '', buurt_name: '', gemeente: '', year: '', overall_score: 0, overall_normalized: 0, dimensions: [], trend: [], comparison: [], source: '', messages: [] }),
    );
    await getLivability('vbo-1', 121286, 487296);
    const [, init] = mockFetch.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
