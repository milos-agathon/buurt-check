import { describe, it, expect } from 'vitest';
import {
  resolveSourceFetchStatus,
  buildParsedSourceDate,
  parseSourceDateValue,
  formatCoverageDate,
  staleThresholdDate,
  toUtcDate,
} from './dataCoverage';

describe('resolveSourceFetchStatus', () => {
  it('returns idle when not enabled', () => {
    expect(resolveSourceFetchStatus(false, false, false, false)).toBe('idle');
  });

  it('returns success when data exists (even if error also present)', () => {
    expect(resolveSourceFetchStatus(true, true, false, true)).toBe('success');
  });

  it('returns loading when enabled, no data, still loading', () => {
    expect(resolveSourceFetchStatus(true, false, true, false)).toBe('loading');
  });

  it('returns error when enabled, no data, not loading, has error', () => {
    expect(resolveSourceFetchStatus(true, false, false, true)).toBe('error');
  });

  it('returns loading as default when enabled with no other signals', () => {
    expect(resolveSourceFetchStatus(true, false, false, false)).toBe('loading');
  });

  it('hasData takes precedence over loading', () => {
    expect(resolveSourceFetchStatus(true, true, true, false)).toBe('success');
  });

  it('returns error when error is a non-empty string', () => {
    expect(resolveSourceFetchStatus(true, false, false, 'Something went wrong')).toBe('error');
  });

  it('returns loading when error is null', () => {
    expect(resolveSourceFetchStatus(true, false, false, null)).toBe('loading');
  });
});

describe('buildParsedSourceDate', () => {
  it('builds year-only date with Dec 31 recency', () => {
    const result = buildParsedSourceDate(2024);
    expect(result).toEqual({
      precision: 'year',
      year: 2024,
      recencyDate: new Date(Date.UTC(2024, 11, 31)),
    });
  });

  it('builds year+month date with end-of-month recency', () => {
    const result = buildParsedSourceDate(2024, 2);
    expect(result).toEqual({
      precision: 'month',
      year: 2024,
      month: 2,
      recencyDate: new Date(Date.UTC(2024, 1, 29)), // 2024 is leap year
    });
  });

  it('builds full date with exact recency', () => {
    const result = buildParsedSourceDate(2025, 6, 15);
    expect(result).toEqual({
      precision: 'day',
      year: 2025,
      month: 6,
      day: 15,
      recencyDate: new Date(Date.UTC(2025, 5, 15)),
    });
  });

  it('handles leap year Feb 29', () => {
    const result = buildParsedSourceDate(2024, 2, 29);
    expect(result).not.toBeNull();
    expect(result!.day).toBe(29);
  });

  it('rejects non-leap year Feb 29', () => {
    expect(buildParsedSourceDate(2025, 2, 29)).toBeNull();
  });

  it('rejects month 0', () => {
    expect(buildParsedSourceDate(2024, 0)).toBeNull();
  });

  it('rejects month 13', () => {
    expect(buildParsedSourceDate(2024, 13)).toBeNull();
  });

  it('rejects day 0', () => {
    expect(buildParsedSourceDate(2024, 1, 0)).toBeNull();
  });

  it('rejects day 32 in January', () => {
    expect(buildParsedSourceDate(2024, 1, 32)).toBeNull();
  });

  it('rejects year below 1900', () => {
    expect(buildParsedSourceDate(1899)).toBeNull();
  });

  it('rejects year above 2200', () => {
    expect(buildParsedSourceDate(2201)).toBeNull();
  });

  it('rejects non-integer year', () => {
    expect(buildParsedSourceDate(2024.5)).toBeNull();
  });
});

describe('parseSourceDateValue', () => {
  it('returns null for null', () => {
    expect(parseSourceDateValue(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseSourceDateValue(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSourceDateValue('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseSourceDateValue('  ')).toBeNull();
  });

  it('returns null for non-date string', () => {
    expect(parseSourceDateValue('hello')).toBeNull();
  });

  // YYYY-MM-DD
  it('parses YYYY-MM-DD', () => {
    const result = parseSourceDateValue('2025-01-15');
    expect(result).toEqual({
      precision: 'day',
      year: 2025,
      month: 1,
      day: 15,
      recencyDate: new Date(Date.UTC(2025, 0, 15)),
    });
  });

  // YYYY-MM-DDThh:mm:ss (ISO datetime)
  it('parses ISO datetime (strips time part)', () => {
    const result = parseSourceDateValue('2025-01-15T10:30:00Z');
    expect(result).toEqual({
      precision: 'day',
      year: 2025,
      month: 1,
      day: 15,
      recencyDate: new Date(Date.UTC(2025, 0, 15)),
    });
  });

  // YYYYMMDD
  it('parses YYYYMMDD compact', () => {
    const result = parseSourceDateValue('20250115');
    expect(result).toEqual({
      precision: 'day',
      year: 2025,
      month: 1,
      day: 15,
      recencyDate: new Date(Date.UTC(2025, 0, 15)),
    });
  });

  // YYYY-MM
  it('parses YYYY-MM', () => {
    const result = parseSourceDateValue('2025-03');
    expect(result).toEqual({
      precision: 'month',
      year: 2025,
      month: 3,
      recencyDate: new Date(Date.UTC(2025, 2, 31)),
    });
  });

  // YYYYMM
  it('parses YYYYMM compact', () => {
    const result = parseSourceDateValue('202503');
    expect(result).toEqual({
      precision: 'month',
      year: 2025,
      month: 3,
      recencyDate: new Date(Date.UTC(2025, 2, 31)),
    });
  });

  // YYYYMM00 (CBS monthly)
  it('parses YYYYMM00 CBS monthly format', () => {
    const result = parseSourceDateValue('2024MM06');
    expect(result).toEqual({
      precision: 'month',
      year: 2024,
      month: 6,
      recencyDate: new Date(Date.UTC(2024, 5, 30)),
    });
  });

  it('parses YYYYMM00 case-insensitive', () => {
    const result = parseSourceDateValue('2024mm03');
    expect(result).not.toBeNull();
    expect(result!.month).toBe(3);
  });

  // YYYYJJ00 (CBS yearly)
  it('parses YYYYJJ00 CBS yearly format', () => {
    const result = parseSourceDateValue('2023JJ00');
    expect(result).toEqual({
      precision: 'year',
      year: 2023,
      recencyDate: new Date(Date.UTC(2023, 11, 31)),
    });
  });

  it('parses YYYYJJ00 case-insensitive', () => {
    const result = parseSourceDateValue('2023jj00');
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2023);
  });

  // Bare YYYY
  it('parses bare year', () => {
    const result = parseSourceDateValue('2024');
    expect(result).toEqual({
      precision: 'year',
      year: 2024,
      recencyDate: new Date(Date.UTC(2024, 11, 31)),
    });
  });

  // Numeric input
  it('parses numeric year input', () => {
    const result = parseSourceDateValue(2024);
    expect(result).toEqual({
      precision: 'year',
      year: 2024,
      recencyDate: new Date(Date.UTC(2024, 11, 31)),
    });
  });

  // Edge cases
  it('rejects invalid month in YYYY-MM-DD', () => {
    expect(parseSourceDateValue('2025-13-01')).toBeNull();
  });

  it('rejects invalid day in YYYY-MM-DD', () => {
    expect(parseSourceDateValue('2025-02-30')).toBeNull();
  });

  it('handles Feb 29 in leap year', () => {
    const result = parseSourceDateValue('2024-02-29');
    expect(result).not.toBeNull();
    expect(result!.day).toBe(29);
  });

  it('rejects Feb 29 in non-leap year', () => {
    expect(parseSourceDateValue('2025-02-29')).toBeNull();
  });

  it('trims whitespace', () => {
    const result = parseSourceDateValue('  2025-01-15  ');
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2025);
  });
});

describe('formatCoverageDate', () => {
  it('formats year-only as plain year string', () => {
    const parsed = buildParsedSourceDate(2024)!;
    expect(formatCoverageDate(parsed, 'en')).toBe('2024');
    expect(formatCoverageDate(parsed, 'nl')).toBe('2024');
  });

  it('formats month+year in English', () => {
    const parsed = buildParsedSourceDate(2025, 1)!;
    const result = formatCoverageDate(parsed, 'en');
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2025/);
  });

  it('formats month+year in Dutch', () => {
    const parsed = buildParsedSourceDate(2025, 1)!;
    const result = formatCoverageDate(parsed, 'nl');
    expect(result).toMatch(/jan/i);
    expect(result).toMatch(/2025/);
  });

  it('formats day precision same as month (ignores day)', () => {
    const parsed = buildParsedSourceDate(2025, 6, 15)!;
    const result = formatCoverageDate(parsed, 'en');
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2025/);
  });

  it('defaults to en-US for unknown languages', () => {
    const parsed = buildParsedSourceDate(2025, 3)!;
    const result = formatCoverageDate(parsed, 'fr');
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/2025/);
  });
});

describe('staleThresholdDate', () => {
  it('returns a date exactly 12 months before the given date', () => {
    const now = new Date(Date.UTC(2026, 1, 23)); // Feb 23, 2026
    const threshold = staleThresholdDate(now);
    expect(threshold.getUTCFullYear()).toBe(2025);
    expect(threshold.getUTCMonth()).toBe(1); // February (0-indexed)
    expect(threshold.getUTCDate()).toBe(23);
  });

  it('handles year boundary (Jan → previous Dec)', () => {
    const now = new Date(Date.UTC(2026, 0, 15)); // Jan 15, 2026
    const threshold = staleThresholdDate(now);
    expect(threshold.getUTCFullYear()).toBe(2025);
    expect(threshold.getUTCMonth()).toBe(0); // January
    expect(threshold.getUTCDate()).toBe(15);
  });

  it('uses current date by default', () => {
    const threshold = staleThresholdDate();
    const now = new Date();
    expect(threshold.getUTCFullYear()).toBe(now.getUTCFullYear() - 1);
  });
});

describe('toUtcDate', () => {
  it('creates UTC date with 1-based month', () => {
    const date = toUtcDate(2025, 1, 15);
    expect(date.getUTCFullYear()).toBe(2025);
    expect(date.getUTCMonth()).toBe(0); // Jan = 0 internally
    expect(date.getUTCDate()).toBe(15);
  });

  it('has zero time component', () => {
    const date = toUtcDate(2025, 6, 1);
    expect(date.getUTCHours()).toBe(0);
    expect(date.getUTCMinutes()).toBe(0);
    expect(date.getUTCSeconds()).toBe(0);
  });
});
