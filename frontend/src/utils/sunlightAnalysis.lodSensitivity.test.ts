import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { analyzeSunlight } from './sunlightAnalysis';

vi.mock('./sunPosition', () => ({
  SUN_DISTANCE: 300,
  getDaylightRange: vi.fn(() => ({ sunrise: 8, sunset: 14 })),
  getRepresentativeDates: vi.fn((year: number) =>
    Array.from({ length: 12 }, (_, month) => new Date(year, month, 21))),
  getSunDirection: vi.fn((date: Date) => {
    const hour = date.getHours();
    if (hour <= 9) return { x: 0.9, y: 0.4, z: 0.2 };
    if (hour <= 11) return { x: 0.2, y: 0.7, z: 0.9 };
    if (hour <= 13) return { x: -0.9, y: 0.4, z: 0.2 };
    return { x: -0.3, y: 0.6, z: -0.8 };
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
  baseY: number = 0,
): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(size.width, size.height, size.depth),
    new MeshBasicMaterial({ color: 0xffffff }),
  );
  mesh.position.set(center.x, baseY + (size.height / 2), center.z);
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

async function runScene(targetMeshes: Mesh[]) {
  const neighbors = [
    createBoxMesh('neighbor-east', { x: 8, z: 0 }, { width: 4, depth: 18, height: 14 }),
    createBoxMesh('neighbor-west', { x: -8, z: 0 }, { width: 4, depth: 18, height: 14 }),
    createBoxMesh('neighbor-south', { x: 0, z: 8 }, { width: 14, depth: 4, height: 10 }),
  ];

  return analyzeSunlight({
    buildingMeshes: [...targetMeshes, ...neighbors],
    targetPandId: 'target',
    footprint: rectangleFootprint(0, 0, 8, 8),
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
    facadePointCount: 2,
    groundPointCount: 1,
    yieldControl: async () => {},
  });
}

describe('sunlight benchmark: LoD sensitivity on target roof', () => {
  it('quantifies LoD 1.2 vs LoD 2.2 sensitivity with detailed roof obstructions', async () => {
    // LoD 1.2: extruded footprint with a flat roof.
    const lod12 = await runScene([
      createBoxMesh('target', { x: 0, z: 0 }, { width: 8, depth: 8, height: 6 }),
    ]);

    // LoD 2.2: same base volume plus roof detail (ridge + dormer-like obstruction).
    const lod22 = await runScene([
      createBoxMesh('target', { x: 0, z: 0 }, { width: 8, depth: 8, height: 6 }),
      createBoxMesh('target', { x: 0, z: 0 }, { width: 2.4, depth: 8, height: 2.4 }, 6),
      createBoxMesh('target', { x: 1.4, z: -0.2 }, { width: 4, depth: 4.2, height: 2.6 }, 6),
    ]);

    expect(lod12).not.toBeNull();
    expect(lod22).not.toBeNull();

    const lod12Result = lod12!;
    const lod22Result = lod22!;
    const lod12RoofCount = lod12Result.roofGridPoints?.length ?? 0;
    const lod22RoofCount = lod22Result.roofGridPoints?.length ?? 0;

    expect(lod12RoofCount).toBeGreaterThan(0);
    expect(lod12RoofCount).toBe(lod22RoofCount);
    expect(lod12Result.annualAverage).toBeGreaterThan(lod22Result.annualAverage);
    expect(lod12Result.winter).toBeGreaterThan(lod22Result.winter);

    // Keep a minimum detectable delta so geometry sensitivity is explicit in CI.
    expect(lod12Result.annualAverage - lod22Result.annualAverage).toBeGreaterThanOrEqual(0.2);
    expect(lod12Result.winter - lod22Result.winter).toBeGreaterThanOrEqual(0.2);
  });
});
