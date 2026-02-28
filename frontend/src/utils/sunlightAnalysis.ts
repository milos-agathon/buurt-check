import { Raycaster, Vector3 } from 'three';
import type { SunlightResult } from '../types/api';
import {
  getDaylightRange,
  getRepresentativeDates,
  getSunDirection,
  setTimeInTimeZone,
  SUN_DISTANCE,
} from './sunPosition';
import {
  buildSunlightEvaluationPoints,
  type SunlightEvaluationPoints,
} from './sunlightSampling';
import {
  DEFAULT_GRID_SPACING_METERS,
  DEFAULT_MAX_ROOF_POINTS,
} from './roofSampling';

interface RaycastHitLike {
  distance?: number;
  point?: Vector3;
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
  groundY?: number;
  lat: number;
  lng: number;
  year?: number;
  intervalMinutes?: number;
  chunkRaycasts?: number;
  gridSpacingMeters?: number;
  maxPoints?: number;
  includeFacadePoints?: boolean;
  includeGroundPoints?: boolean;
  facadePointCount?: number;
  groundPointCount?: number;
  facadeOffsetMeters?: number;
  groundOffsetMeters?: number;
  facadeHeightMeters?: number;
  groundHeightOffsetMeters?: number;
  raycaster?: RaycasterLike;
  yieldControl?: () => Promise<void>;
  abortSignal?: AbortSignal;
}

const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_CHUNK_RAYCASTS = 200;
const SELF_HIT_EPSILON_METERS = 0.15;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function weightedAverage(values: number[], weights: number[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < values.length; i++) {
    const weight = Math.max(0, weights[i] ?? 0);
    weightedSum += values[i] * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    return 0;
  }

  return weightedSum / totalWeight;
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

function isSameSurfaceSelfHit(hit: RaycastHitLike, origin: Vector3): boolean {
  if (typeof hit.distance === 'number') {
    return hit.distance <= SELF_HIT_EPSILON_METERS;
  }
  if (hit.point && typeof hit.point.distanceTo === 'function') {
    return hit.point.distanceTo(origin) <= SELF_HIT_EPSILON_METERS;
  }
  return false;
}

function buildDefaultResult(year: number, points: SunlightEvaluationPoints): SunlightResult {
  return {
    winter: 0,
    equinox: 0,
    summer: 0,
    annualAverage: 0,
    analysisYear: year,
    roofGridPoints: points.roofGridPoints,
    facadeProxyPoints: points.facadeProxyPoints,
    groundProxyPoints: points.groundProxyPoints,
    perPointAnnual: points.roofGridPoints.map(() => 0),
    perFacadeAnnual: points.facadeProxyPoints.map(() => 0),
    perGroundAnnual: points.groundProxyPoints.map(() => 0),
    samplingBreakdown: {
      roof: points.roofGridPoints.length,
      facade: points.facadeProxyPoints.length,
      ground: points.groundProxyPoints.length,
      total: points.allPoints.length,
    },
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
    groundY = roofY,
    lat,
    lng,
    year = new Date().getFullYear(),
    intervalMinutes = DEFAULT_INTERVAL_MINUTES,
    chunkRaycasts = DEFAULT_CHUNK_RAYCASTS,
    gridSpacingMeters = DEFAULT_GRID_SPACING_METERS,
    maxPoints = DEFAULT_MAX_ROOF_POINTS,
    includeFacadePoints = false,
    includeGroundPoints = false,
    facadePointCount = 2,
    groundPointCount = 1,
    facadeOffsetMeters = 0.75,
    groundOffsetMeters = 3,
    facadeHeightMeters = 1.5,
    groundHeightOffsetMeters = 0.1,
    raycaster = new Raycaster() as unknown as RaycasterLike,
    yieldControl = yieldToMainThread,
    abortSignal,
  } = options;

  if (abortSignal?.aborted) return null;

  const sampledPoints = buildSunlightEvaluationPoints(footprint, roofY, groundY, {
    gridSpacingMeters,
    maxRoofPoints: maxPoints,
    includeFacadePoints,
    includeGroundPoints,
    facadePointCount,
    groundPointCount,
    facadeOffsetMeters,
    groundOffsetMeters,
    facadeHeightMeters,
    groundHeightOffsetMeters,
  });
  const roofGridPoints = sampledPoints.roofGridPoints;
  const facadeProxyPoints = sampledPoints.facadeProxyPoints;
  const groundProxyPoints = sampledPoints.groundProxyPoints;
  const allPoints = sampledPoints.allPoints;

  if (allPoints.length === 0) {
    return buildDefaultResult(year, sampledPoints);
  }

  const monthlyDates = getRepresentativeDates(year);
  const perPointMonthly = allPoints.map((): number[] => []);
  const monthlySampleWeights: number[] = [];
  const hoursPerSample = intervalMinutes / 60;
  const maxChunk = Math.max(1, Math.floor(chunkRaycasts));
  let raycastsSinceYield = 0;

  for (const date of monthlyDates) {
    const { sunrise, sunset } = getDaylightRange(date, lat, lng);
    const sampleMinutes = getSampleMinutesForDay(sunrise, sunset, intervalMinutes);
    monthlySampleWeights.push(sampleMinutes.length);

    for (let pointIdx = 0; pointIdx < allPoints.length; pointIdx++) {
      const [x, y, z] = allPoints[pointIdx];
      const origin = new Vector3(x, y, z);
      let sunlitHours = 0;

      for (const minuteOfDay of sampleMinutes) {
        if (abortSignal?.aborted) return null;

        const sampleDate = setTimeInTimeZone(date, minuteOfDay);
        const sunDir = getSunDirection(sampleDate, lat, lng);
        if (!sunDir) continue;

        raycaster.set(origin, sunDir);
        raycaster.far = SUN_DISTANCE * 2;

        const intersections = raycaster.intersectObjects(buildingMeshes);
        const blocked = intersections.some((hit) => {
          if (hit.object?.userData?.isGround) return false;
          if (hit.object?.userData?.pandId === targetPandId) {
            return !isSameSurfaceSelfHit(hit, origin);
          }
          return true;
        });

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
    return round1(sum / allPoints.length);
  });

  const perPointAnnualByEvalPoint = perPointMonthly.map((pointMonths) =>
    round1(weightedAverage(pointMonths, monthlySampleWeights))
  );
  const perPointAnnual = perPointAnnualByEvalPoint.slice(0, roofGridPoints.length);
  const perFacadeAnnual = perPointAnnualByEvalPoint.slice(
    roofGridPoints.length,
    roofGridPoints.length + facadeProxyPoints.length,
  );
  const perGroundAnnual = perPointAnnualByEvalPoint.slice(
    roofGridPoints.length + facadeProxyPoints.length,
  );
  const annualAverage = round1(weightedAverage(meanMonthly, monthlySampleWeights));

  return {
    winter: meanMonthly[11],
    equinox: meanMonthly[2],
    summer: meanMonthly[5],
    annualAverage,
    analysisYear: year,
    roofGridPoints,
    facadeProxyPoints,
    groundProxyPoints,
    perPointAnnual,
    perFacadeAnnual,
    perGroundAnnual,
    samplingBreakdown: {
      roof: roofGridPoints.length,
      facade: facadeProxyPoints.length,
      ground: groundProxyPoints.length,
      total: allPoints.length,
    },
  };
}
