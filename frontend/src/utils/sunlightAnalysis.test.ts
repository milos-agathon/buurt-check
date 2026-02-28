import { describe, expect, it, vi } from 'vitest';
import { analyzeSunlight, getSampleMinutesForDay } from './sunlightAnalysis';
import { getDaylightRange } from './sunPosition';

vi.mock('./sunPosition', () => ({
  SUN_DISTANCE: 300,
  getDaylightRange: vi.fn(() => ({ sunrise: 8, sunset: 9 })),
  getRepresentativeDates: vi.fn((year: number) =>
    Array.from({ length: 12 }, (_, month) => new Date(year, month, 21))),
  getSunDirection: vi.fn(() => ({ x: 1, y: 1, z: 1 })),
  setTimeInTimeZone: vi.fn((date: Date, minuteOfDay: number) => {
    const sample = new Date(date);
    sample.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
    return sample;
  }),
}));

vi.mock('./roofSampling', () => ({
  DEFAULT_GRID_SPACING_METERS: 2,
  DEFAULT_MAX_ROOF_POINTS: 64,
  generateRoofSamplePoints: vi.fn(() => [
    [0, 10, 0],
    [2, 10, -2],
  ]),
}));

describe('getSampleMinutesForDay', () => {
  it('uses 30-minute samples clamped to daylight window', () => {
    expect(getSampleMinutesForDay(8.1, 9.9, 30)).toEqual([510, 540, 570]);
  });

  it('returns empty when rounded sunset is before rounded sunrise', () => {
    expect(getSampleMinutesForDay(8.76, 8.77, 30)).toEqual([]);
  });
});

describe('analyzeSunlight', () => {
  it('computes per-point and aggregate sunlight using 30-minute intervals', async () => {
    const raycaster = {
      far: 0,
      set: vi.fn(),
      intersectObjects: vi.fn(() => []),
    };
    const yieldControl = vi.fn(async () => {});

    const result = await analyzeSunlight({
      buildingMeshes: [{ userData: { pandId: 'target' } }],
      targetPandId: 'target',
      footprint: [[0, 0], [4, 0], [4, 4], [0, 4]],
      roofY: 10,
      lat: 52.37,
      lng: 4.9,
      intervalMinutes: 30,
      chunkRaycasts: 2,
      raycaster,
      yieldControl,
    });

    expect(result).not.toBeNull();
    expect(result!.winter).toBe(1.5);
    expect(result!.equinox).toBe(1.5);
    expect(result!.summer).toBe(1.5);
    expect(result!.annualAverage).toBe(1.5);
    expect(result!.perPointAnnual).toEqual([1.5, 1.5]);
    expect(result!.roofGridPoints).toEqual([
      [0, 10, 0],
      [2, 10, -2],
    ]);
    expect(yieldControl).toHaveBeenCalled();
  });

  it('treats intersections from other buildings as blocked', async () => {
    const raycaster = {
      far: 0,
      set: vi.fn(),
      intersectObjects: vi.fn(() => [{ object: { userData: { pandId: 'other' } } }]),
    };

    const result = await analyzeSunlight({
      buildingMeshes: [{ userData: { pandId: 'target' } }],
      targetPandId: 'target',
      footprint: [[0, 0], [4, 0], [4, 4], [0, 4]],
      roofY: 10,
      lat: 52.37,
      lng: 4.9,
      intervalMinutes: 30,
      raycaster,
      yieldControl: async () => {},
    });

    expect(result).not.toBeNull();
    expect(result!.annualAverage).toBe(0);
    expect(result!.perPointAnnual).toEqual([0, 0]);
  });

  it('ignores same-surface self-hits at ray origin', async () => {
    const raycaster = {
      far: 0,
      set: vi.fn(),
      intersectObjects: vi.fn(() => [{ distance: 0, object: { userData: { pandId: 'target' } } }]),
    };

    const result = await analyzeSunlight({
      buildingMeshes: [{ userData: { pandId: 'target' } }],
      targetPandId: 'target',
      footprint: [[0, 0], [4, 0], [4, 4], [0, 4]],
      roofY: 10,
      lat: 52.37,
      lng: 4.9,
      intervalMinutes: 30,
      raycaster,
      yieldControl: async () => {},
    });

    expect(result).not.toBeNull();
    expect(result!.annualAverage).toBe(1.5);
    expect(result!.perPointAnnual).toEqual([1.5, 1.5]);
  });

  it('counts distant self-hits as real self-shadowing', async () => {
    const raycaster = {
      far: 0,
      set: vi.fn(),
      intersectObjects: vi.fn(() => [{ distance: 1.25, object: { userData: { pandId: 'target' } } }]),
    };

    const result = await analyzeSunlight({
      buildingMeshes: [{ userData: { pandId: 'target' } }],
      targetPandId: 'target',
      footprint: [[0, 0], [4, 0], [4, 4], [0, 4]],
      roofY: 10,
      lat: 52.37,
      lng: 4.9,
      intervalMinutes: 30,
      raycaster,
      yieldControl: async () => {},
    });

    expect(result).not.toBeNull();
    expect(result!.annualAverage).toBe(0);
    expect(result!.perPointAnnual).toEqual([0, 0]);
  });

  it('returns null when aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const result = await analyzeSunlight({
      buildingMeshes: [],
      targetPandId: 'target',
      footprint: [[0, 0], [4, 0], [4, 4], [0, 4]],
      roofY: 10,
      lat: 52.37,
      lng: 4.9,
      abortSignal: abortController.signal,
    });

    expect(result).toBeNull();
  });

  it('computes annual averages using daylight-weighted monthly means', async () => {
    const daylightRangeMock = vi.mocked(getDaylightRange);
    daylightRangeMock.mockImplementation((date: Date) => {
      return date.getMonth() < 6
        ? { sunrise: 8, sunset: 9 }
        : { sunrise: 8, sunset: 11 };
    });

    const raycaster = {
      far: 0,
      set: vi.fn(),
      intersectObjects: vi.fn(() => []),
    };

    try {
      const result = await analyzeSunlight({
        buildingMeshes: [{ userData: { pandId: 'target' } }],
        targetPandId: 'target',
        footprint: [[0, 0], [4, 0], [4, 4], [0, 4]],
        roofY: 10,
        lat: 52.37,
        lng: 4.9,
        intervalMinutes: 60,
        raycaster,
        yieldControl: async () => {},
      });

      expect(result).not.toBeNull();
      expect(result!.annualAverage).toBe(3.3);
      expect(result!.perPointAnnual).toEqual([3.3, 3.3]);
    } finally {
      daylightRangeMock.mockImplementation(() => ({ sunrise: 8, sunset: 9 }));
    }
  });

  it('computes facade and ground breakdowns from labeled extra eval points without changing roof aggregates', async () => {
    const raycaster = {
      far: 0,
      set: vi.fn(),
      intersectObjects: vi.fn(() => []),
    };

    const result = await analyzeSunlight({
      buildingMeshes: [{ userData: { pandId: 'target' } }],
      targetPandId: 'target',
      footprint: [[0, 0], [4, 0], [4, 4], [0, 4]],
      roofY: 10,
      lat: 52.37,
      lng: 4.9,
      intervalMinutes: 30,
      raycaster,
      yieldControl: async () => {},
      extraEvalPoints: {
        points: [
          [5, 3.5, -5],
          [8, 1.5, -8],
        ],
        labels: [
          'facade:south:1.5m',
          'ground:ring:0',
        ],
        skipSelfShadow: false,
      },
    });

    expect(result).not.toBeNull();
    expect(result!.perPointAnnual).toEqual([1.5, 1.5]);
    expect(result!.facadeResults).toEqual([
      {
        orientation: 'south',
        heightLabel: '1.5m',
        winterHours: 1.5,
        summerHours: 1.5,
        annualAverage: 1.5,
      },
    ]);
    expect(result!.groundAnnualAverage).toBe(1.5);
    expect(result!.samplingBreakdown).toEqual({
      roof: 2,
      facade: 1,
      ground: 1,
      total: 4,
    });
  });

  it('counts target-building hits as blocking for extra points when skipSelfShadow is false', async () => {
    const raycaster = {
      far: 0,
      set: vi.fn(),
      intersectObjects: vi.fn(() => [{ distance: 0, object: { userData: { pandId: 'target' } } }]),
    };

    const result = await analyzeSunlight({
      buildingMeshes: [{ userData: { pandId: 'target' } }],
      targetPandId: 'target',
      footprint: [[0, 0], [4, 0], [4, 4], [0, 4]],
      roofY: 10,
      lat: 52.37,
      lng: 4.9,
      intervalMinutes: 30,
      raycaster,
      yieldControl: async () => {},
      extraEvalPoints: {
        points: [[5, 3.5, -5]],
        labels: ['facade:south:1.5m'],
        skipSelfShadow: false,
      },
    });

    expect(result).not.toBeNull();
    expect(result!.winter).toBe(1.5);
    expect(result!.facadeResults).toEqual([
      {
        orientation: 'south',
        heightLabel: '1.5m',
        winterHours: 0,
        summerHours: 0,
        annualAverage: 0,
      },
    ]);
  });
});
