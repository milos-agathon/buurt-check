import { describe, expect, it } from 'vitest';
import { getEN17037Level, getTNOBenchmark } from './standardsBenchmark';

describe('getEN17037Level', () => {
  it('returns "high" for >= 4h on equinox', () => {
    expect(getEN17037Level(4.5)).toBe('high');
  });

  it('returns "high" at exact 4h boundary', () => {
    expect(getEN17037Level(4.0)).toBe('high');
  });

  it('returns "medium" for >= 3h', () => {
    expect(getEN17037Level(3.2)).toBe('medium');
  });

  it('returns "medium" at exact 3h boundary', () => {
    expect(getEN17037Level(3.0)).toBe('medium');
  });

  it('returns "medium" just below 4h boundary', () => {
    expect(getEN17037Level(3.99)).toBe('medium');
  });

  it('returns "minimum" for >= 1.5h', () => {
    expect(getEN17037Level(2.0)).toBe('minimum');
  });

  it('returns "minimum" at exact 1.5h boundary', () => {
    expect(getEN17037Level(1.5)).toBe('minimum');
  });

  it('returns "minimum" just below 3h boundary', () => {
    expect(getEN17037Level(2.99)).toBe('minimum');
  });

  it('returns "below" for < 1.5h', () => {
    expect(getEN17037Level(0.8)).toBe('below');
  });

  it('returns "below" just under 1.5h boundary', () => {
    expect(getEN17037Level(1.49)).toBe('below');
  });

  it('returns "below" for 0h', () => {
    expect(getEN17037Level(0)).toBe('below');
  });
});

describe('getTNOBenchmark', () => {
  it('returns "streng" for >= 80% of possible sun hours', () => {
    expect(getTNOBenchmark(7.0, 7.5)).toBe('streng');
  });

  it('returns "streng" at exact 80% boundary', () => {
    expect(getTNOBenchmark(6.0, 7.5)).toBe('streng');
  });

  it('returns "licht" for >= 50% of possible sun hours', () => {
    expect(getTNOBenchmark(4.0, 7.5)).toBe('licht');
  });

  it('returns "licht" at exact 50% boundary', () => {
    expect(getTNOBenchmark(3.75, 7.5)).toBe('licht');
  });

  it('returns "licht" just below 80% boundary', () => {
    expect(getTNOBenchmark(5.99, 7.5)).toBe('licht');
  });

  it('returns "below" for < 50% of possible sun hours', () => {
    expect(getTNOBenchmark(2.0, 7.5)).toBe('below');
  });

  it('returns "below" just under 50% boundary', () => {
    expect(getTNOBenchmark(3.74, 7.5)).toBe('below');
  });

  it('returns "below" when possibleHours is 0', () => {
    expect(getTNOBenchmark(5.0, 0)).toBe('below');
  });

  it('returns "below" when possibleHours is negative', () => {
    expect(getTNOBenchmark(5.0, -1)).toBe('below');
  });
});

