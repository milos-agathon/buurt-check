import {
  createMatchSession,
  getMatchResults,
  getMatchSession,
  getMatchStatus,
  patchMatchSessionAnswers,
  runMatchSession,
} from './matchFirstApi';

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

it('creates a backend match session with stable locale and source keys', async () => {
  const fetchSpy = mockFetch({
    session_id: 'match_api',
    locale: 'nl',
    phase: 'survey_intro',
    current_step: null,
    answer_version: 0,
    expires_at: '2026-05-15T12:00:00Z',
  }, 201);

  await expect(createMatchSession({ locale: 'nl', source: 'landing' })).resolves.toMatchObject({
    session_id: 'match_api',
    locale: 'nl',
  });

  expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ locale: 'nl', source: 'landing' }),
  }));
});

it('patches raw answer IDs without translated labels', async () => {
  const fetchSpy = mockFetch({
    session_id: 'match_api',
    answer_version: 2,
    is_complete: false,
    validation: {
      intent: { valid: true, required: true, error_code: null },
    },
    stale_results: true,
  });

  await patchMatchSessionAnswers('match_api', {
    locale: 'en',
    current_step: 1,
    answers: { intent: 'buy' },
  });

  expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match_api/answers', expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({
      locale: 'en',
      current_step: 1,
      answers: { intent: 'buy' },
    }),
  }));
});

it('surfaces stable backend warning codes on failed answer patch responses', async () => {
  mockFetch({ detail: 'match.warning.invalid_answer_value' }, 422);

  await expect(patchMatchSessionAnswers('match_api', {
    locale: 'en',
    current_step: 1,
    answers: { intent: 'buy' },
  })).rejects.toThrow('match.warning.invalid_answer_value');
});

it('starts a match run only with the review CTA source and current vector version', async () => {
  const fetchSpy = mockFetch({
    session_id: 'match_api',
    job_id: 'match_job_123',
    status: 'queued',
    stage: 'queued',
    progress: 5,
    message_key: 'matchFirst.progress.queued',
    preference_vector_id: 'pv_123',
    poll_after_ms: 1250,
  }, 202);

  await expect(runMatchSession('match_api', {
    preference_vector_version: 'pv_v1_current',
    source: 'review_final_cta',
  })).resolves.toMatchObject({
    job_id: 'match_job_123',
    status: 'queued',
    poll_after_ms: 1250,
  });

  expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match_api/run', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      preference_vector_version: 'pv_v1_current',
      source: 'review_final_cta',
    }),
  }));
});

it('reads pollable match status without exposing raw backend internals', async () => {
  const fetchSpy = mockFetch({
    session_id: 'match_api',
    job_id: 'match_job_123',
    status: 'running',
    stage: 'scoring_tradeoffs',
    progress: 74,
    message_key: 'matchFirst.progress.scoring_tradeoffs',
    model_mode: 'weighted_scoring',
    model_version: 'match-score-v1',
    scoring_version: 'match-score-v1',
    evaluation_status: 'not_validated_no_labels',
    fallback_used: false,
    fallback_reason_code: null,
    result_set_id: null,
    error_code: null,
    runtime_ms: 1800,
    updated_at: '2026-05-16T12:00:00Z',
  });

  await expect(getMatchStatus('match_api')).resolves.toMatchObject({
    status: 'running',
    stage: 'scoring_tradeoffs',
    progress: 74,
    error_code: null,
  });

  expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match_api/status', expect.objectContaining({
    credentials: 'include',
  }));
});

it('reads completed match results after a terminal backend state', async () => {
  const fetchSpy = mockFetch({
    session_id: 'match_api',
    job_id: 'match_job_123',
    result_set_id: 'mrs_123',
    preference_vector_version: 'pv_v1_current',
    status: 'completed_with_fallback',
    generated_at: '2026-05-16T12:00:01Z',
    runtime_ms: 1900,
    model_mode: 'weighted_scoring',
    model_version: 'match-score-v1',
    scoring_version: 'match-score-v1',
    data_version: 'match-seed-v1',
    evaluation_status: 'not_validated_no_labels',
    predictive_probability_available: false,
    fallback_used: true,
    fallback_reason_code: 'match.warning.advanced_ranking_skipped',
    normal_recommendation_count: 1,
    candidate_count: 3,
    scored_candidate_count: 3,
    ranked_results: [],
    recommendations: [],
    stretch_matches: [],
    near_misses: [],
    empty_state_code: null,
    map_center: { lat: 52.2, lng: 5.3 },
    bbox: [3.2, 50.7, 7.3, 53.6],
    map: { type: 'FeatureCollection', display_bounds_wgs84: [3.2, 50.7, 7.3, 53.6], features: [] },
  });

  await expect(getMatchResults('match_api')).resolves.toMatchObject({
    status: 'completed_with_fallback',
    result_set_id: 'mrs_123',
    fallback_used: true,
  });

  expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match_api/results', expect.objectContaining({
    credentials: 'include',
  }));
});

it('reads persisted answers and a vector preview for review', async () => {
  mockFetch({
    session_id: 'match_api',
    locale: 'en',
    phase: 'review',
    current_step: 11,
    answer_version: 11,
    answers: { intent: 'buy' },
    validation: {},
    is_complete: true,
    preference_vector: {
      preference_vector_id: 'pv_123',
      session_id: 'match_api',
      journey_intent: 'buy',
      hard_filters: ['intent:buy', 'budget', 'commute'],
      avoid_signals: ['high_noise'],
      lifestyle_weights: { green_access: 0.5, calmness: 0.5 },
      locale: 'en',
      method_version: 'preference-vector-v2',
      raw_answer_refs: { intent: 'buy' },
      source_answer_version: 11,
      vector_version: 'abc123',
    },
  });

  await expect(getMatchSession('match_api')).resolves.toMatchObject({
    session_id: 'match_api',
    preference_vector: {
      journey_intent: 'buy',
      raw_answer_refs: { intent: 'buy' },
    },
  });
});
