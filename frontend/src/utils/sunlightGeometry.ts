import type { BuildingBlock } from '../types/api';
import type { TriangleOccluder } from './triangleRaycaster';
import { ROOF_EVALUATION_OFFSET_METERS } from './sunlightConstants';

type FootprintPoint = [number, number];

function toViewerGroundY(groundHeight: number, minGround: number): number {
  return groundHeight - minGround;
}

function toViewerTopY(groundHeight: number, buildingHeight: number, minGround: number): number {
  return toViewerGroundY(groundHeight, minGround) + buildingHeight;
}

function footprintCentroid(footprint: number[][]): FootprintPoint {
  if (footprint.length === 0) return [0, 0];
  const [sumX, sumY] = footprint.reduce(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]] as FootprintPoint,
    [0, 0],
  );
  return [sumX / footprint.length, sumY / footprint.length];
}

function fanTriangulate(
  points: [number, number, number][],
  pandId: string,
  triangles: TriangleOccluder[],
) {
  if (points.length < 3) return;
  for (let i = 1; i < points.length - 1; i++) {
    triangles.push({
      a: points[0],
      b: points[i],
      c: points[i + 1],
      pandId,
    });
  }
}

function addExtrudedFootprintTriangles(
  building: BuildingBlock,
  minGround: number,
  triangles: TriangleOccluder[],
) {
  const pandId = building.pand_id;
  const footprint = building.footprint;
  if (footprint.length < 3) return;

  const topY = toViewerTopY(building.ground_height, building.building_height, minGround);
  const baseY = toViewerGroundY(building.ground_height, minGround);
  const topRing: [number, number, number][] = [];

  for (const [x, dy] of footprint) {
    topRing.push([x, topY, -dy]);
  }
  fanTriangulate(topRing, pandId, triangles);

  for (let i = 0; i < footprint.length; i++) {
    const current = footprint[i];
    const next = footprint[(i + 1) % footprint.length];

    const x1 = current[0];
    const z1 = -current[1];
    const x2 = next[0];
    const z2 = -next[1];

    triangles.push({
      a: [x1, baseY, z1],
      b: [x2, baseY, z2],
      c: [x2, topY, z2],
      pandId,
    });
    triangles.push({
      a: [x1, baseY, z1],
      b: [x2, topY, z2],
      c: [x1, topY, z1],
      pandId,
    });
  }
}

function addLod22Triangles(
  building: BuildingBlock,
  minGround: number,
  triangles: TriangleOccluder[],
) {
  const surfaces = building.roof_surfaces;
  if (!surfaces || surfaces.length === 0) return;

  const pandId = building.pand_id;
  for (const surface of surfaces) {
    if (surface.length < 3) continue;
    const verts = surface.map((vert) => (
      [vert[0], vert[2] - minGround, -vert[1]] as [number, number, number]
    ));
    fanTriangulate(verts, pandId, triangles);
  }
}

function shouldIncludeBuilding(
  building: BuildingBlock,
  targetPandId: string,
  targetCentroid: FootprintPoint,
  cullDistanceMeters: number,
): boolean {
  if (building.pand_id === targetPandId) return true;
  const [cx, cy] = footprintCentroid(building.footprint);
  const dx = cx - targetCentroid[0];
  const dy = cy - targetCentroid[1];
  return Math.hypot(dx, dy) <= cullDistanceMeters;
}

export function buildTrianglesFromBuildings(
  buildings: BuildingBlock[],
  targetPandId: string,
  cullDistanceMeters: number,
): TriangleOccluder[] {
  if (buildings.length === 0) return [];
  const target = buildings.find((building) => building.pand_id === targetPandId) ?? buildings[0];
  const targetCentroid = footprintCentroid(target.footprint);
  const minGround = Math.min(...buildings.map((building) => building.ground_height));

  const safeCullDistance = Math.max(1, cullDistanceMeters);
  const triangles: TriangleOccluder[] = [];
  for (const building of buildings) {
    if (!shouldIncludeBuilding(building, targetPandId, targetCentroid, safeCullDistance)) {
      continue;
    }
    if (building.roof_surfaces && building.roof_surfaces.length > 0) {
      addLod22Triangles(building, minGround, triangles);
    } else {
      addExtrudedFootprintTriangles(building, minGround, triangles);
    }
  }
  return triangles;
}

export function getRelativeTargetHeights(
  buildings: BuildingBlock[],
  targetPandId: string,
): { roofY: number; groundY: number } | null {
  if (buildings.length === 0) return null;
  const target = buildings.find((building) => building.pand_id === targetPandId);
  if (!target) return null;
  const minGround = Math.min(...buildings.map((building) => building.ground_height));
  const groundY = toViewerGroundY(target.ground_height, minGround);
  const roofY = groundY + target.building_height + ROOF_EVALUATION_OFFSET_METERS;
  return { roofY, groundY };
}
