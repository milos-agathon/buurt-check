export type SurfaceVector3 = [number, number, number];

const EPSILON = 1e-9;

function normalize(vector: SurfaceVector3): SurfaceVector3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= EPSILON) return [0, 1, 0];
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/**
 * Compute polygon normal with Newell's method.
 * Expects vertices in a right-handed, Y-up coordinate system.
 */
export function computeRoofNormal(vertices: number[][]): SurfaceVector3 {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    return [0, 1, 0];
  }

  let nx = 0;
  let ny = 0;
  let nz = 0;

  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    if (!current || !next || current.length < 3 || next.length < 3) {
      continue;
    }

    nx += (current[1] - next[1]) * (current[2] + next[2]);
    ny += (current[2] - next[2]) * (current[0] + next[0]);
    nz += (current[0] - next[0]) * (current[1] + next[1]);
  }

  let normal = normalize([nx, ny, nz]);
  // Roof normals should point upward for irradiance incidence checks.
  if (normal[1] < 0) {
    normal = [-normal[0], -normal[1], -normal[2]];
  }
  return normal;
}

export function cardinalFacadeNormal(
  orientation: 'north' | 'south' | 'east' | 'west',
): SurfaceVector3 {
  switch (orientation) {
    case 'north':
      return [0, 0, -1];
    case 'south':
      return [0, 0, 1];
    case 'east':
      return [1, 0, 0];
    case 'west':
      return [-1, 0, 0];
    default:
      return [0, 0, 1];
  }
}

/**
 * Angle between surface normal and sun direction in radians.
 * Returns 0..PI.
 */
export function incidenceAngle(
  surfaceNormal: number[],
  sunDirection: number[],
): number {
  if (surfaceNormal.length < 3 || sunDirection.length < 3) {
    return Math.PI / 2;
  }

  const n = normalize([
    Number(surfaceNormal[0]) || 0,
    Number(surfaceNormal[1]) || 0,
    Number(surfaceNormal[2]) || 0,
  ]);
  const s = normalize([
    Number(sunDirection[0]) || 0,
    Number(sunDirection[1]) || 0,
    Number(sunDirection[2]) || 0,
  ]);

  const dot = Math.max(-1, Math.min(1, (n[0] * s[0]) + (n[1] * s[1]) + (n[2] * s[2])));
  return Math.acos(dot);
}
