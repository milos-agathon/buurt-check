import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import type { ReactElement } from 'react';
import L from 'leaflet';
import App from '../App';
import ResultsMap from '../components/match-first/ResultsMap';
import {
  getMatchResultsMapStateStorageKey,
  saveMatchSessionSnapshot,
} from '../services/matchSessionStorage';
import { setupTestI18n } from './helpers';
import type {
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
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/api/match/results-basemap')) {
      return new Response(JSON.stringify(basemapConfig()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/api/match/analytics')) {
      return new Response(JSON.stringify({ accepted: true, duplicate: false }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ detail: 'unexpected' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  });
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
      bounds_rd: [125800, 486300, 126700, 487200],
      display_centroid_wgs84: { lat: 52.355, lng: 5.0 },
      display_bounds_wgs84: [4.96, 52.33, 5.04, 52.38],
      boundary_ref: `boundary_${neighborhoodId}`,
    },
    ...overrides,
  };
}

function resultsResponse(overrides: Partial<MatchResultsResponse> = {}): MatchResultsResponse {
  const rankedResults = overrides.ranked_results ?? [
    recommendation(),
    recommendation({
      rank: 2,
      recommendation_id: 'rec_2',
      neighborhood_id: 'nh_utrecht_leidsche_rijn',
      name: 'Leidsche Rijn',
      municipality: 'Utrecht',
      fit_score: 79,
      geometry_ref: {
        centroid_rd: { x: 132900, y: 456200 },
        bounds_rd: [131900, 455200, 133900, 457200],
        display_centroid_wgs84: { lat: 52.1, lng: 5.03 },
        display_bounds_wgs84: [4.99, 52.07, 5.07, 52.13],
        boundary_ref: 'boundary_nh_utrecht_leidsche_rijn',
      },
    }),
  ];
  return {
    session_id: 'match-results',
    job_id: 'match_job_results',
    result_set_id: 'mrs_results',
    preference_vector_version: 'pv_v1_results',
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

function basemapConfig(overrides: Record<string, unknown> = {}) {
  return {
    source_id: 'pdok_brt_achtergrondkaart',
    source_name: 'PDOK BRT Achtergrondkaart',
    service_type: 'wmts_raster',
    theme: 'standaard',
    tile_matrix_set: 'EPSG:3857',
    tile_url_template: 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png',
    attribution: 'PDOK / Kadaster / BRT Achtergrondkaart (standaard WMTS)',
    min_zoom: 0,
    max_zoom: 19,
    ...overrides,
  };
}

function mockBasemapFetch(config = basemapConfig()) {
  return vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
    if (String(input).endsWith('/api/match/results-basemap')) {
      return new Response(JSON.stringify(config), {
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

it('fetches a backend-configured PDOK BRT basemap for the Leaflet results map', async () => {
  const fetchSpy = mockBasemapFetch();

  renderWithI18n(
    <ResultsMap
      sessionId="match-results"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
    />,
  );

  await waitFor(() => {
    expect(fetchSpy).toHaveBeenCalledWith('/api/match/results-basemap', expect.objectContaining({
      credentials: 'include',
    }));
  });
  expect(await screen.findByText('PDOK / Kadaster / BRT Achtergrondkaart (standaard WMTS)')).toBeInTheDocument();
});

it('rejects OSM, Mapbox, and Google basemap configuration in the results map', async () => {
  mockBasemapFetch();

  renderWithI18n(
    <ResultsMap
      sessionId="match-results"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
    />,
  );

  const attribution = await screen.findByText('PDOK / Kadaster / BRT Achtergrondkaart (standaard WMTS)');
  expect(attribution).not.toHaveTextContent(/openstreetmap|mapbox|google/i);
});

it('records PDOK tile failures while leaving the recommendation list usable', async () => {
  mockBasemapFetch();
  const tileErrorHandlers: Array<() => void> = [];
  const tileLayer = {
    addTo: vi.fn(() => tileLayer),
    remove: vi.fn(),
    on: vi.fn((eventName: string, handler: () => void) => {
      if (eventName === 'tileerror') tileErrorHandlers.push(handler);
      return tileLayer;
    }),
  };
  vi.spyOn(L, 'tileLayer').mockReturnValue(tileLayer as unknown as L.TileLayer);

  renderWithI18n(
    <ResultsMap
      sessionId="match-results"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
    />,
  );

  await waitFor(() => expect(tileErrorHandlers).toHaveLength(1));
  act(() => tileErrorHandlers[0]());

  expect(await screen.findByText('The official PDOK/BRT map layer did not load. You can still use the recommendation list.')).toBeInTheDocument();
  expect(screen.getByTestId('recommendation-card-rec_1')).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('buurt-check-match-first-analytics') ?? '[]')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event_name: 'match_map_layer_failed',
        context: expect.objectContaining({
          reason: 'pdok_brt_tile_failed',
          source: 'results',
        }),
      }),
    ]),
  );
});

it('loads completed session results on the results route without rerunning matching', async () => {
  const sessionId = 'match-route-results';
  saveMatchSessionSnapshot(sessionId, {
    sessionId,
    locale: 'en',
    step: 11,
    answerVersion: 11,
    staleResults: false,
    answers: { intent: 'buy' },
  });
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith(`/api/match/sessions/${sessionId}/results`) && method === 'GET') {
      return new Response(JSON.stringify(resultsResponse({ session_id: sessionId })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ detail: 'unexpected' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  window.location.hash = `#/match/session/${sessionId}/results`;
  renderWithI18n(<App />);

  expect(await screen.findByRole('heading', { name: 'Your match map' }, { timeout: 5000 })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Netherlands recommendations map' })).toHaveAttribute('data-map-center', '52.2,5.3');
  expect(screen.getByTestId('recommendation-card-rec_1')).toBeInTheDocument();
  expect(fetchSpy).toHaveBeenCalledWith(`/api/match/sessions/${sessionId}/results`, expect.objectContaining({
    credentials: 'include',
  }));
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/run'))).toBe(false);
});

it('restores saved map view when a completed results route fetches its result set', async () => {
  const sessionId = 'match-route-restored-results';
  saveMatchSessionSnapshot(sessionId, {
    sessionId,
    locale: 'en',
    step: 11,
    answerVersion: 11,
    staleResults: false,
    answers: { intent: 'buy' },
  });
  sessionStorage.setItem(getMatchResultsMapStateStorageKey(sessionId), JSON.stringify({
    sessionId,
    jobId: 'match_job_results',
    resultSetId: 'mrs_results',
    preferenceVectorVersion: 'pv_v1_results',
    selectedRecommendationId: 'rec_2',
    selectedNeighborhoodId: 'nh_utrecht_leidsche_rijn',
    selectedResultRank: 2,
    mapCenter: [52.1, 5.03],
    mapZoom: 12,
    listScroll: 280,
    mobileMode: 'list',
    locale: 'en',
  }));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith(`/api/match/sessions/${sessionId}/results`) && method === 'GET') {
      return new Response(JSON.stringify(resultsResponse({ session_id: sessionId })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ detail: 'unexpected' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  window.location.hash = `#/match/session/${sessionId}/results`;
  renderWithI18n(<App />);

  const map = await screen.findByRole('region', { name: 'Netherlands recommendations map' });
  expect(map).toHaveAttribute('data-map-center', '52.1,5.03');
  expect(map).toHaveAttribute('data-map-zoom', '12');
  expect(screen.getByTestId('results-map-shell')).toHaveAttribute('data-mobile-mode', 'list');
  expect(screen.getByTestId('recommendation-card-rec_2')).toHaveAttribute('aria-current', 'true');
});

it('ignores stale saved map view when verified in-memory results use a different result set', async () => {
  const sessionId = 'match-rerun-results';
  sessionStorage.setItem(getMatchResultsMapStateStorageKey(sessionId), JSON.stringify({
    sessionId,
    jobId: 'match_job_old',
    resultSetId: 'mrs_old',
    preferenceVectorVersion: 'pv_v1_old',
    selectedRecommendationId: 'rec_2',
    selectedNeighborhoodId: 'nh_utrecht_leidsche_rijn',
    selectedResultRank: 2,
    mapCenter: [52.1, 5.03],
    mapZoom: 12,
    listScroll: 280,
    mobileMode: 'list',
    locale: 'en',
  }));

  renderWithI18n(
    <ResultsMap
      sessionId={sessionId}
      initialResults={resultsResponse({
        session_id: sessionId,
        job_id: 'match_job_new',
        result_set_id: 'mrs_new',
        preference_vector_version: 'pv_v1_new',
      })}
      onBackToSurvey={() => {}}
    />,
  );

  expect(screen.getByRole('region', { name: 'Netherlands recommendations map' })).toHaveAttribute('data-map-center', '52.2,5.3');
  expect(screen.getByRole('region', { name: 'Netherlands recommendations map' })).toHaveAttribute('data-map-zoom', '7');
  expect(screen.getByTestId('results-map-shell')).toHaveAttribute('data-mobile-mode', 'map');
  expect(screen.getByTestId('recommendation-card-rec_2')).not.toHaveAttribute('aria-current');
  expect(await screen.findByText('PDOK / Kadaster / BRT Achtergrondkaart (standaard WMTS)')).toBeInTheDocument();
});

it('keeps ranked list selection and map feature selection synchronized', async () => {
  const user = userEvent.setup();
  renderWithI18n(
    <ResultsMap
      sessionId="match-results"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
    />,
  );

  await user.click(within(screen.getByTestId('recommendation-card-rec_2')).getByRole('button', { name: /Leidsche Rijn/ }));

  const utrechtCard = screen.getByTestId('recommendation-card-rec_2');
  expect(utrechtCard).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('region', { name: 'Netherlands recommendations map' })).toHaveAttribute('data-selected-neighborhood', 'nh_utrecht_leidsche_rijn');
  expect(screen.getByRole('button', { name: 'Show Leidsche Rijn on map' })).toHaveAttribute('aria-pressed', 'true');

  await user.click(screen.getByRole('button', { name: 'Show IJburg on map' }));

  expect(screen.getByTestId('recommendation-card-rec_1')).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('region', { name: 'Netherlands recommendations map' })).toHaveAttribute('data-selected-neighborhood', 'nh_amsterdam_ijburg');
});

it('renders numbered recommendation markers inside Leaflet so they stay projected during pan and zoom', async () => {
  renderWithI18n(
    <ResultsMap
      sessionId="match-results"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
    />,
  );

  const ijburgMarker = await screen.findByRole('button', { name: 'Show IJburg on map' });

  expect(ijburgMarker.closest('.leaflet-marker-pane')).not.toBeNull();
});

it('invalidates the Leaflet size after rendering so PDOK tiles fill the map panel', async () => {
  const invalidateSize = vi.spyOn(L.Map.prototype, 'invalidateSize');

  renderWithI18n(
    <ResultsMap
      sessionId="match-results"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
    />,
  );

  await waitFor(() => {
    expect(invalidateSize).toHaveBeenCalled();
  });
});

it('records neighborhood detail clicks as recommendation selection before opening detail', async () => {
  const user = userEvent.setup();
  const onOpenNeighborhood = vi.fn();
  renderWithI18n(
    <ResultsMap
      sessionId="match-results"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
      onOpenNeighborhood={onOpenNeighborhood}
    />,
  );

  await user.click(within(screen.getByTestId('recommendation-card-rec_1')).getByRole('button', { name: 'View neighborhood' }));

  expect(onOpenNeighborhood).toHaveBeenCalledWith(expect.objectContaining({
    recommendation_id: 'rec_1',
  }));
  expect(JSON.parse(localStorage.getItem('buurt-check-match-first-analytics') ?? '[]')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event_name: 'match_recommendation_selected',
        context: expect.objectContaining({
          recommendation_id: 'rec_1',
          neighborhood_id: 'nh_amsterdam_ijburg',
          result_rank: 1,
        }),
      }),
    ]),
  );
});

it('shows a map popup with the neighborhood detail CTA when a numbered marker is clicked', async () => {
  const user = userEvent.setup();
  const onOpenNeighborhood = vi.fn();
  renderWithI18n(
    <ResultsMap
      sessionId="match-results"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
      onOpenNeighborhood={onOpenNeighborhood}
    />,
  );

  await user.click(await screen.findByRole('button', { name: 'Show IJburg on map' }));

  const popup = screen.getByRole('dialog', { name: 'IJburg' });
  expect(within(popup).getByText('Amsterdam')).toBeInTheDocument();

  await user.click(within(popup).getByRole('button', { name: 'View neighborhood' }));

  expect(onOpenNeighborhood).toHaveBeenCalledWith(expect.objectContaining({
    recommendation_id: 'rec_1',
    neighborhood_id: 'nh_amsterdam_ijburg',
  }));
});

it('places a marker popup below the marker when an above placement would clip on mobile', async () => {
  const user = userEvent.setup();
  const onOpenNeighborhood = vi.fn();
  const latLngSpy = vi.spyOn(L.Map.prototype, 'latLngToContainerPoint').mockReturnValue({
    x: 24,
    y: 18,
  } as L.Point);
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return this.classList.contains('results-map__leaflet') ? 320 : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return this.classList.contains('results-map__leaflet') ? 220 : 0;
    },
  });

  try {
    renderWithI18n(
      <ResultsMap
        sessionId="match-results"
        initialResults={resultsResponse()}
        onBackToSurvey={() => {}}
        onOpenNeighborhood={onOpenNeighborhood}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Show IJburg on map' }));

    const popup = screen.getByRole('dialog', { name: 'IJburg' });
    expect(popup).toHaveAttribute('data-placement', 'below');
    expect(popup).toHaveStyle({ left: '118px', top: '18px' });
    expect(latLngSpy).toHaveBeenCalled();
  } finally {
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
    }
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
    }
  }
});

it('reveals the matching list card when a map feature is selected', async () => {
  const user = userEvent.setup();
  const scrollIntoView = vi.fn();
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });

  try {
    renderWithI18n(
      <ResultsMap
        sessionId="match-results"
        initialResults={resultsResponse()}
        onBackToSurvey={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Show Leidsche Rijn on map' }));

    expect(screen.getByTestId('recommendation-card-rec_2')).toHaveAttribute('aria-current', 'true');
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
  } finally {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    });
  }
});

it('persists mobile map/list mode and selected map state for later Dossier return', async () => {
  const user = userEvent.setup();
  renderWithI18n(
    <ResultsMap
      sessionId="match-results"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
    />,
  );

  await user.click(screen.getByRole('button', { name: 'List' }));
  expect(screen.getByTestId('results-map-shell')).toHaveAttribute('data-mobile-mode', 'list');

  await user.click(within(screen.getByTestId('recommendation-card-rec_2')).getByRole('button', { name: /Leidsche Rijn/ }));

  const stored = JSON.parse(
    sessionStorage.getItem(getMatchResultsMapStateStorageKey('match-results')) ?? '{}',
  ) as Record<string, unknown>;
  expect(stored).toMatchObject({
    sessionId: 'match-results',
    resultSetId: 'mrs_results',
    selectedRecommendationId: 'rec_2',
    selectedNeighborhoodId: 'nh_utrecht_leidsche_rijn',
    selectedResultRank: 2,
    mobileMode: 'list',
    mapCenter: [52.1, 5.03],
    mapZoom: 12,
  });
});

it('persists list scroll position when the user scrolls the recommendation list', async () => {
  renderWithI18n(
    <ResultsMap
      sessionId="match-results"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
    />,
  );
  expect(await screen.findByText('PDOK / Kadaster / BRT Achtergrondkaart (standaard WMTS)')).toBeInTheDocument();

  const list = screen.getByRole('list', { name: 'Recommended neighborhoods' });
  list.scrollTop = 144;
  fireEvent.scroll(list);

  const stored = JSON.parse(
    sessionStorage.getItem(getMatchResultsMapStateStorageKey('match-results')) ?? '{}',
  ) as Record<string, unknown>;
  expect(stored).toMatchObject({
    sessionId: 'match-results',
    resultSetId: 'mrs_results',
    listScroll: 144,
  });
});

it('shows a no-strong-match state while keeping possible recommendations usable from the list', async () => {
  const user = userEvent.setup();
  renderWithI18n(
    <ResultsMap
      sessionId="match-results"
      initialResults={resultsResponse({
        status: 'completed_no_strong_matches',
        normal_recommendation_count: 0,
        ranked_results: [],
        recommendations: [],
        near_misses: [
          recommendation({
            rank: 1,
            recommendation_id: 'near_1',
            neighborhood_id: 'nh_delft_hof_van_delft',
            name: 'Hof van Delft',
            municipality: 'Delft',
            fit_score: 58,
            confidence: { score: 48, level: 'low', reasons: ['match.results.confidence.incomplete_feature_coverage'] },
          }),
        ],
        empty_state_code: 'match.empty.no_strong_matches',
      })}
      onBackToSurvey={() => {}}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('We found a few possible matches');
  expect(screen.queryByText(/perfect/i)).not.toBeInTheDocument();

  const list = screen.getByRole('list', { name: 'Recommended neighborhoods' });
  await user.click(within(list).getByRole('button', { name: /Hof van Delft/ }));

  expect(screen.getByTestId('recommendation-card-near_1')).toHaveAttribute('aria-current', 'true');
});
