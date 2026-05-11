import { render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import MatchComparison from './MatchComparison';
import { setupTestI18n } from '../../test/helpers';
import type { MatchCompareResponse, MetricSource } from '../../types/match';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

const source: MetricSource = {
  source_id: 'src_green',
  source_name: 'MOCK DATA - seed',
  source_type: 'mock',
  metric_name: 'green_access',
  license_status: 'mock',
  measurement_date: '2024-01-01',
  retrieved_at: '2026-05-11T08:00:00Z',
  geography_level: 'neighborhood',
  method_version: 'seed',
  limitations: ['Mock limitation'],
  confidence: 72,
  freshness_status: 'mock',
};

const comparison: MatchCompareResponse = {
  locale: 'en',
  source_coverage: ['src_green'],
  missing_data_states: ['mobility:nh_two'],
  neighborhoods: [
    {
      neighborhood_id: 'nh_one',
      name: 'IJburg',
      municipality: 'Amsterdam',
      score: 72,
      dimension_scores: { green_access: 84 },
      evidence: [{ code: 'green_access_evidence', evidence_refs: ['ev_green'] }],
      tradeoffs: [{ code: 'affordability_buy_tradeoff', evidence_refs: [] }],
      confidence: { score: 72, label: 'medium', reasons: ['mock'] },
      freshness_status: 'mock',
      missing_data: [],
      source_refs: ['src_green'],
    },
    {
      neighborhood_id: 'nh_two',
      name: 'Leidsche Rijn',
      municipality: 'Utrecht',
      score: 70,
      dimension_scores: { green_access: 78 },
      evidence: [{ code: 'family_fit_evidence', evidence_refs: ['ev_family'] }],
      tradeoffs: [{ code: 'missing_mobility', evidence_refs: [] }],
      confidence: { score: 68, label: 'medium', reasons: ['mock'] },
      freshness_status: 'unavailable',
      missing_data: ['mobility'],
      source_refs: ['src_green'],
    },
    {
      neighborhood_id: 'nh_three',
      name: 'Katendrecht',
      municipality: 'Rotterdam',
      score: 66,
      dimension_scores: { green_access: null },
      evidence: [{ code: 'amenities_evidence', evidence_refs: ['ev_amenities'] }],
      tradeoffs: [{ code: 'missing_green_access', evidence_refs: [] }],
      confidence: { score: 60, label: 'medium', reasons: ['mock'] },
      freshness_status: 'unavailable',
      missing_data: ['green_access'],
      source_refs: [],
    },
  ],
  indicators: [
    {
      indicator_key: 'green_access',
      label_code: 'match.comparison.indicator.green_access',
      cells: {
        nh_one: {
          value: 84,
          display_value: '84 / 100',
          state: 'mock',
          confidence: 72,
          freshness_status: 'mock',
          source_refs: ['src_green'],
          sources: [source],
          limitations: ['Mock limitation'],
        },
        nh_two: {
          value: 78,
          display_value: '78 / 100',
          state: 'mock',
          confidence: 72,
          freshness_status: 'mock',
          source_refs: ['src_green'],
          sources: [source],
          limitations: ['Mock limitation'],
        },
        nh_three: {
          value: null,
          display_value: 'unavailable',
          state: 'missing',
          confidence: 0,
          freshness_status: 'unavailable',
          source_refs: [],
          sources: [],
          limitations: ['Metric unavailable'],
        },
      },
    },
    ...['calmness', 'mobility', 'amenities', 'family_fit'].map((key) => ({
      indicator_key: key,
      label_code: `match.comparison.indicator.${key}`,
      cells: {
        nh_one: { value: 70, display_value: '70 / 100', state: 'mock' as const, confidence: 70, freshness_status: 'mock' as const, source_refs: ['src_green'], sources: [source], limitations: [] },
        nh_two: { value: null, display_value: 'unavailable', state: 'missing' as const, confidence: 0, freshness_status: 'unavailable' as const, source_refs: [], sources: [], limitations: [] },
        nh_three: { value: 65, display_value: '65 / 100', state: 'mock' as const, confidence: 70, freshness_status: 'mock' as const, source_refs: ['src_green'], sources: [source], limitations: [] },
      },
    })),
  ],
};

function renderComparison(props: Partial<React.ComponentProps<typeof MatchComparison>> = {}) {
  render(
    <I18nextProvider i18n={i18n}>
      <MatchComparison comparison={comparison} {...props} />
    </I18nextProvider>,
  );
}

it('renders side-by-side comparison for at least three neighborhoods with missing data', () => {
  renderComparison();

  expect(screen.getByText('3 neighborhoods selected')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'IJburg' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Leidsche Rijn' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Katendrecht' })).toBeInTheDocument();
  expect(screen.getByText('Missing: mobility')).toBeInTheDocument();

  const greenRow = screen.getByRole('row', { name: /Green access/i });
  expect(within(greenRow).getAllByText('MOCK DATA - seed')).toHaveLength(2);
  expect(within(greenRow).getByText('unavailable')).toBeInTheDocument();
});

it('renders loading and empty states', () => {
  renderComparison({ comparison: null, loading: true });
  expect(screen.getByRole('status')).toHaveTextContent('Loading comparison...');

  renderComparison({ comparison: null, loading: false });
  expect(screen.getByText('Choose at least three neighborhoods to compare.')).toBeInTheDocument();
});
