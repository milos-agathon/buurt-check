import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { I18nextProvider } from 'react-i18next';
import type { ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import NeighborhoodDetail from '../components/match-first/NeighborhoodDetail';
import ResultsMap from '../components/match-first/ResultsMap';
import { getMatchResultsMapStateStorageKey } from '../services/matchSessionStorage';
import { setupTestI18n } from './helpers';
import type {
  MatchNeighborhoodAmenityTag,
  MatchNeighborhoodBuildingFeature,
  MatchNeighborhoodRecommendation,
  MatchResultsResponse,
} from '../types/matchFirst';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  await i18n.changeLanguage('en');
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    value: 640,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    value: 360,
  });
  const context2d = {
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    set fillStyle(_value: string) {},
    set strokeStyle(_value: string) {},
    set lineWidth(_value: number) {},
  } as unknown as CanvasRenderingContext2D;
  const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as {
    mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
  };
  getContextSpy.mockImplementation((contextId) => (contextId === '2d' ? context2d : null));
});

function renderWithI18n(ui: ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

function recommendation(overrides: Partial<MatchNeighborhoodRecommendation> = {}): MatchNeighborhoodRecommendation {
  const rank = overrides.rank ?? 1;
  const neighborhoodId = overrides.neighborhood_id ?? 'nh_amsterdam_ijburg';
  return {
    rank,
    recommendation_id: overrides.recommendation_id ?? `rec_${rank}`,
    neighborhood_id: neighborhoodId,
    name: overrides.name ?? 'IJburg',
    municipality: overrides.municipality ?? 'Amsterdam',
    fit_score: overrides.fit_score ?? 84,
    fit_label_key: overrides.fit_label_key ?? 'matchFirst.results.fitLabel.strong',
    category: overrides.category ?? 'top',
    eligibility_status: overrides.eligibility_status ?? 'eligible',
    confidence: overrides.confidence ?? {
      score: 72,
      level: 'medium',
      reasons: ['match.results.confidence.mock_source_data'],
    },
    reason_codes: overrides.reason_codes ?? [
      'match.results.reasons.green_access_match',
      'match.results.reasons.mobility_match',
      'match.results.reasons.family_fit_match',
    ],
    tradeoffs: overrides.tradeoffs ?? ['match.results.tradeoffs.review_source_limitations'],
    component_scores: overrides.component_scores ?? {},
    failed_filters: overrides.failed_filters ?? [],
    source_refs: overrides.source_refs ?? ['seed_match_source'],
    source_metadata: overrides.source_metadata ?? [],
    limitations: overrides.limitations ?? ['match.results.limitations.mock_data'],
    freshness_status: overrides.freshness_status ?? 'mock',
    geometry_ref: overrides.geometry_ref ?? {
      centroid_rd: { x: 126250, y: 486800 },
      bounds_rd: [125450, 486000, 127050, 487600],
      display_centroid_wgs84: { lat: 52.355, lng: 5.0 },
      display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
      boundary_ref: `boundary_${neighborhoodId}`,
    },
    ...overrides,
  };
}

function resultsResponse(overrides: Partial<MatchResultsResponse> = {}): MatchResultsResponse {
  const rankedResults = overrides.ranked_results ?? [recommendation()];
  return {
    session_id: 'match-detail',
    job_id: 'match_job_detail',
    result_set_id: 'mrs_detail',
    preference_vector_version: 'pv_v1_detail',
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
    normal_recommendation_count: rankedResults.length,
    candidate_count: rankedResults.length,
    scored_candidate_count: rankedResults.length,
    ranked_results: rankedResults,
    recommendations: rankedResults,
    stretch_matches: [],
    near_misses: [],
    empty_state_code: null,
    map_center: { lat: 52.2, lng: 5.3 },
    bbox: [3.2, 50.7, 7.3, 53.6],
    map: { type: 'FeatureCollection', display_bounds_wgs84: [3.2, 50.7, 7.3, 53.6], features: [] },
    ...overrides,
  };
}

function amenityTags(): MatchNeighborhoodAmenityTag[] {
  return [
    'parks',
    'transit',
    'groceries',
    'schools',
    'cycling',
    'healthcare',
    'cafes',
    'childcare',
  ].map((amenity_key, index) => ({
    amenity_key,
    label_key: `matchFirst.amenity.${amenity_key}`,
    reason_code: index < 2 ? 'must_have_match' : 'default_context',
    source_refs: ['seed_match_source'],
    relevance: 95 - index,
  }));
}

interface MockNeighborhoodDetailFetchOptions {
  failAmenities?: boolean;
  allowedBoundsRd?: [number, number, number, number];
  buildings?: MatchNeighborhoodBuildingFeature[];
  dossierBridgeStatus?: 'resolved' | 'unavailable' | 'candidates' | 'manual_required';
  dossierBridgeError?: string;
  dossierBridgeStatusCode?: number;
  dossierBridgeRoute?: string;
  dossierBridgeResponses?: Array<{ status?: number; body: unknown }>;
}

function boundsFromFetchCall(call: Parameters<typeof fetch> | undefined): number[] {
  expect(call).toBeDefined();
  const url = new URL(String(call?.[0]), 'http://localhost');
  return (url.searchParams.get('bounds_rd') ?? '').split(',').map(Number);
}

function mockNeighborhoodDetailFetches(
  results = resultsResponse(),
  options: MockNeighborhoodDetailFetchOptions = {},
) {
  const allowedBoundsRd = options.allowedBoundsRd ?? [125450, 486000, 127050, 487600];
  const buildings = options.buildings ?? [];
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    const neighborhoodId = results.ranked_results[0]?.neighborhood_id ?? 'nh_amsterdam_ijburg';
    if (url.endsWith(`/api/match/sessions/${results.session_id}/results`)) {
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith(`/api/match/neighborhoods/${neighborhoodId}`)) {
      return new Response(JSON.stringify({
        neighborhood_id: neighborhoodId,
        name: 'IJburg',
        municipality: 'Amsterdam',
        centroid_rd: { x: 126250, y: 486800 },
        bounds_rd: allowedBoundsRd,
        display_centroid_wgs84: { lat: 52.355, lng: 5 },
        display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
        boundary_ref: `boundary_${neighborhoodId}`,
        source_refs: ['seed_match_source'],
        freshness_status: 'mock',
        limitations: ['match.results.limitations.mock_data'],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`/api/match/neighborhoods/${neighborhoodId}/map-layers`)) {
      return new Response(JSON.stringify({
        neighborhood_id: neighborhoodId,
        session_id: results.session_id,
        result_set_id: results.result_set_id,
        allowed_bounds_rd: allowedBoundsRd,
        display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
        boundary: {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: { neighborhood_id: neighborhoodId },
        },
        building_layer: {
          available: false,
          endpoint: `/api/match/neighborhoods/${neighborhoodId}/buildings`,
          fallback_reason_code: 'matchFirst.neighborhood.missing3d',
        },
        amenity_layer: { endpoint: `/api/match/neighborhoods/${neighborhoodId}/amenities` },
        fallback_2d_available: true,
        source_refs: ['seed_match_source'],
        limitations: ['match.results.limitations.mock_data'],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`/api/match/neighborhoods/${neighborhoodId}/amenities`)) {
      if (options.failAmenities) {
        return new Response(JSON.stringify({ detail: 'amenities unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        neighborhood_id: neighborhoodId,
        session_id: results.session_id,
        result_set_id: results.result_set_id,
        tags: amenityTags(),
        points: [],
        source_refs: ['seed_match_source'],
        limitations: [],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`/api/match/neighborhoods/${neighborhoodId}/buildings`)) {
      return new Response(JSON.stringify({
        neighborhood_id: neighborhoodId,
        session_id: results.session_id,
        result_set_id: results.result_set_id,
        bounds_rd: allowedBoundsRd,
        clipped_to_neighborhood: true,
        buildings,
        fallback_reason_code: 'matchFirst.neighborhood.missing3d',
        data_version: 'match-seed-v1',
        source_refs: ['seed_match_source'],
        limitations: ['match.results.limitations.source_metadata_unavailable'],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/api/match/dossier/from-building')) {
      if (options.dossierBridgeResponses?.length) {
        const next = options.dossierBridgeResponses.shift();
        return new Response(JSON.stringify(next?.body ?? { detail: 'unexpected bridge call' }), {
          status: next?.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (options.dossierBridgeError) {
        return new Response(JSON.stringify({ detail: options.dossierBridgeError }), {
          status: options.dossierBridgeStatusCode ?? 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const status = options.dossierBridgeStatus ?? 'resolved';
      const body = status === 'resolved'
        ? {
          status: 'resolved',
          route: options.dossierBridgeRoute
            ?? '#/address/0363010000123456?lookup=adr-abc123&match_session=match-detail',
          vbo_id: '0363010000123456',
          lookup_id: 'adr-abc123',
          address_candidate: {
            address_id: '0363010000123456',
            vbo_id: '0363010000123456',
            lookup_id: 'adr-abc123',
            reliability: 'resolved',
          },
          fallback_reason_code: null,
        }
        : status === 'manual_required'
          ? {
            status: 'manual_required',
            route: null,
            vbo_id: null,
            lookup_id: null,
            address_candidate: {
              address_id: null,
              vbo_id: null,
              lookup_id: null,
              reliability: 'unavailable',
            },
            candidate_addresses: [],
            fallback_reason_code: 'match.neighborhood.manual_address_required',
          }
          : {
          status: 'unavailable',
          route: null,
          vbo_id: null,
          lookup_id: null,
          address_candidate: {
            address_id: null,
            vbo_id: null,
            lookup_id: null,
            reliability: 'unavailable',
          },
          fallback_reason_code: 'match.neighborhood.no_reliable_address',
        };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ detail: 'unexpected' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

function buildingCandidate(overrides: Partial<MatchNeighborhoodBuildingFeature> = {}): MatchNeighborhoodBuildingFeature {
  return {
    building_id: overrides.building_id ?? 'bldg_nh_amsterdam_ijburg_001',
    vbo_id: overrides.vbo_id === undefined ? '0363010000123456' : overrides.vbo_id,
    address_id: overrides.address_id === undefined ? '0363010000123456' : overrides.address_id,
    lookup_id: overrides.lookup_id === undefined ? 'adr-abc123' : overrides.lookup_id,
    footprint: overrides.footprint ?? {
      type: 'Polygon',
      coordinates: [[
        [4.999, 52.354],
        [5.001, 52.354],
        [5.001, 52.356],
        [4.999, 52.356],
        [4.999, 52.354],
      ]],
    },
    height_m: overrides.height_m ?? 11,
    source_refs: overrides.source_refs ?? ['seed_match_source'],
    address_resolution: overrides.address_resolution ?? 'resolved',
    address_candidate_count: overrides.address_candidate_count ?? 1,
    fallback_label_key: overrides.fallback_label_key ?? 'matchFirst.neighborhood.addressCandidate',
  };
}

async function expectNoSeriousA11yViolations(container: HTMLElement) {
  const results = await axe(container);
  const severe = results.violations.filter(
    (violation: { impact?: string | null }) =>
      violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(severe).toHaveLength(0);
}

it('opens selected-neighborhood detail from a result card without rerunning matching', async () => {
  const user = userEvent.setup();
  const onOpenNeighborhood = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  renderWithI18n(
    <ResultsMap
      sessionId="match-detail"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
      onOpenNeighborhood={onOpenNeighborhood}
    />,
  );

  await user.click(within(screen.getByTestId('recommendation-card-rec_1')).getByRole('button', { name: 'View neighborhood' }));

  expect(onOpenNeighborhood).toHaveBeenCalledWith(expect.objectContaining({
    neighborhood_id: 'nh_amsterdam_ijburg',
  }));
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/run'))).toBe(false);
  const stored = JSON.parse(sessionStorage.getItem(getMatchResultsMapStateStorageKey('match-detail')) ?? '{}') as Record<string, unknown>;
  expect(stored).toMatchObject({
    selectedRecommendationId: 'rec_1',
    selectedNeighborhoodId: 'nh_amsterdam_ijburg',
    mapCenter: [52.355, 5],
    mapZoom: 12,
  });
});

it('loads boundary, scoped buildings, capped amenities, and missing-3D fallback for selected detail', async () => {
  const fetchSpy = mockNeighborhoodDetailFetches();
  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Selected neighborhood map' })).toHaveAttribute('data-boundary-ref', 'boundary_nh_amsterdam_ijburg');
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-building-requested', 'true');
  });

  const buildingCall = fetchSpy.mock.calls.find(([input]) => String(input).includes('/buildings'));
  expect(boundsFromFetchCall(buildingCall)).toEqual([125450, 486000, 127050, 487600]);
  expect(await screen.findByText('3D buildings are not available here yet, so we are showing the neighborhood in 2D.')).toBeInTheDocument();
  expect(screen.getByTestId('amenity-tags').querySelectorAll('li')).toHaveLength(7);
  expect(await screen.findByTestId('house-selection-panel')).toHaveTextContent('No reliable house candidate is available yet.');
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/dossier/from-building'))).toBe(false);
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'drawn');
  });
});

it('toggles amenity filters with visible pressed state and stable analytics keys', async () => {
  const user = userEvent.setup();
  mockNeighborhoodDetailFetches();
  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={resultsResponse()}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  const parksFilter = await screen.findByRole('button', { name: 'Filter by Parks' });
  expect(parksFilter).toHaveAttribute('aria-pressed', 'false');

  await user.click(parksFilter);

  expect(parksFilter).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Showing Parks context')).toBeInTheDocument();

  const events = JSON.parse(localStorage.getItem('buurt-check-match-first-analytics') ?? '[]') as Array<{
    event_name: string;
    context: Record<string, unknown>;
  }>;
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      event_name: 'match_amenity_interacted',
      context: expect.objectContaining({
        amenity_key: 'parks',
        neighborhood_id: 'nh_amsterdam_ijburg',
        result_set_id: 'mrs_detail',
      }),
    }),
  ]));
  expect(JSON.stringify(events)).not.toContain('Parks');

  await user.click(parksFilter);

  expect(parksFilter).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByText('Showing Parks context')).not.toBeInTheDocument();
});

it('keeps selected map and 2D fallback usable when amenity tags fail', async () => {
  const fetchSpy = mockNeighborhoodDetailFetches(resultsResponse(), { failAmenities: true });
  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByRole('region', { name: 'Selected neighborhood map' })).toHaveAttribute('data-display-bounds-wgs84', '4.988,52.347,5.012,52.363');
  });
  expect(await screen.findByText('Amenity tags are unavailable right now.')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-building-requested', 'true');
  });

  const buildingCall = fetchSpy.mock.calls.find(([input]) => String(input).includes('/buildings'));
  expect(boundsFromFetchCall(buildingCall)).toEqual([125450, 486000, 127050, 487600]);
  expect(await screen.findByText('3D buildings are not available here yet, so we are showing the neighborhood in 2D.')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'drawn');
  });
});

it('uses the exact selected-neighborhood layer bounds for building requests', async () => {
  const allowedBoundsRd: [number, number, number, number] = [124999.5, 485900.25, 126600.75, 487501.5];
  const fetchSpy = mockNeighborhoodDetailFetches(resultsResponse(), { allowedBoundsRd });
  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-building-requested', 'true');
  });

  const buildingCall = fetchSpy.mock.calls.find(([input]) => String(input).includes('/buildings'));
  expect(boundsFromFetchCall(buildingCall)).toEqual(allowedBoundsRd);
});

it('preserves selected-neighborhood map state for later return and keeps list fallback accessible', async () => {
  mockNeighborhoodDetailFetches();
  const { container } = renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={resultsResponse()}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    const stored = JSON.parse(sessionStorage.getItem(getMatchResultsMapStateStorageKey('match-detail')) ?? '{}') as Record<string, unknown>;
    expect(stored).toMatchObject({
      selectedNeighborhoodId: 'nh_amsterdam_ijburg',
      selectedResultRank: 1,
      mapZoom: 14,
    });
  });
  expect(await screen.findByTestId('house-selection-panel')).toHaveTextContent('No reliable house candidate is available yet.');
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'drawn');
  });
  await expectNoSeriousA11yViolations(container);
});

it('preserves exact returned map and list state when reopening selected-neighborhood detail', async () => {
  await i18n.changeLanguage('nl');
  sessionStorage.setItem(getMatchResultsMapStateStorageKey('match-detail'), JSON.stringify({
    sessionId: 'match-detail',
    jobId: 'match_job_detail',
    resultSetId: 'mrs_detail',
    preferenceVectorVersion: 'pv_v1_detail',
    selectedRecommendationId: 'rec_1',
    selectedNeighborhoodId: 'nh_amsterdam_ijburg',
    selectedResultRank: 1,
    selectedHouseId: 'bldg_nh_amsterdam_ijburg_001',
    mapCenter: [52.36, 4.9],
    mapZoom: 13,
    listScroll: 240,
    mobileMode: 'list',
    locale: 'nl',
  }));
  mockNeighborhoodDetailFetches();

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={resultsResponse()}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    const stored = JSON.parse(sessionStorage.getItem(getMatchResultsMapStateStorageKey('match-detail')) ?? '{}') as Record<string, unknown>;
    expect(stored).toMatchObject({
      sessionId: 'match-detail',
      jobId: 'match_job_detail',
      resultSetId: 'mrs_detail',
      preferenceVectorVersion: 'pv_v1_detail',
      selectedNeighborhoodId: 'nh_amsterdam_ijburg',
      selectedRecommendationId: 'rec_1',
      selectedResultRank: 1,
      selectedHouseId: 'bldg_nh_amsterdam_ijburg_001',
      mapCenter: [52.36, 4.9],
      mapZoom: 13,
      listScroll: 240,
      mobileMode: 'list',
      locale: 'nl',
    });
  });
});

it('opens a reliable house candidate in the Dossier without rerunning matching', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  const building = buildingCandidate();
  const secondBuilding = buildingCandidate({
    building_id: 'bldg_nh_amsterdam_ijburg_002',
    vbo_id: '0363010000123457',
    address_id: '0363010000123457',
    lookup_id: 'adr-def456',
  });
  const onOpenDossier = vi.fn(() => true);
  const fetchSpy = mockNeighborhoodDetailFetches(results, {
    buildings: [building, secondBuilding],
    dossierBridgeRoute: '#/address/0363010000123456?lookup=adr-abc123&match_session=match-detail',
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={onOpenDossier}
    />,
  );

  const openDossierButton = await screen.findByRole('button', { name: 'Open Dossier for house 1' });
  expect(screen.getByRole('button', { name: 'Open Dossier for house 2' })).toBeInTheDocument();
  await user.click(openDossierButton);

  await waitFor(() => {
    expect(onOpenDossier).toHaveBeenCalledWith('#/address/0363010000123456?lookup=adr-abc123&match_session=match-detail');
  });
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('match_dossier_opened');
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/run'))).toBe(false);
  const dossierCall = fetchSpy.mock.calls.find(([input]) => String(input).includes('/dossier/from-building'));
  expect(dossierCall).toBeDefined();
  const bridgePayload = JSON.parse(String((dossierCall?.[1] as RequestInit | undefined)?.body ?? '{}')) as Record<string, unknown>;
  expect(bridgePayload).toMatchObject({
    session_id: 'match-detail',
    neighborhood_id: 'nh_amsterdam_ijburg',
    building_id: 'bldg_nh_amsterdam_ijburg_001',
    address_id: '0363010000123456',
    vbo_id: '0363010000123456',
    lookup_id: 'adr-abc123',
  });
  expect(bridgePayload.return_context).toMatchObject({
    session_id: 'match-detail',
    job_id: 'match_job_detail',
    result_set_id: 'mrs_detail',
    preference_vector_version: 'pv_v1_detail',
    source: 'match_map',
    return_url: '#/match/session/match-detail/neighborhood/nh_amsterdam_ijburg',
    map_center: [52.355, 5],
    map_zoom: 14,
    list_scroll: 0,
    mobile_mode: 'map',
    selected_result_id: 'rec_1',
    selected_result_rank: 1,
    language: 'en',
    selected_house_id: 'bldg_nh_amsterdam_ijburg_001',
  });
  const stored = JSON.parse(sessionStorage.getItem(getMatchResultsMapStateStorageKey('match-detail')) ?? '{}') as Record<string, unknown>;
  expect(stored).toMatchObject({
    sessionId: 'match-detail',
    jobId: 'match_job_detail',
    resultSetId: 'mrs_detail',
    preferenceVectorVersion: 'pv_v1_detail',
    selectedNeighborhoodId: 'nh_amsterdam_ijburg',
    selectedRecommendationId: 'rec_1',
    selectedResultRank: 1,
    selectedHouseId: 'bldg_nh_amsterdam_ijburg_001',
    mapCenter: [52.355, 5],
    mapZoom: 14,
    mobileMode: 'map',
    locale: 'en',
  });
});

it('renders candidate address choices and resolves the selected candidate without rerunning matching', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  const building = buildingCandidate({
    vbo_id: null,
    address_id: null,
    lookup_id: null,
    address_resolution: 'candidate',
    address_candidate_count: 2,
  });
  const onOpenDossier = vi.fn(() => true);
  const fetchSpy = mockNeighborhoodDetailFetches(results, {
    buildings: [building],
    dossierBridgeResponses: [
      {
        body: {
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
          candidate_addresses: [
            {
              candidate_id: 'cand_bldg_nh_amsterdam_ijburg_001_adr_provider_1',
              address_id: '0363010000987651',
              vbo_id: '0363010000987651',
              lookup_id: 'adr-provider-1',
              display_label_key: 'matchFirst.neighborhood.nearbyAddressCandidateWithLabel',
              display_params: { index: '1', label: 'IJburglaan 1000, 1087JK Amsterdam' },
              reliability: 'candidate',
              source_refs: ['pdok_locatieserver_reverse', 'seed_match_source'],
              fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
            },
            {
              candidate_id: 'cand_bldg_nh_amsterdam_ijburg_001_adr_provider_2',
              address_id: '0363010000987652',
              vbo_id: '0363010000987652',
              lookup_id: 'adr-provider-2',
              display_label_key: 'matchFirst.neighborhood.nearbyAddressCandidateWithLabel',
              display_params: { index: '2', label: 'IJburglaan 1002, 1087JK Amsterdam' },
              reliability: 'candidate',
              source_refs: ['pdok_locatieserver_reverse', 'seed_match_source'],
              fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
            },
          ],
          fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
        },
      },
      {
        body: {
          status: 'resolved',
          route: '#/address/0363010000987652?lookup=adr-provider-2&match_session=match-detail',
          vbo_id: '0363010000987652',
          lookup_id: 'adr-provider-2',
          address_candidate: {
            address_id: '0363010000987652',
            vbo_id: '0363010000987652',
            lookup_id: 'adr-provider-2',
            reliability: 'candidate',
          },
          candidate_addresses: [],
          fallback_reason_code: null,
        },
      },
    ],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={onOpenDossier}
    />,
  );

  await user.click(await screen.findByRole('button', { name: 'Open Dossier for house 1' }));

  const candidateOne = await screen.findByRole('button', {
    name: 'Choose Nearby address 1: IJburglaan 1000, 1087JK Amsterdam for house 1',
  });
  const candidateTwo = screen.getByRole('button', {
    name: 'Choose Nearby address 2: IJburglaan 1002, 1087JK Amsterdam for house 1',
  });
  expect(candidateOne).toHaveAccessibleDescription(
    'Address candidate. Source: pdok_locatieserver_reverse, seed_match_source.',
  );
  expect(candidateTwo).toHaveAccessibleDescription(
    'Address candidate. Source: pdok_locatieserver_reverse, seed_match_source.',
  );
  candidateTwo.focus();
  await user.keyboard('{Enter}');

  await waitFor(() => {
    expect(onOpenDossier).toHaveBeenCalledWith('#/address/0363010000987652?lookup=adr-provider-2&match_session=match-detail');
  });
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/run'))).toBe(false);
  const bridgeCalls = fetchSpy.mock.calls.filter(([input]) => String(input).includes('/dossier/from-building'));
  expect(bridgeCalls).toHaveLength(2);
  const selectedCandidatePayload = JSON.parse(String((bridgeCalls[1]?.[1] as RequestInit | undefined)?.body ?? '{}')) as Record<string, unknown>;
  expect(selectedCandidatePayload).toMatchObject({
    session_id: 'match-detail',
    neighborhood_id: 'nh_amsterdam_ijburg',
    building_id: 'bldg_nh_amsterdam_ijburg_001',
    selected_candidate_id: 'cand_bldg_nh_amsterdam_ijburg_001_adr_provider_2',
  });
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('cand_bldg');
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('0363010000987652');
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('adr-provider-2');
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('Nearby address');
});

it('keeps candidate address controls keyboard usable with translated copy and recovery actions', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  const onOpenDossier = vi.fn(() => true);
  const onBackToResults = vi.fn();
  const onSearchManually = vi.fn();
  mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate({
      vbo_id: null,
      address_id: null,
      lookup_id: null,
      address_resolution: 'candidate',
      address_candidate_count: 1,
    })],
    dossierBridgeResponses: [
      {
        body: {
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
          candidate_addresses: [{
            candidate_id: 'cand_bldg_nh_amsterdam_ijburg_001_001',
            address_id: '0363010000123461',
            vbo_id: '0363010000123461',
            lookup_id: 'adr-candidate-001',
            display_label_key: 'matchFirst.neighborhood.nearbyAddressCandidate',
            display_params: { index: '1' },
            reliability: 'candidate',
            source_refs: ['seed_match_source'],
            fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
          }],
          fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
        },
      },
      {
        body: {
          status: 'resolved',
          route: '#/address/0363010000123461?lookup=adr-candidate-001&match_session=match-detail',
          vbo_id: '0363010000123461',
          lookup_id: 'adr-candidate-001',
          address_candidate: {
            address_id: '0363010000123461',
            vbo_id: '0363010000123461',
            lookup_id: 'adr-candidate-001',
            reliability: 'candidate',
          },
          candidate_addresses: [],
          fallback_reason_code: null,
        },
      },
    ],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={onBackToResults}
      onBackToSurvey={() => {}}
      onOpenDossier={onOpenDossier}
      onSearchManually={onSearchManually}
    />,
  );

  await user.click(await screen.findByRole('button', { name: 'Open Dossier for house 1' }));

  const housePanel = await screen.findByTestId('house-selection-panel');
  expect(within(housePanel).getByRole('button', { name: 'Search manually' })).toBeInTheDocument();
  expect(within(housePanel).getByRole('button', { name: 'Back to results' })).toBeInTheDocument();
  const candidate = within(housePanel).getByRole('button', { name: 'Choose Nearby address 1 for house 1' });
  candidate.focus();
  await user.keyboard(' ');

  await waitFor(() => {
    expect(onOpenDossier).toHaveBeenCalledWith('#/address/0363010000123461?lookup=adr-candidate-001&match_session=match-detail');
  });
});

it('shows stale result recovery when a selected candidate address becomes stale', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate({
      vbo_id: null,
      address_id: null,
      lookup_id: null,
      address_resolution: 'candidate',
      address_candidate_count: 1,
    })],
    dossierBridgeResponses: [
      {
        body: {
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
          candidate_addresses: [{
            candidate_id: 'cand_bldg_nh_amsterdam_ijburg_001_001',
            address_id: '0363010000123461',
            vbo_id: '0363010000123461',
            lookup_id: 'adr-candidate-001',
            display_label_key: 'matchFirst.neighborhood.nearbyAddressCandidate',
            display_params: { index: '1' },
            reliability: 'candidate',
            source_refs: ['seed_match_source'],
            fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
          }],
          fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
        },
      },
      { status: 409, body: { detail: 'match.results.stale' } },
    ],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={() => true}
    />,
  );

  await user.click(await screen.findByRole('button', { name: 'Open Dossier for house 1' }));
  await user.click(await screen.findByRole('button', { name: 'Choose Nearby address 1 for house 1' }));

  expect(await screen.findByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
  expect(screen.queryByText('No reliable house candidate is available yet.')).not.toBeInTheDocument();
});

it('keeps manual search and back recovery when the bridge requires manual address entry', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  const onBackToResults = vi.fn();
  const onSearchManually = vi.fn();
  mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate({
      vbo_id: null,
      address_id: null,
      lookup_id: null,
      address_resolution: 'manual_required',
      address_candidate_count: 0,
    })],
    dossierBridgeStatus: 'manual_required',
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={onBackToResults}
      onBackToSurvey={() => {}}
      onOpenDossier={() => true}
      onSearchManually={onSearchManually}
    />,
  );

  await user.click(await screen.findByRole('button', { name: 'Open Dossier for house 1' }));

  const housePanel = await screen.findByTestId('house-selection-panel');
  expect(housePanel).toHaveTextContent('Choose an address manually to open the Dossier.');
  await user.click(within(housePanel).getByRole('button', { name: 'Search manually' }));
  expect(onSearchManually).toHaveBeenCalledTimes(1);
  await user.click(within(housePanel).getByRole('button', { name: 'Back to results' }));
  expect(onBackToResults).toHaveBeenCalledTimes(1);
});

it('shows recovery and skips Dossier-open analytics when App rejects a resolved bridge route', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate()],
    dossierBridgeRoute: '#/match/session/match-detail/results',
  });
  const onOpenDossier = vi.fn(() => false);
  const onBackToResults = vi.fn();
  const onSearchManually = vi.fn();

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={onBackToResults}
      onBackToSurvey={() => {}}
      onOpenDossier={onOpenDossier}
      onSearchManually={onSearchManually}
    />,
  );

  await user.click(await screen.findByRole('button', { name: 'Open Dossier for house 1' }));

  const housePanel = await screen.findByTestId('house-selection-panel');
  expect(housePanel).toHaveTextContent('No reliable house candidate is available yet.');
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('match_dossier_opened');
  await user.click(within(housePanel).getByRole('button', { name: 'Search manually' }));
  expect(onSearchManually).toHaveBeenCalledTimes(1);
  await user.click(within(housePanel).getByRole('button', { name: 'Back to results' }));
  expect(onBackToResults).toHaveBeenCalledTimes(1);
});

it('keeps Phase 7 house-selection controls at mobile touch target size', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/components/match-first/NeighborhoodDetail.css'),
    'utf8',
  );

  expect(css).toMatch(/\.house-selection__list button\s*\{[\s\S]*min-height:\s*44px/);
  expect(css).toMatch(/\.house-selection__candidate-list button\s*\{[\s\S]*min-height:\s*44px/);
  expect(css).toMatch(/\.house-selection__candidate-list button:focus-visible\s*\{/);
  expect(css).toMatch(/\.house-selection__actions button\s*\{[\s\S]*min-height:\s*44px/);
  expect(css).toMatch(/\.house-selection__actions button:focus-visible\s*\{/);
});

it('keeps candidate address production copy behind translation keys', () => {
  const panelSource = readFileSync(
    resolve(process.cwd(), 'src/components/match-first/HouseSelectionPanel.tsx'),
    'utf8',
  );
  const detailSource = readFileSync(
    resolve(process.cwd(), 'src/components/match-first/NeighborhoodDetail.tsx'),
    'utf8',
  );

  expect(panelSource).not.toContain('Nearby address');
  expect(panelSource).not.toContain('Choose an address');
  expect(detailSource).not.toContain('Nearby address');
  expect(detailSource).not.toContain('Choose an address');
});

it('keeps the selected-neighborhood detail in place when a house has no reliable Dossier address', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  const fetchSpy = mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate({
      vbo_id: null,
      address_id: null,
      lookup_id: null,
      address_resolution: 'candidate',
      address_candidate_count: 0,
    })],
    dossierBridgeStatus: 'unavailable',
  });
  const onOpenDossier = vi.fn();
  const onBackToResults = vi.fn();
  const onSearchManually = vi.fn();

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={onBackToResults}
      onBackToSurvey={() => {}}
      onOpenDossier={onOpenDossier}
      onSearchManually={onSearchManually}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-building-requested', 'true');
  });
  await user.click(await screen.findByRole('button', { name: 'Open Dossier for house 1' }));

  const housePanel = await screen.findByTestId('house-selection-panel');
  expect(housePanel).toHaveTextContent('No reliable house candidate is available yet.');
  await user.click(within(housePanel).getByRole('button', { name: 'Search manually' }));
  expect(onSearchManually).toHaveBeenCalledTimes(1);
  await user.click(within(housePanel).getByRole('button', { name: 'Back to results' }));
  expect(onBackToResults).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-neighborhood-id', 'nh_amsterdam_ijburg');
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/dossier/from-building'))).toBe(true);
  expect(onOpenDossier).not.toHaveBeenCalled();
});

it('shows stale result recovery when the Dossier bridge rejects stale context', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate()],
    dossierBridgeError: 'match.results.stale',
    dossierBridgeStatusCode: 409,
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={() => {}}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-building-requested', 'true');
  });
  await user.click(await screen.findByRole('button', { name: 'Open Dossier for house 1' }));

  expect(await screen.findByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
  expect(screen.queryByText('No reliable house candidate is available yet.')).not.toBeInTheDocument();
});

it('shows an empty unavailable state without building requests when the neighborhood is absent from completed results', async () => {
  const fetchSpy = mockNeighborhoodDetailFetches(resultsResponse({
    ranked_results: [],
    recommendations: [],
    normal_recommendation_count: 0,
    near_misses: [],
  }));

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_missing"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/buildings'))).toBe(false);
});
