import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { I18nextProvider } from 'react-i18next';
import type { ReactElement } from 'react';
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

it('selects a reliable house candidate locally without opening the Dossier bridge', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  const building = buildingCandidate();
  const fetchSpy = mockNeighborhoodDetailFetches(results, {
    buildings: [building],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  const selectHouseButton = await screen.findByRole('button', { name: 'Select house' });
  await user.click(selectHouseButton);

  await waitFor(() => {
    expect(screen.getByText('House selected')).toBeInTheDocument();
  });
  expect(screen.getByText('Address dossier opening comes in the next step.')).toBeInTheDocument();
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/run'))).toBe(false);
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/dossier/from-building'))).toBe(false);
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

it('keeps the selected-neighborhood detail usable when no reliable house candidate exists', async () => {
  const results = resultsResponse();
  const fetchSpy = mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate({
      vbo_id: null,
      address_id: null,
      lookup_id: null,
      address_resolution: 'unavailable',
      address_candidate_count: 0,
    })],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-building-requested', 'true');
  });
  expect(await screen.findByTestId('house-selection-panel')).toHaveTextContent('No reliable house candidate is available yet.');
  expect(screen.queryByRole('button', { name: 'Select house' })).not.toBeInTheDocument();
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/dossier/from-building'))).toBe(false);
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
