import { render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import MatchReport from './MatchReport';
import { setupTestI18n } from '../../test/helpers';
import type { MatchReportResponse } from '../../types/match';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  [i18nEn, i18nNl] = await Promise.all([setupTestI18n('en'), setupTestI18n('nl')]);
});

const report: MatchReportResponse = {
  report_id: 'match_report_test',
  status: 'fallback',
  generated_by: 'deterministic_fallback',
  validation_status: 'fallback_used',
  locale: 'en',
  source_refs: ['src_green'],
  limitations: ['This report uses labelled seed data.'],
  generated_at: '2026-05-11T08:00:00Z',
  generation_metadata: {
    requested_mode: 'ai_with_fallback',
    resolved_mode: 'deterministic_fallback',
    ai_provider: 'none',
    ai_available: false,
    scoring_mutable_by_ai: false,
    data_contract: 'structured_report_input',
  },
  guardrail_events: [],
  report_input: {
    locale: 'en',
    profile_summary: { household_type: 'family' },
    preference_vector: {
      preference_vector_id: 'pv_test',
      journey_intent: 'both',
      anchor_locations: [],
      commute_limits: [],
      property_types: ['apartment'],
      hard_filters: ['green_access'],
      nice_to_haves: [],
      avoid_signals: [],
      lifestyle_weights: { green_access: 1 },
      persona_inputs: {},
      locale: 'en',
      method_version: 'preference-v1',
    },
    recommendations: [],
    comparisons: [],
    similar_neighborhoods: [],
    listing_context: { provider_mode: 'mock' },
    evidence_items: [],
    approved_limitations: ['This report uses labelled seed data.'],
    source_refs: ['src_green'],
    generated_at: '2026-05-11T08:00:00Z',
  },
  sections: [
    {
      section_type: 'profile_summary',
      title: 'Profile summary',
      body: 'Your preferences are translated into a structured neighborhood profile.',
      claims: [
        {
          text: 'Your preferences are translated into a structured neighborhood profile.',
          evidence_refs: ['ev_green_access'],
          source_refs: ['src_green'],
          freshness_status: 'mock',
          confidence: { score: 82, label: 'high', reasons: ['Generated from structured evidence.'] },
          score_driver_refs: ['green_access'],
        },
      ],
    },
    {
      section_type: 'live_homes_available_now',
      title: 'Live homes available now',
      body: 'Live supply is not connected yet; this state shows mock or placeholder listing context.',
      claims: [
        {
          text: 'Live supply is not connected yet; this state shows mock or placeholder listing context.',
          evidence_refs: ['ev_green_access'],
          source_refs: ['src_green'],
          freshness_status: 'mock',
          confidence: { score: 72, label: 'medium', reasons: ['Placeholder state.'] },
          score_driver_refs: [],
        },
      ],
    },
  ],
};

function renderReport(i18n = i18nEn, props: Partial<React.ComponentProps<typeof MatchReport>> = {}) {
  render(
    <I18nextProvider i18n={i18n}>
      <MatchReport report={report} {...props} />
    </I18nextProvider>,
  );
}

it('renders validated report sections with claim metadata', () => {
  renderReport();

  expect(screen.getByRole('heading', { name: 'Neighborhood report' })).toBeInTheDocument();
  expect(screen.getByText('Profile summary')).toBeInTheDocument();
  expect(screen.getByText('AI explanation layer: Deterministic fallback')).toBeInTheDocument();
  expect(screen.queryByText('AI explanation layer: deterministic fallback')).not.toBeInTheDocument();
  expect(screen.getByText('Scores cannot be changed by AI')).toBeInTheDocument();
  const claim = screen.getAllByText('Your preferences are translated into a structured neighborhood profile.')[1].closest('article');
  expect(claim).not.toBeNull();
  expect(within(claim as HTMLElement).getByText('Confidence')).toBeInTheDocument();
  expect(within(claim as HTMLElement).getByText('82/100')).toBeInTheDocument();
  expect(within(claim as HTMLElement).getByText('Freshness')).toBeInTheDocument();
  expect(within(claim as HTMLElement).getByText('Mock data')).toBeInTheDocument();
  expect(within(claim as HTMLElement).queryByText('mock')).not.toBeInTheDocument();
  expect(within(claim as HTMLElement).getByText('Sources')).toBeInTheDocument();
  expect(within(claim as HTMLElement).getByText('src_green')).toHaveClass('match-source-badge');
});

it('renders missing claim sources as localized report copy', () => {
  const reportWithoutClaimSources: MatchReportResponse = {
    ...report,
    sections: [
      {
        ...report.sections[0],
        claims: [
          {
            ...report.sections[0].claims[0],
            source_refs: [],
          },
        ],
      },
    ],
  };

  renderReport(i18nEn, { report: reportWithoutClaimSources });

  const claim = screen.getAllByText('Your preferences are translated into a structured neighborhood profile.')[1].closest('article');

  expect(claim).not.toBeNull();
  expect(within(claim as HTMLElement).getByText('No sources listed')).toBeInTheDocument();
  expect(within(claim as HTMLElement).queryByText('-')).not.toBeInTheDocument();
});

it('renders fallback and empty states in the active locale', () => {
  renderReport(i18nNl, { report: { ...report, sections: [], locale: 'nl' } });

  expect(screen.getByRole('heading', { name: 'Buurrapport' })).toBeInTheDocument();
  expect(screen.getByText('Er is nog geen rapportinhoud beschikbaar.')).toBeInTheDocument();
  expect(screen.getByText('Deterministische fallback gebruikt')).toBeInTheDocument();
  expect(screen.getByText('AI-uitleglaag: Deterministische fallback')).toBeInTheDocument();
  expect(screen.queryByText('AI-uitleglaag: deterministic fallback')).not.toBeInTheDocument();
});
