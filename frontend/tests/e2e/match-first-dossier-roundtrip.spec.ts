import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';
import { installMockAddressFlow } from './helpers/mockApi';

const SESSION_ID = 'match-e2e';
const NEIGHBORHOOD_ID = 'nh_amsterdam_ijburg';
const RESULT_SET_ID = 'mrs_e2e';
const JOB_ID = 'match_job_e2e';
const VECTOR_VERSION = 'pv_e2e';
const RECOMMENDATION_ID = 'rec_e2e_1';
const FIRST_HOUSE_ID = 'bldg_nh_amsterdam_ijburg_001';
const SECOND_HOUSE_ID = 'bldg_nh_amsterdam_ijburg_002';
const FIRST_VBO = '0363010000696734';
const SECOND_VBO = '0363010000696735';
const FIRST_CANDIDATE_ID = `cand_${FIRST_HOUSE_ID}_adr_provider_2`;

const COMPLETE_MATCH_ANSWERS = {
  intent: 'buy',
  budget: { buy_min: 45_000_000, buy_max: 65_000_000 },
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

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function waitForBackendResults(request: APIRequestContext, sessionId: string) {
  let lastStatus = 0;
  let lastBody = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request.get(
      `http://127.0.0.1:8000/api/match/sessions/${sessionId}/results`,
    );
    lastStatus = response.status();
    lastBody = await response.text();
    if (response.status() === 200) {
      return JSON.parse(lastBody) as ReturnType<typeof matchResults>;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Match results did not become available: ${lastStatus} ${lastBody}`);
}

function recommendation() {
  return {
    rank: 1,
    recommendation_id: RECOMMENDATION_ID,
    neighborhood_id: NEIGHBORHOOD_ID,
    name: 'IJburg',
    municipality: 'Amsterdam',
    fit_score: 84,
    fit_label_key: 'match.results.fit.strong',
    category: 'top',
    eligibility_status: 'eligible',
    confidence: { level: 'medium', score: 72, reasons: ['seed'] },
    reason_codes: ['green_access', 'transit'],
    tradeoffs: [],
    component_scores: { green_access: 88, transit: 80 },
    failed_filters: [],
    source_refs: ['seed:match-e2e'],
    source_metadata: [],
    limitations: ['match.results.limitations.not_predictive'],
    freshness_status: 'mock',
    geometry_ref: {
      boundary_ref: `boundary_${NEIGHBORHOOD_ID}`,
      centroid_rd: { x: 126250, y: 486800 },
      bounds_rd: [125450, 486000, 127050, 487600],
      display_centroid_wgs84: { lat: 52.355, lng: 5 },
      display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
    },
    amenity_refs: ['parks', 'transit'],
  };
}

function matchResults() {
  const ranked = recommendation();
  return {
    session_id: SESSION_ID,
    job_id: JOB_ID,
    result_set_id: RESULT_SET_ID,
    preference_vector_version: VECTOR_VERSION,
    status: 'completed',
    generated_at: '2026-05-17T10:00:00Z',
    runtime_ms: 850,
    model_mode: 'weighted_scoring',
    model_version: 'match-score-v1',
    scoring_version: 'match-score-v1',
    data_version: 'seed-e2e',
    evaluation_status: 'not_validated_no_labels',
    predictive_probability_available: false,
    fallback_used: false,
    fallback_reason_code: null,
    normal_recommendation_count: 1,
    candidate_count: 3,
    scored_candidate_count: 3,
    ranked_results: [ranked],
    recommendations: [ranked],
    stretch_matches: [],
    near_misses: [],
    empty_state_code: null,
    map_center: { lat: 52.2, lng: 5.3 },
    bbox: [3.2, 50.7, 7.3, 53.6],
    map: {
      type: 'FeatureCollection',
      display_bounds_wgs84: [3.2, 50.7, 7.3, 53.6],
      features: [],
    },
  };
}

async function createCompletedBackendMatch(request: APIRequestContext) {
  const createResponse = await request.post('http://127.0.0.1:8000/api/match/sessions', {
    data: { locale: 'en', source: 'landing' },
  });
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json() as { session_id: string };

  const patchResponse = await request.patch(
    `http://127.0.0.1:8000/api/match/sessions/${created.session_id}/answers`,
    {
      data: {
        locale: 'en',
        current_step: 11,
        answers: COMPLETE_MATCH_ANSWERS,
      },
    },
  );
  expect(patchResponse.status()).toBe(200);

  const sessionResponse = await request.get(
    `http://127.0.0.1:8000/api/match/sessions/${created.session_id}`,
  );
  expect(sessionResponse.status()).toBe(200);
  const session = await sessionResponse.json() as { preference_vector_version: string };

  const runResponse = await request.post(
    `http://127.0.0.1:8000/api/match/sessions/${created.session_id}/run`,
    {
      data: {
        source: 'review_final_cta',
        preference_vector_version: session.preference_vector_version,
      },
    },
  );
  expect(runResponse.status()).toBe(202);

  const results = await waitForBackendResults(request, created.session_id);
  const selected = results.ranked_results[0];
  expect(selected).toBeTruthy();
  return {
    sessionId: created.session_id,
    neighborhoodId: selected!.neighborhood_id,
  };
}

function houseCandidate(index: 1 | 2) {
  const first = index === 1;
  const centerLng = first ? 5 : 5.003;
  const centerLat = first ? 52.355 : 52.356;
  return {
    building_id: first ? FIRST_HOUSE_ID : SECOND_HOUSE_ID,
    vbo_id: first ? null : SECOND_VBO,
    address_id: first ? null : SECOND_VBO,
    lookup_id: first ? null : 'adr-mock-2',
    footprint: {
      type: 'Polygon',
      coordinates: [[
        [centerLng - 0.0002, centerLat - 0.0002],
        [centerLng + 0.0002, centerLat - 0.0002],
        [centerLng + 0.0002, centerLat + 0.0002],
        [centerLng - 0.0002, centerLat + 0.0002],
        [centerLng - 0.0002, centerLat - 0.0002],
      ]],
    },
    height_m: null,
    source_refs: ['seed:match-e2e'],
    address_resolution: first ? 'candidate' : 'resolved',
    address_candidate_count: first ? 2 : 1,
    fallback_label_key: 'matchFirst.neighborhood.addressCandidate',
  };
}

function firstHouseCandidateAddresses() {
  return [
    {
      candidate_id: `cand_${FIRST_HOUSE_ID}_adr_provider_1`,
      address_id: '0363010000696733',
      vbo_id: '0363010000696733',
      lookup_id: 'adr-provider-1',
      display_label_key: 'matchFirst.neighborhood.nearbyAddressCandidateWithLabel',
      display_params: { index: '1', label: 'IJburglaan 1000, 1087JK Amsterdam' },
      reliability: 'candidate',
      source_refs: ['pdok_locatieserver_reverse', 'seed:match-e2e'],
      fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
    },
    {
      candidate_id: FIRST_CANDIDATE_ID,
      address_id: FIRST_VBO,
      vbo_id: FIRST_VBO,
      lookup_id: 'adr-provider-2',
      display_label_key: 'matchFirst.neighborhood.nearbyAddressCandidateWithLabel',
      display_params: { index: '2', label: 'IJburglaan 1002, 1087JK Amsterdam' },
      reliability: 'candidate',
      source_refs: ['pdok_locatieserver_reverse', 'seed:match-e2e'],
      fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
    },
  ];
}

function dossierRouteFor(body: {
  building_id?: string;
  return_context?: {
    map_center?: number[];
    map_zoom?: number;
    list_scroll?: number;
    mobile_mode?: 'map' | 'list';
    selected_result_id?: string;
    selected_result_rank?: number;
    language?: 'en' | 'nl';
    selected_house_id?: string;
  };
}) {
  const isSecond = body.building_id === SECOND_HOUSE_ID;
  const vbo = isSecond ? SECOND_VBO : FIRST_VBO;
  const lookup = isSecond ? 'adr-mock-2' : 'adr-provider-2';
  const returnUrl = `#/match/session/${SESSION_ID}/neighborhood/${NEIGHBORHOOD_ID}`;
  const context = {
    jobId: JOB_ID,
    resultSetId: RESULT_SET_ID,
    preferenceVectorVersion: VECTOR_VERSION,
    source: 'match_map',
    addressId: vbo,
    buildingId: body.building_id,
    returnUrl,
    mapCenter: body.return_context?.map_center ?? [52.355, 5],
    mapZoom: body.return_context?.map_zoom ?? 14,
    listScroll: body.return_context?.list_scroll ?? 0,
    mobileMode: body.return_context?.mobile_mode ?? 'map',
    selectedResultId: body.return_context?.selected_result_id,
    selectedResultRank: body.return_context?.selected_result_rank,
    language: body.return_context?.language ?? 'en',
    selectedHouseId: body.return_context?.selected_house_id ?? body.building_id,
  };
  const params = new URLSearchParams({
    lookup,
    match_return: returnUrl,
    match_session: SESSION_ID,
    match_neighborhood: NEIGHBORHOOD_ID,
    match_context: JSON.stringify(context),
  });
  return `#/address/${vbo}?${params.toString()}`;
}

async function installMatchFirstRoundtripMocks(
  page: Page,
  options: {
    bridgeRouteForBody?: (body: Parameters<typeof dossierRouteFor>[0]) => string;
  } = {},
) {
  let runCalls = 0;
  let bridgeCalls = 0;

  await page.route(`**/api/match/sessions/${SESSION_ID}/run`, async (route) => {
    runCalls += 1;
    await fulfillJson(route, { detail: 'unexpected run' }, 500);
  });

  await page.route(`**/api/match/sessions/${SESSION_ID}`, async (route) => {
    await fulfillJson(route, {
      session_id: SESSION_ID,
      locale: 'en',
      phase: 'review',
      current_step: 11,
      answer_version: 11,
      answers: { language: 'en' },
      validation: {},
      is_complete: true,
      preference_vector_id: 'pv_e2e_id',
      preference_vector_version: VECTOR_VERSION,
      preference_vector: null,
    });
  });

  await page.route(`**/api/match/sessions/${SESSION_ID}/results`, async (route) => {
    await fulfillJson(route, matchResults());
  });

  await page.route(`**/api/match/neighborhoods/${NEIGHBORHOOD_ID}`, async (route) => {
    await fulfillJson(route, {
      neighborhood_id: NEIGHBORHOOD_ID,
      name: 'IJburg',
      municipality: 'Amsterdam',
      centroid_rd: { x: 126250, y: 486800 },
      bounds_rd: [125450, 486000, 127050, 487600],
      display_centroid_wgs84: { lat: 52.355, lng: 5 },
      display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
      boundary_ref: `boundary_${NEIGHBORHOOD_ID}`,
      source_refs: ['seed:match-e2e'],
      freshness_status: 'mock',
      limitations: [],
    });
  });

  await page.route(`**/api/match/neighborhoods/${NEIGHBORHOOD_ID}/map-layers**`, async (route) => {
    await fulfillJson(route, {
      neighborhood_id: NEIGHBORHOOD_ID,
      session_id: SESSION_ID,
      result_set_id: RESULT_SET_ID,
      allowed_bounds_rd: [125450, 486000, 127050, 487600],
      display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
      boundary: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[4.988, 52.347], [5.012, 52.347], [5.012, 52.363], [4.988, 52.363], [4.988, 52.347]]],
        },
        properties: { neighborhood_id: NEIGHBORHOOD_ID },
      },
      building_layer: {
        endpoint: `/api/match/neighborhoods/${NEIGHBORHOOD_ID}/buildings`,
        available: false,
        fallback_reason_code: 'matchFirst.neighborhood.missing3d',
      },
      amenity_layer: {
        endpoint: `/api/match/neighborhoods/${NEIGHBORHOOD_ID}/amenities`,
        available: true,
        fallback_reason_code: null,
      },
      fallback_2d_available: true,
      source_refs: ['seed:match-e2e'],
      limitations: [],
    });
  });

  await page.route(`**/api/match/neighborhoods/${NEIGHBORHOOD_ID}/amenities**`, async (route) => {
    await fulfillJson(route, {
      neighborhood_id: NEIGHBORHOOD_ID,
      session_id: SESSION_ID,
      result_set_id: RESULT_SET_ID,
      tags: [
        { amenity_key: 'parks', label_key: 'matchFirst.amenity.parks', reason_code: 'matchFirst.amenity.reason.green_space_priority', source_refs: ['seed'], relevance: 95 },
        { amenity_key: 'transit', label_key: 'matchFirst.amenity.transit', reason_code: 'matchFirst.amenity.reason.transport_priority', source_refs: ['seed'], relevance: 90 },
        { amenity_key: 'cycling', label_key: 'matchFirst.amenity.cycling', reason_code: 'matchFirst.amenity.reason.cycling_priority', source_refs: ['seed'], relevance: 80 },
        { amenity_key: 'schools', label_key: 'matchFirst.amenity.schools', reason_code: 'matchFirst.amenity.reason.family_priority', source_refs: ['seed'], relevance: 75 },
        { amenity_key: 'groceries', label_key: 'matchFirst.amenity.groceries', reason_code: 'matchFirst.amenity.reason.daily_services_priority', source_refs: ['seed'], relevance: 70 },
      ],
      points: [],
      source_refs: ['seed:match-e2e'],
      limitations: [],
    });
  });

  await page.route(`**/api/match/neighborhoods/${NEIGHBORHOOD_ID}/buildings**`, async (route) => {
    await fulfillJson(route, {
      neighborhood_id: NEIGHBORHOOD_ID,
      session_id: SESSION_ID,
      result_set_id: RESULT_SET_ID,
      bounds_rd: [125450, 486000, 127050, 487600],
      clipped_to_neighborhood: true,
      buildings: [houseCandidate(1), houseCandidate(2)],
      fallback_reason_code: 'matchFirst.neighborhood.missing3d',
      data_version: 'seed-e2e',
      source_refs: ['seed:match-e2e'],
      limitations: [],
    });
  });

  await page.route('**/api/match/dossier/from-building', async (route) => {
    bridgeCalls += 1;
    const body = route.request().postDataJSON() as {
      building_id?: string;
      selected_candidate_id?: string;
      return_context?: Record<string, unknown>;
    };
    if (body.building_id === FIRST_HOUSE_ID && !body.selected_candidate_id) {
      await fulfillJson(route, {
        status: 'candidates',
        route: null,
        vbo_id: null,
        lookup_id: null,
        address_candidate: {
          address_id: null,
          vbo_id: null,
          lookup_id: null,
          reliability: 'candidate',
        },
        candidate_addresses: firstHouseCandidateAddresses(),
        fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
      });
      return;
    }
    const routeHash = options.bridgeRouteForBody
      ? options.bridgeRouteForBody(body as Parameters<typeof dossierRouteFor>[0])
      : dossierRouteFor(body as Parameters<typeof dossierRouteFor>[0]);
    const resolvedFirstCandidate = body.selected_candidate_id === FIRST_CANDIDATE_ID;
    await fulfillJson(route, {
      status: 'resolved',
      route: routeHash,
      vbo_id: body.building_id === SECOND_HOUSE_ID ? SECOND_VBO : FIRST_VBO,
      lookup_id: body.building_id === SECOND_HOUSE_ID ? 'adr-mock-2' : 'adr-provider-2',
      address_candidate: {
        address_id: body.building_id === SECOND_HOUSE_ID ? SECOND_VBO : FIRST_VBO,
        vbo_id: body.building_id === SECOND_HOUSE_ID ? SECOND_VBO : FIRST_VBO,
        lookup_id: body.building_id === SECOND_HOUSE_ID ? 'adr-mock-2' : 'adr-provider-2',
        reliability: resolvedFirstCandidate ? 'candidate' : 'resolved',
      },
      candidate_addresses: resolvedFirstCandidate
        ? firstHouseCandidateAddresses().filter((candidate) => candidate.candidate_id === body.selected_candidate_id)
        : [],
      fallback_reason_code: null,
    });
  });

  return {
    getRunCalls: () => runCalls,
    getBridgeCalls: () => bridgeCalls,
  };
}

async function installDynamicAddressLookup(page: Page) {
  await page.unroute('**/api/address/lookup**');
  await page.route('**/api/address/lookup**', async (route) => {
    const url = new URL(route.request().url());
    const lookupId = url.searchParams.get('id');
    const isSecond = lookupId === 'adr-mock-2';
    const isCandidate = lookupId === 'adr-provider-2';
    await fulfillJson(route, {
      id: lookupId ?? 'adr-mock-1',
      display_name: isSecond
        ? 'Keizersgracht 102, 1015AA Amsterdam'
        : isCandidate
          ? 'IJburglaan 1002, 1087JK Amsterdam'
          : 'Keizersgracht 100, 1015AA Amsterdam',
      street: isCandidate ? 'IJburglaan' : 'Keizersgracht',
      house_number: isSecond ? '102' : isCandidate ? '1002' : '100',
      postcode: isCandidate ? '1087JK' : '1015AA',
      city: 'Amsterdam',
      rd_x: isSecond ? 121015 : 121000,
      rd_y: isSecond ? 487015 : 487000,
      latitude: isSecond ? 52.3678 : 52.3676,
      longitude: isSecond ? 4.8849 : 4.8846,
      adresseerbaar_object_id: isSecond ? SECOND_VBO : isCandidate ? FIRST_VBO : FIRST_VBO,
      buurt_code: 'BU0363AD07',
    });
  });
}

test.use({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});

test('house Dossier round-trip restores match state and opens another house without rerun', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('i18nextLng', 'en');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await installMockAddressFlow(page);
  await installDynamicAddressLookup(page);
  const matchMocks = await installMatchFirstRoundtripMocks(page);

  await page.goto(`/#/match/session/${SESSION_ID}/neighborhood/${NEIGHBORHOOD_ID}`);
  await expect(page.getByRole('heading', { name: 'IJburg' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Dossier for house 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Dossier for house 2' })).toBeVisible();

  await page.getByRole('button', { name: 'Open Dossier for house 1' }).click();
  await expect(page.getByRole('button', {
    name: 'Choose Nearby address 1: IJburglaan 1000, 1087JK Amsterdam for house 1',
  })).toBeVisible();
  await page.getByRole('button', {
    name: 'Choose Nearby address 2: IJburglaan 1002, 1087JK Amsterdam for house 1',
  }).click();
  await expect(page).toHaveURL(new RegExp(`#\\/address\\/${FIRST_VBO}`));
  await expect.poll(async () => page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator('.app__screen[data-match-motion="reduced"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to match map' })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem('buurt-check-match-first-analytics');
    const events = raw ? JSON.parse(raw) as Array<{ event_name: string }> : [];
    return events.map((event) => event.event_name);
  })).toContain('match_dossier_opened');

  await page.getByRole('button', { name: 'Back to match map' }).click();
  await expect(page).toHaveURL(`/#/match/session/${SESSION_ID}/neighborhood/${NEIGHBORHOOD_ID}`);
  await expect(page.getByRole('heading', { name: 'IJburg' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Dossier for house 1' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem('buurt-check-match-first-analytics');
    const events = raw ? JSON.parse(raw) as Array<{ event_name: string }> : [];
    return events.map((event) => event.event_name);
  })).toEqual(expect.arrayContaining([
    'match_back_to_map_clicked',
    'match_back_to_map_return_success',
  ]));

  const restoredState = await page.evaluate((sessionId) => {
    const raw = window.sessionStorage.getItem(`buurt-check-match-results-map-state:${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  }, SESSION_ID);
  expect(restoredState).toMatchObject({
    sessionId: SESSION_ID,
    jobId: JOB_ID,
    resultSetId: RESULT_SET_ID,
    preferenceVectorVersion: VECTOR_VERSION,
    selectedRecommendationId: RECOMMENDATION_ID,
    selectedNeighborhoodId: NEIGHBORHOOD_ID,
    selectedResultRank: 1,
    selectedHouseId: FIRST_HOUSE_ID,
    mapCenter: [52.355, 5],
    mapZoom: 14,
    listScroll: 0,
    mobileMode: 'map',
    locale: 'en',
  });

  await page.getByRole('button', { name: 'Open Dossier for house 2' }).click();
  await expect(page).toHaveURL(new RegExp(`#\\/address\\/${SECOND_VBO}`));
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem('buurt-check-match-first-analytics');
    const events = raw ? JSON.parse(raw) as Array<{ event_name: string }> : [];
    return events.filter((event) => event.event_name === 'match_dossier_opened').length;
  })).toBe(2);
  expect(matchMocks.getBridgeCalls()).toBe(3);
  expect(matchMocks.getRunCalls()).toBe(0);
});

test('backend provider-backed candidate bridge opens Dossier without rerun', async ({
  page,
  request,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Backend-integrated provider proof runs once to avoid shared DB races.');
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('i18nextLng', 'en');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const completed = await createCompletedBackendMatch(request);
  await installMockAddressFlow(page);
  await page.unroute('**/api/address/lookup**');

  let runCalls = 0;
  let bridgeCalls = 0;
  await page.route(`**/api/match/sessions/${completed.sessionId}/run`, async (route) => {
    runCalls += 1;
    await fulfillJson(route, { detail: 'unexpected run' }, 500);
  });
  await page.route('**/api/match/dossier/from-building', async (route) => {
    bridgeCalls += 1;
    await route.continue();
  });

  await page.goto(`/#/match/session/${completed.sessionId}/neighborhood/${completed.neighborhoodId}`);
  await expect(page.getByRole('button', { name: 'Open Dossier for house 3' })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole('button', { name: 'Open Dossier for house 3' }).click();
  const providerCandidate = page.getByRole('button', {
    name: /Choose Nearby address 1: .+ for house 3/,
  });
  await expect(providerCandidate).toBeVisible({ timeout: 30_000 });
  const describedBy = await providerCandidate.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toContainText('pdok_locatieserver_reverse');

  await providerCandidate.click();
  await expect(page).toHaveURL(/#\/address\/[0-9]{16}\?/);
  await expect(page.getByRole('button', { name: 'Back to match map' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to match map' }).click();
  await expect(page).toHaveURL(
    `/#/match/session/${completed.sessionId}/neighborhood/${completed.neighborhoodId}`,
  );
  expect(bridgeCalls).toBe(2);
  expect(runCalls).toBe(0);
});

test('bridge route without match_return is rejected before Dossier analytics', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('i18nextLng', 'en');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await installMockAddressFlow(page);
  await installDynamicAddressLookup(page);
  await installMatchFirstRoundtripMocks(page, {
    bridgeRouteForBody: () => `#/address/${FIRST_VBO}?lookup=adr-mock-1`,
  });

  await page.goto(`/#/match/session/${SESSION_ID}/neighborhood/${NEIGHBORHOOD_ID}`);
  await page.getByRole('button', { name: 'Open Dossier for house 1' }).click();
  await page.getByRole('button', {
    name: 'Choose Nearby address 2: IJburglaan 1002, 1087JK Amsterdam for house 1',
  }).click();

  await expect(page).toHaveURL(`/#/match/session/${SESSION_ID}/neighborhood/${NEIGHBORHOOD_ID}`);
  await expect(page.getByRole('button', { name: 'Search manually' })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem('buurt-check-match-first-analytics');
    const events = raw ? JSON.parse(raw) as Array<{ event_name: string }> : [];
    return events.map((event) => event.event_name);
  })).not.toContain('match_dossier_opened');
});

test('accepted bridge route with failed lookup does not record Dossier-open analytics', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('i18nextLng', 'en');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await installMockAddressFlow(page);
  await installMatchFirstRoundtripMocks(page);
  await page.unroute('**/api/address/lookup**');
  await page.route('**/api/address/lookup**', async (route) => {
    await fulfillJson(route, { detail: 'lookup missing' }, 404);
  });
  await page.route('**/api/address/suggest**', async (route) => {
    await fulfillJson(route, { suggestions: [] });
  });

  await page.goto(`/#/match/session/${SESSION_ID}/neighborhood/${NEIGHBORHOOD_ID}`);
  await page.getByRole('button', { name: 'Open Dossier for house 1' }).click();
  await page.getByRole('button', {
    name: 'Choose Nearby address 2: IJburglaan 1002, 1087JK Amsterdam for house 1',
  }).click();

  await expect(page).toHaveURL(new RegExp(`#\\/address\\/${FIRST_VBO}`));
  await expect(page.getByRole('button', { name: 'Back to match map' })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem('buurt-check-match-first-analytics');
    const events = raw ? JSON.parse(raw) as Array<{ event_name: string }> : [];
    return events.map((event) => event.event_name);
  })).not.toContain('match_dossier_opened');
});
