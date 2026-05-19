import { expect, test, type Page, type Route } from '@playwright/test';
import { installMockAddressFlow } from './helpers/mockApi';

const SESSION_ID = 'match-final-e2e';
const JOB_ID = 'match_job_final';
const RESULT_SET_ID = 'mrs_final';
const VECTOR_VERSION = 'pv_final';
const NEIGHBORHOOD_ID = 'nh_final_ijburg';
const RECOMMENDATION_ID = 'rec_final_1';
const BUILDING_ID = 'bldg_final_1';
const VBO_ID = '0363010000999999';
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const completeAnswers = {
  intent: 'both',
  budget: { buy_min: 45_000_000, buy_max: 65_000_000, rent_max: 250_000 },
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

function recommendation() {
  return {
    rank: 1,
    recommendation_id: RECOMMENDATION_ID,
    neighborhood_id: NEIGHBORHOOD_ID,
    name: 'IJburg',
    municipality: 'Amsterdam',
    fit_score: 84,
    fit_label_key: 'matchFirst.results.fitLabel.strong',
    category: 'top',
    eligibility_status: 'eligible',
    confidence: { level: 'medium', score: 72, reasons: ['seed'] },
    reason_codes: ['match.results.reasons.green_access_match'],
    tradeoffs: ['match.results.tradeoffs.review_source_limitations'],
    component_scores: {},
    failed_filters: [],
    source_refs: ['seed:final-e2e'],
    source_metadata: [],
    limitations: ['match.results.limitations.mock_data'],
    freshness_status: 'mock',
    geometry_ref: {
      boundary_ref: `boundary_${NEIGHBORHOOD_ID}`,
      centroid_rd: { x: 126250, y: 486800 },
      bounds_rd: [125450, 486000, 127050, 487600],
      display_centroid_wgs84: { lat: 52.355, lng: 5 },
      display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
    },
  };
}

function resultsResponse() {
  const ranked = recommendation();
  return {
    session_id: SESSION_ID,
    job_id: JOB_ID,
    result_set_id: RESULT_SET_ID,
    preference_vector_version: VECTOR_VERSION,
    status: 'completed',
    generated_at: '2026-05-17T12:00:00Z',
    runtime_ms: 850,
    model_mode: 'weighted_scoring',
    model_version: 'match-score-v1',
    scoring_version: 'match-score-v1',
    data_version: 'seed-final-e2e',
    evaluation_status: 'not_validated_no_labels',
    predictive_probability_available: false,
    fallback_used: false,
    fallback_reason_code: null,
    normal_recommendation_count: 1,
    candidate_count: 1,
    scored_candidate_count: 1,
    ranked_results: [ranked],
    recommendations: [ranked],
    stretch_matches: [],
    near_misses: [],
    empty_state_code: null,
    map_center: { lat: 52.2, lng: 5.3 },
    bbox: [3.2, 50.7, 7.3, 53.6],
    map: { type: 'FeatureCollection', display_bounds_wgs84: [3.2, 50.7, 7.3, 53.6], features: [] },
  };
}

async function installFinalJourneyMocks(page: Page) {
  let runCalls = 0;
  let basemapConfigCalls = 0;
  let pdokTileCalls = 0;
  let storedAnswers = completeAnswers;
  const analyticsEvents: Array<{
    event_name: string;
    context?: Record<string, unknown>;
  }> = [];

  await page.route('**/api/match/analytics', async (route) => {
    analyticsEvents.push(route.request().postDataJSON() as {
      event_name: string;
      context?: Record<string, unknown>;
    });
    await fulfillJson(route, { accepted: true, duplicate: false }, 202);
  });

  await page.route('**/api/match/results-basemap', async (route) => {
    basemapConfigCalls += 1;
    await fulfillJson(route, {
      source_id: 'pdok_brt_achtergrondkaart',
      source_name: 'PDOK BRT Achtergrondkaart',
      service_type: 'wmts_raster',
      theme: 'standaard',
      tile_matrix_set: 'EPSG:3857',
      tile_url_template: 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png',
      attribution: 'PDOK / Kadaster / BRT Achtergrondkaart (standaard WMTS)',
      min_zoom: 0,
      max_zoom: 19,
    });
  });

  await page.route('**/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/**/*.png', async (route) => {
    pdokTileCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
    });
  });

  await page.route('**/api/match/sessions', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await fulfillJson(route, {
      session_id: SESSION_ID,
      locale: 'en',
      phase: 'survey_intro',
      current_step: null,
      answer_version: 0,
      expires_at: '2026-05-18T12:00:00Z',
    }, 201);
  });

  await page.route(`**/api/match/sessions/${SESSION_ID}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await fulfillJson(route, {
      session_id: SESSION_ID,
      locale: 'en',
      phase: 'review',
      current_step: 11,
      answer_version: 11,
      answers: storedAnswers,
      validation: {},
      is_complete: true,
      preference_vector_id: 'pv_final_id',
      preference_vector_version: VECTOR_VERSION,
      preference_vector: {
        preference_vector_id: 'pv_final_id',
        session_id: SESSION_ID,
        journey_intent: 'both',
        hard_filters: ['intent:both', 'budget', 'commute'],
        avoid_signals: ['busy_nightlife'],
        lifestyle_weights: { green_access: 0.5, calmness: 0.5 },
        locale: 'en',
        method_version: 'preference-vector-v2',
        raw_answer_refs: storedAnswers,
        source_answer_version: 11,
        vector_version: VECTOR_VERSION,
      },
    });
  });

  await page.route(`**/api/match/sessions/${SESSION_ID}/answers`, async (route) => {
    const body = route.request().postDataJSON() as {
      answers?: Partial<typeof completeAnswers>;
    };
    if (body.answers) {
      storedAnswers = { ...storedAnswers, ...body.answers };
    }
    await fulfillJson(route, {
      session_id: SESSION_ID,
      answer_version: 1,
      is_complete: false,
      validation: {},
      stale_results: true,
    });
  });

  await page.route(`**/api/match/sessions/${SESSION_ID}/run`, async (route) => {
    runCalls += 1;
    await fulfillJson(route, {
      session_id: SESSION_ID,
      job_id: JOB_ID,
      status: 'queued',
      stage: 'queued',
      progress: 5,
      message_key: 'matchFirst.progress.queued',
      preference_vector_id: 'pv_final_id',
      poll_after_ms: 1,
    }, 202);
  });

  await page.route(`**/api/match/sessions/${SESSION_ID}/status`, async (route) => {
    await fulfillJson(route, {
      session_id: SESSION_ID,
      job_id: JOB_ID,
      status: 'completed',
      stage: 'completed',
      progress: 100,
      message_key: 'matchFirst.progress.completed',
      model_mode: 'weighted_scoring',
      model_version: 'match-score-v1',
      scoring_version: 'match-score-v1',
      evaluation_status: 'not_validated_no_labels',
      fallback_used: false,
      fallback_reason_code: null,
      result_set_id: RESULT_SET_ID,
      error_code: null,
      runtime_ms: 850,
      updated_at: '2026-05-17T12:00:00Z',
      poll_after_ms: 1,
    });
  });

  await page.route(`**/api/match/sessions/${SESSION_ID}/results`, async (route) => {
    await fulfillJson(route, resultsResponse());
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
      source_refs: ['seed:final-e2e'],
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
      boundary: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { neighborhood_id: NEIGHBORHOOD_ID } },
      building_layer: { endpoint: `/api/match/neighborhoods/${NEIGHBORHOOD_ID}/buildings`, available: false, fallback_reason_code: 'matchFirst.neighborhood.missing3d' },
      amenity_layer: { endpoint: `/api/match/neighborhoods/${NEIGHBORHOOD_ID}/amenities`, available: true, fallback_reason_code: null },
      fallback_2d_available: true,
      source_refs: ['seed:final-e2e'],
      limitations: [],
    });
  });

  await page.route(`**/api/match/neighborhoods/${NEIGHBORHOOD_ID}/amenities**`, async (route) => {
    await fulfillJson(route, {
      neighborhood_id: NEIGHBORHOOD_ID,
      session_id: SESSION_ID,
      result_set_id: RESULT_SET_ID,
      tags: [{ amenity_key: 'parks', label_key: 'matchFirst.amenity.parks', reason_code: 'green_space_priority', source_refs: ['seed'], relevance: 95 }],
      points: [],
      source_refs: ['seed:final-e2e'],
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
      buildings: [{
        building_id: BUILDING_ID,
        vbo_id: VBO_ID,
        address_id: VBO_ID,
        lookup_id: 'adr-final',
        footprint: { type: 'Polygon', coordinates: [[[5, 52.355], [5.001, 52.355], [5.001, 52.356], [5, 52.356], [5, 52.355]]] },
        height_m: 11,
        source_refs: ['seed:final-e2e'],
        address_resolution: 'resolved',
        address_candidate_count: 1,
        fallback_label_key: 'matchFirst.neighborhood.addressCandidate',
      }],
      fallback_reason_code: 'matchFirst.neighborhood.missing3d',
      data_version: 'seed-final-e2e',
      source_refs: ['seed:final-e2e'],
      limitations: [],
    });
  });

  await page.route('**/api/match/dossier/from-building', async (route) => {
    const body = route.request().postDataJSON() as {
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
    };
    const returnUrl = `#/match/session/${SESSION_ID}/neighborhood/${NEIGHBORHOOD_ID}`;
    const context = {
      jobId: JOB_ID,
      resultSetId: RESULT_SET_ID,
      preferenceVectorVersion: VECTOR_VERSION,
      source: 'match_map',
      addressId: VBO_ID,
      buildingId: BUILDING_ID,
      returnUrl,
      mapCenter: body.return_context?.map_center ?? [52.355, 5],
      mapZoom: body.return_context?.map_zoom ?? 14,
      listScroll: body.return_context?.list_scroll ?? 0,
      mobileMode: body.return_context?.mobile_mode ?? 'map',
      selectedResultId: body.return_context?.selected_result_id,
      selectedResultRank: body.return_context?.selected_result_rank,
      language: body.return_context?.language ?? 'en',
      selectedHouseId: body.return_context?.selected_house_id ?? BUILDING_ID,
    };
    const params = new URLSearchParams({
      lookup: 'adr-final',
      match_return: returnUrl,
      match_session: SESSION_ID,
      match_neighborhood: NEIGHBORHOOD_ID,
      match_context: JSON.stringify(context),
    });
    await fulfillJson(route, {
      status: 'resolved',
      route: `#/address/${VBO_ID}?${params.toString()}`,
      vbo_id: VBO_ID,
      lookup_id: 'adr-final',
      address_candidate: { address_id: VBO_ID, vbo_id: VBO_ID, lookup_id: 'adr-final', reliability: 'resolved' },
      candidate_addresses: [],
      fallback_reason_code: null,
    });
  });

  return {
    getRunCalls: () => runCalls,
    getBasemapConfigCalls: () => basemapConfigCalls,
    getPdokTileCalls: () => pdokTileCalls,
    getAnalyticsEvents: () => analyticsEvents,
  };
}

async function answerSurvey(page: Page) {
  await page.getByRole('radio', { name: 'Both' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('spinbutton', { name: 'Minimum budget' }).fill('450000');
  await page.getByRole('spinbutton', { name: 'Maximum budget' }).fill('650000');
  await page.getByRole('spinbutton', { name: 'Maximum monthly rent' }).fill('2500');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: 'Young family' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('textbox', { name: 'City or station' }).fill('Utrecht Centraal');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox', { name: 'Green space' }).check();
  await page.getByRole('checkbox', { name: 'Calm streets' }).check();
  await page.getByRole('checkbox', { name: 'Public transport' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox', { name: 'Parks nearby' }).check();
  await page.getByRole('checkbox', { name: 'Good transit' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox', { name: 'Busy nightlife' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox', { name: 'Row house' }).check();
  await page.getByRole('checkbox', { name: 'Family house' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: 'Quiet city' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: 'English' }).check();
  await page.getByRole('button', { name: 'Review answers' }).click();
}

async function clickPrimaryCta(page: Page) {
  await page.locator('.match-first-landing__cta').click();
}

function countEvents(events: string[], eventName: string) {
  return events.filter((event) => event === eventName).length;
}

async function withAnswerPatch(page: Page, action: () => Promise<void>) {
  const response = page.waitForResponse((candidate) => (
    candidate.url().includes(`/api/match/sessions/${SESSION_ID}/answers`)
    && candidate.status() === 200
  ));
  await action();
  await response;
}

async function advanceSurveyToQuestion(page: Page, step: number) {
  await clickPrimaryCta(page);
  await expect(page).toHaveURL(new RegExp(`/question/${step}$`));
}

async function advanceSurveyToReview(page: Page) {
  await clickPrimaryCta(page);
  await expect(page).toHaveURL(/\/review$/);
}

async function answerSurveyWithStableControls(page: Page, language: 'en' | 'nl') {
  await withAnswerPatch(page, () => page.locator('input[name="match-first-intent"][value="both"]').check());
  await page.evaluate(() => window.location.reload());
  await expect(page.locator('input[name="match-first-intent"][value="both"]')).toBeChecked();
  await advanceSurveyToQuestion(page, 2);

  const budgetInputs = page.locator('.survey-question__range input[type="number"]');
  await withAnswerPatch(page, () => budgetInputs.nth(0).fill('450000'));
  await withAnswerPatch(page, () => budgetInputs.nth(1).fill('650000'));
  await withAnswerPatch(page, () => budgetInputs.nth(2).fill('2500'));
  await advanceSurveyToQuestion(page, 3);

  await withAnswerPatch(page, () => page.locator('input[name="match-first-household_type"][value="family_young_child"]').check());
  await advanceSurveyToQuestion(page, 4);

  await withAnswerPatch(page, () => page.locator('.survey-question__anchor input[type="text"]').fill('Utrecht Centraal'));
  await advanceSurveyToQuestion(page, 5);
  await advanceSurveyToQuestion(page, 6);

  await withAnswerPatch(page, () => page.locator('input[name="match-first-lifestyle_priorities"][value="green_access"]').check());
  await withAnswerPatch(page, () => page.locator('input[name="match-first-lifestyle_priorities"][value="calmness"]').check());
  await withAnswerPatch(page, () => page.locator('input[name="match-first-lifestyle_priorities"][value="public_transport"]').check());
  await advanceSurveyToQuestion(page, 7);

  await withAnswerPatch(page, () => page.locator('input[name="match-first-must_haves"][value="parks_nearby"]').check());
  await withAnswerPatch(page, () => page.locator('input[name="match-first-must_haves"][value="good_transit"]').check());
  await advanceSurveyToQuestion(page, 8);

  await withAnswerPatch(page, () => page.locator('input[name="match-first-dealbreakers"][value="busy_nightlife"]').check());
  await advanceSurveyToQuestion(page, 9);

  await withAnswerPatch(page, () => page.locator('input[name="match-first-housing_types"][value="row_house"]').check());
  await withAnswerPatch(page, () => page.locator('input[name="match-first-housing_types"][value="family_house"]').check());
  await advanceSurveyToQuestion(page, 10);

  await withAnswerPatch(page, () => page.locator('input[name="match-first-area_character"][value="quiet_city"]').check());
  await advanceSurveyToQuestion(page, 11);

  await withAnswerPatch(page, () => page.locator(`input[name="match-first-language"][value="${language}"]`).check());
  await advanceSurveyToReview(page);
}

test.use({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});

test('landing hero text keeps contrast over the hero background', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('i18nextLng', 'en');
  });
  await installFinalJourneyMocks(page);

  await page.goto('/');

  const contrast = await page.locator('#match-first-landing-title').evaluate((heading) => {
    const parseRgb = (value: string): [number, number, number] => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) throw new Error(`Unsupported color ${value}`);
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    };
    const channel = (value: number) => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([red, green, blue]: [number, number, number]) => (
      0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
    );
    const ratio = (a: [number, number, number], b: [number, number, number]) => {
      const light = Math.max(luminance(a), luminance(b));
      const dark = Math.min(luminance(a), luminance(b));
      return (light + 0.05) / (dark + 0.05);
    };

    const headingColor = parseRgb(getComputedStyle(heading).color);
    const brightestHeroOverlay: [number, number, number] = [255, 255, 255];
    return ratio(headingColor, brightestHeroOverlay);
  });

  expect(contrast).toBeGreaterThanOrEqual(4.5);
});

test('complete match-first journey emits required analytics and restores from Dossier', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('i18nextLng', 'en');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installMockAddressFlow(page);
  const mocks = await installFinalJourneyMocks(page);

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find my dream neighborhood' })).toBeVisible();
  await page.getByRole('link', { name: 'Already have an address?' }).click();
  await expect(page).toHaveURL('/#/search');
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem('buurt-check-match-first-analytics');
    const events = raw ? JSON.parse(raw) as Array<{ event_name: string }> : [];
    return events.map((event) => event.event_name);
  })).toContain('match_first_search_link_clicked');
  await page.goto('/');
  await page.getByRole('button', { name: 'Find my dream neighborhood' }).click();
  await page.getByRole('button', { name: 'Start the match' }).click();
  await answerSurvey(page);

  await page.getByRole('button', { name: 'Show my matches' }).click();
  await expect(page.getByRole('heading', { name: 'Your neighborhood matches are ready.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open my map' }).click();
  await expect(page.getByRole('heading', { name: 'Your match map' })).toBeVisible();
  await expect(page.getByText('PDOK / Kadaster / BRT Achtergrondkaart (standaard WMTS)')).toBeVisible();
  expect(mocks.getBasemapConfigCalls()).toBeGreaterThan(0);
  await expect.poll(() => mocks.getPdokTileCalls()).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Show IJburg on map' }).click();
  await page.getByRole('button', { name: 'List' }).click();
  await page.getByRole('button', { name: 'View neighborhood' }).click();
  await expect(page.getByRole('heading', { name: 'IJburg' })).toBeVisible();
  await page.getByRole('button', { name: 'Filter by Parks' }).click();
  await page.getByRole('button', { name: 'Open Dossier for house 1' }).click();
  await expect(page).toHaveURL(/#\/address\/[0-9]{16}/);
  await expect(page.getByRole('button', { name: 'Back to match map' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to match map' }).click();
  await expect(page).toHaveURL(`/#/match/session/${SESSION_ID}/neighborhood/${NEIGHBORHOOD_ID}`);
  await expect(page.getByRole('heading', { name: 'IJburg' })).toBeVisible();
  expect(mocks.getRunCalls()).toBe(1);

  const eventNames = await page.evaluate(() => {
    const raw = window.localStorage.getItem('buurt-check-match-first-analytics');
    const events = raw ? JSON.parse(raw) as Array<{ event_name: string }> : [];
    return events.map((event) => event.event_name);
  });
  expect(eventNames).toEqual(expect.arrayContaining([
    'match_landing_cta_clicked',
    'match_survey_intro_shown',
    'match_survey_started',
    'match_survey_question_shown',
    'match_survey_answer_saved',
    'match_survey_completed',
    'match_final_run_cta_clicked',
    'match_job_completed',
    'match_results_map_opened',
    'match_map_feature_selected',
    'match_recommendation_selected',
    'match_neighborhood_detail_opened',
    'match_amenity_interacted',
    'match_house_selected',
    'match_dossier_opened',
    'match_back_to_map_clicked',
    'match_back_to_map_return_success',
  ]));
  expect(countEvents(eventNames, 'match_landing_cta_clicked')).toBe(1);
  expect(countEvents(eventNames, 'match_final_run_cta_clicked')).toBe(1);
  expect(countEvents(eventNames, 'match_results_map_opened')).toBe(1);
  expect(countEvents(eventNames, 'match_recommendation_selected')).toBe(1);
  expect(countEvents(eventNames, 'match_dossier_opened')).toBe(1);
  expect(countEvents(eventNames, 'match_back_to_map_return_success')).toBe(1);

  await expect.poll(() => mocks.getAnalyticsEvents().map((event) => event.event_name)).toEqual(
    expect.arrayContaining([
      'match_landing_cta_clicked',
      'match_first_search_link_clicked',
      'match_survey_intro_shown',
      'match_survey_started',
      'match_survey_question_shown',
      'match_survey_answer_saved',
      'match_final_run_cta_clicked',
      'match_results_map_opened',
      'match_recommendation_selected',
      'match_amenity_interacted',
      'match_house_selected',
      'match_dossier_opened',
      'match_back_to_map_clicked',
      'match_back_to_map_return_success',
    ]),
  );
  const backendEventNames = mocks.getAnalyticsEvents().map((event) => event.event_name);
  expect(countEvents(backendEventNames, 'match_landing_cta_clicked')).toBe(1);
  expect(countEvents(backendEventNames, 'match_final_run_cta_clicked')).toBe(1);
  expect(countEvents(backendEventNames, 'match_results_map_opened')).toBe(1);
  expect(countEvents(backendEventNames, 'match_recommendation_selected')).toBe(1);
  expect(countEvents(backendEventNames, 'match_dossier_opened')).toBe(1);
  expect(countEvents(backendEventNames, 'match_back_to_map_return_success')).toBe(1);
  const backendAnalyticsPayload = JSON.stringify(mocks.getAnalyticsEvents());
  expect(backendAnalyticsPayload).not.toContain(BUILDING_ID);
  expect(backendAnalyticsPayload).not.toContain(VBO_ID);
});

for (const locale of ['en', 'nl'] as const) {
  test(`reduced-motion quickstart smoke path works in ${locale.toUpperCase()}`, async ({ page, browserName }) => {
    await page.addInitScript((language) => {
      if (window.name !== 'match-first-quickstart-seeded') {
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.localStorage.setItem('i18nextLng', language);
        window.name = 'match-first-quickstart-seeded';
      }
    }, locale);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installMockAddressFlow(page);
    const mocks = await installFinalJourneyMocks(page);

    await page.goto('/');
    await expect(page.locator('#match-first-landing-title')).toBeVisible();
    await expect(page.locator('.match-first-landing__cta')).toBeVisible();
    await expect(page.locator('.match-first-landing__address-link')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

    await page.locator('.match-first-landing__address-link').click();
    await expect(page).toHaveURL('/#/search');
    await page.goto('/');

    await clickPrimaryCta(page);
    await expect(page.locator('#match-survey-intro-title')).toBeVisible();
    await clickPrimaryCta(page);
    await answerSurveyWithStableControls(page, locale);

    await expect(page.locator('.match-first-landing__cta')).toBeVisible();
    expect(mocks.getRunCalls()).toBe(0);

    await clickPrimaryCta(page);
    await expect(page.locator('#match-success-title')).toBeVisible();
    await expect(page.getByTestId('match-success-checkmark')).toHaveAttribute('data-motion', 'reduced');
    await clickPrimaryCta(page);

    await expect(page.locator('#match-results-title')).toBeVisible();
    await page.locator('.results-map__marker').first().click();
    await page.locator('.results-map-shell__toggle button').nth(1).click();
    await page.locator('.recommendation-card__detail').first().click();
    await expect(page.locator('#match-neighborhood-title')).toHaveText('IJburg');
    await page.locator('.amenity-tags__button').first().click();
    await expect(page.locator('.amenity-tags__button').first()).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.house-selection__list button').first().click();
    await expect(page).toHaveURL(/#\/address\/[0-9]{16}/);
    await page.locator('.app__match-return-button').click();
    await expect(page).toHaveURL(`/#/match/session/${SESSION_ID}/neighborhood/${NEIGHBORHOOD_ID}`);
    await expect(page.locator('#match-neighborhood-title')).toHaveText('IJburg');
    expect(mocks.getRunCalls()).toBe(1);

    test.info().annotations.push({
      type: 'quickstart-smoke',
      description: `browser=${browserName}; viewport=390x844; language=${locale}; reduced-motion=reduce; result=pass; blockers=none`,
    });
  });
}
