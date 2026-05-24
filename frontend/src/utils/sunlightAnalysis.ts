import { Raycaster, Vector3 } from 'three';
import type { FacadeSunlightResult, SunlightResult } from '../types/api';
import {
  getDaylightRange,
  getRepresentativeDates,
  getSunDirection,
  setTimeInTimeZone,
  SUN_DISTANCE,
} from './sunPosition';
import {
  buildSunlightEvaluationPoints,
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
  extraEvalPoints?: {
    points: [number, number, number][];
    labels: string[];
    skipSelfShadow: boolean;
  };
  /** Emit per-point per-timestep visibility for irradiance post-processing. */
  emitPerTimestep?: boolean;
  raycaster?: RaycasterLike;
  yieldControl?: () => Promise<void>;
  abortSignal?: AbortSignal;
  onMonthComplete?: (monthIdx: number, totalMonths: number) => void;
}

const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_CHUNK_RAYCASTS = 200;
const SELF_HIT_EPSILON_METERS = 0.15;
const SUNLIGHT_METHOD_VERSION = 'sunlight-v2-interval-dayweighted';
const ORIENTATION_ORDER: Record<FacadeSunlightResult['orientation'], number> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
};

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

export interface SunlightSampleInterval {
  startMinute: number;
  endMinute: number;
  midpointMinute: number;
  durationHours: number;
}

function daysInMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

export function getSampleIntervalsForDay(
  sunriseHour: number,
  sunsetHour: number,
  intervalMinutes: number,
): SunlightSampleInterval[] {
  const safeInterval = Math.max(1, Math.floor(intervalMinutes));
  const sunriseMinute = sunriseHour * 60;
  const sunsetMinute = sunsetHour * 60;
  if (!Number.isFinite(sunriseMinute) || !Number.isFinite(sunsetMinute)) return [];
  if (sunsetMinute <= sunriseMinute) return [];

  const firstBoundary = Math.floor(sunriseMinute / safeInterval) * safeInterval;
  const intervals: SunlightSampleInterval[] = [];
  for (let boundary = firstBoundary; boundary < sunsetMinute; boundary += safeInterval) {
    const startMinute = Math.max(boundary, sunriseMinute);
    const endMinute = Math.min(boundary + safeInterval, sunsetMinute);
    if (endMinute <= startMinute) continue;
    intervals.push({
      startMinute,
      endMinute,
      midpointMinute: (startMinute + endMinute) / 2,
      durationHours: (endMinute - startMinute) / 60,
    });
  }
  return intervals;
}

function yieldToMainThread(): Promise<void> {
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

type PointCategory = 'roof' | 'facade' | 'ground' | 'extra';
type SelfShadowPolicy = 'epsilon' | 'always-skip' | 'always-block';

function parsePointCategory(label: string): PointCategory {
  if (label.startsWith('facade:')) return 'facade';
  if (label.startsWith('ground:')) return 'ground';
  return 'extra';
}

function parseFacadeLabel(label: string): {
  orientation: FacadeSunlightResult['orientation'];
  heightLabel: string;
} | null {
  const [, orientationRaw, heightLabel = '1.5m'] = label.split(':');
  if (
    orientationRaw !== 'north'
    && orientationRaw !== 'south'
    && orientationRaw !== 'east'
    && orientationRaw !== 'west'
  ) {
    return null;
  }

  return {
    orientation: orientationRaw,
    heightLabel,
  };
}

function buildDefaultResult(
  year: number,
  roofGridPoints: [number, number, number][],
  facadeProxyPoints: [number, number, number][],
  groundProxyPoints: [number, number, number][],
): SunlightResult {
  return {
    winter: 0,
    equinox: 0,
    summer: 0,
    annualAverage: 0,
    methodVersion: SUNLIGHT_METHOD_VERSION,
    targetPlane: 'roof',
    analysisYear: year,
    roofGridPoints,
    facadeProxyPoints,
    groundProxyPoints,
    perPointAnnual: roofGridPoints.map(() => 0),
    perFacadeAnnual: facadeProxyPoints.map(() => 0),
    perGroundAnnual: groundProxyPoints.map(() => 0),
    facadeResults: [],
    groundAnnualAverage: 0,
    samplingBreakdown: {
      roof: roofGridPoints.length,
      facade: facadeProxyPoints.length,
      ground: groundProxyPoints.length,
      total: roofGridPoints.length + facadeProxyPoints.length + groundProxyPoints.length,
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
    extraEvalPoints,
    emitPerTimestep = false,
    raycaster = new Raycaster() as unknown as RaycasterLike,
    yieldControl = yieldToMainThread,
    abortSignal,
    onMonthComplete,
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
  const legacyFacadeProxyPoints = sampledPoints.facadeProxyPoints;
  const legacyGroundProxyPoints = sampledPoints.groundProxyPoints;

  const extraPoints = extraEvalPoints?.points ?? [];
  const extraLabels = extraEvalPoints?.labels ?? [];
  const extraCategories = extraPoints.map((_, index) => parsePointCategory(extraLabels[index] ?? ''));
  const extraPolicy: SelfShadowPolicy = extraEvalPoints
    ? (extraEvalPoints.skipSelfShadow ? 'always-skip' : 'always-block')
    : 'always-block';

  const allPoints = [
    ...sampledPoints.allPoints,
    ...extraPoints,
  ];

  const pointSelfShadowPolicy: SelfShadowPolicy[] = [
    ...sampledPoints.allPoints.map(() => 'epsilon' as const),
    ...extraPoints.map(() => extraPolicy),
  ];

  if (allPoints.length === 0) {
    const empty = buildDefaultResult(year, roofGridPoints, legacyFacadeProxyPoints, legacyGroundProxyPoints);
    if (emitPerTimestep) {
      empty.perTimestepVisibility = [];
      empty.timestepMeta = [];
    }
    return empty;
  }

  const monthlyDates = getRepresentativeDates(year);
  const perPointMonthly = allPoints.map((): number[] => []);
  const perTimestepVisibility = emitPerTimestep
    ? roofGridPoints.map((): (0 | 1)[] => [])
    : undefined;
  const timestepMeta = emitPerTimestep
    ? [] as { date: string; minuteOfDay: number }[]
    : undefined;
  const monthlyDayWeights: number[] = [];
  const maxChunk = Math.max(1, Math.floor(chunkRaycasts));
  let raycastsSinceYield = 0;

  for (let monthIdx = 0; monthIdx < monthlyDates.length; monthIdx++) {
    const date = monthlyDates[monthIdx];
    const { sunrise, sunset } = getDaylightRange(date, lat, lng);
    const sampleIntervals = getSampleIntervalsForDay(sunrise, sunset, intervalMinutes);
    monthlyDayWeights.push(daysInMonth(year, monthIdx));

    if (emitPerTimestep && timestepMeta) {
      for (const interval of sampleIntervals) {
        const minuteOfDay = Math.round(interval.midpointMinute);
        const sampleDate = setTimeInTimeZone(date, minuteOfDay);
        timestepMeta.push({
          date: sampleDate.toISOString(),
          minuteOfDay,
        });
      }
    }

    for (let pointIdx = 0; pointIdx < allPoints.length; pointIdx++) {
      const [x, y, z] = allPoints[pointIdx];
      const origin = new Vector3(x, y, z);
      let sunlitHours = 0;

      for (const interval of sampleIntervals) {
        if (abortSignal?.aborted) return null;

        const minuteOfDay = Math.round(interval.midpointMinute);
        const sampleDate = setTimeInTimeZone(date, minuteOfDay);
        const sunDir = getSunDirection(sampleDate, lat, lng);
        if (!sunDir) {
          if (
            emitPerTimestep
            && perTimestepVisibility
            && pointIdx < roofGridPoints.length
          ) {
            perTimestepVisibility[pointIdx].push(0);
          }
          continue;
        }

        raycaster.set(origin, sunDir);
        raycaster.far = SUN_DISTANCE * 2;

        const intersections = raycaster.intersectObjects(buildingMeshes);
        const selfShadowPolicy = pointSelfShadowPolicy[pointIdx] ?? 'epsilon';
        const blocked = intersections.some((hit) => {
          if (hit.object?.userData?.isGround) return false;
          if (hit.object?.userData?.pandId === targetPandId) {
            if (selfShadowPolicy === 'always-skip') return false;
            if (selfShadowPolicy === 'always-block') return true;
            return !isSameSurfaceSelfHit(hit, origin);
          }
          return true;
        });

        const lit: 0 | 1 = blocked ? 0 : 1;
        if (lit === 1) {
          sunlitHours += interval.durationHours;
        }
        if (
          emitPerTimestep
          && perTimestepVisibility
          && pointIdx < roofGridPoints.length
        ) {
          perTimestepVisibility[pointIdx].push(lit);
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

    onMonthComplete?.(monthIdx, monthlyDates.length);
  }

  const roofPointCount = roofGridPoints.length;
  const roofMeanMonthly = Array.from({ length: 12 }, (_, monthIdx) => {
    if (roofPointCount <= 0) return 0;
    let sum = 0;
    for (let pointIdx = 0; pointIdx < roofPointCount; pointIdx++) {
      sum += perPointMonthly[pointIdx][monthIdx] ?? 0;
    }
    return round1(sum / roofPointCount);
  });

  const perPointAnnualByEvalPoint = perPointMonthly.map((pointMonths) =>
    round1(weightedAverage(pointMonths, monthlyDayWeights))
  );
  const perPointAnnual = perPointAnnualByEvalPoint.slice(0, roofPointCount);
  const annualAverage = round1(weightedAverage(roofMeanMonthly, monthlyDayWeights));

  const facadeProxyPoints: [number, number, number][] = [...legacyFacadeProxyPoints];
  const groundProxyPoints: [number, number, number][] = [...legacyGroundProxyPoints];
  const perFacadeAnnual: number[] = perPointAnnualByEvalPoint.slice(
    roofPointCount,
    roofPointCount + legacyFacadeProxyPoints.length,
  );
  const perGroundAnnual: number[] = perPointAnnualByEvalPoint.slice(
    roofPointCount + legacyFacadeProxyPoints.length,
    roofPointCount + legacyFacadeProxyPoints.length + legacyGroundProxyPoints.length,
  );

  const facadeBuckets = new Map<string, {
    orientation: FacadeSunlightResult['orientation'];
    heightLabel: string;
    winterSum: number;
    summerSum: number;
    annualSum: number;
    count: number;
  }>();

  const extraStartIdx = sampledPoints.allPoints.length;
  for (let i = 0; i < extraPoints.length; i++) {
    const label = extraLabels[i] ?? '';
    const category = extraCategories[i];
    const globalIdx = extraStartIdx + i;
    const annual = perPointAnnualByEvalPoint[globalIdx] ?? 0;
    const point = extraPoints[i];

    if (category === 'facade') {
      const parsed = parseFacadeLabel(label);
      facadeProxyPoints.push(point);
      perFacadeAnnual.push(annual);

      if (!parsed) continue;

      const monthly = perPointMonthly[globalIdx] ?? [];
      const key = `${parsed.orientation}:${parsed.heightLabel}`;
      const bucket = facadeBuckets.get(key) ?? {
        orientation: parsed.orientation,
        heightLabel: parsed.heightLabel,
        winterSum: 0,
        summerSum: 0,
        annualSum: 0,
        count: 0,
      };

      bucket.winterSum += monthly[11] ?? 0;
      bucket.summerSum += monthly[5] ?? 0;
      bucket.annualSum += annual;
      bucket.count += 1;
      facadeBuckets.set(key, bucket);
      continue;
    }

    if (category === 'ground') {
      groundProxyPoints.push(point);
      perGroundAnnual.push(annual);
    }
  }

  const facadeResults = Array.from(facadeBuckets.values())
    .map((bucket): FacadeSunlightResult => ({
      orientation: bucket.orientation,
      heightLabel: bucket.heightLabel,
      winterHours: round1(bucket.winterSum / Math.max(1, bucket.count)),
      summerHours: round1(bucket.summerSum / Math.max(1, bucket.count)),
      annualAverage: round1(bucket.annualSum / Math.max(1, bucket.count)),
    }))
    .sort((a, b) => {
      const orientationDelta = ORIENTATION_ORDER[a.orientation] - ORIENTATION_ORDER[b.orientation];
      if (orientationDelta !== 0) return orientationDelta;
      return parseFloat(a.heightLabel) - parseFloat(b.heightLabel);
    });

  const groundAnnualAverage = perGroundAnnual.length > 0
    ? round1(perGroundAnnual.reduce((sum, value) => sum + value, 0) / perGroundAnnual.length)
    : undefined;

  return {
    winter: roofMeanMonthly[11],
    equinox: roofMeanMonthly[2],
    summer: roofMeanMonthly[5],
    annualAverage,
    methodVersion: SUNLIGHT_METHOD_VERSION,
    targetPlane: 'roof',
    analysisYear: year,
    roofGridPoints,
    facadeProxyPoints,
    groundProxyPoints,
    perPointAnnual,
    perFacadeAnnual,
    perGroundAnnual,
    facadeResults,
    groundAnnualAverage,
    samplingBreakdown: {
      roof: roofGridPoints.length,
      facade: facadeProxyPoints.length,
      ground: groundProxyPoints.length,
      total: allPoints.length,
    },
    perTimestepVisibility,
    timestepMeta,
  };
}
