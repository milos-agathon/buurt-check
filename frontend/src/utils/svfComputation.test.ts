import { describe, expect, it } from 'vitest';
import {
  computeSvfFromPixels,
  cosineWeightForCubemapPixel,
  directionToFaceUV,
  isCubemapPixelSky,
} from './svfComputation';

describe('cosineWeightForCubemapPixel', () => {
  it('assigns higher weight to zenith than edge pixels on top face', () => {
    const zenith = cosineWeightForCubemapPixel(2, 32, 32, 64);
    const edge = cosineWeightForCubemapPixel(2, 0, 0, 64);
    expect(zenith).toBeGreaterThan(edge);
  });

  it('returns zero for every pixel on bottom face', () => {
    const size = 64;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        expect(cosineWeightForCubemapPixel(3, x, y, size)).toBe(0);
      }
    }
  });

  it('returns zero for invalid face index', () => {
    const weight = cosineWeightForCubemapPixel(9, 32, 32, 64);
    expect(weight).toBe(0);
  });
});

describe('computeSvfFromPixels', () => {
  it('returns 1 for all-sky pixels on top face', () => {
    const size = 64;
    const skyColor = [135, 206, 235] as const;
    const pixels = new Uint8Array(size * size * 4);

    for (let i = 0; i < size * size; i++) {
      pixels[i * 4] = skyColor[0];
      pixels[i * 4 + 1] = skyColor[1];
      pixels[i * 4 + 2] = skyColor[2];
      pixels[i * 4 + 3] = 255;
    }

    const svf = computeSvfFromPixels(pixels, size, skyColor, 2);
    expect(svf).toBeCloseTo(1, 2);
  });

  it('returns 0 for all-obstruction pixels on top face', () => {
    const size = 64;
    const skyColor = [135, 206, 235] as const;
    const pixels = new Uint8Array(size * size * 4).fill(0);

    const svf = computeSvfFromPixels(pixels, size, skyColor, 2);
    expect(svf).toBeCloseTo(0, 2);
  });

  it('returns a fractional value for mixed sky/obstruction pixels', () => {
    const size = 8;
    const skyColor = [135, 206, 235] as const;
    const pixels = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = ((y * size) + x) * 4;
        const isSky = x < size / 2;
        pixels[idx] = isSky ? skyColor[0] : 0;
        pixels[idx + 1] = isSky ? skyColor[1] : 0;
        pixels[idx + 2] = isSky ? skyColor[2] : 0;
        pixels[idx + 3] = 255;
      }
    }

    const svf = computeSvfFromPixels(pixels, size, skyColor, 2);
    expect(svf).toBeGreaterThan(0);
    expect(svf).toBeLessThan(1);
  });

  it('returns intermediate SVF for a half-obstructed side face', () => {
    const size = 64;
    const skyColor = [135, 206, 235] as const;
    const pixels = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = ((y * size) + x) * 4;
        const isSky = x < size / 2;
        pixels[idx] = isSky ? skyColor[0] : 0;
        pixels[idx + 1] = isSky ? skyColor[1] : 0;
        pixels[idx + 2] = isSky ? skyColor[2] : 0;
        pixels[idx + 3] = 255;
      }
    }

    const svf = computeSvfFromPixels(pixels, size, skyColor, 0);
    expect(svf).toBeGreaterThan(0);
    expect(svf).toBeLessThan(1);
  });
});

/**
 * Helper: compute direction from pixel center using cosineWeightForCubemapPixel's
 * forward mapping logic (duplicated here for testing roundtrip).
 */
function pixelToDirection(
  faceIndex: number,
  px: number,
  py: number,
  size: number,
): { dx: number; dy: number; dz: number } {
  const u = ((px + 0.5) / size) * 2 - 1;
  const v = -(((py + 0.5) / size) * 2 - 1);

  let dx = 0;
  let dy = 0;
  let dz = 0;
  switch (faceIndex) {
    case 0: dx = 1; dy = v; dz = -u; break;
    case 1: dx = -1; dy = v; dz = u; break;
    case 2: dx = u; dy = 1; dz = -v; break;
    case 3: dx = u; dy = -1; dz = v; break;
    case 4: dx = u; dy = v; dz = 1; break;
    case 5: dx = -u; dy = v; dz = -1; break;
  }
  return { dx, dy, dz };
}

describe('directionToFaceUV', () => {
  const SIZE = 64;

  it('roundtrips face 0 (+X) center pixel', () => {
    const px = 32;
    const py = 16;
    const dir = pixelToDirection(0, px, py, SIZE);
    const result = directionToFaceUV(dir.dx, dir.dy, dir.dz, SIZE);
    expect(result.face).toBe(0);
    expect(Math.abs(result.u - px)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.v - py)).toBeLessThanOrEqual(1);
  });

  it('roundtrips face 1 (-X) center pixel', () => {
    const px = 32;
    const py = 16;
    const dir = pixelToDirection(1, px, py, SIZE);
    const result = directionToFaceUV(dir.dx, dir.dy, dir.dz, SIZE);
    expect(result.face).toBe(1);
    expect(Math.abs(result.u - px)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.v - py)).toBeLessThanOrEqual(1);
  });

  it('roundtrips face 2 (+Y, top) center pixel', () => {
    const px = 32;
    const py = 32;
    const dir = pixelToDirection(2, px, py, SIZE);
    const result = directionToFaceUV(dir.dx, dir.dy, dir.dz, SIZE);
    expect(result.face).toBe(2);
    expect(Math.abs(result.u - px)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.v - py)).toBeLessThanOrEqual(1);
  });

  it('roundtrips face 4 (+Z) center pixel', () => {
    const px = 32;
    const py = 16;
    const dir = pixelToDirection(4, px, py, SIZE);
    const result = directionToFaceUV(dir.dx, dir.dy, dir.dz, SIZE);
    expect(result.face).toBe(4);
    expect(Math.abs(result.u - px)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.v - py)).toBeLessThanOrEqual(1);
  });

  it('roundtrips face 5 (-Z) center pixel', () => {
    const px = 32;
    const py = 16;
    const dir = pixelToDirection(5, px, py, SIZE);
    const result = directionToFaceUV(dir.dx, dir.dy, dir.dz, SIZE);
    expect(result.face).toBe(5);
    expect(Math.abs(result.u - px)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.v - py)).toBeLessThanOrEqual(1);
  });

  it('roundtrips face 3 (-Y, bottom) center pixel', () => {
    const px = 32;
    const py = 32;
    const dir = pixelToDirection(3, px, py, SIZE);
    const result = directionToFaceUV(dir.dx, dir.dy, dir.dz, SIZE);
    expect(result.face).toBe(3);
    expect(Math.abs(result.u - px)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.v - py)).toBeLessThanOrEqual(1);
  });

  it('roundtrips multiple random pixels on each upper-hemisphere face', () => {
    const faces = [0, 1, 2, 4, 5];
    const testPixels = [
      [0, 0], [63, 0], [0, 63], [63, 63], [16, 48], [48, 16],
    ];

    for (const face of faces) {
      for (const [px, py] of testPixels) {
        const dir = pixelToDirection(face, px, py, SIZE);
        // Only test pixels whose direction is unambiguously in this face
        // (skip edge pixels where face selection could differ)
        const absDx = Math.abs(dir.dx);
        const absDy = Math.abs(dir.dy);
        const absDz = Math.abs(dir.dz);
        const maxAbs = Math.max(absDx, absDy, absDz);

        // Skip ambiguous edge pixels where two axes are nearly equal
        const components = [absDx, absDy, absDz].sort((a, b) => b - a);
        if (components[0] - components[1] < 0.1) continue;

        const result = directionToFaceUV(dir.dx, dir.dy, dir.dz, SIZE);

        // For unambiguous pixels, face should match
        if (maxAbs === absDx) {
          expect(result.face === 0 || result.face === 1).toBe(true);
        } else if (maxAbs === absDy) {
          expect(result.face === 2 || result.face === 3).toBe(true);
        } else {
          expect(result.face === 4 || result.face === 5).toBe(true);
        }

        // Pixel coordinates should match within ±1
        expect(Math.abs(result.u - px)).toBeLessThanOrEqual(1);
        expect(Math.abs(result.v - py)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('maps straight up direction (0,1,0) to face 2 (+Y) center', () => {
    const result = directionToFaceUV(0, 1, 0, SIZE);
    expect(result.face).toBe(2);
    // Center of face should be around size/2
    expect(Math.abs(result.u - 31.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.v - 31.5)).toBeLessThanOrEqual(1);
  });

  it('maps straight east direction (1,0,0) to face 0 (+X) center', () => {
    const result = directionToFaceUV(1, 0, 0, SIZE);
    expect(result.face).toBe(0);
  });

  it('clamps pixel coordinates to valid range', () => {
    // An extreme direction that would map past the edge
    const result = directionToFaceUV(1, 0.001, 0, SIZE);
    expect(result.u).toBeGreaterThanOrEqual(0);
    expect(result.u).toBeLessThanOrEqual(SIZE - 1);
    expect(result.v).toBeGreaterThanOrEqual(0);
    expect(result.v).toBeLessThanOrEqual(SIZE - 1);
  });
});

describe('isCubemapPixelSky', () => {
  const SIZE = 8;
  const SKY_COLOR: [number, number, number] = [135, 206, 235];

  function makePixels(
    size: number,
    fill: [number, number, number, number],
  ): Uint8Array {
    const pixels = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      pixels[i * 4] = fill[0];
      pixels[i * 4 + 1] = fill[1];
      pixels[i * 4 + 2] = fill[2];
      pixels[i * 4 + 3] = fill[3];
    }
    return pixels;
  }

  it('returns true for a sky-colored pixel', () => {
    const pixels = makePixels(SIZE, [SKY_COLOR[0], SKY_COLOR[1], SKY_COLOR[2], 255]);
    expect(isCubemapPixelSky(pixels, SIZE, 0, 0)).toBe(true);
    expect(isCubemapPixelSky(pixels, SIZE, 4, 4)).toBe(true);
    expect(isCubemapPixelSky(pixels, SIZE, 7, 7)).toBe(true);
  });

  it('returns false for an obstruction (black) pixel', () => {
    const pixels = makePixels(SIZE, [0, 0, 0, 255]);
    expect(isCubemapPixelSky(pixels, SIZE, 0, 0)).toBe(false);
    expect(isCubemapPixelSky(pixels, SIZE, 4, 4)).toBe(false);
  });

  it('returns true for a pixel within SKY_TOLERANCE of sky color', () => {
    const pixels = makePixels(SIZE, [
      SKY_COLOR[0] + 25,
      SKY_COLOR[1] - 25,
      SKY_COLOR[2] + 10,
      255,
    ]);
    expect(isCubemapPixelSky(pixels, SIZE, 3, 3)).toBe(true);
  });

  it('returns false for a pixel outside SKY_TOLERANCE', () => {
    const pixels = makePixels(SIZE, [
      SKY_COLOR[0] + 31,  // exceeds tolerance of 30
      SKY_COLOR[1],
      SKY_COLOR[2],
      255,
    ]);
    expect(isCubemapPixelSky(pixels, SIZE, 0, 0)).toBe(false);
  });

  it('checks the correct pixel in a mixed buffer', () => {
    const pixels = new Uint8Array(SIZE * SIZE * 4).fill(0);
    // Set pixel (3, 2) to sky color
    const idx = ((2 * SIZE) + 3) * 4;
    pixels[idx] = SKY_COLOR[0];
    pixels[idx + 1] = SKY_COLOR[1];
    pixels[idx + 2] = SKY_COLOR[2];
    pixels[idx + 3] = 255;

    expect(isCubemapPixelSky(pixels, SIZE, 3, 2)).toBe(true);
    expect(isCubemapPixelSky(pixels, SIZE, 0, 0)).toBe(false);
    expect(isCubemapPixelSky(pixels, SIZE, 4, 4)).toBe(false);
  });
});
