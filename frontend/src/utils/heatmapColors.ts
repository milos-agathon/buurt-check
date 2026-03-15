function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function toCssRgb([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

// Warm red, daylight yellow, livable green.
export const HEATMAP_RED: [number, number, number] = [0.88, 0.25, 0.25];
export const HEATMAP_YELLOW: [number, number, number] = [0.88, 0.77, 0.25];
export const HEATMAP_GREEN: [number, number, number] = [0.25, 0.69, 0.38];

export function getSunHoursGradientCss(): string {
  return `linear-gradient(to right, ${toCssRgb(HEATMAP_RED)}, ${toCssRgb(HEATMAP_YELLOW)}, ${toCssRgb(HEATMAP_GREEN)})`;
}

/**
 * Maps sun-hour values to a red -> yellow -> green gradient.
 * Returns normalized RGB components in [0, 1].
 */
export function sunHoursToColor(
  value: number,
  min: number,
  max: number,
): [number, number, number] {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return HEATMAP_RED;
  }
  const span = max - min;
  const normalized = span <= 0 ? 0.5 : (value - min) / span;
  const t = clamp01(normalized);

  if (t <= 0.5) {
    const local = t / 0.5;
    return [
      lerp(HEATMAP_RED[0], HEATMAP_YELLOW[0], local),
      lerp(HEATMAP_RED[1], HEATMAP_YELLOW[1], local),
      lerp(HEATMAP_RED[2], HEATMAP_YELLOW[2], local),
    ];
  }

  const local = (t - 0.5) / 0.5;
  return [
    lerp(HEATMAP_YELLOW[0], HEATMAP_GREEN[0], local),
    lerp(HEATMAP_YELLOW[1], HEATMAP_GREEN[1], local),
    lerp(HEATMAP_YELLOW[2], HEATMAP_GREEN[2], local),
  ];
}
