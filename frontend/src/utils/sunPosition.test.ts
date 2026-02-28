import SunCalc from 'suncalc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSunDirection,
  getDaylightRange,
  getRepresentativeDates,
  getDatePartsInTimeZone,
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
