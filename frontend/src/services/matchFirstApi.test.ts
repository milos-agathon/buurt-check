import {
  createMatchSession,
  getMatchNeighborhood,
  getMatchNeighborhoodAmenities,
  getMatchNeighborhoodBuildings,
  getMatchNeighborhoodMapLayers,
  getMatchResults,
  getMatchSession,
  getMatchStatus,
  patchMatchSessionAnswers,
  resolveDossierFromBuilding,
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

it('reads selected-neighborhood summary and scoped detail layers', async () => {
  const fetchSpy = mockFetch({
    neighborhood_id: 'nh_api',
    name: 'API neighborhood',
    municipality: 'Utrecht',
    centroid_rd: { x: 132900, y: 456200 },
    bounds_rd: [132100, 455400, 133700, 457000],
    display_centroid_wgs84: { lat: 52.1, lng: 5.03 },
    display_bounds_wgs84: [5.01, 52.09, 5.05, 52.11],
    boundary_ref: 'boundary_nh_api',
    source_refs: ['seed_match_source'],
    freshness_status: 'mock',
    limitations: ['match.results.limitations.mock_data'],
  });

  await expect(getMatchNeighborhood('nh_api')).resolves.toMatchObject({
    neighborhood_id: 'nh_api',
    boundary_ref: 'boundary_nh_api',
  });

  expect(fetchSpy).toHaveBeenCalledWith('/api/match/neighborhoods/nh_api', expect.objectContaining({
    credentials: 'include',
  }));
});

it('requests selected-neighborhood map layers with completed result context', async () => {
  const fetchSpy = mockFetch({
    neighborhood_id: 'nh_api',
    session_id: 'match_api',
    result_set_id: 'mrs_api',
    allowed_bounds_rd: [132100, 455400, 133700, 457000],
    display_bounds_wgs84: [5.01, 52.09, 5.05, 52.11],
    boundary: {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { neighborhood_id: 'nh_api' },
    },
    building_layer: {
      available: false,
      endpoint: '/api/match/neighborhoods/nh_api/buildings',
      fallback_reason_code: 'matchFirst.neighborhood.missing3d',
    },
    amenity_layer: { endpoint: '/api/match/neighborhoods/nh_api/amenities' },
    fallback_2d_available: true,
    source_refs: ['seed_match_source'],
    limitations: [],
  });

  await expect(getMatchNeighborhoodMapLayers('nh_api', {
    sessionId: 'match_api',
    resultSetId: 'mrs_api',
  })).resolves.toMatchObject({
    neighborhood_id: 'nh_api',
    fallback_2d_available: true,
  });

  expect(fetchSpy).toHaveBeenCalledWith(
    '/api/match/neighborhoods/nh_api/map-layers?session_id=match_api&result_set_id=mrs_api',
    expect.objectContaining({ credentials: 'include' }),
  );
});

it('requests buildings only with selected-neighborhood bounds', async () => {
  const fetchSpy = mockFetch({
    neighborhood_id: 'nh_api',
    session_id: 'match_api',
    result_set_id: 'mrs_api',
    bounds_rd: [132100, 455400, 133700, 457000],
    clipped_to_neighborhood: true,
    buildings: [],
    fallback_reason_code: 'matchFirst.neighborhood.missing3d',
    complete: true,
    next_cursor: null,
    loaded_scope: 'selected_neighborhood',
    partial_reason_code: null,
    data_version: 'match-seed-v1',
    source_refs: ['seed_match_source'],
    limitations: [],
  });

  await getMatchNeighborhoodBuildings('nh_api', {
    sessionId: 'match_api',
    resultSetId: 'mrs_api',
    boundsRd: [132100, 455400, 133700, 457000],
    lod: 'low',
    limit: 25,
  });

  expect(fetchSpy).toHaveBeenCalledWith(
    '/api/match/neighborhoods/nh_api/buildings?session_id=match_api&result_set_id=mrs_api&bounds_rd=132100%2C455400%2C133700%2C457000&lod=low&limit=25',
    expect.objectContaining({ credentials: 'include' }),
  );
});

it('passes selected-neighborhood building cursor when loading the next page', async () => {
  const fetchSpy = mockFetch({
    neighborhood_id: 'nh_api',
    session_id: 'match_api',
    result_set_id: 'mrs_api',
    bounds_rd: [132100, 455400, 133700, 457000],
    clipped_to_neighborhood: true,
    buildings: [],
    fallback_reason_code: null,
    complete: true,
    next_cursor: null,
    loaded_scope: 'selected_neighborhood',
    partial_reason_code: null,
    data_version: 'match-seed-v1',
    source_refs: ['seed_match_source'],
    limitations: [],
  });

  await getMatchNeighborhoodBuildings('nh_api', {
    sessionId: 'match_api',
    resultSetId: 'mrs_api',
    boundsRd: [132100, 455400, 133700, 457000],
    lod: 'low',
    limit: 25,
    cursor: 'cursor-page-2',
  });

  expect(fetchSpy).toHaveBeenCalledWith(
    '/api/match/neighborhoods/nh_api/buildings?session_id=match_api&result_set_id=mrs_api&bounds_rd=132100%2C455400%2C133700%2C457000&lod=low&limit=25&cursor=cursor-page-2',
    expect.objectContaining({ credentials: 'include' }),
  );
});

it('requests capped preference-aware amenity tags for a completed result context', async () => {
  const fetchSpy = mockFetch({
    neighborhood_id: 'nh_api',
    session_id: 'match_api',
    result_set_id: 'mrs_api',
    tags: [{
      amenity_key: 'parks',
      label_key: 'matchFirst.amenity.parks',
      reason_code: 'green_space_priority',
      source_refs: ['seed_match_source'],
      relevance: 95,
    }],
    points: [],
    source_refs: ['seed_match_source'],
    limitations: [],
  });

  await expect(getMatchNeighborhoodAmenities('nh_api', {
    sessionId: 'match_api',
    resultSetId: 'mrs_api',
  })).resolves.toMatchObject({
    tags: [expect.objectContaining({ amenity_key: 'parks' })],
    points: [],
  });

  expect(fetchSpy).toHaveBeenCalledWith(
    '/api/match/neighborhoods/nh_api/amenities?session_id=match_api&result_set_id=mrs_api',
    expect.objectContaining({ credentials: 'include' }),
  );
});

it('resolves a selected building to a Dossier bridge route with match return context', async () => {
  const fetchSpy = mockFetch({
    status: 'resolved',
    route: '#/address/0363010000123456?lookup=adr-123&match_session=match_api',
    vbo_id: '0363010000123456',
    lookup_id: 'adr-123',
    address_candidate: {
      address_id: '0363010000123456',
      vbo_id: '0363010000123456',
      lookup_id: 'adr-123',
      reliability: 'resolved',
    },
    fallback_reason_code: null,
  });

  await expect(resolveDossierFromBuilding({
    session_id: 'match_api',
    neighborhood_id: 'nh_api',
    building_id: 'bldg_nh_api_001',
    address_id: '0363010000123456',
    vbo_id: '0363010000123456',
    lookup_id: 'adr-123',
    return_context: {
      session_id: 'match_api',
      job_id: 'match_job_api',
      result_set_id: 'mrs_api',
      preference_vector_version: 'pv_api',
      source: 'match_map',
      return_url: '#/match/session/match_api/neighborhood/nh_api',
      map_center: [52.36, 4.9],
      map_zoom: 13,
      list_scroll: 240,
      mobile_mode: 'list',
      selected_result_id: 'rec_api',
      selected_result_rank: 1,
      language: 'nl',
      selected_house_id: 'bldg_nh_api_001',
    },
  })).resolves.toMatchObject({
    status: 'resolved',
    route: expect.stringContaining('#/address/0363010000123456'),
  });

  expect(fetchSpy).toHaveBeenCalledWith('/api/match/dossier/from-building', expect.objectContaining({
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({
      session_id: 'match_api',
      neighborhood_id: 'nh_api',
      building_id: 'bldg_nh_api_001',
      address_id: '0363010000123456',
      vbo_id: '0363010000123456',
      lookup_id: 'adr-123',
      return_context: {
        session_id: 'match_api',
        job_id: 'match_job_api',
        result_set_id: 'mrs_api',
        preference_vector_version: 'pv_api',
        source: 'match_map',
        return_url: '#/match/session/match_api/neighborhood/nh_api',
        map_center: [52.36, 4.9],
        map_zoom: 13,
        list_scroll: 240,
        mobile_mode: 'list',
        selected_result_id: 'rec_api',
        selected_result_rank: 1,
        language: 'nl',
        selected_house_id: 'bldg_nh_api_001',
      },
    }),
  }));
});

it('posts selected candidate IDs to the Dossier bridge without client address identifiers', async () => {
  const fetchSpy = mockFetch({
    status: 'resolved',
    route: '#/address/0363010000123462?lookup=adr-candidate-002&match_session=match_api',
    vbo_id: '0363010000123462',
    lookup_id: 'adr-candidate-002',
    address_candidate: {
      address_id: '0363010000123462',
      vbo_id: '0363010000123462',
      lookup_id: 'adr-candidate-002',
      reliability: 'candidate',
    },
    candidate_addresses: [],
    fallback_reason_code: null,
  });

  await expect(resolveDossierFromBuilding({
    session_id: 'match_api',
    neighborhood_id: 'nh_api',
    building_id: 'bldg_nh_api_001',
    address_id: null,
    vbo_id: null,
    lookup_id: null,
    selected_candidate_id: 'cand_bldg_nh_api_001_002',
    return_context: {
      session_id: 'match_api',
      job_id: 'match_job_api',
      result_set_id: 'mrs_api',
      preference_vector_version: 'pv_api',
      source: 'match_map',
      return_url: '#/match/session/match_api/neighborhood/nh_api',
      map_center: [52.36, 4.9],
      map_zoom: 13,
      list_scroll: 240,
      mobile_mode: 'list',
      selected_result_id: 'rec_api',
      selected_result_rank: 1,
      language: 'nl',
      selected_house_id: 'bldg_nh_api_001',
    },
  })).resolves.toMatchObject({
    status: 'resolved',
    address_candidate: expect.objectContaining({ reliability: 'candidate' }),
  });

  expect(fetchSpy).toHaveBeenCalledWith('/api/match/dossier/from-building', expect.objectContaining({
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({
      session_id: 'match_api',
      neighborhood_id: 'nh_api',
      building_id: 'bldg_nh_api_001',
      address_id: null,
      vbo_id: null,
      lookup_id: null,
      selected_candidate_id: 'cand_bldg_nh_api_001_002',
      return_context: {
        session_id: 'match_api',
        job_id: 'match_job_api',
        result_set_id: 'mrs_api',
        preference_vector_version: 'pv_api',
        source: 'match_map',
        return_url: '#/match/session/match_api/neighborhood/nh_api',
        map_center: [52.36, 4.9],
        map_zoom: 13,
        list_scroll: 240,
        mobile_mode: 'list',
        selected_result_id: 'rec_api',
        selected_result_rank: 1,
        language: 'nl',
        selected_house_id: 'bldg_nh_api_001',
      },
    }),
  }));
});
