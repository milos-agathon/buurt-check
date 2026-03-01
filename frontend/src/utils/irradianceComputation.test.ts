import { describe, expect, it } from 'vitest';
import { computeIrradiance, type HourlyWeatherRecord } from './irradianceComputation';
import type { SunlightTimestepMeta } from '../types/api';

describe('computeIrradiance', () => {
  const makeWeather = (dniW: number, dhiW: number): HourlyWeatherRecord[] =>
    Array.from({ length: 4 }, (_, i) => ({
      date: `2025-06-21T${String(10 + i).padStart(2, '0')}:00:00Z`,
      minuteOfDay: (10 + i) * 60,
      dni_w_m2: dniW,
      dhi_w_m2: dhiW,
    }));

  it('returns only diffuse contribution when fully shadowed', () => {
    const visibility = [[0, 0, 0, 0] as (0 | 1)[]];
    const sunDirs = [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]];
    const surfaceNormal = [0, 1, 0];
    const svf = 0.5;
    const weather = makeWeather(500, 200);

    const result = computeIrradiance({
      perTimestepVisibility: visibility,
      sunDirections: sunDirs,
      surfaceNormal,
      svf,
      weather,
      intervalMinutes: 60,
    });

    expect(result.totalKwhM2).toBeGreaterThan(0);
    expect(result.directKwhM2).toBeCloseTo(0, 5);
  });

  it('returns higher irradiance when fully lit vs fully shadowed', () => {
    const litVisibility = [[1, 1, 1, 1] as (0 | 1)[]];
    const shadowedVisibility = [[0, 0, 0, 0] as (0 | 1)[]];
    const sunDirs = [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]];
    const surfaceNormal = [0, 1, 0];
    const svf = 0.8;
    const weather = makeWeather(500, 200);

    const litResult = computeIrradiance({
      perTimestepVisibility: litVisibility,
      sunDirections: sunDirs,
      surfaceNormal,
      svf,
      weather,
      intervalMinutes: 60,
    });
    const shadowedResult = computeIrradiance({
      perTimestepVisibility: shadowedVisibility,
      sunDirections: sunDirs,
      surfaceNormal,
      svf,
      weather,
      intervalMinutes: 60,
    });

    expect(litResult.totalKwhM2).toBeGreaterThan(shadowedResult.totalKwhM2);
    expect(litResult.directKwhM2).toBeGreaterThan(shadowedResult.directKwhM2);
  });

  it('scales representative-day timesteps to annual estimate when timestep meta is provided', () => {
    const visibility = [[1, 1] as (0 | 1)[]];
    const sunDirs = [[0, 1, 0], [0, 1, 0]];
    const weather: HourlyWeatherRecord[] = [
      { date: '2005-06-21T10:00:00Z', minuteOfDay: 600, dni_w_m2: 500, dhi_w_m2: 100 },
      { date: '2005-06-21T11:00:00Z', minuteOfDay: 660, dni_w_m2: 500, dhi_w_m2: 100 },
    ];
    const timestepMeta: SunlightTimestepMeta[] = [
      { date: '2026-06-21T10:00:00.000Z', minuteOfDay: 600 },
      { date: '2026-06-21T11:00:00.000Z', minuteOfDay: 660 },
    ];

    const result = computeIrradiance({
      perTimestepVisibility: visibility,
      sunDirections: sunDirs,
      surfaceNormal: [0, 1, 0],
      svf: 0.5,
      weather,
      intervalMinutes: 60,
      timestepMeta,
    });

    expect(result.totalKwhM2).toBeGreaterThan(0.01);
  });

  it('aligns summer local NL timestep metadata to UTC weather minute-of-day', () => {
    // Local NL 10:00 in summer corresponds to UTC 08:00.
    // timestepMeta keeps local minuteOfDay (600) while date carries UTC instant (08:00Z).
    const result = computeIrradiance({
      perTimestepVisibility: [[1]],
      sunDirections: [[0, 1, 0]],
      surfaceNormal: [0, 1, 0],
      svf: 0,
      weather: [
        { date: '2005-06-21T08:00:00Z', minuteOfDay: 480, dni_w_m2: 600, dhi_w_m2: 0 },
      ],
      intervalMinutes: 60,
      timestepMeta: [
        { date: '2026-06-21T08:00:00.000Z', minuteOfDay: 600 },
      ],
    });

    expect(result.directKwhM2).toBeCloseTo(18, 5);
  });

  it('returns zero when weather data is empty', () => {
    const result = computeIrradiance({
      perTimestepVisibility: [[1, 1, 1]],
      sunDirections: [[0, 1, 0], [0, 1, 0], [0, 1, 0]],
      surfaceNormal: [0, 1, 0],
      svf: 0.8,
      weather: [],
      intervalMinutes: 60,
    });

    expect(result).toEqual({
      totalKwhM2: 0,
      directKwhM2: 0,
      diffuseKwhM2: 0,
    });
  });

  it('uses the shortest aligned series when array lengths do not match', () => {
    const result = computeIrradiance({
      perTimestepVisibility: [[1, 1, 1]],
      sunDirections: [[0, 1, 0]],
      surfaceNormal: [0, 1, 0],
      svf: 1,
      weather: [
        { date: '2005-06-21T10:00:00Z', minuteOfDay: 600, dni_w_m2: 500, dhi_w_m2: 100 },
        { date: '2005-06-21T11:00:00Z', minuteOfDay: 660, dni_w_m2: 500, dhi_w_m2: 100 },
      ],
      intervalMinutes: 60,
    });

    expect(result.directKwhM2).toBeCloseTo(0.5, 5);
    expect(result.diffuseKwhM2).toBeCloseTo(0.1, 5);
    expect(result.totalKwhM2).toBeCloseTo(0.6, 5);
  });

  it('treats non-finite weather values as zero', () => {
    const result = computeIrradiance({
      perTimestepVisibility: [[1]],
      sunDirections: [[0, 1, 0]],
      surfaceNormal: [0, 1, 0],
      svf: 1,
      weather: [
        {
          date: '2005-06-21T10:00:00Z',
          minuteOfDay: 600,
          dni_w_m2: Number.NaN,
          dhi_w_m2: Number.POSITIVE_INFINITY,
        },
      ],
      intervalMinutes: 60,
    });

    expect(result).toEqual({
      totalKwhM2: 0,
      directKwhM2: 0,
      diffuseKwhM2: 0,
    });
  });

  it('uses fractional multi-point visibility for direct irradiance', () => {
    // 3 points: timestep 0 has 1/3 visibility, timestep 1 has full visibility.
    const result = computeIrradiance({
      perTimestepVisibility: [
        [1, 1],  // point 0: both visible
        [0, 1],  // point 1: only second visible
        [0, 1],  // point 2: only second visible
      ],
      sunDirections: [[0, 1, 0], [0, 1, 0]],
      surfaceNormal: [0, 1, 0],
      svf: 1.0,
      weather: [
        { date: '2005-06-21T12:00:00Z', minuteOfDay: 720, dni_w_m2: 800, dhi_w_m2: 200 },
        { date: '2005-06-21T12:30:00Z', minuteOfDay: 750, dni_w_m2: 800, dhi_w_m2: 200 },
      ],
      intervalMinutes: 30,
    });

    // Direct visibility fraction by timestep:
    // t0 = 1/3, t1 = 1.0 -> direct = 800 * 0.5h * (1/3 + 1) = 0.533... kWh/m2
    expect(result.directKwhM2).toBeCloseTo(0.533333, 4);
    expect(result.totalKwhM2).toBeGreaterThan(result.directKwhM2);
  });

  it('rejects nearest-neighbor weather match when misalignment exceeds 30 minutes', () => {
    // Weather at 12:00, analysis timestep at 14:00 (120 min gap)
    const result = computeIrradiance({
      perTimestepVisibility: [[1]],
      sunDirections: [[0, 1, 0]],
      surfaceNormal: [0, 1, 0],
      svf: 1.0,
      weather: [
        { date: '2005-06-21T12:00:00Z', minuteOfDay: 720, dni_w_m2: 800, dhi_w_m2: 200 },
      ],
      intervalMinutes: 30,
      timestepMeta: [
        { date: '2005-06-21T14:00:00Z', minuteOfDay: 840 },
      ],
    });

    // Weather is too far away (120 min > 30 min guard), should be treated as no weather
    expect(result.directKwhM2).toBe(0);
  });
});
