import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getMatchResults } from '../../services/matchFirstApi';
import { recordMatchFirstEvent } from '../../services/matchFirstAnalytics';
import {
  readMatchResultsMapState,
  saveMatchResultsMapState,
} from '../../services/matchSessionStorage';
import type {
  MatchFirstLocale,
  MatchNeighborhoodRecommendation,
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
}

type MobileMode = 'map' | 'list';

const NETHERLANDS_CENTER: [number, number] = [52.2, 5.3];
const NETHERLANDS_BOUNDS: [number, number, number, number] = [3.2, 50.7, 7.3, 53.6];
const NATIONAL_ZOOM = 7;
const SELECTED_ZOOM = 12;

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

function markerPosition(
  recommendation: MatchNeighborhoodRecommendation,
  bounds: [number, number, number, number],
): { left: string; top: string } {
  const [west, south, east, north] = bounds;
  const [lat, lng] = recommendationCenter(recommendation);
  const x = ((lng - west) / Math.max(east - west, 0.0001)) * 100;
  const y = ((north - lat) / Math.max(north - south, 0.0001)) * 100;
  return {
    left: `${Math.max(3, Math.min(97, x))}%`,
    top: `${Math.max(3, Math.min(97, y))}%`,
  };
}

function visibleRecommendations(results: MatchResultsResponse): MatchNeighborhoodRecommendation[] {
  if (results.ranked_results.length > 0) return results.ranked_results;
  return [...results.near_misses, ...results.stretch_matches];
}

function hasNoStrongMatches(results: MatchResultsResponse): boolean {
  return results.status === 'completed_no_strong_matches'
    || results.empty_state_code === 'match.empty.no_strong_matches'
    || (results.normal_recommendation_count === 0 && visibleRecommendations(results).length > 0);
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
}: ResultsMapProps) {
  const { t, i18n } = useTranslation();
  const reducedMotion = Boolean(useReducedMotion());
  const [fetchedResults, setFetchedResults] = useState<MatchResultsResponse | null>(null);
  const [loading, setLoading] = useState(!initialResults);
  const [unavailable, setUnavailable] = useState(false);
  const restoredMapState = useMemo(() => readMatchResultsMapState(sessionId), [sessionId]);
  const restoredMapStateRef = useRef<MatchResultsMapState | null>(restoredMapState);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | undefined>(() => (
    restoredMapState?.selectedRecommendationId
  ));
  const [mobileMode, setMobileMode] = useState<MobileMode>(() => (
    restoredMapState?.mobileMode ?? 'map'
  ));
  const [mapCenter, setMapCenter] = useState<[number, number]>(() => (
    restoredMapState?.mapCenter ?? readCenter(initialResults?.map_center)
  ));
  const [mapZoom, setMapZoom] = useState<number>(() => (
    restoredMapState?.mapZoom ?? NATIONAL_ZOOM
  ));
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayerRef = useRef<L.LayerGroup | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const recordedMapOpenRef = useRef(false);
  const locale: MatchFirstLocale = i18n.resolvedLanguage?.startsWith('nl') ? 'nl' : 'en';
  const results = initialResults ?? fetchedResults;

  useEffect(() => {
    if (initialResults) return;

    let cancelled = false;
    void getMatchResults(sessionId)
      .then((response) => {
        if (cancelled) return;
        setFetchedResults(response);
        const restoredState = restoredMapStateRef.current;
        if (restoredStateMatchesResults(restoredState, response)) {
          setSelectedRecommendationId(restoredState.selectedRecommendationId);
          setMobileMode(restoredState.mobileMode);
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
        if (!cancelled) setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialResults, sessionId]);

  const recommendations = useMemo(() => (
    results ? visibleRecommendations(results) : []
  ), [results]);
  const selectedRecommendation = recommendations.find((item) => item.recommendation_id === selectedRecommendationId);
  const mapBounds = useMemo(() => readBounds(results), [results]);
  const listScrollRestoredRef = useRef(false);

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
    saveMatchResultsMapState(
      sessionId,
      createMapState(
        results,
        selectedRecommendation,
        mapCenter,
        mapZoom,
        listRef.current?.scrollTop ?? 0,
        mobileMode,
        locale,
      ),
    );
  }, [locale, mapCenter, mapZoom, mobileMode, results, selectedRecommendation, sessionId]);

  const moveMapToRecommendation = useCallback((recommendation: MatchNeighborhoodRecommendation, source: 'list' | 'map') => {
    const center = recommendationCenter(recommendation);
    setMapCenter(center);
    setMapZoom(SELECTED_ZOOM);
    const map = leafletMapRef.current;
    if (map) {
      map.setView(center, SELECTED_ZOOM, { animate: source === 'list' && !reducedMotion });
    }
  }, [reducedMotion]);

  const selectRecommendation = useCallback((recommendation: MatchNeighborhoodRecommendation, source: 'list' | 'map') => {
    setSelectedRecommendationId(recommendation.recommendation_id);
    moveMapToRecommendation(recommendation, source);
    recordMatchFirstEvent(source === 'map' ? 'match_map_feature_selected' : 'match_recommendation_selected', {
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
  }, [locale, mobileMode, moveMapToRecommendation, results, sessionId]);

  useEffect(() => {
    if (!mapElementRef.current || leafletMapRef.current || !results) return;
    try {
      const restoredMapState = restoredMapStateRef.current;
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
    } catch {
      recordMatchFirstEvent('match_map_layer_failed', {
        locale,
        source: 'results',
        session_id: sessionId,
        reason: 'leaflet_init_failed',
      });
    }

    return () => {
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      leafletLayerRef.current = null;
    };
  }, [locale, mapBounds, results, sessionId]);

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
      L.circleMarker([lat, lng], {
        radius: selected ? 8 : 6,
        color: selected ? '#005c57' : '#375653',
        fillColor: selected ? '#00a896' : '#ffffff',
        fillOpacity: 0.95,
        weight: selected ? 3 : 2,
      }).on('click', () => selectRecommendation(recommendation, 'map')).addTo(group);
    }
  }, [recommendations, results, selectRecommendation, selectedRecommendationId]);

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
      data-mobile-mode={mobileMode}
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
        <div className="results-map-shell__toggle" role="group" aria-label={t('matchFirst.results.mobileToggleLabel')}>
          <button
            type="button"
            aria-pressed={mobileMode === 'map'}
            onClick={() => setMobileMode('map')}
          >
            {t('matchFirst.results.toggleMap')}
          </button>
          <button
            type="button"
            aria-pressed={mobileMode === 'list'}
            onClick={() => setMobileMode('list')}
          >
            {t('matchFirst.results.toggleList')}
          </button>
        </div>
      </header>

      <div className="results-map-shell__body">
        <div
          className="results-map-shell__map-panel"
          data-active-mobile={mobileMode === 'map'}
        >
          <div
            className="results-map"
            role="region"
            aria-label={t('matchFirst.results.mapLabel')}
            data-map-center={`${mapCenter[0]},${mapCenter[1]}`}
            data-map-zoom={mapZoom}
            data-selected-neighborhood={selectedRecommendation?.neighborhood_id}
          >
            <div ref={mapElementRef} className="results-map__leaflet" aria-hidden="true" />
            <div className="results-map__overlay" aria-hidden="true">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
                <path className="results-map__nl-shape" d="M45 4 64 10 76 25 72 47 84 67 69 90 43 96 27 78 31 57 16 40 26 17Z" />
                {recommendations.map((recommendation) => {
                  const bounds = recommendationBounds(recommendation);
                  if (!bounds) return null;
                  const [west, south, east, north] = mapBounds;
                  const x = ((bounds[0] - west) / Math.max(east - west, 0.0001)) * 100;
                  const y = ((north - bounds[3]) / Math.max(north - south, 0.0001)) * 100;
                  const width = ((bounds[2] - bounds[0]) / Math.max(east - west, 0.0001)) * 100;
                  const height = ((bounds[3] - bounds[1]) / Math.max(north - south, 0.0001)) * 100;
                  return (
                    <rect
                      key={recommendation.recommendation_id}
                      className={recommendation.recommendation_id === selectedRecommendationId
                        ? 'results-map__polygon results-map__polygon--selected'
                        : 'results-map__polygon'}
                      x={x}
                      y={y}
                      width={Math.max(width, 2)}
                      height={Math.max(height, 2)}
                    />
                  );
                })}
              </svg>
            </div>
            {recommendations.map((recommendation) => (
              <button
                key={recommendation.recommendation_id}
                type="button"
                className={recommendation.recommendation_id === selectedRecommendationId
                  ? 'results-map__marker results-map__marker--selected'
                  : 'results-map__marker'}
                style={markerPosition(recommendation, mapBounds)}
                aria-label={t('matchFirst.results.markerLabel', { name: recommendation.name })}
                aria-pressed={recommendation.recommendation_id === selectedRecommendationId}
                onClick={() => selectRecommendation(recommendation, 'map')}
              >
                <span>{recommendation.rank}</span>
              </button>
            ))}
            <div className="results-map__controls" role="group" aria-label={t('matchFirst.results.mapControlsLabel')}>
              <button type="button" onClick={() => adjustMap(0, 0, 1)}>{t('matchFirst.results.zoomIn')}</button>
              <button type="button" onClick={() => adjustMap(0, 0, -1)}>{t('matchFirst.results.zoomOut')}</button>
              <button type="button" onClick={() => adjustMap(0.1, 0, 0)}>{t('matchFirst.results.panNorth')}</button>
              <button type="button" onClick={() => adjustMap(0, 0.1, 0)}>{t('matchFirst.results.panEast')}</button>
            </div>
          </div>
        </div>

        <div
          className="results-map-shell__list-panel"
          data-active-mobile={mobileMode === 'list'}
        >
          <RecommendationList
            ref={listRef}
            recommendations={recommendations}
            selectedRecommendationId={selectedRecommendationId}
            onSelect={(recommendation) => selectRecommendation(recommendation, 'list')}
          />
        </div>
      </div>
    </section>
  );
}
