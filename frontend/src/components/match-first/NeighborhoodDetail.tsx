import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getMatchNeighborhood,
  getMatchNeighborhoodAmenities,
  getMatchNeighborhoodBuildings,
  getMatchNeighborhoodMapLayers,
  getMatchResults,
  MatchFirstApiError,
  resolveDossierFromBuilding,
} from '../../services/matchFirstApi';
import { recordMatchFirstEvent } from '../../services/matchFirstAnalytics';
import {
  readMatchResultsMapState,
  saveMatchResultsMapState,
} from '../../services/matchSessionStorage';
import type {
  MatchDossierBridgeReturnContext,
  MatchDossierCandidateAddress,
  MatchFirstLocale,
  MatchNeighborhoodAmenitiesResponse,
  MatchNeighborhoodBuildingFeature,
  MatchNeighborhoodBuildingsResponse,
  MatchNeighborhoodMapLayersResponse,
  MatchNeighborhoodRecommendation,
  MatchResultsMapState,
  MatchNeighborhoodSummaryResponse,
  MatchResultsResponse,
} from '../../types/matchFirst';
import type { MatchReturnContext } from '../../routing/hashRoutes';
import AmenityTags from './AmenityTags';
import HouseSelectionPanel from './HouseSelectionPanel';
import './MatchFirstLanding.css';
import './NeighborhoodDetail.css';
import NeighborhoodBuildingLayer from './NeighborhoodBuildingLayer';

interface NeighborhoodDetailProps {
  sessionId: string;
  neighborhoodId: string;
  initialResults?: MatchResultsResponse | null;
  onBackToResults: () => void;
  onBackToSurvey: () => void;
  onOpenDossier?: (route: string) => boolean | void;
  onSearchManually?: (context: MatchReturnContext) => void;
  onReturnHydrated?: () => void;
  onReturnHydrationFailed?: (reason: string) => void;
}

interface LayerData {
  requestKey: string;
  summary: MatchNeighborhoodSummaryResponse | null;
  layers: MatchNeighborhoodMapLayersResponse | null;
  amenities: MatchNeighborhoodAmenitiesResponse | null;
  failed: boolean;
  amenitiesFailed: boolean;
}

interface BuildingData {
  requestKey: string;
  buildings: MatchNeighborhoodBuildingsResponse | null;
  failed: boolean;
}

interface CandidateAddressSelection {
  building: MatchNeighborhoodBuildingFeature;
  addresses: MatchDossierCandidateAddress[];
  recoveryContext: MatchReturnContext;
}

function visibleRecommendations(results: MatchResultsResponse): MatchNeighborhoodRecommendation[] {
  if (results.ranked_results.length > 0) return results.ranked_results;
  return [...results.near_misses, ...results.stretch_matches];
}

function normalizeTranslationKey(code: string, prefix: string): string {
  return code.startsWith(`${prefix}.`) ? code : `${prefix}.${code}`;
}

function asBoundsAttribute(bounds: number[] | undefined): string | undefined {
  return bounds && bounds.length === 4 ? bounds.join(',') : undefined;
}

function getRestoredStateForDetail(
  state: MatchResultsMapState | null,
  results: MatchResultsResponse,
  recommendation: MatchNeighborhoodRecommendation,
): MatchResultsMapState | null {
  if (
    !state
    || state.sessionId !== results.session_id
    || state.jobId !== results.job_id
    || state.resultSetId !== results.result_set_id
    || state.preferenceVectorVersion !== results.preference_vector_version
    || state.selectedNeighborhoodId !== recommendation.neighborhood_id
    || state.selectedRecommendationId !== recommendation.recommendation_id
    || state.selectedResultRank !== recommendation.rank
  ) {
    return null;
  }
  return state;
}

export default function NeighborhoodDetail({
  sessionId,
  neighborhoodId,
  initialResults = null,
  onBackToResults,
  onBackToSurvey,
  onOpenDossier,
  onSearchManually,
  onReturnHydrated,
  onReturnHydrationFailed,
}: NeighborhoodDetailProps) {
  const { t, i18n } = useTranslation();
  const locale: MatchFirstLocale = i18n.resolvedLanguage?.startsWith('nl') ? 'nl' : 'en';
  const [fetchedResults, setFetchedResults] = useState<MatchResultsResponse | null>(null);
  const [resultsUnavailable, setResultsUnavailable] = useState(false);
  const [layerData, setLayerData] = useState<LayerData | null>(null);
  const [buildingData, setBuildingData] = useState<BuildingData | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [pendingBuildingId, setPendingBuildingId] = useState<string | null>(null);
  const [pendingCandidateId, setPendingCandidateId] = useState<string | null>(null);
  const [candidateAddressState, setCandidateAddressState] = useState<CandidateAddressSelection | null>(null);
  const [selectionFallbackKey, setSelectionFallbackKey] = useState<string | null>(null);
  const [selectionRecoveryContext, setSelectionRecoveryContext] = useState<MatchReturnContext | null>(null);
  const [activeAmenityKey, setActiveAmenityKey] = useState<string | null>(null);
  const openedEventRef = useRef(false);
  const fallbackEventRef = useRef(false);
  const returnHydratedEventRef = useRef(false);
  const returnFailedEventRef = useRef(false);
  const results = initialResults ?? fetchedResults;

  useEffect(() => {
    if (initialResults) return;
    let cancelled = false;
    void getMatchResults(sessionId)
      .then((response) => {
        if (!cancelled) {
          setFetchedResults(response);
          setResultsUnavailable(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResultsUnavailable(true);
          if (!returnFailedEventRef.current) {
            returnFailedEventRef.current = true;
            onReturnHydrationFailed?.(
              error instanceof MatchFirstApiError ? error.detail : 'match.results.unavailable',
            );
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialResults, sessionId]);

  const recommendation = useMemo(() => (
    results
      ? visibleRecommendations(results).find((item) => item.neighborhood_id === neighborhoodId) ?? null
      : null
  ), [neighborhoodId, results]);

  const reasonLines = useMemo(() => (
    recommendation?.reason_codes
      .slice(0, 2)
      .map((code) => normalizeTranslationKey(code, 'match.results.reasons'))
      .map((key) => (i18n.exists(key) ? t(key) : t('matchFirst.results.reasonUnavailable'))) ?? []
  ), [i18n, recommendation?.reason_codes, t]);
  const layerRequestKey = results && recommendation
    ? `${results.result_set_id}:${neighborhoodId}`
    : null;
  const currentLayerData = layerData?.requestKey === layerRequestKey ? layerData : null;
  const summary = currentLayerData?.summary ?? null;
  const layers = currentLayerData?.layers ?? null;
  const amenities = currentLayerData?.amenities ?? null;
  const layersFailed = currentLayerData?.failed ?? false;
  const amenitiesFailed = currentLayerData?.amenitiesFailed ?? false;
  const loadingLayers = Boolean(layerRequestKey && !currentLayerData);
  const buildingRequestKey = layers
    ? `${layerRequestKey}:${layers.allowed_bounds_rd.join(',')}`
    : null;
  const currentBuildingData = buildingData?.requestKey === buildingRequestKey ? buildingData : null;
  const buildings = currentBuildingData?.buildings ?? null;
  const buildingsFailed = currentBuildingData?.failed ?? false;
  const loadingBuildings = Boolean(buildingRequestKey && !currentBuildingData);

  useEffect(() => {
    if (!results || !recommendation || returnHydratedEventRef.current) return;
    returnHydratedEventRef.current = true;
    onReturnHydrated?.();
  }, [onReturnHydrated, recommendation, results]);

  useEffect(() => {
    if (!results || recommendation || returnFailedEventRef.current) return;
    returnFailedEventRef.current = true;
    onReturnHydrationFailed?.('match.results.stale');
  }, [onReturnHydrationFailed, recommendation, results]);

  useEffect(() => {
    if (!results || !recommendation) return;
    const restoredState = getRestoredStateForDetail(
      readMatchResultsMapState(sessionId),
      results,
      recommendation,
    );
    setSelectedBuildingId(restoredState?.selectedHouseId ?? null);
    const centroid = recommendation.geometry_ref.display_centroid_wgs84;
    saveMatchResultsMapState(sessionId, {
      sessionId: results.session_id,
      jobId: results.job_id,
      resultSetId: results.result_set_id,
      preferenceVectorVersion: results.preference_vector_version,
      selectedRecommendationId: recommendation.recommendation_id,
      selectedNeighborhoodId: recommendation.neighborhood_id,
      selectedResultRank: recommendation.rank,
      selectedHouseId: restoredState?.selectedHouseId,
      mapCenter: restoredState?.mapCenter ?? (centroid ? [centroid.lat, centroid.lng] : [52.2, 5.3]),
      mapZoom: restoredState?.mapZoom ?? 14,
      listScroll: restoredState?.listScroll ?? 0,
      mobileMode: restoredState?.mobileMode ?? 'map',
      locale,
    });
  }, [locale, recommendation, results, sessionId]);

  const buildDossierBridgeContext = (building: MatchNeighborhoodBuildingFeature) => {
    if (!results || !recommendation) return null;
    const restoredState = getRestoredStateForDetail(
      readMatchResultsMapState(sessionId),
      results,
      recommendation,
    );
    const centroid = recommendation.geometry_ref.display_centroid_wgs84;
    const center = restoredState?.mapCenter
      ?? (centroid ? [centroid.lat, centroid.lng] as [number, number] : [52.2, 5.3] as [number, number]);
    const mapZoom = restoredState?.mapZoom ?? 14;
    const listScroll = restoredState?.listScroll ?? 0;
    const mobileMode = restoredState?.mobileMode ?? 'map';
    const returnUrl = `#/match/session/${encodeURIComponent(results.session_id)}/neighborhood/${encodeURIComponent(recommendation.neighborhood_id)}`;
    const recoveryContext: MatchReturnContext = {
      target: returnUrl,
      sessionId: results.session_id,
      neighborhoodId: recommendation.neighborhood_id,
      jobId: results.job_id,
      resultSetId: results.result_set_id,
      preferenceVectorVersion: results.preference_vector_version,
      source: 'match_map',
      buildingId: building.building_id,
      returnUrl,
      mapCenter: center,
      mapZoom,
      listScroll,
      mobileMode,
      selectedResultId: recommendation.recommendation_id,
      selectedResultRank: recommendation.rank,
      language: locale,
      selectedHouseId: building.building_id,
    };
    const returnContext: MatchDossierBridgeReturnContext = {
      session_id: results.session_id,
      job_id: results.job_id,
      result_set_id: results.result_set_id,
      preference_vector_version: results.preference_vector_version,
      source: 'match_map',
      return_url: returnUrl,
      map_center: center,
      map_zoom: mapZoom,
      list_scroll: listScroll,
      mobile_mode: mobileMode,
      selected_result_id: recommendation.recommendation_id,
      selected_result_rank: recommendation.rank,
      language: locale,
      selected_house_id: building.building_id,
    };
    const selectedState = {
      sessionId: results.session_id,
      jobId: results.job_id,
      resultSetId: results.result_set_id,
      preferenceVectorVersion: results.preference_vector_version,
      selectedRecommendationId: recommendation.recommendation_id,
      selectedNeighborhoodId: recommendation.neighborhood_id,
      selectedResultRank: recommendation.rank,
      selectedHouseId: building.building_id,
      mapCenter: center,
      mapZoom,
      listScroll,
      mobileMode,
      locale,
    };
    return { recoveryContext, returnContext, selectedState };
  };

  const showBridgeFallback = (
    building: MatchNeighborhoodBuildingFeature,
    recoveryContext: MatchReturnContext,
    fallbackReasonCode: string,
    fallbackKey = 'matchFirst.neighborhood.noReliableAddress',
  ) => {
    if (!results || !recommendation) return;
    setCandidateAddressState(null);
    setSelectionFallbackKey(fallbackKey);
    setSelectionRecoveryContext(recoveryContext);
    recordMatchFirstEvent('match_no_reliable_address_shown', {
      locale,
      source: 'match_map',
      session_id: results.session_id,
      result_set_id: results.result_set_id,
      neighborhood_id: recommendation.neighborhood_id,
      selected_house_id: building.building_id,
      building_id: building.building_id,
      fallback_reason_code: fallbackReasonCode,
    });
  };

  const handleBridgeOutcome = (
    building: MatchNeighborhoodBuildingFeature,
    recoveryContext: MatchReturnContext,
    bridge: Awaited<ReturnType<typeof resolveDossierFromBuilding>>,
  ) => {
    if (bridge.status === 'resolved' && bridge.route) {
      const routeAccepted = onOpenDossier?.(bridge.route) === true;
      if (routeAccepted) {
        return;
      }
      showBridgeFallback(
        building,
        recoveryContext,
        'match.dossier.invalid_bridge_route',
      );
      return;
    }

    if (bridge.status === 'candidates' && bridge.candidate_addresses.length > 0) {
      setCandidateAddressState({
        building,
        addresses: bridge.candidate_addresses,
        recoveryContext,
      });
      setSelectionFallbackKey(null);
      setSelectionRecoveryContext(recoveryContext);
      return;
    }

    showBridgeFallback(
      building,
      recoveryContext,
      bridge.fallback_reason_code ?? 'match.neighborhood.no_reliable_address',
      bridge.status === 'manual_required'
        ? 'matchFirst.neighborhood.manualAddressRequired'
        : 'matchFirst.neighborhood.noReliableAddress',
    );
  };

  const handleBridgeError = (
    error: unknown,
    building: MatchNeighborhoodBuildingFeature,
    recoveryContext: MatchReturnContext,
  ) => {
    const detail = error instanceof MatchFirstApiError ? error.detail : null;
    if (detail === 'match.results.stale' || detail === 'match.results.not_found') {
      setResultsUnavailable(true);
      setCandidateAddressState(null);
      setSelectionRecoveryContext(null);
      if (!returnFailedEventRef.current) {
        returnFailedEventRef.current = true;
        onReturnHydrationFailed?.(detail);
      }
      return;
    }
    showBridgeFallback(
      building,
      recoveryContext,
      'match.neighborhood.no_reliable_address',
    );
  };

  const handleSelectHouse = async (building: MatchNeighborhoodBuildingFeature) => {
    if (!results || !recommendation) return;
    const bridgeContext = buildDossierBridgeContext(building);
    if (!bridgeContext) return;
    setSelectedBuildingId(building.building_id);
    setPendingBuildingId(building.building_id);
    setPendingCandidateId(null);
    setCandidateAddressState(null);
    setSelectionFallbackKey(null);
    setSelectionRecoveryContext(null);

    recordMatchFirstEvent('match_house_selected', {
      locale,
      source: 'match_map',
      session_id: results.session_id,
      result_set_id: results.result_set_id,
      neighborhood_id: recommendation.neighborhood_id,
      recommendation_id: recommendation.recommendation_id,
      result_rank: recommendation.rank,
      selected_house_id: building.building_id,
    });

    saveMatchResultsMapState(sessionId, bridgeContext.selectedState);

    try {
      const bridge = await resolveDossierFromBuilding({
        session_id: results.session_id,
        neighborhood_id: recommendation.neighborhood_id,
        building_id: building.building_id,
        address_id: building.address_id ?? null,
        vbo_id: building.vbo_id ?? null,
        lookup_id: building.lookup_id ?? null,
        return_context: bridgeContext.returnContext,
      });

      handleBridgeOutcome(building, bridgeContext.recoveryContext, bridge);
    } catch (error: unknown) {
      handleBridgeError(error, building, bridgeContext.recoveryContext);
    } finally {
      setPendingBuildingId(null);
    }
  };

  const handleSelectCandidateAddress = async (candidateAddress: MatchDossierCandidateAddress) => {
    if (!results || !recommendation || !candidateAddressState) return;
    const building = candidateAddressState.building;
    const bridgeContext = buildDossierBridgeContext(building);
    if (!bridgeContext) return;
    setPendingCandidateId(candidateAddress.candidate_id);
    setSelectionFallbackKey(null);
    setSelectionRecoveryContext(candidateAddressState.recoveryContext);
    saveMatchResultsMapState(sessionId, bridgeContext.selectedState);

    try {
      const bridge = await resolveDossierFromBuilding({
        session_id: results.session_id,
        neighborhood_id: recommendation.neighborhood_id,
        building_id: building.building_id,
        address_id: null,
        vbo_id: null,
        lookup_id: null,
        selected_candidate_id: candidateAddress.candidate_id,
        return_context: bridgeContext.returnContext,
      });
      handleBridgeOutcome(building, bridgeContext.recoveryContext, bridge);
    } catch (error: unknown) {
      handleBridgeError(error, building, bridgeContext.recoveryContext);
    } finally {
      setPendingCandidateId(null);
    }
  };

  const handleAmenityFilterClick = (amenityKey: string) => {
    if (!results || !recommendation) return;
    const nextAmenityKey = activeAmenityKey === amenityKey ? null : amenityKey;
    setActiveAmenityKey(nextAmenityKey);
    recordMatchFirstEvent('match_amenity_interacted', {
      locale,
      source: 'neighborhood',
      session_id: results.session_id,
      result_set_id: results.result_set_id,
      neighborhood_id: recommendation.neighborhood_id,
      recommendation_id: recommendation.recommendation_id,
      amenity_key: amenityKey,
      status: nextAmenityKey ? 'selected' : 'cleared',
    });
  };

  useEffect(() => {
    if (!results || !recommendation || openedEventRef.current) return;
    openedEventRef.current = true;
    recordMatchFirstEvent('match_neighborhood_detail_opened', {
      locale,
      source: 'results',
      session_id: sessionId,
      job_id: results.job_id,
      result_set_id: results.result_set_id,
      recommendation_id: recommendation.recommendation_id,
      neighborhood_id: recommendation.neighborhood_id,
      result_rank: recommendation.rank,
    });
  }, [locale, recommendation, results, sessionId]);

  useEffect(() => {
    if (!results || !recommendation || !layerRequestKey) return;
    let cancelled = false;

    void Promise.allSettled([
      getMatchNeighborhood(neighborhoodId),
      getMatchNeighborhoodMapLayers(neighborhoodId, {
        sessionId,
        resultSetId: results.result_set_id,
      }),
      getMatchNeighborhoodAmenities(neighborhoodId, {
        sessionId,
        resultSetId: results.result_set_id,
      }),
    ])
      .then(([summaryResult, layersResult, amenitiesResult]) => {
        if (cancelled) return;
        const nextSummary = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
        const nextLayers = layersResult.status === 'fulfilled' ? layersResult.value : null;
        const nextAmenities = amenitiesResult.status === 'fulfilled' ? amenitiesResult.value : null;
        const layersFailed = layersResult.status === 'rejected';
        const amenitiesFailed = amenitiesResult.status === 'rejected';

        setLayerData({
          requestKey: layerRequestKey,
          summary: nextSummary,
          layers: nextLayers,
          amenities: nextAmenities,
          failed: layersFailed,
          amenitiesFailed,
        });

        if (layersFailed) {
          recordMatchFirstEvent('match_map_layer_failed', {
            locale,
            source: 'neighborhood',
            session_id: sessionId,
            result_set_id: results.result_set_id,
            neighborhood_id: neighborhoodId,
            reason: 'selected_layer_fetch_failed',
          });
        }

        if (amenitiesFailed) {
          recordMatchFirstEvent('match_amenity_layer_failed', {
            locale,
            source: 'neighborhood',
            session_id: sessionId,
            result_set_id: results.result_set_id,
            neighborhood_id: neighborhoodId,
            reason: 'amenity_fetch_failed',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [layerRequestKey, locale, neighborhoodId, recommendation, results, sessionId]);

  useEffect(() => {
    if (!results || !layers || !buildingRequestKey) return;
    let cancelled = false;
    void getMatchNeighborhoodBuildings(neighborhoodId, {
      sessionId,
      resultSetId: results.result_set_id,
      boundsRd: layers.allowed_bounds_rd,
      lod: 'low',
      limit: 50,
    })
      .then((response) => {
        if (!cancelled) {
          setBuildingData({
            requestKey: buildingRequestKey,
            buildings: response,
            failed: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBuildingData({
            requestKey: buildingRequestKey,
            buildings: null,
            failed: true,
          });
          recordMatchFirstEvent('match_building_layer_failed', {
            locale,
            source: 'neighborhood',
            session_id: sessionId,
            result_set_id: results.result_set_id,
            neighborhood_id: neighborhoodId,
            reason: 'building_fetch_failed',
          });
        }
      })
    return () => {
      cancelled = true;
    };
  }, [buildingRequestKey, layers, locale, neighborhoodId, results, sessionId]);

  useEffect(() => {
    if (!buildings?.fallback_reason_code || fallbackEventRef.current) return;
    fallbackEventRef.current = true;
    recordMatchFirstEvent('match_missing_3d_fallback_shown', {
      locale,
      source: 'neighborhood',
      session_id: sessionId,
      result_set_id: buildings.result_set_id,
      neighborhood_id: neighborhoodId,
      fallback_reason_code: buildings.fallback_reason_code,
    });
  }, [buildings, locale, neighborhoodId, sessionId]);

  if (!results && !resultsUnavailable) {
    return (
      <section className="match-first-landing match-first-landing--simple neighborhood-detail" aria-labelledby="match-neighborhood-title">
        <div className="match-first-landing__content">
          <p className="match-first-landing__eyebrow">{t('matchFirst.neighborhood.eyebrow')}</p>
          <h1 id="match-neighborhood-title">{t('matchFirst.neighborhood.loadingTitle')}</h1>
          <p className="match-first-landing__body" role="status">{t('matchFirst.results.loadingBody')}</p>
        </div>
      </section>
    );
  }

  if (resultsUnavailable || !results || !recommendation) {
    return (
      <section className="match-first-landing match-first-landing--simple neighborhood-detail" aria-labelledby="match-neighborhood-title">
        <div className="match-first-landing__content">
          <p className="match-first-landing__eyebrow">{t('matchFirst.neighborhood.eyebrow')}</p>
          <h1 id="match-neighborhood-title">{t('matchFirst.results.unavailableTitle')}</h1>
          <p className="match-first-landing__body" role="status">{t('matchFirst.results.unavailableBody')}</p>
          <div className="match-first-landing__actions">
            <button type="button" className="match-first-landing__cta" onClick={onBackToResults}>
              {t('matchFirst.neighborhood.backToResults')}
            </button>
            <button type="button" className="match-first-landing__secondary" onClick={onBackToSurvey}>
              {t('matchFirst.neighborhood.backToSurvey')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="neighborhood-detail"
      aria-labelledby="match-neighborhood-title"
      data-testid="neighborhood-detail"
      data-neighborhood-id={neighborhoodId}
      data-building-requested={buildings || loadingBuildings ? 'true' : 'false'}
      data-building-bounds-rd={asBoundsAttribute(buildings?.bounds_rd ?? layers?.allowed_bounds_rd)}
    >
      <header className="neighborhood-detail__header">
        <button type="button" className="neighborhood-detail__back" onClick={onBackToResults}>
          {t('matchFirst.neighborhood.backToResults')}
        </button>
        <div>
          <p className="match-first-landing__eyebrow">{t('matchFirst.neighborhood.eyebrow')}</p>
          <h1 id="match-neighborhood-title">{recommendation.name}</h1>
          <p className="neighborhood-detail__summary">
            {t('matchFirst.neighborhood.fitSummary', {
              score: recommendation.fit_score,
              municipality: summary?.municipality ?? recommendation.municipality,
            })}
          </p>
        </div>
      </header>

      <div className="neighborhood-detail__body">
        <div
          className="neighborhood-detail__map"
          role="region"
          aria-label={t('matchFirst.neighborhood.mapLabel')}
          data-testid="neighborhood-detail-map"
          data-boundary-ref={summary?.boundary_ref ?? recommendation.geometry_ref.boundary_ref}
          data-selected-neighborhood={neighborhoodId}
          data-display-bounds-wgs84={asBoundsAttribute(layers?.display_bounds_wgs84 ?? summary?.display_bounds_wgs84)}
        >
          <NeighborhoodBuildingLayer
            layers={layers}
            buildings={buildings}
            loading={loadingLayers || loadingBuildings}
            failed={layersFailed || buildingsFailed}
          />
        </div>

        <aside className="neighborhood-detail__side" aria-label={t('matchFirst.neighborhood.contextLabel')}>
          <section className="neighborhood-detail__panel" aria-labelledby="match-neighborhood-fit-title">
            <h2 id="match-neighborhood-fit-title">{t('matchFirst.neighborhood.fitContextTitle')}</h2>
            <p className="neighborhood-detail__metric">
              {t('matchFirst.results.fitScore', { score: recommendation.fit_score })}
            </p>
            {reasonLines.length > 0 && (
              <ul className="neighborhood-detail__reasons" aria-label={t('matchFirst.results.reasonLinesLabel')}>
                {reasonLines.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
          </section>

          <section className="neighborhood-detail__panel" aria-labelledby="match-neighborhood-amenities-title">
            <h2 id="match-neighborhood-amenities-title">{t('matchFirst.neighborhood.amenitiesTitle')}</h2>
            <AmenityTags
              tags={amenities?.tags ?? []}
              loading={loadingLayers && !amenities}
              failed={amenitiesFailed}
              activeAmenityKey={activeAmenityKey}
              onFilterClick={(tag) => handleAmenityFilterClick(tag.amenity_key)}
            />
          </section>

          <section className="neighborhood-detail__panel" aria-labelledby="match-neighborhood-houses-title">
            <h2 id="match-neighborhood-houses-title">{t('matchFirst.neighborhood.housesTitle')}</h2>
            <HouseSelectionPanel
              buildings={buildings?.buildings ?? []}
              loading={loadingBuildings && !buildings}
              failed={buildingsFailed}
              selectedBuildingId={selectedBuildingId}
              pendingBuildingId={pendingBuildingId}
              pendingCandidateId={pendingCandidateId}
              fallbackKey={selectionFallbackKey}
              candidateAddresses={candidateAddressState?.addresses ?? []}
              candidateBuildingId={candidateAddressState?.building.building_id ?? null}
              onSelectHouse={onOpenDossier ? handleSelectHouse : undefined}
              onSelectCandidateAddress={onOpenDossier ? handleSelectCandidateAddress : undefined}
              onSearchManually={selectionRecoveryContext && onSearchManually
                ? () => onSearchManually(selectionRecoveryContext)
                : undefined}
              onBackToResults={onBackToResults}
            />
          </section>
        </aside>
      </div>
    </section>
  );
}
