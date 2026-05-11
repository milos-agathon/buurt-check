import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import MatchReport from '../components/match/MatchReport';
import { setupTestI18n } from './helpers';
import type { MatchReportResponse } from '../types/match';

const baseReport: MatchReportResponse = {
  report_id: 'report_i18n',
  status: 'generated',
  generated_by: 'ai',
  validation_status: 'passed',
  locale: 'nl',
  sections: [],
  limitations: [],
  source_refs: [],
  guardrail_events: [],
  generated_at: '2026-05-11T08:00:00Z',
  report_input: {
    locale: 'nl',
    profile_summary: {},
    preference_vector: {
      preference_vector_id: 'pv_i18n',
      journey_intent: 'buy',
      anchor_locations: [],
      commute_limits: [],
      property_types: [],
      hard_filters: [],
      nice_to_haves: [],
      avoid_signals: [],
      lifestyle_weights: {},
      persona_inputs: {},
      locale: 'nl',
      method_version: 'preference-v1',
    },
    recommendations: [],
    comparisons: [],
    similar_neighborhoods: [],
    listing_context: {},
    evidence_items: [],
    approved_limitations: [],
    source_refs: [],
    generated_at: '2026-05-11T08:00:00Z',
  },
};

it('renders Dutch report chrome from i18n while preserving structured report locale', async () => {
  const i18n = await setupTestI18n('nl');

  render(
    <I18nextProvider i18n={i18n}>
      <MatchReport report={baseReport} />
    </I18nextProvider>,
  );

  expect(screen.getByRole('heading', { name: 'Buurrapport' })).toBeInTheDocument();
  expect(screen.getByText('AI gecontroleerd')).toBeInTheDocument();
});
