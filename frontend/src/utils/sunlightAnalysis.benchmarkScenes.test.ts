import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { analyzeSunlight } from './sunlightAnalysis';

vi.mock('./sunPosition', () => ({
  SUN_DISTANCE: 300,
  getDaylightRange: vi.fn(() => ({ sunrise: 8, sunset: 11 })),
  getRepresentativeDates: vi.fn((year: number) =>
    Array.from({ length: 12 }, (_, month) => new Date(year, month, 21))),
  getSunDirection: vi.fn((date: Date) => {
    const hour = date.getHours();
    if (hour <= 8) return { x: 1, y: 0.45, z: 0 };
    if (hour <= 9) return { x: 0.6, y: 0.55, z: 0.6 };
    if (hour <= 10) return { x: 0, y: 0.65, z: 1 };
    return { x: -1, y: 0.45, z: 0 };
  }),
  setTimeInTimeZone: vi.fn((date: Date, minuteOfDay: number) => {
    const sample = new Date(date);
    sample.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
    return sample;
  }),
}));

function createBoxMesh(
  pandId: string,
  center: { x: number; z: number },
  size: { width: number; depth: number; height: number },
): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(size.width, size.height, size.depth),
    new MeshBasicMaterial({ color: 0xffffff }),
  );
  mesh.position.set(center.x, size.height / 2, center.z);
  mesh.userData.pandId = pandId;
  mesh.updateMatrixWorld(true);
  return mesh;
}

function rectangleFootprint(centerX: number, centerZ: number, width: number, depth: number): number[][] {
  const minX = centerX - (width / 2);
  const maxX = centerX + (width / 2);
  const minZ = centerZ - (depth / 2);
  const maxZ = centerZ + (depth / 2);
  return [
    [minX, -minZ],
    [maxX, -minZ],
    [maxX, -maxZ],
    [minX, -maxZ],
  ];
}

async function runScene(buildingMeshes: Mesh[]) {
  return analyzeSunlight({
    buildingMeshes,
    targetPandId: 'target',
    footprint: rectangleFootprint(0, 0, 6, 6),
    roofY: 6.5,
    groundY: 0,
    lat: 52.37,
    lng: 4.9,
    year: 2025,
    intervalMinutes: 60,
    chunkRaycasts: 1_000_000,
    gridSpacingMeters: 3,
    maxPoints: 64,
    includeFacadePoints: true,
    includeGroundPoints: true,
    facadePointCount: 2,
    groundPointCount: 1,
    yieldControl: async () => {},
  });
}

describe('sunlight benchmark scenes', () => {
  it('orders benchmark scenes by expected openness (detached > row > canyon > courtyard)', async () => {
    const detached = await runScene([
      createBoxMesh('target', { x: 0, z: 0 }, { width: 6, depth: 6, height: 6 }),
    ]);

    const rowHouse = await runScene([
      createBoxMesh('target', { x: 0, z: 0 }, { width: 6, depth: 6, height: 6 }),
      createBoxMesh('row-east', { x: 8, z: 0 }, { width: 6, depth: 6, height: 6 }),
      createBoxMesh('row-west', { x: -8, z: 0 }, { width: 6, depth: 6, height: 6 }),
    ]);

    const canyon = await runScene([
      createBoxMesh('target', { x: 0, z: 0 }, { width: 6, depth: 6, height: 6 }),
      createBoxMesh('canyon-east', { x: 5, z: 0 }, { width: 4, depth: 20, height: 16 }),
      createBoxMesh('canyon-west', { x: -5, z: 0 }, { width: 4, depth: 20, height: 16 }),
    ]);

    const courtyard = await runScene([
      createBoxMesh('target', { x: 0, z: 0 }, { width: 6, depth: 6, height: 6 }),
      createBoxMesh('court-east', { x: 6, z: 0 }, { width: 4, depth: 18, height: 14 }),
      createBoxMesh('court-west', { x: -6, z: 0 }, { width: 4, depth: 18, height: 14 }),
      createBoxMesh('court-north', { x: 0, z: -6 }, { width: 18, depth: 4, height: 14 }),
      createBoxMesh('court-south', { x: 0, z: 6 }, { width: 18, depth: 4, height: 14 }),
    ]);

    expect(detached).not.toBeNull();
    expect(rowHouse).not.toBeNull();
    expect(canyon).not.toBeNull();
    expect(courtyard).not.toBeNull();

    const detachedHours = detached!.annualAverage;
    const rowHours = rowHouse!.annualAverage;
    const canyonHours = canyon!.annualAverage;
    const courtyardHours = courtyard!.annualAverage;

    expect(detachedHours).toBeGreaterThan(rowHours);
    expect(rowHours).toBeGreaterThan(canyonHours);
    expect(canyonHours).toBeGreaterThan(courtyardHours);
  });

  it('returns deterministic results for the same benchmark geometry', async () => {
    const scene = [
      createBoxMesh('target', { x: 0, z: 0 }, { width: 6, depth: 6, height: 6 }),
      createBoxMesh('canyon-east', { x: 5, z: 0 }, { width: 4, depth: 20, height: 16 }),
      createBoxMesh('canyon-west', { x: -5, z: 0 }, { width: 4, depth: 20, height: 16 }),
    ];

    const run1 = await runScene(scene);
    const run2 = await runScene(scene);

    expect(run1).not.toBeNull();
    expect(run2).not.toBeNull();
    expect(run1!.annualAverage).toBe(run2!.annualAverage);
    expect(run1!.winter).toBe(run2!.winter);
    expect(run1!.perPointAnnual).toEqual(run2!.perPointAnnual);
  });
});
