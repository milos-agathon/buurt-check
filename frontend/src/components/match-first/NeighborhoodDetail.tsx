import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getMatchNeighborhood,
  getMatchNeighborhoodAmenities,
  getMatchNeighborhoodBuildings,
  getMatchNeighborhoodMapLayers,
  getMatchResultsBasemapConfig,
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
  MatchResultsBasemapConfig,
  MatchNeighborhoodSummaryResponse,
  MatchResultsResponse,
} from '../../types/matchFirst';
import type { MatchReturnContext } from '../../routing/hashRoutes';
import AmenityTags from './AmenityTags';
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

const APPROVED_BASEMAP_THEMES = new Set(['standaard', 'grijs', 'pastel']);
const APPROVED_PDOK_BRT_WMTS_PREFIX = 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/';
const BLOCKED_BASEMAP_PROVIDERS = ['openstreetmap', 'mapbox', 'google'];

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
  const [basemapConfig, setBasemapConfig] = useState<MatchResultsBasemapConfig | null>(null);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const openedEventRef = useRef(false);
  const fallbackEventRef = useRef(false);
  const returnHydratedEventRef = useRef(false);
  const returnFailedEventRef = useRef(false);
  const basemapFailureEventRef = useRef(false);
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
  }, [initialResults, onReturnHydrationFailed, sessionId]);

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
  const selectedBuilding = useMemo(() => (
    buildings?.buildings.find((building) => building.building_id === selectedBuildingId) ?? null
  ), [buildings?.buildings, selectedBuildingId]);
  const selectedBuildingIndex = useMemo(() => {
    if (!selectedBuilding || !buildings?.buildings.length) return 1;
    return Math.max(
      1,
      buildings.buildings.findIndex((building) => building.building_id === selectedBuilding.building_id) + 1,
    );
  }, [buildings?.buildings, selectedBuilding]);
  const selectedCandidateAddresses = selectedBuilding
    && candidateAddressState?.building.building_id === selectedBuilding.building_id
    ? candidateAddressState.addresses
    : [];
  const showHouseRecoveryActions = Boolean(
    selectedBuilding
    && (
      selectionFallbackKey === 'matchFirst.neighborhood.noReliableAddress'
      || selectionFallbackKey === 'matchFirst.neighborhood.manualAddressRequired'
      || selectedCandidateAddresses.length > 0
    ),
  );

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

  const handlePreviewHouse = (building: MatchNeighborhoodBuildingFeature) => {
    if (!results || !recommendation) return;
    const bridgeContext = buildDossierBridgeContext(building);
    if (!bridgeContext) return;
    setSelectedBuildingId(building.building_id);
    setPendingCandidateId(null);
    setCandidateAddressState(null);
    setSelectionFallbackKey(null);
    setSelectionRecoveryContext(null);
    saveMatchResultsMapState(sessionId, bridgeContext.selectedState);

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
  };

  const handleSelectHouse = async (building: MatchNeighborhoodBuildingFeature) => {
    if (!results || !recommendation) return;
    const bridgeContext = buildDossierBridgeContext(building);
    if (!bridgeContext) return;
    if (selectedBuildingId !== building.building_id) {
      setSelectedBuildingId(building.building_id);
      saveMatchResultsMapState(sessionId, bridgeContext.selectedState);
    }
    setPendingBuildingId(building.building_id);
    setPendingCandidateId(null);
    setCandidateAddressState(null);
    setSelectionFallbackKey(null);
    setSelectionRecoveryContext(null);

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

  const recordBasemapFailure = useCallback((reason: string) => {
    if (basemapFailureEventRef.current) return;
    basemapFailureEventRef.current = true;
    setBasemapFailed(true);
    recordMatchFirstEvent('match_map_layer_failed', {
      locale,
      source: 'neighborhood',
      session_id: results?.session_id ?? sessionId,
      result_set_id: results?.result_set_id,
      neighborhood_id: neighborhoodId,
      reason,
    });
  }, [locale, neighborhoodId, results?.result_set_id, results?.session_id, sessionId]);

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
    if (!results || !recommendation || !layers) return;
    let cancelled = false;
    void getMatchResultsBasemapConfig()
      .then((config) => {
        if (cancelled) return;
        if (!isApprovedBasemapConfig(config)) {
          recordBasemapFailure('pdok_brt_config_rejected');
          return;
        }
        setBasemapConfig(config);
        setBasemapFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          recordBasemapFailure('pdok_brt_config_failed');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [layers, recommendation, recordBasemapFailure, results]);

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
            selectedBuildingId={selectedBuildingId}
            amenityPoints={amenities?.points ?? []}
            activeAmenityKey={activeAmenityKey}
            basemapConfig={basemapConfig}
            basemapFailed={basemapFailed}
            onBasemapFailed={recordBasemapFailure}
            onSelectBuilding={onOpenDossier ? handlePreviewHouse : undefined}
          />
          {selectedBuilding && (
            <div
              className="neighborhood-detail__house-popup"
              role="dialog"
              aria-labelledby="match-neighborhood-selected-house-title"
            >
              <p className="neighborhood-detail__popup-kicker">
                {t('matchFirst.neighborhood.loadedHouseCount', {
                  index: selectedBuildingIndex,
                  count: buildings?.buildings.length ?? 1,
                })}
              </p>
              <h2 id="match-neighborhood-selected-house-title">
                {t('matchFirst.neighborhood.selectedHouseTitle', { index: selectedBuildingIndex })}
              </h2>
              <p>{t(selectedBuilding.fallback_label_key ?? 'matchFirst.neighborhood.addressCandidate')}</p>
              {selectedCandidateAddresses.length > 0 && (
                <div className="neighborhood-detail__house-candidates">
                  <p className="neighborhood-detail__muted">{t('matchFirst.neighborhood.candidateAddressesIntro')}</p>
                  <ul
                    className="house-selection__candidate-list"
                    aria-label={t('matchFirst.neighborhood.candidateAddressesLabel')}
                  >
                    {selectedCandidateAddresses.map((candidateAddress, index) => {
                      const label = t(
                        candidateAddress.display_label_key,
                        candidateAddress.display_params ?? {},
                      );
                      const descriptionId = `selected-house-candidate-address-${index + 1}`;
                      const sourceRefs = candidateAddress.source_refs.length > 0
                        ? candidateAddress.source_refs.join(', ')
                        : t('matchFirst.neighborhood.sourceUnavailable');
                      return (
                        <li key={candidateAddress.candidate_id}>
                          <button
                            type="button"
                            aria-label={t('matchFirst.neighborhood.chooseCandidateAddressForHouse', {
                              label,
                              houseIndex: selectedBuildingIndex,
                            })}
                            aria-describedby={descriptionId}
                            disabled={pendingCandidateId === candidateAddress.candidate_id}
                            aria-busy={pendingCandidateId === candidateAddress.candidate_id}
                            onClick={() => handleSelectCandidateAddress(candidateAddress)}
                          >
                            {label}
                            <span id={descriptionId} className="sr-only">
                              {t('matchFirst.neighborhood.addressCandidateDescription', { sourceRefs })}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {selectionFallbackKey && (
                <p className="neighborhood-detail__muted" role="status">{t(selectionFallbackKey)}</p>
              )}
              <div className="neighborhood-detail__house-popup-actions">
                <button
                  type="button"
                  onClick={() => handleSelectHouse(selectedBuilding)}
                  disabled={pendingBuildingId === selectedBuilding.building_id}
                  aria-busy={pendingBuildingId === selectedBuilding.building_id}
                >
                  {pendingBuildingId === selectedBuilding.building_id
                    ? t('matchFirst.neighborhood.housesLoading')
                    : t('matchFirst.neighborhood.viewHouse')}
                </button>
                <button type="button" onClick={() => setSelectedBuildingId(null)}>
                  {t('matchFirst.neighborhood.closeHousePreview')}
                </button>
              </div>
              {showHouseRecoveryActions && (
                <div className="house-selection__actions">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectionRecoveryContext) onSearchManually?.(selectionRecoveryContext);
                    }}
                    disabled={!selectionRecoveryContext || !onSearchManually}
                  >
                    {t('matchFirst.neighborhood.searchManually')}
                  </button>
                  <button type="button" onClick={onBackToResults}>
                    {t('matchFirst.neighborhood.backToResults')}
                  </button>
                </div>
              )}
            </div>
          )}
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

        </aside>
      </div>
    </section>
  );
}
