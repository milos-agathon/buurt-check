import { beforeAll, describe, expect, it } from 'vitest';
import { setupTestI18n } from '../test/helpers';
import {
  getRiskComparisonColorKey,
  getRiskComparisonLabel,
} from './riskComparisonPresentation';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

describe('riskComparisonPresentation', () => {
  it('maps peer rows to the urbanization peer label instead of City average', () => {
    const label = getRiskComparisonLabel(
      {
        label_code: 'city_avg',
        label_key: 'risk.detail.peerUrbanization',
      },
      i18n.t,
    );

    expect(label).toBe('Peer baseline (urbanization)');
    expect(label).not.toBe('City average');
    expect(getRiskComparisonColorKey({
      label_code: 'city_avg',
      role: 'peer',
      benchmark_family: 'urbanization_peer',
    })).toBe('peer');
  });

  it('maps the air interim target to Air quality target, not a WHO label', () => {
    const label = getRiskComparisonLabel(
      {
        label_code: 'air_interim_target',
        label_key: 'risk.detail.airQualityTarget',
      },
      i18n.t,
    );

    expect(label).toBe('Air quality target');
    expect(label).not.toContain('WHO');
    expect(getRiskComparisonColorKey({
      label_code: 'air_interim_target',
      role: 'reference',
      benchmark_family: 'air_interim_target',
    })).toBe('air_target');
  });

  it('keeps climate and daylight targets out of the WHO legend bucket', () => {
    expect(getRiskComparisonColorKey({
      label_code: 'adaptation_target',
      role: 'reference',
      benchmark_family: 'climate_adaptation_target',
    })).toBe('climate_target');

    expect(getRiskComparisonColorKey({
      label_code: 'daylight_target',
      role: 'reference',
      benchmark_family: 'daylight_target',
    })).toBe('daylight_target');
  });
});
