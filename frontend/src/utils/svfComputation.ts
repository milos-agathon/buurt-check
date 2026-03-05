import {
  Color,
  CubeCamera,
  Mesh,
  MeshBasicMaterial,
  Scene,
  WebGLCubeRenderTarget,
} from 'three';
import type { Object3D, WebGLRenderer } from 'three';
import { getTregenzaPatches } from './tregenzaPatches';
import { perezLuminance } from './perezSky';

const SKY_COLOR: [number, number, number] = [135, 206, 235];
const OBSTRUCTION_COLOR = 0x000000;
const CUBE_SIZE = 64;
const SKY_TOLERANCE = 30;
const UPPER_HEMISPHERE_FACES = [0, 1, 2, 4, 5];

/**
 * Cosine-weighted solid-angle contribution for one cubemap pixel.
 * Face order: +X(0), -X(1), +Y(2), -Y(3), +Z(4), -Z(5).
 */
export function cosineWeightForCubemapPixel(
  faceIndex: number,
  px: number,
  py: number,
  size: number,
): number {
  if (size <= 0) return 0;

  // Normalize pixel center to [-1, 1] face coordinates.
  const u = ((px + 0.5) / size) * 2 - 1;
  const v = -(((py + 0.5) / size) * 2 - 1);

  let dx = 0;
  let dy = 0;
  let dz = 0;
  switch (faceIndex) {
    case 0: dx = 1; dy = v; dz = -u; break; // +X
    case 1: dx = -1; dy = v; dz = u; break; // -X
    case 2: dx = u; dy = 1; dz = -v; break; // +Y
    case 3: dx = u; dy = -1; dz = v; break; // -Y
    case 4: dx = u; dy = v; dz = 1; break; // +Z
    case 5: dx = -u; dy = v; dz = -1; break; // -Z
    default: return 0;
  }

  const len = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
  if (len <= 0) return 0;
  const ny = dy / len;

  // SVF only uses the upper hemisphere.
  if (ny <= 0) return 0;

  // Cubemap pixel solid-angle term: dOmega = 1 / (u^2 + v^2 + 1)^(3/2)
  const r2 = (u * u) + (v * v) + 1;
  const dOmega = 1 / (r2 * Math.sqrt(r2));

  return ny * dOmega;
}

/**
 * Inverse of cosineWeightForCubemapPixel's direction computation.
 * Maps a 3D direction vector to cubemap face index and UV pixel coordinates.
 *
 * Face order: +X(0), -X(1), +Y(2), -Y(3), +Z(4), -Z(5).
 *
 * Returns face index plus integer pixel coordinates clamped to [0, size-1].
 */
export function directionToFaceUV(
  dx: number,
  dy: number,
  dz: number,
  size: number,
): { face: number; u: number; v: number } {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const absDz = Math.abs(dz);

  let face: number;
  let uNorm: number;
  let vNorm: number;

  if (absDx >= absDy && absDx >= absDz) {
    if (dx > 0) {
      // Face 0 (+X): forward dx=1, dy=v, dz=-u → u_norm=-dz/dx, v_norm=dy/dx
      face = 0;
      uNorm = -dz / dx;
      vNorm = dy / dx;
    } else {
      // Face 1 (-X): forward dx=-1, dy=v, dz=u
      // Normalize by -dx: u_norm=dz/(-dx), v_norm=dy/(-dx)
      face = 1;
      const scale = -dx;
      uNorm = dz / scale;
      vNorm = dy / scale;
    }
  } else if (absDy >= absDx && absDy >= absDz) {
    if (dy > 0) {
      // Face 2 (+Y): forward dx=u, dy=1, dz=-v → u_norm=dx/dy, v_norm=-dz/dy
      face = 2;
      uNorm = dx / dy;
      vNorm = -dz / dy;
    } else {
      // Face 3 (-Y): forward dx=u, dy=-1, dz=v
      // Normalize by -dy: u_norm=dx/(-dy), v_norm=dz/(-dy)
      face = 3;
      const scale = -dy;
      uNorm = dx / scale;
      vNorm = dz / scale;
    }
  } else {
    if (dz > 0) {
      // Face 4 (+Z): forward dx=u, dy=v, dz=1 → u_norm=dx/dz, v_norm=dy/dz
      face = 4;
      uNorm = dx / dz;
      vNorm = dy / dz;
    } else {
      // Face 5 (-Z): forward dx=-u, dy=v, dz=-1
      // u_norm = -dx/(-dz) = dx/dz, v_norm = dy/(-dz)
      face = 5;
      uNorm = dx / dz;     // dx/dz where dz<0
      vNorm = dy / (-dz);
    }
  }

  // Inverse of the normalization:
  //   u_norm = ((px + 0.5) / size) * 2 - 1  →  px = ((u_norm + 1) / 2) * size - 0.5
  //   v_norm = -(((py + 0.5) / size) * 2 - 1)  →  py = ((-v_norm + 1) / 2) * size - 0.5
  const px = Math.round(((uNorm + 1) / 2) * size - 0.5);
  const py = Math.round(((-vNorm + 1) / 2) * size - 0.5);

  return {
    face,
    u: Math.max(0, Math.min(size - 1, px)),
    v: Math.max(0, Math.min(size - 1, py)),
  };
}

/**
 * Check if a specific pixel at (px, py) in per-face cubemap data is sky-colored.
 * Uses the same SKY_TOLERANCE as the existing isSkyPixel function.
 *
 * @param facePixels - Uint8Array of size*size*4 (RGBA) for one face
 * @param size - cubemap face resolution
 * @param px - pixel x coordinate [0, size-1]
 * @param py - pixel y coordinate [0, size-1]
 */
export function isCubemapPixelSky(
  facePixels: Uint8Array,
  size: number,
  px: number,
  py: number,
): boolean {
  const idx = ((py * size) + px) * 4;
  const r = facePixels[idx];
  const g = facePixels[idx + 1];
  const b = facePixels[idx + 2];
  return isSkyPixel(r, g, b, SKY_COLOR);
}

function isSkyPixel(r: number, g: number, b: number, skyColor: readonly number[]): boolean {
  return (
    Math.abs(r - skyColor[0]) <= SKY_TOLERANCE
    && Math.abs(g - skyColor[1]) <= SKY_TOLERANCE
    && Math.abs(b - skyColor[2]) <= SKY_TOLERANCE
  );
}

function getFaceTotalWeight(faceIndex: number, size: number): number {
  let total = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const weight = cosineWeightForCubemapPixel(faceIndex, x, y, size);
      if (weight > 0) total += weight;
    }
  }
  return total;
}

export function computeSvfFromPixels(
  pixels: Uint8Array,
  size: number,
  skyColor: readonly number[],
  faceIndex: number,
): number {
  if (size <= 0) return 0;

  let weightedSky = 0;
  let totalWeight = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = ((y * size) + x) * 4;
      const weight = cosineWeightForCubemapPixel(faceIndex, x, y, size);
      if (weight <= 0) continue;

      totalWeight += weight;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      if (isSkyPixel(r, g, b, skyColor)) {
        weightedSky += weight;
      }
    }
  }

  return totalWeight > 0 ? weightedSky / totalWeight : 0;
}

/**
 * Internal resources for SVF scene rendering.
 * Created once and reused across multiple eval points.
 */
interface SvfSceneResources {
  scene: Scene;
  obstructionMat: MeshBasicMaterial;
  clones: Mesh[];
  cubeTarget: WebGLCubeRenderTarget;
  cubeCamera: CubeCamera;
}

/**
 * Create a reusable scene with cloned building meshes for SVF rendering.
 * Caller is responsible for disposing via disposeSvfSceneResources().
 */
function createSvfSceneResources(buildingMeshes: Object3D[]): SvfSceneResources {
  const scene = new Scene();
  scene.background = new Color(
    SKY_COLOR[0] / 255,
    SKY_COLOR[1] / 255,
    SKY_COLOR[2] / 255,
  );

  const obstructionMat = new MeshBasicMaterial({ color: OBSTRUCTION_COLOR });
  const clones: Mesh[] = [];

  for (const obj of buildingMeshes) {
    if (!(obj instanceof Mesh)) continue;
    const clone = new Mesh(obj.geometry, obstructionMat);
    clone.position.copy(obj.position);
    clone.quaternion.copy(obj.quaternion);
    clone.scale.copy(obj.scale);
    clone.updateMatrixWorld();
    scene.add(clone);
    clones.push(clone);
  }

  const cubeTarget = new WebGLCubeRenderTarget(CUBE_SIZE);
  const cubeCamera = new CubeCamera(0.1, 1000, cubeTarget);

  return { scene, obstructionMat, clones, cubeTarget, cubeCamera };
}

/**
 * Dispose all resources created by createSvfSceneResources.
 */
function disposeSvfSceneResources(
  res: SvfSceneResources,
  renderer: WebGLRenderer,
): void {
  renderer.setRenderTarget(null);
  for (const clone of res.clones) {
    res.scene.remove(clone);
  }
  res.obstructionMat.dispose();
  res.cubeTarget.dispose();
}

/**
 * Render cubemap at evalPoint and read per-face pixel data for upper hemisphere.
 * Returns a Map from face index to RGBA pixel data.
 */
function renderAndReadCubemapFaces(
  renderer: WebGLRenderer,
  res: SvfSceneResources,
  evalPoint: [number, number, number],
): Map<number, Uint8Array> {
  res.cubeCamera.position.set(evalPoint[0], evalPoint[1], evalPoint[2]);
  res.cubeCamera.update(renderer, res.scene);

  const facePixels = new Map<number, Uint8Array>();
  for (const faceIndex of UPPER_HEMISPHERE_FACES) {
    const pixels = new Uint8Array(CUBE_SIZE * CUBE_SIZE * 4);
    renderer.setRenderTarget(null);
    renderer.readRenderTargetPixels(res.cubeTarget, 0, 0, CUBE_SIZE, CUBE_SIZE, pixels, faceIndex);
    facePixels.set(faceIndex, pixels);
  }
  return facePixels;
}

/**
 * Compute isotropic SVF from pre-read cubemap face pixel data.
 */
function computeIsotropicSvfFromFaces(
  facePixels: Map<number, Uint8Array>,
): number {
  let weightedSky = 0;
  let totalWeight = 0;

  for (const faceIndex of UPPER_HEMISPHERE_FACES) {
    const pixels = facePixels.get(faceIndex);
    if (!pixels) continue;

    const faceWeight = getFaceTotalWeight(faceIndex, CUBE_SIZE);
    if (faceWeight <= 0) continue;

    const faceSvf = computeSvfFromPixels(pixels, CUBE_SIZE, SKY_COLOR, faceIndex);
    weightedSky += faceSvf * faceWeight;
    totalWeight += faceWeight;
  }

  return totalWeight > 0 ? weightedSky / totalWeight : 0;
}

/**
 * Compute SVF at a single point using a cubemap render + sky classification.
 */
export function computeSvf(
  renderer: WebGLRenderer,
  buildingMeshes: Object3D[],
  evalPoint: [number, number, number],
): number {
  const res = createSvfSceneResources(buildingMeshes);

  try {
    const facePixels = renderAndReadCubemapFaces(renderer, res, evalPoint);
    return computeIsotropicSvfFromFaces(facePixels);
  } finally {
    disposeSvfSceneResources(res, renderer);
  }
}

/**
 * Compute anisotropic SVF at a single point using Perez luminance weighting.
 *
 * Instead of uniform cosine weighting over the hemisphere, each Tregenza sky
 * patch is weighted by the Perez all-weather sky luminance distribution for
 * the given sun position. This captures directional sky brightness.
 *
 * @param renderer - WebGL renderer
 * @param buildingMeshes - building geometry for obstruction
 * @param evalPoint - [x, y, z] evaluation point
 * @param sunAlt - solar altitude in radians [0, PI/2]
 * @param sunAz - solar azimuth in radians [0, 2*PI), 0 = north, clockwise
 * @returns Anisotropic SVF in [0, 1]
 */
export function computeAnisotropicSvfFromCubemap(
  renderer: WebGLRenderer,
  buildingMeshes: Object3D[],
  evalPoint: [number, number, number],
  sunAlt: number,
  sunAz: number,
): number {
  const res = createSvfSceneResources(buildingMeshes);

  try {
    const facePixels = renderAndReadCubemapFaces(renderer, res, evalPoint);
    return computeAnisotropicSvfFromFaces(facePixels, sunAlt, sunAz);
  } finally {
    disposeSvfSceneResources(res, renderer);
  }
}

/**
 * Compute anisotropic SVF from pre-read cubemap face pixel data.
 *
 * For each of 145 Tregenza sky patches:
 * 1. Convert patch (altitude, azimuth) to Three.js direction
 * 2. Map direction to cubemap face + pixel via directionToFaceUV
 * 3. Check visibility via isCubemapPixelSky
 * 4. Weight by Perez luminance * solid angle * sin(altitude)
 */
function computeAnisotropicSvfFromFaces(
  facePixels: Map<number, Uint8Array>,
  sunAlt: number,
  sunAz: number,
): number {
  const patches = getTregenzaPatches();

  let weightedVisible = 0;
  let totalWeight = 0;

  for (const patch of patches) {
    // Convert sky patch direction to Three.js coordinate system:
    // Three.js: Y=up, -Z=north, +X=east
    // Azimuth: 0=north=-Z, clockwise: east=+X, south=+Z, west=-X
    const cosAlt = Math.cos(patch.altitude);
    const dx = Math.sin(patch.azimuth) * cosAlt;
    const dy = Math.sin(patch.altitude);
    const dz = -Math.cos(patch.azimuth) * cosAlt;

    // Skip patches below horizon (should not happen with Tregenza, but guard)
    if (dy <= 0) continue;

    // Map direction to cubemap face + pixel
    const { face, u, v } = directionToFaceUV(dx, dy, dz, CUBE_SIZE);

    // Get face pixel data
    const pixels = facePixels.get(face);
    if (!pixels) continue;

    // Weight: Perez luminance * solid angle * sin(altitude)
    const luminance = perezLuminance(patch.altitude, patch.azimuth, sunAlt, sunAz);
    const weight = luminance * patch.solidAngle * Math.sin(patch.altitude);
    totalWeight += weight;

    // Check visibility
    if (isCubemapPixelSky(pixels, CUBE_SIZE, u, v)) {
      weightedVisible += weight;
    }
  }

  return totalWeight > 0 ? weightedVisible / totalWeight : 0;
}

/**
 * Compute roof-level SVF by averaging representative roof sample points.
 * Reuses a single scene across all eval points for efficiency.
 */
export function computeSvfMultiPoint(
  renderer: WebGLRenderer,
  buildingMeshes: Object3D[],
  evalPoints: [number, number, number][],
  maxPoints: number = 5,
): number {
  if (evalPoints.length === 0) return 0;

  const safeMaxPoints = Math.max(1, Math.floor(maxPoints));
  const step = Math.max(1, Math.floor(evalPoints.length / safeMaxPoints));
  const sampled = evalPoints.filter((_, idx) => idx % step === 0).slice(0, safeMaxPoints);
  if (sampled.length === 0) return 0;

  const res = createSvfSceneResources(buildingMeshes);

  try {
    let total = 0;
    for (const point of sampled) {
      const facePixels = renderAndReadCubemapFaces(renderer, res, point);
      total += computeIsotropicSvfFromFaces(facePixels);
    }
    return total / sampled.length;
  } finally {
    disposeSvfSceneResources(res, renderer);
  }
}

/**
 * Compute anisotropic SVF averaged over multiple evaluation points.
 * Reuses a single scene across all eval points for efficiency.
 *
 * @param renderer - WebGL renderer
 * @param buildingMeshes - building geometry for obstruction
 * @param evalPoints - array of [x, y, z] evaluation points
 * @param sunAlt - solar altitude in radians
 * @param sunAz - solar azimuth in radians
 * @param maxPoints - maximum number of sample points (default 5)
 * @returns Average anisotropic SVF in [0, 1]
 */
export function computeAnisotropicSvfMultiPoint(
  renderer: WebGLRenderer,
  buildingMeshes: Object3D[],
  evalPoints: [number, number, number][],
  sunAlt: number,
  sunAz: number,
  maxPoints: number = 5,
): number {
  if (evalPoints.length === 0) return 0;

  const safeMaxPoints = Math.max(1, Math.floor(maxPoints));
  const step = Math.max(1, Math.floor(evalPoints.length / safeMaxPoints));
  const sampled = evalPoints.filter((_, idx) => idx % step === 0).slice(0, safeMaxPoints);
  if (sampled.length === 0) return 0;

  const res = createSvfSceneResources(buildingMeshes);

  try {
    let total = 0;
    for (const point of sampled) {
      const facePixels = renderAndReadCubemapFaces(renderer, res, point);
      total += computeAnisotropicSvfFromFaces(facePixels, sunAlt, sunAz);
    }
    return total / sampled.length;
  } finally {
    disposeSvfSceneResources(res, renderer);
  }
}
