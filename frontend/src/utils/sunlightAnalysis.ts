import { Raycaster, Vector3 } from 'three';
import type { SunlightResult } from '../types/api';
import { getDaylightRange, getRepresentativeDates, getSunDirection, SUN_DISTANCE } from './sunPosition';
import {
  DEFAULT_GRID_SPACING_METERS,
  DEFAULT_MAX_ROOF_POINTS,
  generateRoofSamplePoints,
  type RoofPoint3D,
} from './roofSampling';

interface RaycastHitLike {
  object?: {
    userData?: {
      pandId?: string;
      isGround?: boolean;
    };
  };
}

export interface RaycasterLike {
  far: number;
  set(origin: Vector3, direction: Vector3): void;
  intersectObjects(objects: unknown[]): RaycastHitLike[];
}

export interface SunlightAnalysisOptions {
  buildingMeshes: unknown[];
  targetPandId: string;
  footprint: number[][];
  roofY: number;
  lat: number;
  lng: number;
  year?: number;
  intervalMinutes?: number;
  chunkRaycasts?: number;
  gridSpacingMeters?: number;
  maxPoints?: number;
  raycaster?: RaycasterLike;
  yieldControl?: () => Promise<void>;
  abortSignal?: AbortSignal;
}

const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_CHUNK_RAYCASTS = 200;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function getSampleMinutesForDay(
  sunriseHour: number,
  sunsetHour: number,
  intervalMinutes: number,
): number[] {
  const safeInterval = Math.max(1, Math.floor(intervalMinutes));
  const startMinutes = Math.ceil((sunriseHour * 60) / safeInterval) * safeInterval;
  const endMinutes = Math.floor((sunsetHour * 60) / safeInterval) * safeInterval;

  if (endMinutes < startMinutes) return [];

  const samples: number[] = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += safeInterval) {
    samples.push(minutes);
  }
  return samples;
}

export function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      let resolved = false;
      window.requestAnimationFrame(() => {
        if (resolved) return;
        resolved = true;
        resolve();
      });
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        resolve();
      }, 16);
      return;
    }
    setTimeout(resolve, 0);
  });
}

function buildDefaultResult(year: number, roofGridPoints: RoofPoint3D[]): SunlightResult {
  return {
    winter: 0,
    equinox: 0,
    summer: 0,
    annualAverage: 0,
    analysisYear: year,
    roofGridPoints,
    perPointAnnual: roofGridPoints.map(() => 0),
  };
}

export async function analyzeSunlight(
  options: SunlightAnalysisOptions,
): Promise<SunlightResult | null> {
  const {
    buildingMeshes,
    targetPandId,
    footprint,
    roofY,
    lat,
    lng,
    year = new Date().getFullYear(),
    intervalMinutes = DEFAULT_INTERVAL_MINUTES,
    chunkRaycasts = DEFAULT_CHUNK_RAYCASTS,
    gridSpacingMeters = DEFAULT_GRID_SPACING_METERS,
    maxPoints = DEFAULT_MAX_ROOF_POINTS,
    raycaster = new Raycaster() as unknown as RaycasterLike,
    yieldControl = yieldToMainThread,
    abortSignal,
  } = options;

  if (abortSignal?.aborted) return null;

  const roofGridPoints = generateRoofSamplePoints(footprint, roofY, {
    gridSpacingMeters,
    maxPoints,
    includeFootprintVertices: true,
    includeCentroid: true,
  });

  if (roofGridPoints.length === 0) {
    return buildDefaultResult(year, roofGridPoints);
  }

  const monthlyDates = getRepresentativeDates(year);
  const perPointMonthly = roofGridPoints.map((): number[] => []);
  const hoursPerSample = intervalMinutes / 60;
  const maxChunk = Math.max(1, Math.floor(chunkRaycasts));
  let raycastsSinceYield = 0;

  for (const date of monthlyDates) {
    const { sunrise, sunset } = getDaylightRange(date, lat, lng);
    const sampleMinutes = getSampleMinutesForDay(sunrise, sunset, intervalMinutes);

    for (let pointIdx = 0; pointIdx < roofGridPoints.length; pointIdx++) {
      const [x, y, z] = roofGridPoints[pointIdx];
      const origin = new Vector3(x, y, z);
      let sunlitHours = 0;

      for (const minuteOfDay of sampleMinutes) {
        if (abortSignal?.aborted) return null;

        const sampleDate = new Date(date);
        sampleDate.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
        const sunDir = getSunDirection(sampleDate, lat, lng);
        if (!sunDir) continue;

        raycaster.set(origin, sunDir);
        raycaster.far = SUN_DISTANCE * 2;

        const intersections = raycaster.intersectObjects(buildingMeshes);
        const blocked = intersections.some((hit) => (
          hit.object?.userData?.pandId !== targetPandId
          && !hit.object?.userData?.isGround
        ));

        if (!blocked) {
          sunlitHours += hoursPerSample;
        }

        raycastsSinceYield++;
        if (raycastsSinceYield >= maxChunk) {
          raycastsSinceYield = 0;
          await yieldControl();
          if (abortSignal?.aborted) return null;
        }
      }

      perPointMonthly[pointIdx].push(round1(sunlitHours));
    }
  }

  const meanMonthly = Array.from({ length: 12 }, (_, monthIdx) => {
    const sum = perPointMonthly.reduce((acc, pointMonths) => acc + (pointMonths[monthIdx] ?? 0), 0);
    return round1(sum / roofGridPoints.length);
  });

  const perPointAnnual = perPointMonthly.map((pointMonths) =>
    round1(pointMonths.reduce((sum, value) => sum + value, 0) / pointMonths.length)
  );
  const annualAverage = round1(meanMonthly.reduce((sum, value) => sum + value, 0) / meanMonthly.length);

  return {
    winter: meanMonthly[11],
    equinox: meanMonthly[2],
    summer: meanMonthly[5],
    annualAverage,
    analysisYear: year,
    roofGridPoints,
    perPointAnnual,
  };
}
