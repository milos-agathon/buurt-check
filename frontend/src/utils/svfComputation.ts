import {
  Color,
  CubeCamera,
  Mesh,
  MeshBasicMaterial,
  Scene,
  WebGLCubeRenderTarget,
} from 'three';
import type { Object3D, WebGLRenderer } from 'three';

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
 * Compute SVF at a single point using a cubemap render + sky classification.
 */
export function computeSvf(
  renderer: WebGLRenderer,
  buildingMeshes: Object3D[],
  evalPoint: [number, number, number],
): number {
  const svfScene = new Scene();
  svfScene.background = new Color(
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
    svfScene.add(clone);
    clones.push(clone);
  }

  const cubeTarget = new WebGLCubeRenderTarget(CUBE_SIZE);
  const cubeCamera = new CubeCamera(0.1, 1000, cubeTarget);
  cubeCamera.position.set(evalPoint[0], evalPoint[1], evalPoint[2]);

  let weightedSky = 0;
  let totalWeight = 0;

  try {
    cubeCamera.update(renderer, svfScene);

    for (const faceIndex of UPPER_HEMISPHERE_FACES) {
      const pixels = new Uint8Array(CUBE_SIZE * CUBE_SIZE * 4);
      renderer.setRenderTarget(cubeTarget, faceIndex);
      renderer.readRenderTargetPixels(cubeTarget, 0, 0, CUBE_SIZE, CUBE_SIZE, pixels);

      const faceWeight = getFaceTotalWeight(faceIndex, CUBE_SIZE);
      if (faceWeight <= 0) continue;

      const faceSvf = computeSvfFromPixels(pixels, CUBE_SIZE, SKY_COLOR, faceIndex);
      weightedSky += faceSvf * faceWeight;
      totalWeight += faceWeight;
    }
  } finally {
    renderer.setRenderTarget(null);
    for (const clone of clones) {
      svfScene.remove(clone);
    }
    obstructionMat.dispose();
    cubeTarget.dispose();
  }

  return totalWeight > 0 ? weightedSky / totalWeight : 0;
}

/**
 * Compute roof-level SVF by averaging representative roof sample points.
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

  const total = sampled.reduce((sum, point) => (
    sum + computeSvf(renderer, buildingMeshes, point)
  ), 0);
  return total / sampled.length;
}
