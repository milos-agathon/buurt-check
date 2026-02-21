import SunCalc from 'suncalc';
import { Vector3 } from 'three';

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
    sunrise: times.sunrise.getHours() + times.sunrise.getMinutes() / 60,
    sunset: times.sunset.getHours() + times.sunset.getMinutes() / 60,
  };
}

/** Returns representative monthly dates (21st of each month) for a given year. */
export function getRepresentativeDates(year: number): Date[] {
  return Array.from({ length: 12 }, (_, month) => new Date(year, month, 21));
}

/**
 * Radius for positioning directional sunlight from scene center.
 * Also used as raycast range for obstruction checks.
 */
export const SUN_DISTANCE = 300;
