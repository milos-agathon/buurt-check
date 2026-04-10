import type { TFunction } from 'i18next';

export type ComparisonColorKey =
  | 'address'
  | 'peer'
  | 'national'
  | 'who'
  | 'air_target'
  | 'climate_target'
  | 'daylight_target';

export function getRiskComparisonLabel(
  row: { label_code: string; label_key?: string },
  t: TFunction,
): string {
  if (row.label_key) {
    return t(row.label_key, { defaultValue: row.label_key });
  }
  if (row.label_code === 'city_avg') return t('risk.detail.peerUrbanization');
  if (row.label_code === 'nl_avg') return t('risk.detail.nationalBaseline');
  if (row.label_code === 'who_limit') return t('risk.detail.whoNoiseGuideline');
  if (row.label_code === 'air_interim_target') return t('risk.detail.airQualityTarget');
  if (row.label_code === 'adaptation_target') return t('risk.detail.climateAdaptationTarget');
  if (row.label_code === 'daylight_target') return t('risk.detail.daylightTarget');
  return t('risk.detail.address');
}

export function getRiskComparisonColorKey(
  row: { label_code: string; role?: string; benchmark_family?: string },
): ComparisonColorKey {
  if (row.role === 'peer') return 'peer';
  if (row.role === 'national') return 'national';
  if (row.role === 'reference') {
    if (row.benchmark_family === 'climate_adaptation_target') return 'climate_target';
    if (row.benchmark_family === 'daylight_target') return 'daylight_target';
    if (row.benchmark_family === 'air_interim_target') return 'air_target';
    return 'who';
  }
  if (row.label_code === 'city_avg') return 'peer';
  if (row.label_code === 'nl_avg') return 'national';
  if (row.label_code === 'adaptation_target') return 'climate_target';
  if (row.label_code === 'daylight_target') return 'daylight_target';
  if (row.label_code === 'air_interim_target') return 'air_target';
  if (row.label_code === 'who_limit') return 'who';
  return 'address';
}
