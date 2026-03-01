import SunCalc from 'suncalc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDateInTimeZone,
  getSunDirection,
  getDaylightRange,
  getRepresentativeDates,
  getDatePartsInTimeZone,
  setTimeInTimeZone,
  sunCalcToNorthAzimuth,
} from './sunPosition';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getSunDirection', () => {
  it('returns normalized Vector3 for summer noon Amsterdam', () => {
    const date = new Date(2025, 5, 21, 12, 0);
    const dir = getSunDirection(date, 52.37, 4.90);
    expect(dir).not.toBeNull();
    expect(dir!.length()).toBeCloseTo(1.0, 2);
    expect(dir!.y).toBeGreaterThan(0);
  });

  it('returns null for nighttime', () => {
    const date = new Date(2025, 11, 21, 2, 0);
    const dir = getSunDirection(date, 52.37, 4.90);
    expect(dir).toBeNull();
  });

  // Coordinate-system regression tests.
  it('sun is south-ish at noon in Amsterdam (positive Z component)', () => {
    const date = new Date(2025, 5, 21, 12, 30);
    const dir = getSunDirection(date, 52.37, 4.90);
    expect(dir).not.toBeNull();
    expect(dir!.z).toBeGreaterThan(0);
  });

  it('morning sun is east-ish (positive X component)', () => {
    const date = new Date(2025, 5, 21, 7, 0);
    const dir = getSunDirection(date, 52.37, 4.90);
    expect(dir).not.toBeNull();
    expect(dir!.x).toBeGreaterThan(0);
  });
});

describe('getDaylightRange', () => {
  it('returns fractional sunrise/sunset hours for summer', () => {
    const date = new Date(2025, 5, 21);
    const range = getDaylightRange(date, 52.37, 4.90);
    expect(range.sunrise).toBeLessThan(6);
    expect(range.sunset).toBeGreaterThan(21);
    expect(range.sunrise % 1).not.toBe(0);
  });

  it('returns shorter day for winter', () => {
    const winter = getDaylightRange(new Date(2025, 11, 21), 52.37, 4.90);
    const summer = getDaylightRange(new Date(2025, 5, 21), 52.37, 4.90);
    const winterLen = winter.sunset - winter.sunrise;
    const summerLen = summer.sunset - summer.sunrise;
    expect(winterLen).toBeLessThan(summerLen);
  });

  it('uses NL timezone extraction instead of Date.getHours/getMinutes', () => {
    class ThrowingDate extends Date {
      override getHours(): number {
        throw new Error('local hours should not be used');
      }

      override getMinutes(): number {
        throw new Error('local minutes should not be used');
      }
    }

    const sunrise = new ThrowingDate('2025-06-21T03:30:00.000Z'); // 05:30 in NL (CEST)
    const sunset = new ThrowingDate('2025-06-21T20:00:00.000Z'); // 22:00 in NL (CEST)
    vi.spyOn(SunCalc, 'getTimes').mockReturnValue({
      sunrise,
      sunset,
    } as unknown as ReturnType<typeof SunCalc.getTimes>);

    const range = getDaylightRange(new Date(2025, 5, 21), 52.37, 4.90);
    expect(range.sunrise).toBeCloseTo(5.5, 1);
    expect(range.sunset).toBeCloseTo(22, 1);
  });
});

describe('getRepresentativeDates', () => {
  it('returns 12 dates (21st of each month) for given year', () => {
    const dates = getRepresentativeDates(2025);
    expect(dates).toHaveLength(12);
    const first = getDatePartsInTimeZone(dates[0]);
    const last = getDatePartsInTimeZone(dates[11]);
    expect(first.month).toBe(1);
    expect(last.month).toBe(12);
    dates.forEach((date) => expect(getDatePartsInTimeZone(date).day).toBe(21));
  });
});

describe('sunCalcToNorthAzimuth', () => {
  it('converts south (SunCalc 0) to 180 degrees north-origin', () => {
    expect(sunCalcToNorthAzimuth(0)).toBeCloseTo(Math.PI);
  });

  it('converts west (SunCalc pi/2) to 270 degrees north-origin', () => {
    expect(sunCalcToNorthAzimuth(Math.PI / 2)).toBeCloseTo(3 * Math.PI / 2);
  });

  it('converts north (SunCalc pi) to 360 degrees / 0 degrees north-origin', () => {
    expect(sunCalcToNorthAzimuth(Math.PI)).toBeCloseTo(2 * Math.PI);
  });

  it('converts east (SunCalc -pi/2) to 90 degrees north-origin', () => {
    expect(sunCalcToNorthAzimuth(-Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});

describe('time-zone date helpers', () => {
  it('createDateInTimeZone creates the requested local NL date/time', () => {
    const date = createDateInTimeZone(2026, 5, 21, 12, 45);
    const parts = getDatePartsInTimeZone(date);

    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(6);
    expect(parts.day).toBe(21);
    expect(parts.hour).toBe(12);
    expect(parts.minute).toBe(45);
  });

  it('setTimeInTimeZone keeps date parts and updates time-of-day', () => {
    const baseDate = createDateInTimeZone(2026, 2, 21, 6, 0);
    const shifted = setTimeInTimeZone(baseDate, 14 * 60 + 15);
    const parts = getDatePartsInTimeZone(shifted);

    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(3);
    expect(parts.day).toBe(21);
    expect(parts.hour).toBe(14);
    expect(parts.minute).toBe(15);
  });

  it('handles spring DST jump (Europe/Amsterdam) without a two-hour drift', () => {
    const before = createDateInTimeZone(2026, 2, 29, 1, 30);
    const after = createDateInTimeZone(2026, 2, 29, 3, 30);

    const beforeParts = getDatePartsInTimeZone(before);
    const afterParts = getDatePartsInTimeZone(after);

    expect(beforeParts.hour).toBe(1);
    expect(afterParts.hour).toBe(3);
    expect((after.getTime() - before.getTime()) / (60 * 60 * 1000)).toBe(1);
  });

  it('handles autumn DST fallback (Europe/Amsterdam) with repeated local hour', () => {
    const before = createDateInTimeZone(2026, 9, 25, 1, 30);
    const after = createDateInTimeZone(2026, 9, 25, 3, 30);

    const beforeParts = getDatePartsInTimeZone(before);
    const afterParts = getDatePartsInTimeZone(after);

    expect(beforeParts.hour).toBe(1);
    expect(afterParts.hour).toBe(3);
    expect((after.getTime() - before.getTime()) / (60 * 60 * 1000)).toBe(3);
  });

  it('setTimeInTimeZone applies DST-aware conversion on transition days', () => {
    const baseDate = createDateInTimeZone(2026, 2, 29, 12, 0);
    const shifted = setTimeInTimeZone(baseDate, 3 * 60 + 30);
    const parts = getDatePartsInTimeZone(shifted);

    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(3);
    expect(parts.day).toBe(29);
    expect(parts.hour).toBe(3);
    expect(parts.minute).toBe(30);
  });
});
