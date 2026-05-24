import { describe, expect, it } from 'vitest';
import {
  getMatchFreshnessIndicatorLabel,
  getMatchGenerationModeLabel,
  getMatchLocaleLabel,
  getMatchRecommendationReasonLabel,
  getSavedNeighborhoodDisplayName,
} from './matchDisplayLabels';
import { setupTestI18n } from '../../test/helpers';

describe('match display labels', () => {
  it('localizes legacy Match metadata tokens without exposing backend keys', async () => {
    const i18nEn = await setupTestI18n('en');
    const i18nNl = await setupTestI18n('nl');

    expect(getMatchFreshnessIndicatorLabel('mock_data', i18nEn.t)).toBe('Mock data coverage');
    expect(getMatchFreshnessIndicatorLabel('stale_data', i18nNl.t)).toBe('Verouderde databronnen');
    expect(getMatchGenerationModeLabel('deterministic_fallback', i18nNl.t)).toBe('Deterministische fallback');
    expect(getMatchLocaleLabel('en', i18nEn.t)).toBe('English');
    expect(getMatchLocaleLabel('nl', i18nNl.t)).toBe('Nederlands');
  });

  it('formats saved neighborhood names from data and localizes missing-name fallbacks', async () => {
    const i18nEn = await setupTestI18n('en');
    const i18nNl = await setupTestI18n('nl');

    expect(getSavedNeighborhoodDisplayName(
      'nh_amsterdam_ijburg',
      { neighborhood_name: 'Amsterdam IJburg' },
      i18nEn.t,
    )).toBe('Amsterdam IJburg');
    expect(getSavedNeighborhoodDisplayName('nh_amsterdam_ijburg', null, i18nEn.t)).toBe(
      'Saved neighborhood nh_amsterdam_ijburg',
    );
    expect(getSavedNeighborhoodDisplayName('nh_amsterdam_ijburg', null, i18nNl.t)).toBe(
      'Opgeslagen buurt nh_amsterdam_ijburg',
    );
  });

  it('hides unknown recommendation reason keys', async () => {
    const i18n = await setupTestI18n('en');

    expect(getMatchRecommendationReasonLabel('mobility_match', i18n.t, i18n.exists.bind(i18n))).toBe(
      'Transit and mobility support this fit.',
    );
    expect(getMatchRecommendationReasonLabel('unknown_backend_reason', i18n.t, i18n.exists.bind(i18n))).toBe(
      'Fit is based on the available scoring inputs.',
    );
  });
});
