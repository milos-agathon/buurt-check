import { describe, it, expect } from 'vitest';
import { getSunDirection, getDaylightRange, getRepresentativeDates } from './sunPosition';

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
});

describe('getRepresentativeDates', () => {
  it('returns 12 dates (21st of each month) for given year', () => {
    const dates = getRepresentativeDates(2025);
    expect(dates).toHaveLength(12);
    expect(dates[0].getMonth()).toBe(0);
    expect(dates[11].getMonth()).toBe(11);
    dates.forEach((d) => expect(d.getDate()).toBe(21));
  });
});
