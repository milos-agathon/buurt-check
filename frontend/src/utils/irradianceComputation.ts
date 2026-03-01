import { incidenceAngle } from './surfaceNormals';
import type { SunlightTimestepMeta } from '../types/api';

export interface HourlyWeatherRecord {
  date: string;
  minuteOfDay: number;
  ghi_w_m2?: number;
  dni_w_m2: number;
  dhi_w_m2: number;
}

interface IrradianceInput {
  perTimestepVisibility: (0 | 1)[][];
  sunDirections: number[][];
  surfaceNormal: number[];
  svf: number;
  weather: HourlyWeatherRecord[];
  intervalMinutes: number;
  timestepMeta?: SunlightTimestepMeta[];
}

export interface IrradianceResult {
  totalKwhM2: number;
  directKwhM2: number;
  diffuseKwhM2: number;
}

interface StepWeather {
  dni_w_m2: number;
  dhi_w_m2: number;
}

function parseDate(dateRaw: string): Date | null {
  const parsed = new Date(dateRaw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  const compact = dateRaw.match(/^(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})$/);
  if (!compact) return null;
  const [, y, m, d, hh, mm] = compact;
  return new Date(Date.UTC(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    0,
  ));
}

function monthDayKeyFromDate(dateRaw: string): string | null {
  const parsed = parseDate(dateRaw);
  if (!parsed) return null;
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${month}-${day}`;
}

function minuteOfDayFromDate(dateRaw: string): number | null {
  const parsed = parseDate(dateRaw);
  if (!parsed) return null;
  return (parsed.getUTCHours() * 60) + parsed.getUTCMinutes();
}

function parseMonthFromDate(dateRaw: string): number | null {
  const parsed = parseDate(dateRaw);
  if (!parsed) return null;
  return parsed.getUTCMonth();
}

function parseYearFromDate(dateRaw: string): number | null {
  const parsed = parseDate(dateRaw);
  if (!parsed) return null;
  return parsed.getUTCFullYear();
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function asStepWeather(record: HourlyWeatherRecord | null): StepWeather {
  if (!record) {
    return { dni_w_m2: 0, dhi_w_m2: 0 };
  }
  return {
    dni_w_m2: Number.isFinite(record.dni_w_m2) ? record.dni_w_m2 : 0,
    dhi_w_m2: Number.isFinite(record.dhi_w_m2) ? record.dhi_w_m2 : 0,
  };
}

function alignWeather(
  weather: HourlyWeatherRecord[],
  timestepMeta?: SunlightTimestepMeta[],
): (StepWeather | null)[] {
  if (!timestepMeta || timestepMeta.length === 0) {
    return weather.map((entry) => asStepWeather(entry));
  }

  const exactMap = new Map<string, StepWeather>();
  const byMonthDay = new Map<string, Array<{ minuteOfDay: number; weather: StepWeather }>>();

  for (const entry of weather) {
    const monthDay = monthDayKeyFromDate(entry.date);
    if (!monthDay) continue;
    const minute = Number.isFinite(entry.minuteOfDay)
      ? entry.minuteOfDay
      : minuteOfDayFromDate(entry.date);
    if (minute == null) continue;

    const weatherValue = asStepWeather(entry);
    exactMap.set(`${monthDay}:${minute}`, weatherValue);
    const bucket = byMonthDay.get(monthDay) ?? [];
    bucket.push({ minuteOfDay: minute, weather: weatherValue });
    byMonthDay.set(monthDay, bucket);
  }

  const aligned: (StepWeather | null)[] = [];
  for (const meta of timestepMeta) {
    const monthDay = monthDayKeyFromDate(meta.date);
    if (!monthDay) {
      aligned.push(null);
      continue;
    }

    // timestepMeta.minuteOfDay is in NL local time; weather records are UTC.
    // Use UTC minute parsed from timestamp to align apples-to-apples.
    const utcMinuteOfDay = minuteOfDayFromDate(meta.date);
    const targetMinuteOfDay = utcMinuteOfDay ?? meta.minuteOfDay;

    const exact = exactMap.get(`${monthDay}:${targetMinuteOfDay}`);
    if (exact) {
      aligned.push(exact);
      continue;
    }

    const candidates = byMonthDay.get(monthDay);
    if (!candidates || candidates.length === 0) {
      aligned.push(null);
      continue;
    }

    let nearest = candidates[0];
    let minDelta = Math.abs(nearest.minuteOfDay - targetMinuteOfDay);
    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      const delta = Math.abs(candidate.minuteOfDay - targetMinuteOfDay);
      if (delta < minDelta) {
        nearest = candidate;
        minDelta = delta;
      }
    }
    // Max-distance guard: reject weather records >30min away
    aligned.push(minDelta <= 30 ? nearest.weather : null);
  }

  return aligned;
}

/**
 * Estimate annual irradiance (kWh/m2/yr) for the analyzed roof.
 *
 * direct = DNI * cos(theta) * visibility
 * diffuse = DHI * SVF
 */
export function computeIrradiance(input: IrradianceInput): IrradianceResult {
  const {
    perTimestepVisibility,
    sunDirections,
    surfaceNormal,
    svf,
    weather,
    intervalMinutes,
    timestepMeta,
  } = input;

  // Average visibility fraction across all roof eval points per timestep.
  const maxTimesteps = perTimestepVisibility.reduce(
    (max, pointVisibility) => Math.max(max, pointVisibility.length),
    0,
  );
  const visibilityFractions = Array.from({ length: maxTimesteps }, (_, t) => {
    let visible = 0;
    let total = 0;
    for (const pointVis of perTimestepVisibility) {
      if (t < pointVis.length) {
        visible += pointVis[t];
        total += 1;
      }
    }
    if (total <= 0) return 0;
    return visible / total;
  });

  if (visibilityFractions.length === 0) {
    return { totalKwhM2: 0, directKwhM2: 0, diffuseKwhM2: 0 };
  }

  const hoursPerStep = intervalMinutes / 60;
  const weatherByStep = alignWeather(weather, timestepMeta);
  const numTimesteps = Math.min(
    visibilityFractions.length,
    sunDirections.length,
    weatherByStep.length,
    timestepMeta?.length ?? Number.MAX_SAFE_INTEGER,
  );

  let directWhM2 = 0;
  let diffuseWhM2 = 0;
  const dayBuckets = new Map<string, { direct: number; diffuse: number; month: number }>();

  for (let t = 0; t < numTimesteps; t++) {
    const visibilityFraction = clamp01(visibilityFractions[t]);
    const sunDir = sunDirections[t];
    const weatherStep = weatherByStep[t];
    if (!sunDir || !weatherStep) continue;

    let stepDirect = 0;
    let stepDiffuse = 0;

    if (visibilityFraction > 0 && weatherStep.dni_w_m2 > 0) {
      const theta = incidenceAngle(surfaceNormal, sunDir);
      const cosTheta = Math.cos(theta);
      if (cosTheta > 0) {
        stepDirect = weatherStep.dni_w_m2 * cosTheta * hoursPerStep * visibilityFraction;
      }
    }

    if (weatherStep.dhi_w_m2 > 0) {
      stepDiffuse = weatherStep.dhi_w_m2 * clamp01(svf) * hoursPerStep;
    }

    if (timestepMeta && timestepMeta[t]) {
      const dateKey = timestepMeta[t].date.slice(0, 10);
      const month = parseMonthFromDate(timestepMeta[t].date);
      if (month != null && dateKey.length === 10) {
        const bucket = dayBuckets.get(dateKey) ?? { direct: 0, diffuse: 0, month };
        bucket.direct += stepDirect;
        bucket.diffuse += stepDiffuse;
        dayBuckets.set(dateKey, bucket);
        continue;
      }
    }

    directWhM2 += stepDirect;
    diffuseWhM2 += stepDiffuse;
  }

  if (dayBuckets.size > 0) {
    const referenceYear = parseYearFromDate(timestepMeta?.[0]?.date ?? '') ?? new Date().getUTCFullYear();
    const perMonth = new Map<number, { direct: number; diffuse: number; daysRepresented: number }>();

    for (const bucket of dayBuckets.values()) {
      const monthBucket = perMonth.get(bucket.month) ?? { direct: 0, diffuse: 0, daysRepresented: 0 };
      monthBucket.direct += bucket.direct;
      monthBucket.diffuse += bucket.diffuse;
      monthBucket.daysRepresented += 1;
      perMonth.set(bucket.month, monthBucket);
    }

    for (const [month, bucket] of perMonth) {
      const monthDays = daysInMonth(referenceYear, month);
      const directPerDay = bucket.direct / Math.max(1, bucket.daysRepresented);
      const diffusePerDay = bucket.diffuse / Math.max(1, bucket.daysRepresented);
      directWhM2 += directPerDay * monthDays;
      diffuseWhM2 += diffusePerDay * monthDays;
    }
  }

  return {
    totalKwhM2: (directWhM2 + diffuseWhM2) / 1000,
    directKwhM2: directWhM2 / 1000,
    diffuseKwhM2: diffuseWhM2 / 1000,
  };
}
