import {
  createMatchSession,
  getMatchSession,
  patchMatchSessionAnswers,
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
