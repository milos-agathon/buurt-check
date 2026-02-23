import { describe, expect, it } from 'vitest';
import { computeSvfFromPixels, cosineWeightForCubemapPixel } from './svfComputation';

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
