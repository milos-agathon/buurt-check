import { describe, expect, it } from 'vitest';
import { computeSvfFromPixels } from './svfComputation';

const SKY_COLOR = [135, 206, 235] as const;

function buildHalfSkyPixels(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = ((y * size) + x) * 4;
      const isSky = x < size / 2;
      pixels[idx] = isSky ? SKY_COLOR[0] : 0;
      pixels[idx + 1] = isSky ? SKY_COLOR[1] : 0;
      pixels[idx + 2] = isSky ? SKY_COLOR[2] : 0;
      pixels[idx + 3] = 255;
    }
  }
  return pixels;
}

function buildCourtyardLikePixels(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size * 0.28;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = ((y * size) + x) * 4;
      const dx = x - center;
      const dy = y - center;
      const isSky = Math.hypot(dx, dy) <= radius;
      pixels[idx] = isSky ? SKY_COLOR[0] : 0;
      pixels[idx + 1] = isSky ? SKY_COLOR[1] : 0;
      pixels[idx + 2] = isSky ? SKY_COLOR[2] : 0;
      pixels[idx + 3] = 255;
    }
  }

  return pixels;
}

describe('SVF multi-resolution convergence', () => {
  it('converges for a half-obstructed side-face pattern', () => {
    const low = computeSvfFromPixels(buildHalfSkyPixels(16), 16, SKY_COLOR, 0);
    const medium = computeSvfFromPixels(buildHalfSkyPixels(32), 32, SKY_COLOR, 0);
    const high = computeSvfFromPixels(buildHalfSkyPixels(64), 64, SKY_COLOR, 0);

    const dLowMedium = Math.abs(medium - low);
    const dMediumHigh = Math.abs(high - medium);
    expect(dMediumHigh).toBeLessThanOrEqual(dLowMedium + 1e-6);
    expect(Math.abs(high - medium)).toBeLessThanOrEqual(0.03);
  });

  it('converges for a courtyard-like top-face pattern', () => {
    const low = computeSvfFromPixels(buildCourtyardLikePixels(24), 24, SKY_COLOR, 2);
    const medium = computeSvfFromPixels(buildCourtyardLikePixels(48), 48, SKY_COLOR, 2);
    const high = computeSvfFromPixels(buildCourtyardLikePixels(96), 96, SKY_COLOR, 2);

    const dLowMedium = Math.abs(medium - low);
    const dMediumHigh = Math.abs(high - medium);
    expect(dMediumHigh).toBeLessThanOrEqual(dLowMedium + 1e-6);
    expect(Math.abs(high - medium)).toBeLessThanOrEqual(0.03);
  });
});
