import { MATCH_FIRST_EVENTS, recordMatchFirstEvent } from './matchFirstAnalytics';
import { readFileSync } from 'node:fs';

const storageKey = 'buurt-check-match-first-analytics';
const CONDITIONAL_SPEC_EVENTS = new Set(['match_quality_feedback_submitted']);
const OPTIONAL_MATCH_FIRST_EVENTS = new Set([
  'match_back_to_map_return_failed',
  'match_first_search_link_clicked',
  'match_first_survey_back_clicked',
  'match_first_survey_review_shown',
  'match_job_retry_clicked',
]);

function readStoredEvents(): unknown[] {
  return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown[];
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('records stable match-first landing event names without translated labels', () => {
  recordMatchFirstEvent('match_landing_cta_clicked', {
    locale: 'nl',
    source: 'landing',
    route: '#/match/survey',
  });

  expect(readStoredEvents()).toMatchObject([
    {
      event_name: 'match_landing_cta_clicked',
      locale: 'nl',
      context: {
        locale: 'nl',
        source: 'landing',
        route: '#/match/survey',
      },
    },
  ]);
});

it('records privacy-safe survey lifecycle events', () => {
  recordMatchFirstEvent('match_survey_question_shown', {
    locale: 'en',
    source: 'survey',
    session_id: 'match-123',
    question_id: 'anchor_location',
    step: 4,
    total_steps: 11,
  });
  recordMatchFirstEvent('match_survey_answer_saved', {
    locale: 'en',
    source: 'survey',
    session_id: 'match-123',
    question_id: 'anchor_location',
    answer_type: 'anchor',
    answer_count: 1,
  });
  recordMatchFirstEvent('match_first_survey_review_shown', {
    locale: 'nl',
    source: 'review',
    session_id: 'match-123',
    total_steps: 11,
  });

  expect(readStoredEvents()).toMatchObject([
    {
      event_name: 'match_survey_question_shown',
      locale: 'en',
      context: {
        locale: 'en',
        source: 'survey',
        session_id: 'match-123',
        question_id: 'anchor_location',
        step: 4,
        total_steps: 11,
      },
    },
    {
      event_name: 'match_survey_answer_saved',
      context: {
        question_id: 'anchor_location',
        answer_type: 'anchor',
        answer_count: 1,
      },
    },
    {
      event_name: 'match_first_survey_review_shown',
      locale: 'nl',
    },
  ]);
});

it('records privacy-safe match progress and success events', () => {
  recordMatchFirstEvent('match_final_run_cta_clicked', {
    locale: 'en',
    source: 'review',
    session_id: 'match-123',
    job_id: 'match_job_123',
    status: 'queued',
    runtime_ms: 1024,
  });
  recordMatchFirstEvent('match_job_completed_with_fallback', {
    locale: 'en',
    source: 'progress',
    session_id: 'match-123',
    job_id: 'match_job_123',
    status: 'completed_with_fallback',
    fallback_reason_code: 'match.warning.advanced_ranking_skipped',
    translated_label: 'Stable scoring model',
  });
  recordMatchFirstEvent('match_success_checkmark_shown', {
    locale: 'en',
    source: 'success',
    session_id: 'match-123',
    result_set_id: 'mrs_123',
    status: 'completed_with_fallback',
  });

  expect(readStoredEvents()).toMatchObject([
    {
      event_name: 'match_final_run_cta_clicked',
      context: {
        locale: 'en',
        source: 'review',
        session_id: 'match-123',
        job_id: 'match_job_123',
        status: 'queued',
        runtime_ms: 1024,
      },
    },
    {
      event_name: 'match_job_completed_with_fallback',
      context: {
        fallback_reason_code: 'match.warning.advanced_ranking_skipped',
        status: 'completed_with_fallback',
      },
    },
    {
      event_name: 'match_success_checkmark_shown',
      context: {
        result_set_id: 'mrs_123',
        status: 'completed_with_fallback',
      },
    },
  ]);
  expect(JSON.stringify(readStoredEvents())).not.toContain('Stable scoring model');
});

it('allows the full Phase 4 progress, terminal, retry, and unavailable event set', () => {
  expect(MATCH_FIRST_EVENTS).toEqual(expect.arrayContaining([
    'match_final_run_cta_clicked',
    'match_job_queued',
    'match_job_running',
    'match_job_slow',
    'match_job_completed',
    'match_job_failed',
    'match_job_completed_with_fallback',
    'match_job_completed_no_strong_matches',
    'match_job_retry_clicked',
    'match_results_unavailable',
    'match_success_checkmark_shown',
    'match_results_map_opened',
  ]));
});

it('allows every Phase 8 required funnel event with privacy-safe context keys', () => {
  expect(MATCH_FIRST_EVENTS).toEqual(expect.arrayContaining([
    'match_landing_cta_clicked',
    'match_first_search_link_clicked',
    'match_survey_intro_shown',
    'match_survey_started',
    'match_survey_question_shown',
    'match_survey_answer_saved',
    'match_survey_answer_save_failed',
    'match_first_survey_back_clicked',
    'match_survey_completed',
    'match_survey_question_abandoned',
    'match_final_run_cta_clicked',
    'match_job_completed_with_fallback',
    'match_job_failed',
    'match_results_map_opened',
    'match_map_feature_selected',
    'match_amenity_interacted',
    'match_house_selected',
    'match_dossier_opened',
    'match_back_to_map_clicked',
  ]));

  recordMatchFirstEvent('match_survey_question_abandoned', {
    locale: 'en',
    source: 'survey',
    session_id: 'match-123',
    question_id: 'budget',
    step: 2,
    total_steps: 11,
    reason: 'route_change',
  });
  recordMatchFirstEvent('match_amenity_interacted', {
    locale: 'en',
    source: 'neighborhood',
    session_id: 'match-123',
    result_set_id: 'mrs-123',
    neighborhood_id: 'nh-123',
    amenity_key: 'parks',
    translated_label: 'Parks',
  });

  expect(readStoredEvents()).toMatchObject([
    {
      event_name: 'match_survey_question_abandoned',
      context: {
        question_id: 'budget',
        step: 2,
        reason: 'route_change',
      },
    },
    {
      event_name: 'match_amenity_interacted',
      context: {
        amenity_key: 'parks',
        neighborhood_id: 'nh-123',
      },
    },
  ]);
  expect(JSON.stringify(readStoredEvents())).not.toContain('Parks');
});

it('keeps the frontend analytics catalog aligned with the active spec contract', () => {
  const spec = readFileSync('../specs/002-match-first-revamp/spec.md', 'utf8');
  const contract = spec
    .split('#### Analytics Event Contract')[1]
    .split('#### Core State Transitions')[0];
  const requiredEvents = Array.from(contract.matchAll(/`(match_[^`]+)`/g))
    .map((match) => match[1])
    .filter((eventName) => !CONDITIONAL_SPEC_EVENTS.has(eventName));

  expect(MATCH_FIRST_EVENTS).toEqual(expect.arrayContaining(requiredEvents));
  const extraEvents = MATCH_FIRST_EVENTS.filter((eventName) => !requiredEvents.includes(eventName));
  expect(extraEvents).toEqual(expect.arrayContaining(Array.from(OPTIONAL_MATCH_FIRST_EVENTS)));
  expect(extraEvents.every((eventName) => OPTIONAL_MATCH_FIRST_EVENTS.has(eventName))).toBe(true);
});

it('allows Phase 6 selected-neighborhood analytics without address text', () => {
  recordMatchFirstEvent('match_house_selected', {
    locale: 'nl',
    source: 'match_map',
    session_id: 'match-123',
    result_set_id: 'mrs-123',
    neighborhood_id: 'BU0363AA01',
    selected_house_id: 'bldg_001',
    address_label: 'Do not store this address',
  });
  recordMatchFirstEvent('match_missing_3d_fallback_shown', {
    locale: 'nl',
    source: 'neighborhood',
    session_id: 'match-123',
    result_set_id: 'mrs-123',
    neighborhood_id: 'BU0363AA01',
    fallback_reason_code: 'matchFirst.neighborhood.missing3d',
  });

  expect(MATCH_FIRST_EVENTS).toEqual(expect.arrayContaining([
    'match_neighborhood_detail_opened',
    'match_building_layer_failed',
    'match_amenity_layer_failed',
    'match_missing_3d_fallback_shown',
    'match_house_selected',
  ]));
  expect(readStoredEvents()).toMatchObject([
    {
      event_name: 'match_house_selected',
      context: {
        locale: 'nl',
        source: 'match_map',
        session_id: 'match-123',
        result_set_id: 'mrs-123',
        neighborhood_id: 'BU0363AA01',
      },
    },
    {
      event_name: 'match_missing_3d_fallback_shown',
      context: {
        fallback_reason_code: 'matchFirst.neighborhood.missing3d',
      },
    },
  ]);
  expect(JSON.stringify(readStoredEvents())).not.toContain('Do not store this address');
});

it('allows Phase 7 Dossier bridge and return analytics without address text', () => {
  recordMatchFirstEvent('match_dossier_opened', {
    locale: 'nl',
    source: 'match_map',
    session_id: 'match-123',
    result_set_id: 'mrs-123',
    neighborhood_id: 'BU0363AA01',
    selected_house_id: 'bldg_001',
    building_id: 'bldg_001',
    address_id: '0363010000123456',
    address_label: 'Do not store this address',
    route: '#/address/0363010000123456',
  });
  recordMatchFirstEvent('match_no_reliable_address_shown', {
    locale: 'nl',
    source: 'match_map',
    session_id: 'match-123',
    result_set_id: 'mrs-123',
    neighborhood_id: 'BU0363AA01',
    building_id: 'bldg_002',
    fallback_reason_code: 'match.neighborhood.no_reliable_address',
  });
  recordMatchFirstEvent('match_back_to_map_clicked', {
    locale: 'nl',
    source: 'dossier',
    session_id: 'match-123',
    result_set_id: 'mrs-123',
    neighborhood_id: 'BU0363AA01',
    selected_house_id: 'bldg_001',
  });
  recordMatchFirstEvent('match_back_to_map_return_success', {
    locale: 'nl',
    source: 'dossier',
    session_id: 'match-123',
    result_set_id: 'mrs-123',
    neighborhood_id: 'BU0363AA01',
  });

  expect(MATCH_FIRST_EVENTS).toEqual(expect.arrayContaining([
    'match_dossier_opened',
    'match_no_reliable_address_shown',
    'match_back_to_map_clicked',
    'match_back_to_map_return_success',
    'match_back_to_map_return_failed',
  ]));
  expect(readStoredEvents()).toMatchObject([
    { event_name: 'match_dossier_opened', context: { neighborhood_id: 'BU0363AA01' } },
    {
      event_name: 'match_no_reliable_address_shown',
      context: { fallback_reason_code: 'match.neighborhood.no_reliable_address' },
    },
    { event_name: 'match_back_to_map_clicked', context: { source: 'dossier' } },
    { event_name: 'match_back_to_map_return_success', context: { neighborhood_id: 'BU0363AA01' } },
  ]);
  expect(JSON.stringify(readStoredEvents())).not.toContain('Do not store this address');
  expect(JSON.stringify(readStoredEvents())).not.toContain('0363010000123456');
  expect(JSON.stringify(readStoredEvents())).not.toContain('bldg_001');
  expect(JSON.stringify(readStoredEvents())).not.toContain('bldg_002');
});

it('drops candidate address IDs lookup IDs and labels from Phase 7 analytics', () => {
  recordMatchFirstEvent('match_no_reliable_address_shown', {
    locale: 'en',
    source: 'match_map',
    session_id: 'match-123',
    result_set_id: 'mrs-123',
    neighborhood_id: 'BU0363AA01',
    building_id: 'bldg_001',
    selected_house_id: 'bldg_001',
    selected_candidate_id: 'cand_bldg_001_002',
    vbo_id: '0363010000123462',
    lookup_id: 'adr-candidate-002',
    address_label: 'Nearby address 2',
    fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
  });

  expect(readStoredEvents()).toMatchObject([
    {
      event_name: 'match_no_reliable_address_shown',
      context: {
        locale: 'en',
        source: 'match_map',
        session_id: 'match-123',
        result_set_id: 'mrs-123',
        neighborhood_id: 'BU0363AA01',
        fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
      },
    },
  ]);
  const rawEvents = JSON.stringify(readStoredEvents());
  expect(rawEvents).not.toContain('cand_bldg_001_002');
  expect(rawEvents).not.toContain('0363010000123462');
  expect(rawEvents).not.toContain('adr-candidate-002');
  expect(rawEvents).not.toContain('bldg_001');
  expect(rawEvents).not.toContain('Nearby address 2');
});

it('posts sanitized match-first analytics to the backend without blocking local storage', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ accepted: true, duplicate: false }),
    { status: 202, headers: { 'Content-Type': 'application/json' } },
  ));
  vi.stubGlobal('fetch', fetchMock);

  const event = recordMatchFirstEvent('match_dossier_opened', {
    locale: 'en',
    source: 'match_map',
    session_id: 'match-123',
    result_set_id: 'mrs-123',
    neighborhood_id: 'BU0363AA01',
    selected_house_id: 'bldg_001',
    building_id: 'bldg_001',
    address_id: '0363010000123456',
    lookup_id: 'adr-private',
  });

  expect(event.event_id).toMatch(/^evt_/);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/match/analytics');
  expect(init.method).toBe('POST');
  expect(init.credentials).toBe('include');

  const body = JSON.parse(String(init.body)) as {
    event_id: string;
    event_name: string;
    session_id?: string;
    locale: string;
    context: Record<string, unknown>;
  };
  expect(body).toMatchObject({
    event_id: event.event_id,
    event_name: 'match_dossier_opened',
    session_id: 'match-123',
    locale: 'en',
    context: {
      source: 'match_map',
      session_id: 'match-123',
      result_set_id: 'mrs-123',
      neighborhood_id: 'BU0363AA01',
    },
  });
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain('bldg_001');
  expect(serialized).not.toContain('0363010000123456');
  expect(serialized).not.toContain('adr-private');
});

it('keeps analytics fire-and-forget when backend recording fails', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error('network unavailable'));
  vi.stubGlobal('fetch', fetchMock);

  const event = recordMatchFirstEvent('match_landing_cta_clicked', {
    locale: 'en',
    source: 'landing',
  });

  expect(event.event_name).toBe('match_landing_cta_clicked');
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(readStoredEvents()).toHaveLength(1);
});

it('records privacy-safe unavailable-results analytics without user text', () => {
  recordMatchFirstEvent('match_results_unavailable', {
    locale: 'en',
    source: 'progress',
    session_id: 'match-123',
    job_id: 'match_job_123',
    result_set_id: 'mrs_123',
    status: 'completed',
    reason: 'result_fetch_failed',
    translated_label: 'Results unavailable',
    free_text: 'Please show my matches',
    anchor_label: 'Utrecht Centraal',
  });

  expect(readStoredEvents()).toMatchObject([
    {
      event_name: 'match_results_unavailable',
      context: {
        locale: 'en',
        source: 'progress',
        session_id: 'match-123',
        job_id: 'match_job_123',
        result_set_id: 'mrs_123',
        status: 'completed',
        reason: 'result_fetch_failed',
      },
    },
  ]);
  expect(JSON.stringify(readStoredEvents())).not.toContain('Results unavailable');
  expect(JSON.stringify(readStoredEvents())).not.toContain('Please show my matches');
  expect(JSON.stringify(readStoredEvents())).not.toContain('Utrecht Centraal');
});

it('drops translated labels exact anchors and free text from survey analytics context', () => {
  recordMatchFirstEvent('match_survey_answer_saved', {
    locale: 'nl',
    source: 'survey',
    session_id: 'match-123',
    question_id: 'intent',
    answer_type: 'single',
    answer_label: 'Rustige buurt',
    anchor_label: 'Utrecht Centraal',
    free_text: 'I want a place close to my office',
    answer_value: 'buy',
  });

  expect(readStoredEvents()).toMatchObject([
    {
      event_name: 'match_survey_answer_saved',
      locale: 'nl',
      context: {
        locale: 'nl',
        source: 'survey',
        session_id: 'match-123',
        question_id: 'intent',
        answer_type: 'single',
      },
    },
  ]);
  expect(JSON.stringify(readStoredEvents())).not.toContain('Rustige buurt');
  expect(JSON.stringify(readStoredEvents())).not.toContain('Utrecht Centraal');
  expect(JSON.stringify(readStoredEvents())).not.toContain('buy');
});

it('returns the analytics event when localStorage writes fail', () => {
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  try {
    const event = recordMatchFirstEvent('match_first_search_link_clicked', {
      locale: 'en',
      source: 'landing',
    });

    expect(event).toMatchObject({
      event_name: 'match_first_search_link_clicked',
      locale: 'en',
      context: {
        locale: 'en',
        source: 'landing',
      },
    });
    expect(readStoredEvents()).toEqual([]);
  } finally {
    setItemSpy.mockRestore();
  }
});
