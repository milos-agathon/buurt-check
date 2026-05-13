import SunCalc from 'suncalc';
import { Vector3 } from 'three';

const NETHERLANDS_TIME_ZONE = 'Europe/Amsterdam';

interface TimeZoneDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    hour12: false,
  });

  formatterCache.set(timeZone, formatter);
  return formatter;
}

function readNumericPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value;
  const parsed = value != null ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getDatePartsInTimeZone(
  date: Date,
  timeZone = NETHERLANDS_TIME_ZONE,
): TimeZoneDateParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  return {
    year: readNumericPart(parts, 'year'),
    month: readNumericPart(parts, 'month'),
    day: readNumericPart(parts, 'day'),
    hour: readNumericPart(parts, 'hour'),
    minute: readNumericPart(parts, 'minute'),
    second: readNumericPart(parts, 'second'),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone = NETHERLANDS_TIME_ZONE): number {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const utcTimestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0,
  );
  return utcTimestamp - date.getTime();
}

export function createDateInTimeZone(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = NETHERLANDS_TIME_ZONE,
): Date {
  const utcGuess = Date.UTC(year, monthIndex, day, hour, minute, 0, 0);
  const firstOffset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let timestamp = utcGuess - firstOffset;

  // Re-evaluate once to handle DST boundaries where the offset changes.
  const secondOffset = getTimeZoneOffsetMs(new Date(timestamp), timeZone);
  if (secondOffset !== firstOffset) {
    timestamp = utcGuess - secondOffset;
  }

  return new Date(timestamp);
}

export function setTimeInTimeZone(
  baseDate: Date,
  minuteOfDay: number,
  timeZone = NETHERLANDS_TIME_ZONE,
): Date {
  const parts = getDatePartsInTimeZone(baseDate, timeZone);
  const safeMinutes = Math.max(0, Math.floor(minuteOfDay));
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  return createDateInTimeZone(parts.year, parts.month - 1, parts.day, hour, minute, timeZone);
}

function getFractionalHourInTimeZone(date: Date, timeZone = NETHERLANDS_TIME_ZONE): number {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return parts.hour + (parts.minute / 60);
}

/** Returns normalized sun direction vector, or null when sun is below horizon. */
export function getSunDirection(date: Date, lat: number, lng: number): Vector3 | null {
  const position = SunCalc.getPosition(date, lat, lng);
  if (position.altitude <= 0) return null;

  const azimuth = position.azimuth;
  const altitude = position.altitude;

  return new Vector3(
    -Math.sin(azimuth) * Math.cos(altitude),
    Math.sin(altitude),
    Math.cos(azimuth) * Math.cos(altitude),
  ).normalize();
}

/** Returns sunrise and sunset as fractional hours (e.g. 5.5 means 05:30). */
export function getDaylightRange(date: Date, lat: number, lng: number): { sunrise: number; sunset: number } {
  const times = SunCalc.getTimes(date, lat, lng);
  return {
    sunrise: getFractionalHourInTimeZone(times.sunrise, NETHERLANDS_TIME_ZONE),
    sunset: getFractionalHourInTimeZone(times.sunset, NETHERLANDS_TIME_ZONE),
  };
}

/** Returns representative monthly dates (21st of each month) for a given year. */
export function getRepresentativeDates(year: number): Date[] {
  return Array.from(
    { length: 12 },
    (_, month) => createDateInTimeZone(year, month, 21, 12, 0, NETHERLANDS_TIME_ZONE),
  );
}

/**
 * Convert SunCalc azimuth (0 = south, clockwise) to geographic azimuth (0 = north, clockwise).
 * SunCalc convention: 0 = south, π/2 = west, π = north, -π/2 = east
 * Geographic convention: 0 = north, π/2 = east, π = south, 3π/2 = west
 */
export function sunCalcToNorthAzimuth(sunCalcAz: number): number {
  return sunCalcAz + Math.PI;
}

/**
 * Radius for positioning directional sunlight from scene center.
 * Also used as raycast range for obstruction checks.
 */
export const SUN_DISTANCE = 300;
