import { expect, test, type Page, type Route } from '@playwright/test';
import { installMockAddressFlow } from './helpers/mockApi';

const MATCH_LANDING_RENDER_BUDGET_MS = 2500;
const SECONDARY_SUGGEST_BUDGET_MS = 1500;
const RESULTS_USABLE_BUDGET_MS = 3000;
const MAP_INTERACTION_BUDGET_MS = 150;
const DETAIL_USABLE_BUDGET_MS = 3000;
const PERF_SESSION_ID = 'match-perf-e2e';
const PERF_NEIGHBORHOOD_ID = 'nh_perf_ijburg';
const PERF_RESULT_SET_ID = 'mrs_perf';
const PERF_JOB_ID = 'match_job_perf';
const PERF_VECTOR_VERSION = 'pv_perf';

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function perfRecommendation() {
  return {
    rank: 1,
    recommendation_id: 'rec_perf_1',
    neighborhood_id: PERF_NEIGHBORHOOD_ID,
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
    source_refs: ['seed:perf'],
    source_metadata: [],
    limitations: ['match.results.limitations.mock_data'],
    freshness_status: 'mock',
    geometry_ref: {
      boundary_ref: `boundary_${PERF_NEIGHBORHOOD_ID}`,
      centroid_rd: { x: 126250, y: 486800 },
      bounds_rd: [125450, 486000, 127050, 487600],
      display_centroid_wgs84: { lat: 52.355, lng: 5 },
      display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
    },
  };
}

function perfResultsResponse() {
  const ranked = perfRecommendation();
  return {
    session_id: PERF_SESSION_ID,
    job_id: PERF_JOB_ID,
    result_set_id: PERF_RESULT_SET_ID,
    preference_vector_version: PERF_VECTOR_VERSION,
    status: 'completed',
    generated_at: '2026-05-18T12:00:00Z',
    runtime_ms: 850,
    model_mode: 'weighted_scoring',
    model_version: 'match-score-v1',
    scoring_version: 'match-score-v1',
    data_version: 'seed-perf',
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

async function installPerfMapMocks(page: Page) {
  const buildingRequestUrls: string[] = [];

  await page.route('**/api/match/analytics', async (route) => {
    await fulfillJson(route, { accepted: true, duplicate: false }, 202);
  });

  await page.route(`**/api/match/sessions/${PERF_SESSION_ID}/results`, async (route) => {
    await fulfillJson(route, perfResultsResponse());
  });

  await page.route(`**/api/match/neighborhoods/${PERF_NEIGHBORHOOD_ID}`, async (route) => {
    await fulfillJson(route, {
      neighborhood_id: PERF_NEIGHBORHOOD_ID,
      name: 'IJburg',
      municipality: 'Amsterdam',
      centroid_rd: { x: 126250, y: 486800 },
      bounds_rd: [125450, 486000, 127050, 487600],
      display_centroid_wgs84: { lat: 52.355, lng: 5 },
      display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
      boundary_ref: `boundary_${PERF_NEIGHBORHOOD_ID}`,
      source_refs: ['seed:perf'],
      freshness_status: 'mock',
      limitations: [],
    });
  });

  await page.route(`**/api/match/neighborhoods/${PERF_NEIGHBORHOOD_ID}/map-layers**`, async (route) => {
    await fulfillJson(route, {
      neighborhood_id: PERF_NEIGHBORHOOD_ID,
      session_id: PERF_SESSION_ID,
      result_set_id: PERF_RESULT_SET_ID,
      allowed_bounds_rd: [125450, 486000, 127050, 487600],
      display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
      boundary: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { neighborhood_id: PERF_NEIGHBORHOOD_ID } },
      building_layer: { endpoint: `/api/match/neighborhoods/${PERF_NEIGHBORHOOD_ID}/buildings`, available: false, fallback_reason_code: 'matchFirst.neighborhood.missing3d' },
      amenity_layer: { endpoint: `/api/match/neighborhoods/${PERF_NEIGHBORHOOD_ID}/amenities`, available: true, fallback_reason_code: null },
      fallback_2d_available: true,
      source_refs: ['seed:perf'],
      limitations: [],
    });
  });

  await page.route(`**/api/match/neighborhoods/${PERF_NEIGHBORHOOD_ID}/amenities**`, async (route) => {
    await fulfillJson(route, {
      neighborhood_id: PERF_NEIGHBORHOOD_ID,
      session_id: PERF_SESSION_ID,
      result_set_id: PERF_RESULT_SET_ID,
      tags: [{ amenity_key: 'parks', label_key: 'matchFirst.amenity.parks', reason_code: 'green_space_priority', source_refs: ['seed'], relevance: 95 }],
      points: [],
      source_refs: ['seed:perf'],
      limitations: [],
    });
  });

  await page.route(`**/api/match/neighborhoods/${PERF_NEIGHBORHOOD_ID}/buildings**`, async (route) => {
    buildingRequestUrls.push(route.request().url());
    await fulfillJson(route, {
      neighborhood_id: PERF_NEIGHBORHOOD_ID,
      session_id: PERF_SESSION_ID,
      result_set_id: PERF_RESULT_SET_ID,
      bounds_rd: [125450, 486000, 127050, 487600],
      clipped_to_neighborhood: true,
      buildings: [],
      fallback_reason_code: 'matchFirst.neighborhood.missing3d',
      data_version: 'seed-perf',
      source_refs: ['seed:perf'],
      limitations: [],
    });
  });

  return { buildingRequestUrls };
}

test.describe('Match-first performance budgets', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  });

  test('initial shell renders under budget', async ({ page }) => {
    await installMockAddressFlow(page);
    await page.goto('/', { waitUntil: 'load' });
    await page.goto('about:blank');

    const start = Date.now();
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByRole('heading', { name: /Find your dream neighborhood|Vind je droombuurt/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Find my dream neighborhood|Vind mijn droombuurt/i })).toBeVisible();
    const elapsedMs = Date.now() - start;

    expect(elapsedMs, `initial shell exceeded budget (${elapsedMs}ms)`).toBeLessThan(MATCH_LANDING_RENDER_BUDGET_MS);
  });

  test('secondary address suggest feedback appears under budget', async ({ page }) => {
    await installMockAddressFlow(page, { suggest: 120 });
    await page.goto('/');
    await page.getByRole('link', { name: /Already have an address|Heb je al een adres/i }).click();
    await expect(page.locator('input.address-search__input')).toBeVisible();

    const start = Date.now();
    await page.locator('input.address-search__input').fill('Keizersgracht 100 Amsterdam');
    await expect(page.getByRole('option').first()).toBeVisible();
    const elapsedMs = Date.now() - start;

    expect(elapsedMs, `suggest interaction exceeded budget (${elapsedMs}ms)`).toBeLessThan(SECONDARY_SUGGEST_BUDGET_MS);
  });

  test('results map and selected-neighborhood detail meet local interaction budgets', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem('i18nextLng', 'en');
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const mocks = await installPerfMapMocks(page);

    const resultsStart = Date.now();
    await page.goto(`/#/match/session/${PERF_SESSION_ID}/results`);
    await expect(page.getByRole('heading', { name: 'Your match map' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Netherlands recommendations map' })).toHaveAttribute('data-map-zoom', '7');
    expect(Date.now() - resultsStart).toBeLessThan(RESULTS_USABLE_BUDGET_MS);

    const mapSyncMs = await page.evaluate(async (neighborhoodId) => {
      const region = document.querySelector<HTMLElement>('[aria-label="Netherlands recommendations map"]');
      const button = document.querySelector<HTMLButtonElement>('[aria-label="Show IJburg on map"]');
      if (!region || !button) throw new Error('Map sync controls unavailable');
      const startedAt = performance.now();
      button.click();
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if (region.dataset.selectedNeighborhood === neighborhoodId) {
            window.clearTimeout(timeout);
            observer.disconnect();
            resolve();
          }
        };
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error('Map selection did not update'));
        }, 1000);
        const observer = new MutationObserver(() => check());
        observer.observe(region, { attributes: true, attributeFilter: ['data-selected-neighborhood'] });
        check();
      });
      return performance.now() - startedAt;
    }, PERF_NEIGHBORHOOD_ID);
    expect(mapSyncMs).toBeLessThan(MAP_INTERACTION_BUDGET_MS);

    const zoomMs = await page.evaluate(async () => {
      const region = document.querySelector<HTMLElement>('[aria-label="Netherlands recommendations map"]');
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.results-map__controls button'));
      const zoomIn = buttons.find((button) => button.textContent?.trim() === 'Zoom in');
      if (!region || !zoomIn) throw new Error('Zoom control unavailable');
      const startedAt = performance.now();
      zoomIn.click();
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if (region.dataset.mapZoom === '13') {
            window.clearTimeout(timeout);
            observer.disconnect();
            resolve();
          }
        };
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error('Zoom did not update'));
        }, 1000);
        const observer = new MutationObserver(() => check());
        observer.observe(region, { attributes: true, attributeFilter: ['data-map-zoom'] });
        check();
      });
      return performance.now() - startedAt;
    });
    expect(zoomMs).toBeLessThan(MAP_INTERACTION_BUDGET_MS);

    const panMs = await page.evaluate(async () => {
      const region = document.querySelector<HTMLElement>('[aria-label="Netherlands recommendations map"]');
      const east = Array.from(document.querySelectorAll<HTMLButtonElement>('.results-map__controls button'))
        .find((button) => button.textContent?.trim() === 'East');
      if (!region || !east) throw new Error('Pan control unavailable');
      const previousCenter = region.dataset.mapCenter;
      const startedAt = performance.now();
      east.click();
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if (region.dataset.mapCenter && region.dataset.mapCenter !== previousCenter) {
            window.clearTimeout(timeout);
            observer.disconnect();
            resolve();
          }
        };
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error('Pan did not update'));
        }, 1000);
        const observer = new MutationObserver(() => check());
        observer.observe(region, { attributes: true, attributeFilter: ['data-map-center'] });
        check();
      });
      return performance.now() - startedAt;
    });
    expect(panMs).toBeLessThan(MAP_INTERACTION_BUDGET_MS);

    await page.getByRole('button', { name: 'List' }).click();
    const detailStart = Date.now();
    await page.getByRole('button', { name: 'View neighborhood' }).click();
    await expect(page.getByRole('heading', { name: 'IJburg' })).toBeVisible();
    await expect(page.getByText('3D buildings are not available here yet, so we are showing the neighborhood in 2D.')).toBeVisible();
    expect(Date.now() - detailStart).toBeLessThan(DETAIL_USABLE_BUDGET_MS);

    expect(mocks.buildingRequestUrls).toHaveLength(1);
    const buildingUrl = new URL(mocks.buildingRequestUrls[0]);
    expect(buildingUrl.searchParams.get('bounds_rd')).toBe('125450,486000,127050,487600');
    expect(mocks.buildingRequestUrls[0]).not.toContain('3.2,50.7,7.3,53.6');
  });
});
