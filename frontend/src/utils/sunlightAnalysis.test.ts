import { describe, expect, it, vi } from 'vitest';
import { analyzeSunlight, getSampleIntervalsForDay } from './sunlightAnalysis';
import { getDaylightRange, getSunDirection } from './sunPosition';

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

describe('getSampleIntervalsForDay', () => {
  it('uses clipped 30-minute intervals within the daylight window', () => {
    expect(getSampleIntervalsForDay(8.1, 9.9, 30)).toEqual([
      { startMinute: 486, endMinute: 510, midpointMinute: 498, durationHours: 0.4 },
      { startMinute: 510, endMinute: 540, midpointMinute: 525, durationHours: 0.5 },
      { startMinute: 540, endMinute: 570, midpointMinute: 555, durationHours: 0.5 },
      { startMinute: 570, endMinute: 594, midpointMinute: 582, durationHours: 0.4 },
    ]);
  });

  it('keeps a short non-aligned daylight window as clipped duration', () => {
    const intervals = getSampleIntervalsForDay(8.76, 8.77, 30);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].startMinute).toBeCloseTo(525.6);
    expect(intervals[0].endMinute).toBeCloseTo(526.2);
    expect(intervals[0].midpointMinute).toBeCloseTo(525.9);
    expect(intervals[0].durationHours).toBeCloseTo(0.01);
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
    expect(result!.winter).toBe(1);
    expect(result!.equinox).toBe(1);
    expect(result!.summer).toBe(1);
    expect(result!.annualAverage).toBe(1);
    expect(result!.perPointAnnual).toEqual([1, 1]);
    expect(result!.methodVersion).toBe('sunlight-v2-interval-dayweighted');
    expect(result!.targetPlane).toBe('roof');
    expect(result!.roofGridPoints).toEqual([
      [0, 10, 0],
      [2, 10, -2],
    ]);
    expect(yieldControl).toHaveBeenCalled();
  });

  it('returns per-timestep visibility matrix when requested', async () => {
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
      emitPerTimestep: true,
    });

    expect(result).not.toBeNull();
    expect(result!.perTimestepVisibility).toBeDefined();
    expect(result!.timestepMeta).toBeDefined();

    const visibility = result!.perTimestepVisibility!;
    const timestepMeta = result!.timestepMeta!;

    expect(visibility.length).toBe(result!.roofGridPoints?.length ?? 0);
    expect(timestepMeta.length).toBeGreaterThan(0);

    const timestepCount = visibility[0]?.length ?? 0;
    expect(timestepCount).toBe(timestepMeta.length);

    for (const perPoint of visibility) {
      expect(perPoint.length).toBe(timestepCount);
      for (const value of perPoint) {
        expect(value === 0 || value === 1).toBe(true);
      }
    }
  });

  it('keeps timestep metadata and visibility aligned when sun direction is unavailable', async () => {
    const sunDirectionMock = vi.mocked(getSunDirection);
    sunDirectionMock.mockImplementation((date: Date) => {
      if (date.getMinutes() === 45) {
        return null;
      }
      return { x: 1, y: 1, z: 1 } as any;
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
        intervalMinutes: 30,
        raycaster,
        yieldControl: async () => {},
        emitPerTimestep: true,
      });

      expect(result).not.toBeNull();
      const visibility = result!.perTimestepVisibility!;
      const timestepMeta = result!.timestepMeta!;

      expect(visibility[0].length).toBe(timestepMeta.length);
      expect(visibility[0]).toContain(0);
    } finally {
      sunDirectionMock.mockImplementation(() => ({ x: 1, y: 1, z: 1 } as any));
    }
  });

  it('emits per-timestep visibility for roof points only when extra eval points are present', async () => {
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
      emitPerTimestep: true,
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
    expect(result!.roofGridPoints).toHaveLength(2);
    expect(result!.samplingBreakdown?.total).toBe(4);
    expect(result!.perTimestepVisibility).toHaveLength(2);
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
    expect(result!.annualAverage).toBe(1);
    expect(result!.perPointAnnual).toEqual([1, 1]);
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

  it('computes annual averages using calendar-day-weighted monthly means', async () => {
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
      expect(result!.annualAverage).toBe(2);
      expect(result!.perPointAnnual).toEqual([2, 2]);
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
    expect(result!.perPointAnnual).toEqual([1, 1]);
    expect(result!.facadeResults).toEqual([
      {
        orientation: 'south',
        heightLabel: '1.5m',
        winterHours: 1,
        summerHours: 1,
        annualAverage: 1,
      },
    ]);
    expect(result!.groundAnnualAverage).toBe(1);
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
    expect(result!.winter).toBe(1);
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
