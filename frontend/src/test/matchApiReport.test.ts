import { createMatchReport, fetchMatchReport } from '../services/matchApi';
import type { MatchReportCreatePayload, MatchReportResponse } from '../types/match';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const report: MatchReportResponse = {
  report_id: 'report_api',
  status: 'fallback',
  generated_by: 'deterministic_fallback',
  validation_status: 'fallback_used',
  locale: 'en',
  sections: [],
  limitations: [],
  source_refs: [],
  guardrail_events: [],
  generation_metadata: {
    requested_mode: 'fallback_only',
    resolved_mode: 'deterministic_fallback',
    ai_provider: 'none',
    ai_available: false,
    scoring_mutable_by_ai: false,
    data_contract: 'structured_report_input',
  },
  generated_at: '2026-05-11T08:00:00Z',
  report_input: {
    locale: 'en',
    profile_summary: {},
    preference_vector: {
      preference_vector_id: 'pv_api',
      journey_intent: 'buy',
      anchor_locations: [],
      commute_limits: [],
      property_types: [],
      hard_filters: [],
      nice_to_haves: [],
      avoid_signals: [],
      lifestyle_weights: {},
      persona_inputs: {},
      locale: 'en',
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

const payload: MatchReportCreatePayload = {
  locale: 'en',
  generation_mode: 'fallback_only',
  report_input: report.report_input,
};

beforeEach(() => {
  fetchMock.mockReset();
});

it('creates and fetches match reports through typed API helpers', async () => {
  fetchMock
    .mockResolvedValueOnce({ ok: true, json: async () => report })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...report, locale: 'nl' }) });

  await expect(createMatchReport(payload)).resolves.toEqual(report);
  await expect(fetchMatchReport('report_api', 'nl')).resolves.toMatchObject({ locale: 'nl' });

  expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/match/reports'), expect.objectContaining({
    method: 'POST',
  }));
  expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('/match/reports/report_api?locale=nl'), expect.any(Object));
});
