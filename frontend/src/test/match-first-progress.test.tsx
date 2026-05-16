import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import type { ReactElement } from 'react';
import App from '../App';
import MatchingProgressScreen from '../components/match-first/MatchingProgressScreen';
import { saveMatchSessionSnapshot } from '../services/matchSessionStorage';
import { setupTestI18n } from './helpers';
import type {
  MatchFirstSurveyAnswers,
  MatchJobStatusResponse,
  MatchResultsResponse,
  MatchRunResponse,
} from '../types/matchFirst';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

const completeAnswers: MatchFirstSurveyAnswers = {
  intent: 'both',
  budget: { buy_min: 45000000, buy_max: 65000000, rent_max: 250000 },
  household_type: 'family_young_child',
  anchor_location: { type: 'city', label: 'Utrecht Centraal' },
  commute: { max_minutes: 45 },
  lifestyle_priorities: ['green_access', 'calmness', 'public_transport'],
  must_haves: ['parks_nearby', 'good_transit'],
  dealbreakers: ['busy_nightlife'],
  housing_types: ['row_house', 'family_house'],
  area_character: 'quiet_city',
  language: 'en',
};

function runResponse(overrides: Partial<MatchRunResponse> = {}): MatchRunResponse {
  return {
    session_id: 'match-progress',
    job_id: 'match_job_123',
    status: 'queued',
    stage: 'queued',
    progress: 5,
    message_key: 'matchFirst.progress.queued',
    preference_vector_id: 'pv_123',
    poll_after_ms: 1000,
    ...overrides,
  };
}

function statusResponse(overrides: Partial<MatchJobStatusResponse> = {}): MatchJobStatusResponse {
  return {
    session_id: 'match-progress',
    job_id: 'match_job_123',
    status: 'running',
    stage: 'reading_preferences',
    progress: 20,
    message_key: 'matchFirst.progress.reading_preferences',
    model_mode: 'weighted_scoring',
    model_version: 'match-score-v1',
    scoring_version: 'match-score-v1',
    evaluation_status: 'not_validated_no_labels',
    fallback_used: false,
    fallback_reason_code: null,
    result_set_id: null,
    error_code: null,
    runtime_ms: 400,
    updated_at: '2026-05-16T12:00:00Z',
    ...overrides,
  };
}

function resultsResponse(overrides: Partial<MatchResultsResponse> = {}): MatchResultsResponse {
  return {
    session_id: 'match-progress',
    job_id: 'match_job_123',
    result_set_id: 'mrs_123',
    preference_vector_version: 'pv_v1_current',
    status: 'completed',
    generated_at: '2026-05-16T12:00:01Z',
    runtime_ms: 1900,
    model_mode: 'weighted_scoring',
    model_version: 'match-score-v1',
    scoring_version: 'match-score-v1',
    data_version: 'match-seed-v1',
    evaluation_status: 'not_validated_no_labels',
    predictive_probability_available: false,
    fallback_used: false,
    fallback_reason_code: null,
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
    ...overrides,
  };
}

function completeSessionResponse(sessionId: string) {
  return {
    session_id: sessionId,
    locale: 'en',
    phase: 'review',
    current_step: 11,
    answer_version: 11,
    answers: completeAnswers,
    validation: {},
    is_complete: true,
    preference_vector_id: 'pv_123',
    preference_vector_version: 'pv_v1_current',
    preference_vector: {
      preference_vector_id: 'pv_123',
      session_id: sessionId,
      journey_intent: 'both',
      budget_min_cents: 45000000,
      budget_max_cents: 65000000,
      monthly_rent_max_cents: 250000,
      anchor_locations: [{ type: 'city', label: 'Utrecht Centraal' }],
      commute_limits: [{ max_minutes: 45 }],
      property_types: ['row_house'],
      hard_filters: ['intent:both', 'budget', 'commute'],
      nice_to_haves: ['green_access'],
      avoid_signals: ['busy_nightlife'],
      lifestyle_weights: { green_access: 0.5, calmness: 0.5 },
      persona_inputs: {},
      locale: 'en',
      method_version: 'preference-vector-v2',
      source_answer_version: 11,
      vector_version: 'pv_v1_current',
      raw_answer_refs: completeAnswers,
      warnings: [],
    },
  };
}

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  await i18n.changeLanguage('en');
});

function renderWithI18n(ui: ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

it.each([
  ['created', 'created', 'Getting your match ready'],
  ['queued', 'queued', 'Getting your match ready'],
  ['running', 'reading_preferences', 'Reading your living preferences'],
  ['running', 'building_profile', 'Building your neighborhood profile'],
  ['running', 'loading_neighborhood_data', 'Gathering neighborhood data'],
  ['running', 'applying_filters', 'Applying your must-haves'],
  ['running', 'running_models', 'Comparing neighborhoods across the Netherlands'],
  ['running', 'scoring_tradeoffs', 'Checking budget, commute, and daily-life tradeoffs'],
  ['running', 'preparing_map', 'Preparing your match map'],
] as const)('renders friendly progress copy for %s/%s without raw internals', async (status, stage, expected) => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(statusResponse({
    status,
    stage,
    message_key: `matchFirst.progress.${stage}`,
  })), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  renderWithI18n(
    <MatchingProgressScreen
      sessionId="match-progress"
      initialStatus={statusResponse({ status, stage, message_key: `matchFirst.progress.${stage}` })}
      onBackToSurvey={() => {}}
      onRetry={() => {}}
      onComplete={() => {}}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent(expected);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow');
  expect(screen.queryByText(/reading_preferences|running_models|match_job|traceback|exception/i)).not.toBeInTheDocument();
});

it('waits for the backend poll_after_ms before requesting the next status', async () => {
  vi.useFakeTimers();
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(statusResponse({
    status: 'running',
    stage: 'building_profile',
    progress: 35,
    message_key: 'matchFirst.progress.building_profile',
  })), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  renderWithI18n(
    <MatchingProgressScreen
      sessionId="match-progress"
      initialStatus={runResponse({ poll_after_ms: 250 })}
      onBackToSurvey={() => {}}
      onRetry={() => {}}
      onComplete={() => {}}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('Getting your match ready');
  expect(fetchSpy).not.toHaveBeenCalled();

  await act(async () => {
    vi.advanceTimersByTime(249);
  });
  expect(fetchSpy).not.toHaveBeenCalled();

  await act(async () => {
    vi.advanceTimersByTime(1);
    await Promise.resolve();
  });
  expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match-progress/status', expect.anything());
  vi.useRealTimers();
});

it('shows slow backend state while continuing to poll the same job', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(statusResponse({
    status: 'matching_slow',
    stage: 'scoring_tradeoffs',
    progress: 74,
    message_key: 'matchFirst.progress.matching_slow',
  })), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  renderWithI18n(
    <MatchingProgressScreen
      sessionId="match-progress"
      initialStatus={statusResponse({
        status: 'matching_slow',
        stage: 'scoring_tradeoffs',
        progress: 74,
        message_key: 'matchFirst.progress.matching_slow',
      })}
      onBackToSurvey={() => {}}
      onRetry={() => {}}
      onComplete={() => {}}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('This is taking longer than usual, but your match is still running.');
  expect(screen.getByRole('button', { name: 'Back to survey' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
});

it('shows failed backend state with retry and preserved survey recovery', async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(statusResponse({
    status: 'failed',
    stage: 'failed',
    progress: 100,
    message_key: 'matchFirst.progress.failed',
    error_code: 'match.warning.retryable_stale_job',
  })), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  renderWithI18n(
    <MatchingProgressScreen
      sessionId="match-progress"
      initialStatus={statusResponse({
        status: 'failed',
        stage: 'failed',
        progress: 100,
        message_key: 'matchFirst.progress.failed',
        error_code: 'match.warning.retryable_stale_job',
      })}
      onBackToSurvey={() => {}}
      onRetry={onRetry}
      onComplete={() => {}}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent(
    "We couldn't create your match map yet. Your answers are saved, so you can try again without starting over.",
  );
  expect(screen.queryByText('match.warning.retryable_stale_job')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it.each([
  ['failed', 'failed'],
  ['expired', 'expired'],
  ['cancelled', 'failed'],
] as const)('shows %s terminal failure state without raw internals', async (status, stage) => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  const onBackToSurvey = vi.fn();

  renderWithI18n(
    <MatchingProgressScreen
      sessionId="match-progress"
      initialStatus={statusResponse({
        status,
        stage,
        progress: 100,
        message_key: `matchFirst.progress.${status}`,
        error_code: 'match.warning.retryable_stale_job',
      })}
      onBackToSurvey={onBackToSurvey}
      onRetry={onRetry}
      onComplete={() => {}}
    />,
  );

  expect(screen.getByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    "We couldn't create your match map yet. Your answers are saved, so you can try again without starting over.",
  );
  expect(screen.queryByText(/match_job_123|match\.warning|traceback|exception|weighted_scoring|scoring_tradeoffs|running_models/i)).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Back to survey' }));
  expect(onBackToSurvey).toHaveBeenCalledTimes(1);
});

it.each([
  ['completed'],
  ['completed_with_fallback'],
  ['completed_no_strong_matches'],
] as const)('verifies %s terminal results before completing', async (terminalStatus) => {
  const onComplete = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(resultsResponse({
    status: terminalStatus,
    fallback_used: terminalStatus === 'completed_with_fallback',
    fallback_reason_code: terminalStatus === 'completed_with_fallback'
      ? 'match.warning.advanced_ranking_skipped'
      : null,
    empty_state_code: terminalStatus === 'completed_no_strong_matches'
      ? 'match.empty.no_strong_matches'
      : null,
  })), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  renderWithI18n(
    <MatchingProgressScreen
      sessionId="match-progress"
      initialStatus={statusResponse({
        status: terminalStatus,
        stage: terminalStatus,
        progress: 100,
        message_key: `matchFirst.progress.${terminalStatus}`,
        result_set_id: 'mrs_123',
      })}
      onBackToSurvey={() => {}}
      onRetry={() => {}}
      onComplete={onComplete}
    />,
  );

  await waitFor(() => {
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ status: terminalStatus, result_set_id: 'mrs_123' }),
      expect.objectContaining({ status: terminalStatus, result_set_id: 'mrs_123' }),
    );
  });
});

it('does not complete when terminal results are stale or mismatched', async () => {
  const onComplete = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(resultsResponse({
    session_id: 'other-session',
    job_id: 'other-job',
    status: 'completed',
  })), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  renderWithI18n(
    <MatchingProgressScreen
      sessionId="match-progress"
      initialStatus={statusResponse({
        status: 'completed',
        stage: 'completed',
        progress: 100,
        message_key: 'matchFirst.progress.completed',
        result_set_id: 'mrs_123',
      })}
      onBackToSurvey={() => {}}
      onRetry={() => {}}
      onComplete={onComplete}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Your answers are saved. Results will appear here when matching is available.');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(onComplete).not.toHaveBeenCalled();
});

it('keeps the checkmark locked when results fetch fails and can retry result verification', async () => {
  const user = userEvent.setup();
  const onComplete = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'match.warning.results_unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify(resultsResponse()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

  renderWithI18n(
    <MatchingProgressScreen
      sessionId="match-progress"
      initialStatus={statusResponse({
        status: 'completed',
        stage: 'completed',
        progress: 100,
        message_key: 'matchFirst.progress.completed',
        result_set_id: 'mrs_123',
      })}
      onBackToSurvey={() => {}}
      onRetry={() => {}}
      onComplete={onComplete}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
  expect(screen.queryByTestId('match-success-checkmark')).not.toBeInTheDocument();
  expect(onComplete).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'Try again' }));

  await waitFor(() => {
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }), expect.objectContaining({
      result_set_id: 'mrs_123',
    }));
  });
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

it('polls status, verifies completed results, and notifies completion', async () => {
  const onComplete = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify(statusResponse({
      status: 'running',
      stage: 'building_profile',
      progress: 35,
      message_key: 'matchFirst.progress.building_profile',
      poll_after_ms: 1,
    })), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify(statusResponse({
      status: 'completed',
      stage: 'completed',
      progress: 100,
      message_key: 'matchFirst.progress.completed',
      result_set_id: 'mrs_123',
    })), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify(resultsResponse()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

  renderWithI18n(
      <MatchingProgressScreen
        sessionId="match-progress"
      initialStatus={runResponse({ poll_after_ms: 1 })}
      onBackToSurvey={() => {}}
      onRetry={() => {}}
      onComplete={onComplete}
    />,
  );

  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent('Building your neighborhood profile');
  });

  await waitFor(() => {
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }), expect.objectContaining({
      result_set_id: 'mrs_123',
    }));
  });
  expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match-progress/status', expect.anything());
  expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match-progress/results', expect.anything());
});

it('starts backend matching from the review CTA, polls, shows checkmark, and routes by CTA to results placeholder', async () => {
  const sessionId = 'match-review-progress';
  saveMatchSessionSnapshot(sessionId, {
    sessionId,
    locale: 'en',
    step: 11,
    answerVersion: 11,
    staleResults: true,
    answers: completeAnswers,
  });

  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith(`/api/match/sessions/${sessionId}`) && method === 'GET') {
      return new Response(JSON.stringify(completeSessionResponse(sessionId)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith(`/api/match/sessions/${sessionId}/run`) && method === 'POST') {
      return new Response(JSON.stringify(runResponse({ session_id: sessionId, poll_after_ms: 1 })), { status: 202, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith(`/api/match/sessions/${sessionId}/status`) && method === 'GET') {
      return new Response(JSON.stringify(statusResponse({
        session_id: sessionId,
        status: 'completed_with_fallback',
        stage: 'completed_with_fallback',
        progress: 100,
        message_key: 'matchFirst.progress.completed_with_fallback',
        fallback_used: true,
        fallback_reason_code: 'match.warning.advanced_ranking_skipped',
        result_set_id: 'mrs_123',
      })), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith(`/api/match/sessions/${sessionId}/results`) && method === 'GET') {
      return new Response(JSON.stringify(resultsResponse({
        session_id: sessionId,
        status: 'completed_with_fallback',
        fallback_used: true,
        fallback_reason_code: 'match.warning.advanced_ranking_skipped',
      })), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ detail: 'unexpected' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  });

  window.location.hash = `#/match/session/${sessionId}/review`;
  renderWithI18n(<App />);

  await userEvent.click(await screen.findByRole('button', { name: 'Show my matches' }));

  await waitFor(() => {
    expect(fetchSpy).toHaveBeenCalledWith(`/api/match/sessions/${sessionId}/run`, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        preference_vector_version: 'pv_v1_current',
        source: 'review_final_cta',
      }),
    }));
  });
  expect(window.location.hash).toBe(`#/match/session/${sessionId}/run`);

  expect(await screen.findByRole('heading', { name: 'Your neighborhood matches are ready.' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'We found your matches using the stable scoring model. Some advanced ranking features were skipped this time.',
  );

  await userEvent.click(screen.getByRole('button', { name: 'Open my map' }));

  expect(window.location.hash).toBe(`#/match/session/${sessionId}/results`);
  expect(await screen.findByRole('heading', { name: 'Your match map' })).toBeInTheDocument();
});
