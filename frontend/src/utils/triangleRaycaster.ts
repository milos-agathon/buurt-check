import { Matrix4, Mesh, Vector3 } from 'three';
import type { RaycasterLike } from './sunlightAnalysis';

const EPSILON = 1e-7;

type Vec3 = [number, number, number];

export interface TriangleOccluder {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  pandId?: string;
  isGround?: boolean;
}

interface TriangleHit {
  distance: number;
  object: {
    userData: {
      pandId?: string;
      isGround?: boolean;
    };
  };
}

function rayTriangleDistance(origin: Vec3, direction: Vec3, tri: TriangleOccluder): number | null {
  const edge1x = tri.b[0] - tri.a[0];
  const edge1y = tri.b[1] - tri.a[1];
  const edge1z = tri.b[2] - tri.a[2];

  const edge2x = tri.c[0] - tri.a[0];
  const edge2y = tri.c[1] - tri.a[1];
  const edge2z = tri.c[2] - tri.a[2];

  const px = (direction[1] * edge2z) - (direction[2] * edge2y);
  const py = (direction[2] * edge2x) - (direction[0] * edge2z);
  const pz = (direction[0] * edge2y) - (direction[1] * edge2x);

  const det = (edge1x * px) + (edge1y * py) + (edge1z * pz);
  if (Math.abs(det) < EPSILON) return null;

  const invDet = 1 / det;
  const tx = origin[0] - tri.a[0];
  const ty = origin[1] - tri.a[1];
  const tz = origin[2] - tri.a[2];

  const u = ((tx * px) + (ty * py) + (tz * pz)) * invDet;
  if (u < 0 || u > 1) return null;

  const qx = (ty * edge1z) - (tz * edge1y);
  const qy = (tz * edge1x) - (tx * edge1z);
  const qz = (tx * edge1y) - (ty * edge1x);

  const v = ((direction[0] * qx) + (direction[1] * qy) + (direction[2] * qz)) * invDet;
  if (v < 0 || (u + v) > 1) return null;

  const t = ((edge2x * qx) + (edge2y * qy) + (edge2z * qz)) * invDet;
  return t > EPSILON ? t : null;
}

export function createTriangleRaycaster(triangles: TriangleOccluder[]): RaycasterLike {
  let origin: Vec3 = [0, 0, 0];
  let direction: Vec3 = [0, 1, 0];

  return {
    far: Infinity,
    set(nextOrigin: { x: number; y: number; z: number }, nextDirection: { x: number; y: number; z: number }) {
      origin = [nextOrigin.x, nextOrigin.y, nextOrigin.z];
      direction = [nextDirection.x, nextDirection.y, nextDirection.z];
    },
    intersectObjects(_objects: unknown[]) {
      const hits: TriangleHit[] = [];
      for (const tri of triangles) {
        const distance = rayTriangleDistance(origin, direction, tri);
        if (distance == null || distance > this.far) continue;
        hits.push({
          distance,
          object: {
            userData: {
              pandId: tri.pandId,
              isGround: tri.isGround,
            },
          },
        });
      }
      hits.sort((a, b) => a.distance - b.distance);
      return hits;
    },
  };
}

function toVec3(x: number, y: number, z: number, matrix: Matrix4): Vec3 {
  const vec = new Vector3(x, y, z).applyMatrix4(matrix);
  return [vec.x, vec.y, vec.z];
}

function pushTriangle(
  triangles: TriangleOccluder[],
  matrixWorld: Matrix4,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  pandId?: string,
  isGround?: boolean,
) {
  triangles.push({
    a: toVec3(a[0], a[1], a[2], matrixWorld),
    b: toVec3(b[0], b[1], b[2], matrixWorld),
    c: toVec3(c[0], c[1], c[2], matrixWorld),
    pandId,
    isGround,
  });
}

export function trianglesFromMeshObjects(meshes: unknown[]): TriangleOccluder[] {
  const triangles: TriangleOccluder[] = [];

  for (const obj of meshes) {
    if (!(obj instanceof Mesh)) continue;

    obj.updateMatrixWorld(true);
    const matrixWorld = obj.matrixWorld;
    const geometry = obj.geometry;
    const positions = geometry.getAttribute('position');
    if (!positions) continue;

    const pandId = obj.userData?.pandId as string | undefined;
    const isGround = Boolean(obj.userData?.isGround);

    if (geometry.index) {
      const index = geometry.index.array;
      for (let i = 0; i < index.length; i += 3) {
        const ia = Number(index[i]);
        const ib = Number(index[i + 1]);
        const ic = Number(index[i + 2]);
        pushTriangle(
          triangles,
          matrixWorld,
          [positions.getX(ia), positions.getY(ia), positions.getZ(ia)],
          [positions.getX(ib), positions.getY(ib), positions.getZ(ib)],
          [positions.getX(ic), positions.getY(ic), positions.getZ(ic)],
          pandId,
          isGround,
        );
      }
      continue;
    }

    for (let i = 0; i < positions.count; i += 3) {
      if (i + 2 >= positions.count) break;
      pushTriangle(
        triangles,
        matrixWorld,
        [positions.getX(i), positions.getY(i), positions.getZ(i)],
        [positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1)],
        [positions.getX(i + 2), positions.getY(i + 2), positions.getZ(i + 2)],
        pandId,
        isGround,
      );
    }
  }

  return triangles;
}
