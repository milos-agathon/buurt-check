import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getMatchResults, getMatchResultsBasemapConfig } from '../../services/matchFirstApi';
import { recordMatchFirstEvent } from '../../services/matchFirstAnalytics';
import {
  readMatchResultsMapState,
  saveMatchResultsMapState,
} from '../../services/matchSessionStorage';
import type {
  MatchFirstLocale,
  MatchNeighborhoodRecommendation,
  MatchResultsBasemapConfig,
  MatchResultsMapState,
  MatchResultsResponse,
} from '../../types/matchFirst';
import './MatchFirstLanding.css';
import './ResultsMap.css';
import RecommendationList from './RecommendationList';

interface ResultsMapProps {
  sessionId: string;
  initialResults?: MatchResultsResponse | null;
  onBackToSurvey: () => void;
  onOpenNeighborhood?: (recommendation: MatchNeighborhoodRecommendation) => void;
  onReturnHydrated?: () => void;
  onReturnHydrationFailed?: (reason: string) => void;
}

type MobileMode = 'map' | 'list';
type SelectionSource = 'list' | 'map';
type MapPopupPlacement = 'above' | 'below';

const NETHERLANDS_CENTER: [number, number] = [52.2, 5.3];
const NETHERLANDS_BOUNDS: [number, number, number, number] = [3.2, 50.7, 7.3, 53.6];
const NATIONAL_ZOOM = 7;
const SELECTED_ZOOM = 12;
const POPUP_HORIZONTAL_CLEARANCE = 118;
const POPUP_ABOVE_TOP_CLEARANCE = 132;
const POPUP_ABOVE_BOTTOM_CLEARANCE = 96;
const APPROVED_BASEMAP_THEMES = new Set(['standaard', 'grijs', 'pastel']);
const APPROVED_PDOK_BRT_WMTS_PREFIX = 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/';
const BLOCKED_BASEMAP_PROVIDERS = ['openstreetmap', 'mapbox', 'google'];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readCenter(value: MatchResultsResponse['map_center'] | undefined): [number, number] {
  return value && isFiniteNumber(value.lat) && isFiniteNumber(value.lng)
    ? [value.lat, value.lng]
    : NETHERLANDS_CENTER;
}

function readBounds(results: MatchResultsResponse | null): [number, number, number, number] {
  const candidate = results?.bbox ?? results?.map.display_bounds_wgs84;
  if (
    Array.isArray(candidate)
    && candidate.length === 4
    && candidate.every(isFiniteNumber)
  ) {
    return [candidate[0], candidate[1], candidate[2], candidate[3]];
  }
  return NETHERLANDS_BOUNDS;
}

function recommendationCenter(recommendation: MatchNeighborhoodRecommendation): [number, number] {
  const centroid = recommendation.geometry_ref.display_centroid_wgs84;
  return centroid && isFiniteNumber(centroid.lat) && isFiniteNumber(centroid.lng)
    ? [centroid.lat, centroid.lng]
    : NETHERLANDS_CENTER;
}

function recommendationBounds(recommendation: MatchNeighborhoodRecommendation): [number, number, number, number] | null {
  const bounds = recommendation.geometry_ref.display_bounds_wgs84;
  if (
    Array.isArray(bounds)
    && bounds.length === 4
    && bounds.every(isFiniteNumber)
  ) {
    return [bounds[0], bounds[1], bounds[2], bounds[3]];
  }
  return null;
}

function visibleRecommendations(results: MatchResultsResponse): MatchNeighborhoodRecommendation[] {
  const rankedResults = Array.isArray(results.ranked_results) ? results.ranked_results : [];
  if (rankedResults.length > 0) return rankedResults;
  const nearMisses = Array.isArray(results.near_misses) ? results.near_misses : [];
  const stretchMatches = Array.isArray(results.stretch_matches) ? results.stretch_matches : [];
  return [...nearMisses, ...stretchMatches];
}

function hasNoStrongMatches(results: MatchResultsResponse): boolean {
  return results.status === 'completed_no_strong_matches'
    || results.empty_state_code === 'match.empty.no_strong_matches'
    || (results.normal_recommendation_count === 0 && visibleRecommendations(results).length > 0);
}

function isUsableMatchResults(value: MatchResultsResponse): boolean {
  return typeof value.session_id === 'string'
    && typeof value.job_id === 'string'
    && typeof value.result_set_id === 'string'
    && Array.isArray(value.ranked_results)
    && Array.isArray(value.near_misses)
    && Array.isArray(value.stretch_matches);
}

function isApprovedBasemapConfig(config: MatchResultsBasemapConfig): boolean {
  const tileUrl = config.tile_url_template.toLowerCase();
  return config.source_id === 'pdok_brt_achtergrondkaart'
    && config.service_type === 'wmts_raster'
    && config.tile_matrix_set === 'EPSG:3857'
    && APPROVED_BASEMAP_THEMES.has(config.theme)
    && tileUrl.startsWith(APPROVED_PDOK_BRT_WMTS_PREFIX)
    && tileUrl.includes('/epsg:3857/')
    && tileUrl.includes('{z}')
    && tileUrl.includes('{x}')
    && tileUrl.includes('{y}')
    && !BLOCKED_BASEMAP_PROVIDERS.some((provider) => tileUrl.includes(provider));
}

function createMapState(
  results: MatchResultsResponse,
  recommendation: MatchNeighborhoodRecommendation | undefined,
  center: [number, number],
  zoom: number,
  listScroll: number,
  mobileMode: MobileMode,
  locale: MatchFirstLocale,
): MatchResultsMapState {
  return {
    sessionId: results.session_id,
    jobId: results.job_id,
    resultSetId: results.result_set_id,
    preferenceVectorVersion: results.preference_vector_version,
    selectedRecommendationId: recommendation?.recommendation_id,
    selectedNeighborhoodId: recommendation?.neighborhood_id,
    selectedResultRank: recommendation?.rank,
    mapCenter: center,
    mapZoom: zoom,
    listScroll,
    mobileMode,
    locale,
  };
}

function restoredStateMatchesResults(
  state: MatchResultsMapState | null,
  results: MatchResultsResponse,
): state is MatchResultsMapState {
  return state?.resultSetId === results.result_set_id
    && state.preferenceVectorVersion === results.preference_vector_version;
}

export default function ResultsMap({
  sessionId,
  initialResults = null,
  onBackToSurvey,
  onOpenNeighborhood,
  onReturnHydrated,
  onReturnHydrationFailed,
}: ResultsMapProps) {
  const { t, i18n } = useTranslation();
  const reducedMotion = Boolean(useReducedMotion());
  const [fetchedResults, setFetchedResults] = useState<MatchResultsResponse | null>(null);
  const [loading, setLoading] = useState(!initialResults);
  const [unavailable, setUnavailable] = useState(false);
  const [basemapConfig, setBasemapConfig] = useState<MatchResultsBasemapConfig | null>(null);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const restoredMapState = useMemo(() => readMatchResultsMapState(sessionId), [sessionId]);
  const initialRestoredMapState = useMemo(() => (
    initialResults && restoredStateMatchesResults(restoredMapState, initialResults)
      ? restoredMapState
      : null
  ), [initialResults, restoredMapState]);
  const startingMapState = initialResults ? initialRestoredMapState : restoredMapState;
  const restoredMapStateRef = useRef<MatchResultsMapState | null>(restoredMapState);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | undefined>(() => (
    startingMapState?.selectedRecommendationId
  ));
  const [mapPopupRecommendationId, setMapPopupRecommendationId] = useState<string | undefined>();
  const [mapPopupPosition, setMapPopupPosition] = useState<{ x: number; y: number; placement: MapPopupPlacement } | null>(null);
  const mobileMode: MobileMode = 'map';
  const [mapCenter, setMapCenter] = useState<[number, number]>(() => (
    startingMapState?.mapCenter ?? readCenter(initialResults?.map_center)
  ));
  const [mapZoom, setMapZoom] = useState<number>(() => (
    startingMapState?.mapZoom ?? NATIONAL_ZOOM
  ));
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletBasemapRef = useRef<L.TileLayer | null>(null);
  const leafletLayerRef = useRef<L.LayerGroup | null>(null);
  const mapResizeFrameRef = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const recordedMapOpenRef = useRef(false);
  const returnHydratedEventRef = useRef(false);
  const returnFailedEventRef = useRef(false);
  const basemapFailureEventRef = useRef(false);
  const lastSelectionSourceRef = useRef<SelectionSource | null>(null);
  const locale: MatchFirstLocale = i18n.resolvedLanguage?.startsWith('nl') ? 'nl' : 'en';
  const results = initialResults ?? fetchedResults;

  const refreshLeafletSize = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    if (mapResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(mapResizeFrameRef.current);
    }
    mapResizeFrameRef.current = window.requestAnimationFrame(() => {
      mapResizeFrameRef.current = null;
      map.invalidateSize({ animate: false, pan: false });
    });
  }, []);

  const recordBasemapFailure = useCallback((reason: string) => {
    if (basemapFailureEventRef.current) return;
    basemapFailureEventRef.current = true;
    recordMatchFirstEvent('match_map_layer_failed', {
      locale,
      source: 'results',
      session_id: results?.session_id ?? sessionId,
      result_set_id: results?.result_set_id,
      reason,
    });
  }, [locale, results, sessionId]);

  useEffect(() => {
    if (initialResults) return;

    let cancelled = false;
    void getMatchResults(sessionId)
      .then((response) => {
        if (cancelled) return;
        if (!isUsableMatchResults(response)) {
          setUnavailable(true);
          if (!returnFailedEventRef.current) {
            returnFailedEventRef.current = true;
            onReturnHydrationFailed?.('match.results.unavailable');
          }
          return;
        }
        setFetchedResults(response);
        const restoredState = restoredMapStateRef.current;
        if (restoredStateMatchesResults(restoredState, response)) {
          setSelectedRecommendationId(restoredState.selectedRecommendationId);
          setMapCenter(restoredState.mapCenter);
          setMapZoom(restoredState.mapZoom);
        } else {
          setSelectedRecommendationId(undefined);
          setMapCenter(readCenter(response.map_center));
          setMapZoom(NATIONAL_ZOOM);
        }
        setUnavailable(false);
      })
      .catch(() => {
        if (!cancelled) {
          setUnavailable(true);
          if (!returnFailedEventRef.current) {
            returnFailedEventRef.current = true;
            onReturnHydrationFailed?.('match.results.unavailable');
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialResults, onReturnHydrationFailed, sessionId]);

  useEffect(() => {
    if (!results) return;
    let cancelled = false;
    void getMatchResultsBasemapConfig()
      .then((config) => {
        if (cancelled) return;
        if (!isApprovedBasemapConfig(config)) {
          setBasemapFailed(true);
          recordBasemapFailure('pdok_brt_config_rejected');
          return;
        }
        setBasemapConfig(config);
        setBasemapFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          setBasemapFailed(true);
          recordBasemapFailure('pdok_brt_config_failed');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [recordBasemapFailure, results]);

  const recommendations = useMemo(() => (
    results ? visibleRecommendations(results) : []
  ), [results]);
  const selectedRecommendation = recommendations.find((item) => item.recommendation_id === selectedRecommendationId);
  const mapPopupRecommendation = recommendations.find((item) => item.recommendation_id === mapPopupRecommendationId);
  const mapBounds = useMemo(() => readBounds(results), [results]);
  const listScrollRestoredRef = useRef(false);

  const persistMapState = useCallback((listScroll = listRef.current?.scrollTop ?? 0) => {
    if (!results) return;
    saveMatchResultsMapState(
      sessionId,
      createMapState(
        results,
        selectedRecommendation,
        mapCenter,
        mapZoom,
        listScroll,
        mobileMode,
        locale,
      ),
    );
  }, [locale, mapCenter, mapZoom, mobileMode, results, selectedRecommendation, sessionId]);

  useEffect(() => {
    if (!results || returnHydratedEventRef.current) return;
    returnHydratedEventRef.current = true;
    onReturnHydrated?.();
  }, [onReturnHydrated, results]);

  useEffect(() => {
    if (!results || recordedMapOpenRef.current) return;
    recordedMapOpenRef.current = true;
    recordMatchFirstEvent('match_results_map_opened', {
      locale,
      source: 'results',
      session_id: results.session_id,
      job_id: results.job_id,
      result_set_id: results.result_set_id,
      status: results.status,
    });
    const confidentRecommendation = recommendations.find((recommendation) => recommendation.confidence.score >= 50);
    if (confidentRecommendation) {
      recordMatchFirstEvent('match_results_confidence_sufficient', {
        locale,
        source: 'results',
        session_id: results.session_id,
        result_set_id: results.result_set_id,
        recommendation_id: confidentRecommendation.recommendation_id,
        neighborhood_id: confidentRecommendation.neighborhood_id,
        confidence_level: confidentRecommendation.confidence.level,
        confidence_score: confidentRecommendation.confidence.score,
      });
    }
  }, [locale, recommendations, results]);

  useEffect(() => {
    if (!results) return;
    const restoredState = restoredMapStateRef.current;
    if (
      !listScrollRestoredRef.current
      && listRef.current
      && restoredStateMatchesResults(restoredState, results)
    ) {
      listScrollRestoredRef.current = true;
      listRef.current.scrollTop = restoredState.listScroll;
    }
    persistMapState(listRef.current?.scrollTop ?? 0);
  }, [persistMapState, results]);

  const handleListScroll = useCallback((event: UIEvent<HTMLOListElement>) => {
    persistMapState(event.currentTarget.scrollTop);
  }, [persistMapState]);

  const updateMapPopupPosition = useCallback((recommendation: MatchNeighborhoodRecommendation) => {
    const map = leafletMapRef.current;
    const element = mapElementRef.current;
    if (!map || !element) {
      setMapPopupPosition(null);
      return;
    }
    const [lat, lng] = recommendationCenter(recommendation);
    const point = map.latLngToContainerPoint([lat, lng]);
    const bounds = element.getBoundingClientRect();
    const width = element.clientWidth || bounds.width;
    const height = element.clientHeight || bounds.height;
    const x = width > 0
      ? Math.min(
        Math.max(point.x, POPUP_HORIZONTAL_CLEARANCE),
        Math.max(POPUP_HORIZONTAL_CLEARANCE, width - POPUP_HORIZONTAL_CLEARANCE),
      )
      : point.x;
    const placement: MapPopupPlacement = point.y < POPUP_ABOVE_TOP_CLEARANCE ? 'below' : 'above';
    const y = height > 0 && placement === 'above'
      ? Math.min(
        Math.max(point.y, POPUP_ABOVE_TOP_CLEARANCE),
        Math.max(POPUP_ABOVE_TOP_CLEARANCE, height - POPUP_ABOVE_BOTTOM_CLEARANCE),
      )
      : point.y;
    setMapPopupPosition({
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      placement,
    });
  }, []);

  useEffect(() => {
    if (!mapPopupRecommendation) return;
    updateMapPopupPosition(mapPopupRecommendation);
  }, [mapCenter, mapPopupRecommendation, mapZoom, updateMapPopupPosition]);

  useEffect(() => {
    if (lastSelectionSourceRef.current !== 'map' || !selectedRecommendationId) return;
    const selectedItem = listRef.current?.querySelector<HTMLElement>('[data-selected-recommendation="true"]');
    if (typeof selectedItem?.scrollIntoView === 'function') {
      selectedItem.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }
    lastSelectionSourceRef.current = null;
  }, [reducedMotion, selectedRecommendationId]);

  const moveMapToRecommendation = useCallback((recommendation: MatchNeighborhoodRecommendation, source: SelectionSource) => {
    const center = recommendationCenter(recommendation);
    setMapCenter(center);
    setMapZoom(SELECTED_ZOOM);
    const map = leafletMapRef.current;
    if (map) {
      map.setView(center, SELECTED_ZOOM, { animate: source === 'list' && !reducedMotion });
    }
  }, [reducedMotion]);

  const selectRecommendation = useCallback((recommendation: MatchNeighborhoodRecommendation, source: SelectionSource) => {
    const wasAlreadySelected = selectedRecommendationId === recommendation.recommendation_id;
    lastSelectionSourceRef.current = source;
    setMapPopupRecommendationId(source === 'map' ? recommendation.recommendation_id : undefined);
    setSelectedRecommendationId(recommendation.recommendation_id);
    moveMapToRecommendation(recommendation, source);
    if (source === 'map') {
      recordMatchFirstEvent('match_map_feature_selected', {
        locale,
        source: 'results',
        session_id: results?.session_id ?? sessionId,
        result_set_id: results?.result_set_id,
        recommendation_id: recommendation.recommendation_id,
        neighborhood_id: recommendation.neighborhood_id,
        result_rank: recommendation.rank,
        map_zoom: SELECTED_ZOOM,
        mobile_mode: mobileMode,
      });
    }
    if (!wasAlreadySelected) {
      recordMatchFirstEvent('match_recommendation_selected', {
        locale,
        source: 'results',
        session_id: results?.session_id ?? sessionId,
        result_set_id: results?.result_set_id,
        recommendation_id: recommendation.recommendation_id,
        neighborhood_id: recommendation.neighborhood_id,
        result_rank: recommendation.rank,
        map_zoom: SELECTED_ZOOM,
        mobile_mode: mobileMode,
      });
    }
  }, [locale, mobileMode, moveMapToRecommendation, results, selectedRecommendationId, sessionId]);

  const openNeighborhoodDetail = useCallback((recommendation: MatchNeighborhoodRecommendation) => {
    if (!results || !onOpenNeighborhood) return;
    const wasAlreadySelected = selectedRecommendationId === recommendation.recommendation_id;
    const center = recommendationCenter(recommendation);
    setSelectedRecommendationId(recommendation.recommendation_id);
    setMapCenter(center);
    setMapZoom(SELECTED_ZOOM);
    leafletMapRef.current?.setView(center, SELECTED_ZOOM, { animate: false });
    saveMatchResultsMapState(
      sessionId,
      createMapState(
        results,
        recommendation,
        center,
        SELECTED_ZOOM,
        listRef.current?.scrollTop ?? 0,
        mobileMode,
        locale,
      ),
    );
    if (!wasAlreadySelected) {
      recordMatchFirstEvent('match_recommendation_selected', {
        locale,
        source: 'results',
        session_id: results.session_id,
        result_set_id: results.result_set_id,
        recommendation_id: recommendation.recommendation_id,
        neighborhood_id: recommendation.neighborhood_id,
        result_rank: recommendation.rank,
        map_zoom: SELECTED_ZOOM,
        mobile_mode: mobileMode,
      });
    }
    onOpenNeighborhood(recommendation);
  }, [locale, mobileMode, onOpenNeighborhood, results, selectedRecommendationId, sessionId]);

  useEffect(() => {
    if (!mapElementRef.current || leafletMapRef.current || !results) return;
    try {
      const restoredMapState = restoredStateMatchesResults(restoredMapStateRef.current, results)
        ? restoredMapStateRef.current
        : null;
      const initialCenter = restoredMapState?.mapCenter ?? readCenter(results.map_center);
      const initialZoom = restoredMapState?.mapZoom ?? NATIONAL_ZOOM;
      const leafletMap = L.map(mapElementRef.current, {
        attributionControl: false,
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: false,
      });
      leafletMap.setMaxBounds([
        [mapBounds[1], mapBounds[0]],
        [mapBounds[3], mapBounds[2]],
      ]);
      leafletMap.setView(initialCenter, initialZoom, { animate: false });
      leafletMap.on('moveend zoomend', () => {
        const center = leafletMap.getCenter();
        setMapCenter([Number(center.lat.toFixed(4)), Number(center.lng.toFixed(4))]);
        setMapZoom(leafletMap.getZoom());
      });
      leafletMapRef.current = leafletMap;
      leafletLayerRef.current = L.layerGroup().addTo(leafletMap);
      refreshLeafletSize();
    } catch {
      recordMatchFirstEvent('match_map_layer_failed', {
        locale,
        source: 'results',
        session_id: sessionId,
        reason: 'leaflet_init_failed',
      });
    }

    return () => {
      if (mapResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(mapResizeFrameRef.current);
        mapResizeFrameRef.current = null;
      }
      leafletBasemapRef.current?.remove();
      leafletBasemapRef.current = null;
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      leafletLayerRef.current = null;
    };
  }, [locale, mapBounds, refreshLeafletSize, results, sessionId]);

  useEffect(() => {
    if (!results) return;
    const element = mapElementRef.current;
    if (!element || !leafletMapRef.current) return;
    refreshLeafletSize();

    if (typeof ResizeObserver === 'undefined') {
      const resizeTimer = window.setTimeout(refreshLeafletSize, 80);
      return () => window.clearTimeout(resizeTimer);
    }

    const resizeObserver = new ResizeObserver(() => refreshLeafletSize());
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [refreshLeafletSize, results]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !basemapConfig || leafletBasemapRef.current) return;
    const basemapLayer = L.tileLayer(basemapConfig.tile_url_template, {
      attribution: basemapConfig.attribution,
      minZoom: basemapConfig.min_zoom,
      maxZoom: basemapConfig.max_zoom,
      pane: 'tilePane',
    });
    basemapLayer.on('tileerror', () => {
      setBasemapFailed(true);
      recordBasemapFailure('pdok_brt_tile_failed');
    });
    basemapLayer.addTo(map);
    leafletBasemapRef.current = basemapLayer;
    refreshLeafletSize();

    return () => {
      basemapLayer.remove();
      if (leafletBasemapRef.current === basemapLayer) {
        leafletBasemapRef.current = null;
      }
    };
  }, [basemapConfig, recordBasemapFailure, refreshLeafletSize]);

  useEffect(() => {
    if (!leafletMapRef.current || !leafletLayerRef.current || !results) return;
    const group = leafletLayerRef.current;
    group.clearLayers();
    for (const recommendation of recommendations) {
      const selected = recommendation.recommendation_id === selectedRecommendationId;
      const bounds = recommendationBounds(recommendation);
      if (bounds) {
        L.rectangle([
          [bounds[1], bounds[0]],
          [bounds[3], bounds[2]],
        ], {
          color: selected ? '#00756f' : '#47625f',
          fillColor: selected ? '#31c6b7' : '#d9ebe8',
          fillOpacity: selected ? 0.28 : 0.16,
          opacity: selected ? 0.9 : 0.55,
          weight: selected ? 2 : 1,
        }).on('click', () => selectRecommendation(recommendation, 'map')).addTo(group);
      }
      const [lat, lng] = recommendationCenter(recommendation);
      const size = selected ? 48 : 44;
      const markerButton = document.createElement('button');
      markerButton.type = 'button';
      markerButton.className = selected
        ? 'results-map__marker results-map__marker--selected'
        : 'results-map__marker';
      markerButton.setAttribute('aria-label', t('matchFirst.results.markerLabel', { name: recommendation.name }));
      markerButton.setAttribute('aria-pressed', String(selected));
      markerButton.addEventListener('click', (event) => {
        event.stopPropagation();
        selectRecommendation(recommendation, 'map');
      });
      const rankLabel = document.createElement('span');
      rankLabel.textContent = String(recommendation.rank);
      markerButton.append(rankLabel);
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'results-map__leaflet-marker-icon',
          html: markerButton,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        keyboard: false,
      }).addTo(group);
    }
  }, [recommendations, results, selectRecommendation, selectedRecommendationId, t]);

  const adjustMap = (deltaLat: number, deltaLng: number, deltaZoom = 0) => {
    const nextCenter: [number, number] = [
      Number((mapCenter[0] + deltaLat).toFixed(4)),
      Number((mapCenter[1] + deltaLng).toFixed(4)),
    ];
    const nextZoom = Math.max(5, Math.min(14, mapZoom + deltaZoom));
    setMapCenter(nextCenter);
    setMapZoom(nextZoom);
    leafletMapRef.current?.setView(nextCenter, nextZoom, { animate: false });
  };

  if (loading && !results) {
    return (
      <section className="match-first-landing match-first-landing--simple results-map-shell" aria-labelledby="match-results-title">
        <div className="match-first-landing__content">
          <p className="match-first-landing__eyebrow">{t('matchFirst.results.eyebrow')}</p>
          <h1 id="match-results-title">{t('matchFirst.results.loadingTitle')}</h1>
          <p className="match-first-landing__body" role="status">{t('matchFirst.results.loadingBody')}</p>
        </div>
      </section>
    );
  }

  if (unavailable || !results) {
    return (
      <section className="match-first-landing match-first-landing--simple results-map-shell" aria-labelledby="match-results-title">
        <div className="match-first-landing__content">
          <p className="match-first-landing__eyebrow">{t('matchFirst.results.eyebrow')}</p>
          <h1 id="match-results-title">{t('matchFirst.results.unavailableTitle')}</h1>
          <p className="match-first-landing__body" role="status">{t('matchFirst.results.unavailableBody')}</p>
          <p className="match-first-landing__body">{t('matchFirst.results.runRequired')}</p>
          <button type="button" className="match-first-landing__cta" onClick={onBackToSurvey}>
            {t('matchFirst.results.backToSurvey')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="results-map-shell"
      aria-labelledby="match-results-title"
      data-testid="results-map-shell"
    >
      <header className="results-map-shell__header">
        <div>
          <p className="match-first-landing__eyebrow">{t('matchFirst.results.eyebrow')}</p>
          <h1 id="match-results-title">{t('matchFirst.results.readyTitle')}</h1>
          <p className="results-map-shell__summary" role="status">
            {hasNoStrongMatches(results)
              ? t('matchFirst.results.noStrongBody')
            : t('matchFirst.results.readyBody')}
          </p>
        </div>
      </header>

      <div className="results-map-shell__body">
        <div
          className="results-map-shell__map-panel"
          data-testid="results-map-panel"
        >
          <div
            className="results-map"
            role="region"
            aria-label={t('matchFirst.results.mapLabel')}
            data-map-center={`${mapCenter[0]},${mapCenter[1]}`}
            data-map-zoom={mapZoom}
            data-selected-neighborhood={selectedRecommendation?.neighborhood_id}
          >
            <div ref={mapElementRef} className="results-map__leaflet" />
            <p className="results-map__attribution">{t('matchFirst.results.basemapAttribution')}</p>
            {basemapFailed ? (
              <p className="results-map__basemap-fallback" role="status">
                {t('matchFirst.results.basemapUnavailable')}
              </p>
            ) : null}
            {mapPopupRecommendation && onOpenNeighborhood ? (
              <article
                className="results-map__selection-popup"
                role="dialog"
                aria-label={mapPopupRecommendation.name}
                data-placement={mapPopupPosition?.placement ?? 'above'}
                style={mapPopupPosition ? {
                  left: `${mapPopupPosition.x}px`,
                  top: `${mapPopupPosition.y}px`,
                } : undefined}
              >
                <div className="results-map__selection-popup-main">
                  <strong>{mapPopupRecommendation.name}</strong>
                  <span>{mapPopupRecommendation.municipality}</span>
                  <span>{t('matchFirst.results.fitScore', { score: mapPopupRecommendation.fit_score })}</span>
                </div>
                <button
                  type="button"
                  className="recommendation-card__detail results-map__selection-popup-cta"
                  onClick={() => openNeighborhoodDetail(mapPopupRecommendation)}
                >
                  {t('matchFirst.results.viewNeighborhood')}
                </button>
              </article>
            ) : null}
            <div className="results-map__controls" role="group" aria-label={t('matchFirst.results.mapControlsLabel')}>
              <button type="button" aria-label={t('matchFirst.results.zoomIn')} onClick={() => adjustMap(0, 0, 1)}>
                <svg
                  aria-hidden="true"
                  data-testid="results-map-zoom-in-icon"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                >
                  <path
                    d="M12 5v14M5 12h14"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
              <button type="button" aria-label={t('matchFirst.results.zoomOut')} onClick={() => adjustMap(0, 0, -1)}>
                <svg
                  aria-hidden="true"
                  data-testid="results-map-zoom-out-icon"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                >
                  <path
                    d="M5 12h14"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
              <button type="button" aria-label={t('matchFirst.results.panNorth')} onClick={() => adjustMap(0.1, 0, 0)}>
                <span
                  aria-hidden="true"
                  className="results-map__control-icon results-map__control-icon--pan-north"
                  data-testid="results-map-pan-north-icon"
                />
              </button>
              <button type="button" aria-label={t('matchFirst.results.panEast')} onClick={() => adjustMap(0, 0.1, 0)}>
                <span
                  aria-hidden="true"
                  className="results-map__control-icon results-map__control-icon--pan-east"
                  data-testid="results-map-pan-east-icon"
                />
              </button>
            </div>
          </div>
        </div>

        <div
          className="results-map-shell__list-panel"
          data-testid="results-list-panel"
        >
          <RecommendationList
            ref={listRef}
            recommendations={recommendations}
            selectedRecommendationId={selectedRecommendationId}
            onSelect={(recommendation) => selectRecommendation(recommendation, 'list')}
            onOpenDetail={onOpenNeighborhood ? openNeighborhoodDetail : undefined}
            onScroll={handleListScroll}
          />
        </div>
      </div>
    </section>
  );
}
