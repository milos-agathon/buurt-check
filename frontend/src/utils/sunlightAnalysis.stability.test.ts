import { describe, expect, it, vi } from 'vitest';
import { analyzeSunlight } from './sunlightAnalysis';

vi.mock('./sunPosition', () => ({
  SUN_DISTANCE: 300,
  getDaylightRange: vi.fn(() => ({ sunrise: 7.5, sunset: 9 })),
  getRepresentativeDates: vi.fn((year: number) =>
    Array.from({ length: 12 }, (_, month) => new Date(year, month, 21))),
  getSunDirection: vi.fn(() => ({ x: 1, y: 1, z: 1 })),
  setTimeInTimeZone: vi.fn((date: Date, minuteOfDay: number) => {
    const sample = new Date(date);
    sample.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
    return sample;
  }),
}));

function createDeterministicRaycaster() {
  let originX = 0;
  let originZ = 0;

  return {
    far: 0,
    set: vi.fn((origin: { x: number; z: number }, _direction: unknown) => {
      originX = origin.x;
      originZ = origin.z;
    }),
    intersectObjects: vi.fn((_objects: unknown[]) => {
      const bucket = Math.round(originX * 10) + Math.round(originZ * 10);
      return bucket % 3 === 0
        ? [{ object: { userData: { pandId: 'neighbor' } } }]
        : [];
    }),
  };
}

async function runAnalysis() {
  return analyzeSunlight({
    buildingMeshes: [{}],
    targetPandId: 'stability-test',
    footprint: [[0, 0], [16, 0], [16, 16], [0, 16]],
    roofY: 10,
    lat: 52.37,
    lng: 4.9,
    year: 2025,
    intervalMinutes: 30,
    chunkRaycasts: 1_000_000,
    gridSpacingMeters: 2,
    maxPoints: 256,
    raycaster: createDeterministicRaycaster(),
    yieldControl: async () => {},
  });
}

describe('sunlight analysis stability', () => {
  it('produces identical output across 5 consecutive runs', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => runAnalysis()),
    );

    for (const result of results) {
      expect(result).not.toBeNull();
    }

    const baseline = results[0]!;

    for (let i = 1; i < results.length; i++) {
      const current = results[i]!;
      expect(current.winter).toBe(baseline.winter);
      expect(current.equinox).toBe(baseline.equinox);
      expect(current.summer).toBe(baseline.summer);
      expect(current.annualAverage).toBe(baseline.annualAverage);
      expect(current.perPointAnnual).toEqual(baseline.perPointAnnual);
      expect(current.roofGridPoints).toEqual(baseline.roofGridPoints);
    }
  });
});
