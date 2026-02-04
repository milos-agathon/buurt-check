import { suggestAddresses, lookupAddress, getBuildingFacts, getNeighborhood3D } from './api';

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
