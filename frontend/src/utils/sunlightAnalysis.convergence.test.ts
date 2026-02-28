import { describe, expect, it, vi } from 'vitest';
import { analyzeSunlight } from './sunlightAnalysis';

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

function createBoundaryRaycaster() {
  let originX = 0;
  let originZ = 0;

  return {
    far: 0,
    set: vi.fn((origin: { x: number; z: number }, _direction: unknown) => {
      originX = origin.x;
      originZ = origin.z;
    }),
    intersectObjects: vi.fn((_objects: unknown[]) => {
      const blocked = (originX + originZ) > -1.3;
      return blocked
        ? [{ object: { userData: { pandId: 'neighbor' } } }]
        : [];
    }),
  };
}

describe('sunlight analysis convergence', () => {
  async function assertConvergenceForFootprint(footprint: number[][]) {
    const coarse = await analyzeSunlight({
      buildingMeshes: [{}],
      targetPandId: 'target',
      footprint,
      roofY: 10,
      lat: 52.37,
      lng: 4.9,
      year: 2025,
      intervalMinutes: 30,
      chunkRaycasts: 1_000_000,
      gridSpacingMeters: 4,
      maxPoints: 64,
      raycaster: createBoundaryRaycaster(),
      yieldControl: async () => {},
    });
    const medium = await analyzeSunlight({
      buildingMeshes: [{}],
      targetPandId: 'target',
      footprint,
      roofY: 10,
      lat: 52.37,
      lng: 4.9,
      year: 2025,
      intervalMinutes: 30,
      chunkRaycasts: 1_000_000,
      gridSpacingMeters: 2,
      maxPoints: 256,
      raycaster: createBoundaryRaycaster(),
      yieldControl: async () => {},
    });
    const fine = await analyzeSunlight({
      buildingMeshes: [{}],
      targetPandId: 'target',
      footprint,
      roofY: 10,
      lat: 52.37,
      lng: 4.9,
      year: 2025,
      intervalMinutes: 30,
      chunkRaycasts: 1_000_000,
      gridSpacingMeters: 1,
      maxPoints: 1024,
      raycaster: createBoundaryRaycaster(),
      yieldControl: async () => {},
    });

    expect(coarse).not.toBeNull();
    expect(medium).not.toBeNull();
    expect(fine).not.toBeNull();

    const r1 = coarse!;
    const r2 = medium!;
    const r3 = fine!;

    const coarseCount = r1.roofGridPoints?.length ?? 0;
    const mediumCount = r2.roofGridPoints?.length ?? 0;
    const fineCount = r3.roofGridPoints?.length ?? 0;
    expect(mediumCount).toBeGreaterThan(coarseCount);
    expect(fineCount).toBeGreaterThan(mediumCount);

    const d12 = Math.abs(r1.annualAverage - r2.annualAverage);
    const d23 = Math.abs(r2.annualAverage - r3.annualAverage);
    expect(d23).toBeLessThanOrEqual(d12);
    expect(d23).toBeLessThanOrEqual(0.3);
  }

  it('stabilizes as roof sample density increases for multiple footprint shapes', async () => {
    await assertConvergenceForFootprint([[0, 0], [20, 0], [20, 20], [0, 20]]);
    await assertConvergenceForFootprint([[0, 0], [28, 0], [28, 12], [0, 12]]);
  });
});
