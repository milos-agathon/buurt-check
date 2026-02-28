import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { analyzeSunlight } from './sunlightAnalysis';
import { createTriangleRaycaster, trianglesFromMeshObjects } from './triangleRaycaster';

vi.mock('./sunPosition', () => ({
  SUN_DISTANCE: 300,
  getDaylightRange: vi.fn(() => ({ sunrise: 8, sunset: 11 })),
  getRepresentativeDates: vi.fn((year: number) =>
    Array.from({ length: 12 }, (_, month) => new Date(year, month, 21))),
  getSunDirection: vi.fn((date: Date) => {
    const hour = date.getHours();
    if (hour <= 8) return { x: 1, y: 0.45, z: 0 };
    if (hour <= 9) return { x: 0.7, y: 0.55, z: 0.7 };
    if (hour <= 10) return { x: 0, y: 0.65, z: 1 };
    return { x: -1, y: 0.45, z: 0 };
  }),
  setTimeInTimeZone: vi.fn((date: Date, minuteOfDay: number) => {
    const sample = new Date(date);
    sample.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
    return sample;
  }),
}));

function createMesh(pandId: string, x: number, z: number, width: number, depth: number, height: number): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshBasicMaterial({ color: 0xffffff }),
  );
  mesh.position.set(x, height / 2, z);
  mesh.userData.pandId = pandId;
  mesh.updateMatrixWorld(true);
  return mesh;
}

const TARGET_FOOTPRINT = [[-3, 3], [3, 3], [3, -3], [-3, -3]];

describe('sunlight cross-check: three raycaster vs independent triangle raycaster', () => {
  it('agrees within tolerance on annual and seasonal metrics', async () => {
    const sceneMeshes = [
      createMesh('target', 0, 0, 6, 6, 6),
      createMesh('neighbor-east', 5.5, 0, 4, 20, 14),
      createMesh('neighbor-west', -5.5, 0, 4, 20, 14),
      createMesh('neighbor-south', 0, 7, 10, 3, 10),
    ];

    const baseline = await analyzeSunlight({
      buildingMeshes: sceneMeshes,
      targetPandId: 'target',
      footprint: TARGET_FOOTPRINT,
      roofY: 6.5,
      groundY: 0,
      lat: 52.37,
      lng: 4.9,
      year: 2025,
      intervalMinutes: 60,
      chunkRaycasts: 1_000_000,
      gridSpacingMeters: 2,
      maxPoints: 64,
      includeFacadePoints: true,
      includeGroundPoints: true,
      yieldControl: async () => {},
    });

    const triangles = trianglesFromMeshObjects(sceneMeshes);
    const triangleRaycaster = createTriangleRaycaster(triangles);

    const crosscheck = await analyzeSunlight({
      buildingMeshes: [],
      raycaster: triangleRaycaster,
      targetPandId: 'target',
      footprint: TARGET_FOOTPRINT,
      roofY: 6.5,
      groundY: 0,
      lat: 52.37,
      lng: 4.9,
      year: 2025,
      intervalMinutes: 60,
      chunkRaycasts: 1_000_000,
      gridSpacingMeters: 2,
      maxPoints: 64,
      includeFacadePoints: true,
      includeGroundPoints: true,
      yieldControl: async () => {},
    });

    expect(baseline).not.toBeNull();
    expect(crosscheck).not.toBeNull();

    expect(Math.abs(baseline!.annualAverage - crosscheck!.annualAverage)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(baseline!.winter - crosscheck!.winter)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(baseline!.equinox - crosscheck!.equinox)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(baseline!.summer - crosscheck!.summer)).toBeLessThanOrEqual(0.2);
  });
});
