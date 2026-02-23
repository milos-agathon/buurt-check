import { describe, expect, it, vi } from 'vitest';
import { analyzeSunlight, getSampleMinutesForDay } from './sunlightAnalysis';

vi.mock('./sunPosition', () => ({
  SUN_DISTANCE: 300,
  getDaylightRange: vi.fn(() => ({ sunrise: 8, sunset: 9 })),
  getRepresentativeDates: vi.fn((year: number) =>
    Array.from({ length: 12 }, (_, month) => new Date(year, month, 21))),
  getSunDirection: vi.fn(() => ({ x: 1, y: 1, z: 1 })),
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
});
