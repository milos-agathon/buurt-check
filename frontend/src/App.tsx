import { lazy, Suspense, useState, useRef, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import AddressSearch from './components/AddressSearch';
import ErrorBoundary from './components/ErrorBoundary';
import RiskTileSkeleton from './components/RiskTileSkeleton';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import DossierSheet, { type SheetSnap } from './components/DossierSheet';
import LoadingScreen, { type LoadingProgressStep } from './components/LoadingScreen';
import { SPRING_TAB } from './config/springs';
import { fetchPrice, getDossierPrice, isServerRenderAvailable } from './config/pricing';
import { hapticTap } from './utils/haptic';
import { useAnimationPerformance } from './hooks/useAnimationPerformance';
import ShortlistScreen from './components/ShortlistScreen';
import TabBar from './components/TabBar';
import TopBar from './components/TopBar';
import type { TabId } from './components/TabBar';
import AnalyticsConsentBanner from './components/AnalyticsConsentBanner';
import BuildingFactsCard from './components/BuildingFactsCard';
import ShadowTimeSlider from './components/ShadowTimeSlider';
import RiskTilesGrid from './components/RiskTilesGrid';
import RiskDetailView from './components/RiskDetailView';
import NeighborhoodStatsCard from './components/NeighborhoodStatsCard';
import AttentionSummary from './components/AttentionSummary';
import LivabilityCard from './components/LivabilityCard';
import LivabilityDetailView from './components/LivabilityDetailView';
// Premium warnings and sunlight evidence remain export-only, not interactive viewer sections.
// Their state is still fetched and passed to ExportBottomSheet for PDF generation.
import ViewingChecklist from './components/ViewingChecklist';
import ActionBar from './components/ActionBar';
import ExportBottomSheet from './components/ExportBottomSheet';
import NotFoundScreen from './components/NotFoundScreen';
import VerificationActionDetailSheet from './components/prebid/VerificationActionDetailSheet';
import PackView from './components/prebid/PackView';
import SharePackSheet from './components/prebid/SharePackSheet';
import SharedPrebidScreen from './components/prebid/SharedPrebidScreen';
import {
  ApiError,
  checkEntitlement,
  confirmStripeCheckoutSession,
  verifyAppleAppStorePurchase,
  createCheckoutSession,
  createShortReport,
  suggestAddresses,
  lookupAddress,
  getBuildingFacts,
  getBuilding3D,
  getNeighborhood3D,
  getRiskCards,
  getRiskComparisons,
  getNeighborhoodStats,
  getViewingQuestions,
  getPropertyWarnings,
  getLivability,
  fetchPrebidBriefing,
  fetchPrebidPack,
  sharePrebidPack,
  emailPrebidPack,
  deletePrebidBriefing,
  fetchSharedPrebidBriefing,
  fetchSharedPrebidPack,
  prewarmShadowEvidence,
  submitSunlightAnalysis,
  toSunlightSubmissionPayload,
  mapApiError,
  verifyGooglePlayPurchase,
} from './services/api';
import {
  beginAppleBillingPurchase,
  clearPendingAppleBillingReport,
  findPendingAppleBillingPurchase,
  finishAppleBillingTransaction,
  getPendingAppleBillingReport,
  isAppleBillingCancelledError,
  isAppleBillingPendingError,
} from './services/appleBilling';
import {
  beginPlayBillingPurchase,
  clearPendingPlayBillingReport,
  completePlayBillingPurchase,
  consumePlayBillingPurchaseToken,
  findRestorablePlayBillingPurchase,
  getPendingPlayBillingReport,
} from './services/playBilling';
import { resolveBillingProvider, type BillingProvider } from './services/billingProvider';
import { navigateToExternal } from './services/navigation';
import {
  getShortlist,
  addToShortlist,
  removeFromShortlist,
  isInShortlist,
  clearShortlist,
  upsertShortlistItem,
} from './services/shortlist';
import { addRecent, clearRecent, removeRecent } from './services/recentSearches';
import { storeEntitlement, clearEntitlement } from './services/entitlement';
import { clearVisited, markVisited } from './services/firstVisit';
import {
  getAnalyticsConsent,
  isAnalyticsEnabled,
  setAnalyticsConsent,
  trackEvent,
  trackPrebidEvent,
  trackPageView,
  type AnalyticsConsentState,
} from './services/clientEvents';
import { getTheme, setTheme, applyTheme, listenForSystemChanges, type ThemePreference } from './services/theme';
import {
  compareMatchNeighborhoods,
  createMatchAlert,
  deleteMatchAlert,
  deleteSavedMatchNeighborhood,
  exportMatchReport,
  fetchMatchAdminHealth,
  fetchMatchAlerts,
  fetchMatchListings,
  fetchSharedMatchReport,
  fetchSavedMatchNeighborhoods,
  findSimilarMatchNeighborhoods,
  saveMatchNeighborhood,
  saveMatchReport,
  shareMatchReport,
  submitMatchFeedback,
  updateMatchAlertStatus,
} from './services/matchApi';
import { ToastContainer, useToast } from './components/ui/Toast';
import { useViewportBottomOffset } from './hooks/useViewportBottomOffset';
import type { Geometry, Position } from 'geojson';
import type {
  AddressSuggestion,
  CheckoutConfirmationResponse,
  ResolvedAddress,
  BuildingFactsResponse,
  LivabilityResponse,
  Neighborhood3DResponse,
  NeighborhoodStatsResponse,
  PrebidBriefingResponse,
  PrebidCoverageRow,
  PrebidPackResponse,
  PrebidVerificationAction,
  SharedPrebidResponse,
  RiskCardsResponse,
  RiskComparisonsResponse,
  ShadowPrewarmResponse,
  SunlightResult,
  ShadowSnapshot,
  ViewingQuestionsResponse,
  PropertyWarningsResponse,
  SeverityLevel,
  RiskLevel,
  ShortlistItem,
} from './types/api';
import type {
  MatchCompareResponse,
  MatchAdminHealthResponse,
  MatchAlertCreatePayload,
  MatchAlertRule,
  MatchListing,
  MatchListingProviderResult,
  MatchQuizResponse,
  MatchRecommendationsResponse,
  MatchReportResponse,
  MatchFeedbackPayload,
  MatchFeedbackResponse,
  ReportShareResponse,
  SavedNeighborhood,
  MatchSimilarResponse,
} from './types/match';
import {
  resolveSourceFetchStatus,
  type SourceFetchStatus,
} from './utils/dataCoverage';
import { buildAttentionSummary } from './utils/attentionSummary';
import { localizeViewer3DMessage } from './utils/viewer3dMessages';
import {
  getRiskComparisonColorKey,
  getRiskComparisonLabel,
  type ComparisonColorKey,
} from './utils/riskComparisonPresentation';
import {
  buildHashRoute,
  parseHashRoute,
  parseRoute,
  type HashRoute,
  type MatchReturnContext,
  type ParsedHashRoute,
} from './routing/hashRoutes';
import './App.css';

const BuildingFootprintMap = lazy(() => import('./components/BuildingFootprintMap'));
const NeighborhoodViewer3D = lazy(() => import('./components/NeighborhoodViewer3D'));
const CompareScreen = lazy(() => import('./components/CompareScreen'));
const SettingsScreen = lazy(() => import('./components/SettingsScreen'));
const MatchLanding = lazy(() => import('./components/match-first/MatchFirstLanding'));
const MatchSurveyIntro = lazy(() => import('./components/match-first/SurveyIntro'));
const MatchSurveyShell = lazy(() => import('./components/match-first/SurveyShell'));
const MatchSurveyReview = lazy(() => import('./components/match-first/SurveyReview'));
const MatchComparison = lazy(() => import('./components/match/MatchComparison'));
const MatchSimilarSearch = lazy(() => import('./components/match/MatchSimilarSearch'));
const MatchReport = lazy(() => import('./components/match/MatchReport'));
const MatchListings = lazy(() => import('./components/match/MatchListings'));
const MatchAlerts = lazy(() => import('./components/match/MatchAlerts'));
const MatchSaved = lazy(() => import('./components/match/MatchSaved'));
const MatchAdminDashboard = lazy(() => import('./components/match/MatchAdminDashboard'));
const MatchFeedbackControls = lazy(() => import('./components/match/MatchFeedbackControls'));

type Screen = HashRoute;
type ComparisonRow = { label: string; value: number; pattern?: 'dashed'; colorKey: ComparisonColorKey };

interface DossierSeedState {
  address?: ResolvedAddress;
  buildingResponse?: BuildingFactsResponse;
  neighborhood3D?: Neighborhood3DResponse;
  riskCards?: RiskCardsResponse;
  riskComparisons?: RiskComparisonsResponse;
  neighborhoodStats?: NeighborhoodStatsResponse;
  propertyWarnings?: PropertyWarningsResponse;
  livability?: LivabilityResponse;
  sunlight?: SunlightResult;
  shadowSnapshots?: ShadowSnapshot[];
  viewingQuestions?: ViewingQuestionsResponse;
}

function readDossierSeed(): DossierSeedState | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') return null;
  try {
    const raw = window.localStorage.getItem('buurt-check-e2e-dossier-seed');
    if (!raw) return null;
    return JSON.parse(raw) as DossierSeedState;
  } catch {
    return null;
  }
}

function levelToSeverity(level: RiskLevel, score?: number): SeverityLevel {
  if (score != null) {
    if (score >= 70) return 'good';
    if (score >= 40) return 'moderate';
    if (score >= 20) return 'poor';
    return 'critical';
  }
  switch (level) {
    case 'low': return 'good';
    case 'medium': return 'moderate';
    case 'high': return 'poor';
    default: return 'unavailable';
  }
}

function normalizeSunlightScore(winterHours: number): number {
  return Math.max(0, Math.min(100, Math.round((winterHours / 6) * 100)));
}

function sunlightSubmissionKey(vboId: string, reportId: string, result: SunlightResult): string {
  return [vboId, reportId, JSON.stringify(toSunlightSubmissionPayload(result))].join('|');
}

type ShadowPrewarmStatus = 'idle' | 'pending' | 'ready' | 'skipped' | 'unavailable' | 'failed';

const TERMINAL_SHADOW_PREWARM_STATUSES: ReadonlySet<ShadowPrewarmStatus> = new Set([
  'ready',
  'skipped',
  'unavailable',
  'failed',
]);

function shadowPrewarmKey(vboId: string, reportId: string): string {
  return `${reportId}:${vboId}`;
}

function isShadowPrewarmTerminalStatus(status: ShadowPrewarmStatus): boolean {
  return TERMINAL_SHADOW_PREWARM_STATUSES.has(status);
}

type ExportLanguage = 'en' | 'nl';

function normalizeUiLanguage(language: string | undefined): ExportLanguage {
  return language?.startsWith('nl') ? 'nl' : 'en';
}

const REQUIRED_SHADOW_SNAPSHOT_LABELS = ['winter', 'equinox', 'summer'] as const;

function hasRequiredShadowSnapshotTriptych(
  snapshots: ShadowSnapshot[] | null | undefined,
): boolean {
  if (!snapshots || snapshots.length === 0) {
    return false;
  }

  const labels = new Set(snapshots.map((snapshot) => snapshot.label));
  return REQUIRED_SHADOW_SNAPSHOT_LABELS.every((label) => labels.has(label));
}


const PLACEHOLDER_BUILDING_HEIGHT_M = 12;
const PLACEHOLDER_HALF_SIZE_M = 6;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeLinearRing(ring: Position[] | undefined): [number, number][] {
  if (!Array.isArray(ring)) return [];

  const normalized: [number, number][] = [];
  for (const coordinate of ring) {
    const [lng, lat] = coordinate;
    if (isFiniteNumber(lng) && isFiniteNumber(lat)) {
      normalized.push([lng, lat]);
    }
  }

  if (normalized.length >= 2) {
    const [firstLng, firstLat] = normalized[0];
    const [lastLng, lastLat] = normalized[normalized.length - 1];
    if (firstLng === lastLng && firstLat === lastLat) {
      normalized.pop();
    }
  }

  return normalized.length >= 3 ? normalized : [];
}

function ringArea(ring: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += (x1 * y2) - (x2 * y1);
  }
  return area * 0.5;
}

function extractPrimaryRing(geometry?: Geometry): [number, number][] | null {
  if (!geometry) return null;

  if (geometry.type === 'Polygon') {
    const ring = normalizeLinearRing(geometry.coordinates[0]);
    return ring.length >= 3 ? ring : null;
  }

  if (geometry.type === 'MultiPolygon') {
    let bestRing: [number, number][] | null = null;
    let bestArea = 0;

    for (const polygon of geometry.coordinates) {
      const ring = normalizeLinearRing(polygon[0]);
      if (ring.length < 3) continue;
      const area = Math.abs(ringArea(ring));
      if (!bestRing || area > bestArea) {
        bestRing = ring;
        bestArea = area;
      }
    }

    return bestRing;
  }

  return null;
}

function lngLatRingToLocalFootprint(
  ring: [number, number][] | null,
  centerLat: number,
  centerLng: number,
): number[][] | null {
  if (!ring || ring.length < 3) return null;

  const latRad = (centerLat * Math.PI) / 180;
  const metersPerDegLat = 111_132.92;
  const metersPerDegLng = 111_320 * Math.cos(latRad);
  if (!Number.isFinite(metersPerDegLng) || Math.abs(metersPerDegLng) < 1e-6) return null;

  const footprint: number[][] = [];
  for (const [lng, lat] of ring) {
    const dx = (lng - centerLng) * metersPerDegLng;
    const dy = (lat - centerLat) * metersPerDegLat;
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      footprint.push([dx, dy]);
    }
  }

  return footprint.length >= 3 ? footprint : null;
}

function createPlaceholderFootprint(): number[][] {
  const d = PLACEHOLDER_HALF_SIZE_M;
  return [[-d, -d], [d, -d], [d, d], [-d, d]];
}

function createImmediateTarget3D(
  addressId: string,
  pandId: string,
  rdX: number,
  rdY: number,
  lat: number,
  lng: number,
  building: BuildingFactsResponse['building'] | undefined,
): Neighborhood3DResponse {
  const primaryRing = extractPrimaryRing(building?.footprint_geojson);
  const footprint = lngLatRingToLocalFootprint(primaryRing, lat, lng) ?? createPlaceholderFootprint();

  return {
    address_id: addressId,
    target_pand_id: pandId,
    center: { lat, lng, rd_x: rdX, rd_y: rdY },
    buildings: [{
      pand_id: pandId,
      ground_height: 0,
      building_height: PLACEHOLDER_BUILDING_HEIGHT_M,
      footprint,
      year: building?.construction_year,
    }],
  };
}

function mergeNeighborhood3DWithFallback(
  neighborhood: Neighborhood3DResponse,
  phase1Target: Neighborhood3DResponse | null,
): Neighborhood3DResponse {
  const fallbackTargetId = phase1Target?.target_pand_id;
  const fallbackTarget = fallbackTargetId
    ? phase1Target?.buildings.find((b) => b.pand_id === fallbackTargetId)
    : undefined;

  const mergedTargetId = neighborhood.target_pand_id ?? fallbackTarget?.pand_id;
  if (!mergedTargetId) {
    return neighborhood;
  }

  const mergedBuildings = [...neighborhood.buildings];
  let targetIndex = mergedBuildings.findIndex((b) => b.pand_id === mergedTargetId);

  if (targetIndex < 0 && fallbackTarget) {
    mergedBuildings.unshift(fallbackTarget);
    targetIndex = 0;
  }

  if (targetIndex > 0) {
    const [targetBuilding] = mergedBuildings.splice(targetIndex, 1);
    mergedBuildings.unshift(targetBuilding);
  }

  return {
    ...neighborhood,
    target_pand_id: mergedTargetId,
    buildings: mergedBuildings,
  };
}

function hasSurroundingContext(data: Neighborhood3DResponse | null): boolean {
  if (!data?.target_pand_id || data.buildings.length < 2) {
    return false;
  }
  return data.buildings.some((b) => b.pand_id === data.target_pand_id);
}

type ProgressivePhase = 'house' | 'risk' | 'buurt';

const DEFAULT_MATCH_COMPARE_IDS = [
  'nh_amsterdam_ijburg',
  'nh_utrecht_leidsche_rijn',
  'nh_rotterdam_katendrecht',
];

const DEFAULT_MATCH_KNOWN_NEIGHBORHOODS = [
  { id: 'nh_amsterdam_ijburg', name: 'IJburg' },
  { id: 'nh_utrecht_leidsche_rijn', name: 'Leidsche Rijn' },
  { id: 'nh_rotterdam_katendrecht', name: 'Katendrecht' },
];

const PHASE_1_TIMEOUT_MS = 7000;
const PHASE_2_TIMEOUT_MS = 9000;
const CHECKLIST_SESSION_KEY = 'buurt-check:viewing-checklist';
const REPORT_LOOKUP_SESSION_KEY = 'buurt-check:report-lookup';
const POST_CHECKOUT_EXPORT_SESSION_KEY = 'buurt-check:post-checkout-export';
const CHECKOUT_RETURN_SESSION_KEY = 'buurt-check:checkout-return';

interface PostCheckoutExportIntent {
  reportId: string;
  template: 'full_dossier';
  language: ExportLanguage;
}

interface CheckoutReturnContext {
  reportId: string;
  sessionId: string;
  buyerResume?: string;
  vboId?: string;
  lookupId?: string;
}

interface QueuedPostCheckoutResume {
  reportId: string;
  provider: 'stripe' | 'google_play' | 'apple_app_store';
  queuedAt: number;
}

function readBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

const TEMP_DISABLE_PAYMENTS = readBooleanEnv(import.meta.env.VITE_PREVIEW_DISABLE_PAYMENTS, false);
const TEMP_FORCE_FULL_DOSSIER_VIEW = readBooleanEnv(import.meta.env.VITE_PREVIEW_FORCE_FULL_DOSSIER_VIEW, false);

function settleWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<'done' | 'timeout'> {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve('timeout'), timeoutMs);
    promise
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timeoutId);
        resolve('done');
      });
  });
}

function parseLocationRoute(location: Location): ParsedHashRoute {
  const searchQuery = location.search.startsWith('?') ? location.search.slice(1) : location.search;

  if (location.hash) {
    const parsed = parseHashRoute(location.hash);
    if (parsed.route !== 'dossier' || !searchQuery) {
      return parsed;
    }

    const params = new URLSearchParams(searchQuery);
    const routeMatchSession = params.get('match_session') ?? undefined;
    const routeMatchNeighborhood = params.get('match_neighborhood') ?? undefined;
    const routeMatchTarget = params.get('match_return') ?? undefined;
    const routeMatchReturn = routeMatchTarget || routeMatchSession || routeMatchNeighborhood
      ? {
        target: routeMatchTarget || (
          routeMatchSession && routeMatchNeighborhood
            ? `#/match/session/${encodeURIComponent(routeMatchSession)}/neighborhood/${encodeURIComponent(routeMatchNeighborhood)}`
            : routeMatchSession
              ? `#/match/session/${encodeURIComponent(routeMatchSession)}/results`
              : '#/match/map'
        ),
        sessionId: routeMatchSession,
        neighborhoodId: routeMatchNeighborhood,
      }
      : undefined;
    return {
      ...parsed,
      lookupId: parsed.lookupId ?? params.get('lookup') ?? undefined,
      reportId: parsed.reportId ?? params.get('report') ?? undefined,
      sessionId: parsed.sessionId ?? params.get('session_id') ?? undefined,
      buyerResume: parsed.buyerResume ?? params.get('buyer_resume') ?? undefined,
      matchReturn: parsed.matchReturn ?? routeMatchReturn,
    };
  }

  return parseRoute(location.pathname || '/', searchQuery);
}

function initialScreenFromRoute(parsed: ParsedHashRoute, hasDossierSeed: boolean): Screen {
  if (hasDossierSeed) return 'dossier';
  return parsed.route;
}

function tabForScreen(screen: Screen): TabId {
  if (screen === 'shortlist' || screen === 'compare') return 'saved';
  if (screen === 'dossier' || screen === 'pack' || screen === 'shared') return 'briefing';
  return 'home';
}

const MATCH_RETURN_ROUTES: ReadonlySet<HashRoute> = new Set([
  'matchLanding',
  'matchSurveyIntro',
  'matchSurvey',
  'matchReview',
  'matchRun',
  'matchSuccess',
  'matchResults',
  'matchNeighborhood',
  'matchReport',
  'matchMap',
]);

const MATCH_SESSION_STORAGE_KEY = 'buurt-check-match-first-session-id';
type MatchJobStatus = 'running' | 'completed' | 'failed';
const MATCH_JOB_STATUS_KEY_PREFIX = 'buurt-check-match-first-job-status:';
const MATCH_RETURN_CONTEXT_KEY_PREFIX = 'buurt-check-match-first-return-context:';

function createMatchSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `match-${crypto.randomUUID()}`;
  }
  return `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStoredMatchSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(MATCH_SESSION_STORAGE_KEY);
}

function storeMatchSessionId(sessionId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MATCH_SESSION_STORAGE_KEY, sessionId);
}

function matchJobStatusStorageKey(sessionId: string): string {
  return `${MATCH_JOB_STATUS_KEY_PREFIX}${sessionId}`;
}

function isMatchJobStatus(value: unknown): value is MatchJobStatus {
  return value === 'running' || value === 'completed' || value === 'failed';
}

function readStoredMatchJobStatus(sessionId: string | null | undefined): MatchJobStatus | null {
  if (typeof window === 'undefined' || !sessionId) return null;
  const value = window.localStorage.getItem(matchJobStatusStorageKey(sessionId));
  return isMatchJobStatus(value) ? value : null;
}

function storeMatchJobStatus(sessionId: string, status: MatchJobStatus): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(matchJobStatusStorageKey(sessionId), status);
}

function matchReturnContextStorageKey(sessionId: string): string {
  return `${MATCH_RETURN_CONTEXT_KEY_PREFIX}${sessionId}`;
}

function normalizeStoredMatchReturnContext(value: Partial<MatchReturnContext> | null | undefined): MatchReturnContext | null {
  if (!value) return null;
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId : undefined;
  const neighborhoodId = typeof value.neighborhoodId === 'string' ? value.neighborhoodId : undefined;
  const target = typeof value.target === 'string' && value.target.length > 0
    ? value.target
    : sessionId && neighborhoodId
      ? `#/match/session/${encodeURIComponent(sessionId)}/neighborhood/${encodeURIComponent(neighborhoodId)}`
      : sessionId
        ? `#/match/session/${encodeURIComponent(sessionId)}/results`
        : '#/match';

  return {
    target,
    sessionId,
    neighborhoodId,
    mapCenter: Array.isArray(value.mapCenter) && value.mapCenter.length === 2
      ? [Number(value.mapCenter[0]), Number(value.mapCenter[1])]
      : undefined,
    mapZoom: typeof value.mapZoom === 'number' ? value.mapZoom : undefined,
    listScroll: typeof value.listScroll === 'number' ? value.listScroll : undefined,
    language: value.language === 'en' || value.language === 'nl' ? value.language : undefined,
    selectedHouseId: typeof value.selectedHouseId === 'string' ? value.selectedHouseId : undefined,
  };
}

function readStoredMatchReturnContext(sessionId: string | null | undefined): MatchReturnContext | null {
  if (typeof window === 'undefined' || !sessionId) return null;
  try {
    const raw = window.localStorage.getItem(matchReturnContextStorageKey(sessionId));
    if (!raw) return null;
    return normalizeStoredMatchReturnContext(JSON.parse(raw) as Partial<MatchReturnContext>);
  } catch {
    return null;
  }
}

function storeMatchReturnContext(context: MatchReturnContext | null | undefined): void {
  if (typeof window === 'undefined' || !context?.sessionId) return;
  const normalized = normalizeStoredMatchReturnContext(context);
  if (!normalized) return;
  window.localStorage.setItem(matchReturnContextStorageKey(context.sessionId), JSON.stringify(normalized));
}

function normalizeMatchReturnTarget(context: MatchReturnContext | null | undefined): { hash: string; screen: Screen } {
  if (context?.target) {
    const hash = context.target.startsWith('#') ? context.target : `#${context.target}`;
    const parsed = parseHashRoute(hash);
    if (parsed.route === 'matchMap' && context.sessionId) {
      const route = context.neighborhoodId ? 'matchNeighborhood' : 'matchResults';
      const normalized = buildHashRoute({
        route,
        sessionId: context.sessionId,
        neighborhoodId: context.neighborhoodId,
      });
      return { hash: normalized, screen: route };
    }
    if (MATCH_RETURN_ROUTES.has(parsed.route)) {
      return { hash: buildHashRoute(parsed), screen: parsed.route };
    }
  }
  if (context?.sessionId) {
    const route = context.neighborhoodId ? 'matchNeighborhood' : 'matchResults';
    const hash = buildHashRoute({
      route,
      sessionId: context.sessionId,
      neighborhoodId: context.neighborhoodId,
    });
    return { hash, screen: route };
  }
  return { hash: '#/match', screen: 'matchLanding' };
}

function formatMatchCenterAttribute(center: [number, number] | undefined): string | undefined {
  return center ? JSON.stringify(center) : undefined;
}

function formatNumberAttribute(value: number | undefined): string | undefined {
  return typeof value === 'number' ? String(value) : undefined;
}

function hashRouteFromUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    const parsed = url.hash
      ? parseHashRoute(url.hash)
      : parseRoute(
        url.pathname || '/',
        url.search.startsWith('?') ? url.search.slice(1) : url.search,
      );
    return buildHashRoute(parsed);
  } catch {
    return null;
  }
}

const DUTCH_POSTCODE_RE = /\b\d{4}\s?[A-Z]{2}\b/gi;

function normalizeSelectionRecoveryText(value: string): string {
  return value
    .toLowerCase()
    .replace(DUTCH_POSTCODE_RE, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSelectionRecoveryQueries(displayName: string): string[] {
  const normalizedDisplayName = displayName.replace(/\s+/g, ' ').trim();
  const withoutPostcode = normalizedDisplayName
    .replace(DUTCH_POSTCODE_RE, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim()
    .replace(/,\s*$/, '');

  const queries = [withoutPostcode, normalizedDisplayName]
    .map((value) => value.trim())
    .filter((value, index, values) => value.length >= 4 && values.indexOf(value) === index);

  return queries;
}

function pickRecoveredSuggestion(
  displayName: string,
  suggestions: AddressSuggestion[],
): AddressSuggestion | null {
  const targetPrefix = normalizeSelectionRecoveryText(displayName.split(',')[0] ?? displayName);
  if (!targetPrefix) {
    return null;
  }

  for (const suggestion of suggestions) {
    const normalizedCandidate = normalizeSelectionRecoveryText(suggestion.display_name);
    if (normalizedCandidate.startsWith(targetPrefix)) {
      return suggestion;
    }
  }

  return null;
}

function checkoutVerificationKey(reportId: string, sessionId?: string): string {
  return `${reportId}:${sessionId ?? ''}`;
}

function getDossierScrollContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const element = document.getElementById('dossier-content');
  return element instanceof HTMLElement ? element : null;
}

function hasInternalDossierScroll(container: HTMLElement | null): container is HTMLElement {
  if (!container) return false;
  return container.scrollHeight > container.clientHeight + 2;
}

function dossierSectionStyle(index: number): CSSProperties {
  return { '--section-index': index } as CSSProperties;
}

function checklistStorageKey(vboId: string): string {
  return `${CHECKLIST_SESSION_KEY}:${vboId}`;
}

function reportLookupStorageKey(reportId: string): string {
  return `${REPORT_LOOKUP_SESSION_KEY}:${reportId}`;
}

function storeReportLookup(reportId: string, lookupId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(reportLookupStorageKey(reportId), lookupId);
  } catch {
    // Ignore storage failures.
  }
}

function getReportLookup(reportId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(reportLookupStorageKey(reportId));
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

const POST_CHECKOUT_CONFIRM_ATTEMPTS = 4;
const POST_CHECKOUT_CONFIRM_DELAY_MS = 2_000;
const POST_CHECKOUT_BACKGROUND_ATTEMPTS = 10;
const POST_CHECKOUT_BACKGROUND_DELAY_MS = 3_000;

function isRetryableCheckoutVerificationError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.httpStatus === undefined || error.httpStatus >= 500 || error.httpStatus === 429;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  return error instanceof TypeError;
}

function readChecklistState(vboId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(checklistStorageKey(vboId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

function persistChecklistState(vboId: string, checked: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      checklistStorageKey(vboId),
      JSON.stringify(Array.from(checked.values())),
    );
  } catch {
    // Ignore storage failures (private mode / quota).
  }
}

function storePostCheckoutExportIntent(intent: PostCheckoutExportIntent): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      POST_CHECKOUT_EXPORT_SESSION_KEY,
      JSON.stringify(intent),
    );
  } catch {
    // Ignore storage failures.
  }
}

function loadPostCheckoutExportIntent(fallbackLanguage: ExportLanguage): PostCheckoutExportIntent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(POST_CHECKOUT_EXPORT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PostCheckoutExportIntent>;
    if (parsed.reportId && parsed.template === 'full_dossier') {
      return {
        reportId: parsed.reportId,
        template: 'full_dossier',
        language: parsed.language === 'en' || parsed.language === 'nl'
          ? parsed.language
          : fallbackLanguage,
      };
    }
  } catch {
    // Ignore storage failures.
  }
  return null;
}

function clearPostCheckoutExportIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(POST_CHECKOUT_EXPORT_SESSION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function consumePostCheckoutExportIntent(
  reportId: string,
  fallbackLanguage: ExportLanguage,
): PostCheckoutExportIntent | null {
  const intent = loadPostCheckoutExportIntent(fallbackLanguage);
  if (!intent || intent.reportId !== reportId) {
    return null;
  }
  clearPostCheckoutExportIntent();
  return intent;
}

function storeCheckoutReturnContext(context: CheckoutReturnContext): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      CHECKOUT_RETURN_SESSION_KEY,
      JSON.stringify(context),
    );
  } catch {
    // Ignore storage failures.
  }
}

function loadCheckoutReturnContext(): CheckoutReturnContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_RETURN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutReturnContext>;
    if (
      typeof parsed.reportId === 'string'
      && typeof parsed.sessionId === 'string'
    ) {
      return {
        reportId: parsed.reportId,
        sessionId: parsed.sessionId,
        buyerResume: typeof parsed.buyerResume === 'string' ? parsed.buyerResume : undefined,
        vboId: typeof parsed.vboId === 'string' ? parsed.vboId : undefined,
        lookupId: typeof parsed.lookupId === 'string' ? parsed.lookupId : undefined,
      };
    }
  } catch {
    // Ignore storage failures.
  }
  return null;
}

function clearCheckoutReturnContext(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CHECKOUT_RETURN_SESSION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

const PREBID_CHECKED_AT = '2026-05-06';

function sourceRef(
  row: PrebidCoverageRow,
  fallbackName: string,
): PrebidVerificationAction['source_refs'][number] {
  return {
    id: row.id,
    name: row.label || fallbackName,
    source_date: row.source_date,
    checked_at: row.checked_at,
    method: row.method,
    version: row.version,
    coverage_status: row.status,
    limitation: row.limitation,
    limitation_nl: row.limitation_nl,
  };
}

function findCoverage(rows: PrebidCoverageRow[], id: string): PrebidCoverageRow {
  return rows.find((row) => row.id === id) ?? rows[0];
}

function buildPrebidCoverageRows({
  buildingResponse,
  riskCards,
  neighborhoodStats,
  livability,
  sunlight,
}: {
  buildingResponse: BuildingFactsResponse | null;
  riskCards: RiskCardsResponse | null;
  neighborhoodStats: NeighborhoodStatsResponse | null;
  livability: LivabilityResponse | null;
  sunlight: SunlightResult | null;
}): PrebidCoverageRow[] {
  return [
    {
      id: 'bag-building',
      authority: 'Kadaster BAG',
      label: 'BAG building and address',
      status: buildingResponse?.building ? 'checked' : 'unavailable',
      basis: 'Confirmed VBO and building record',
      method: 'BAG lookup',
      version: 'v1',
      checked_at: PREBID_CHECKED_AT,
      source_date: buildingResponse?.building?.document_date,
      duration_ms: 420,
      limitation: 'BAG records describe official registration and may lag recent renovations or informal use.',
      limitation_nl: 'BAG-registraties beschrijven de officiele registratie en kunnen achterlopen op recente verbouwingen of informeel gebruik.',
    },
    {
      id: 'noise',
      authority: 'RIVM',
      label: riskCards?.noise.source ?? 'RIVM noise contours',
      status: riskCards ? 'checked' : 'unavailable',
      basis: 'Address point against modelled contour layers',
      method: 'Open-data overlay',
      version: riskCards?.noise.layer,
      checked_at: PREBID_CHECKED_AT,
      source_date: riskCards?.noise.source_date,
      duration_ms: 580,
      limitation: 'Noise contours are modelled outdoor signals. Verify indoor noise and facade quality during the viewing.',
      limitation_nl: 'Geluidcontouren zijn gemodelleerde buitensignalen. Controleer binnen geluid en gevelkwaliteit tijdens de bezichtiging.',
    },
    {
      id: 'air',
      authority: 'RIVM',
      label: riskCards?.air_quality.source ?? 'RIVM air quality',
      status: riskCards ? 'checked' : 'unavailable',
      basis: 'Address point against PM2.5 and NO2 model layers',
      method: 'Open-data overlay',
      version: [riskCards?.air_quality.pm25_layer, riskCards?.air_quality.no2_layer].filter(Boolean).join(' / '),
      checked_at: PREBID_CHECKED_AT,
      source_date: riskCards?.air_quality.source_date,
      duration_ms: 530,
      limitation: 'Air quality layers are annual model estimates and do not capture temporary roadworks or indoor ventilation.',
      limitation_nl: 'Luchtkwaliteitslagen zijn jaarlijkse modelschattingen en tonen geen tijdelijke werkzaamheden of binnenventilatie.',
    },
    {
      id: 'climate',
      authority: 'Klimaateffectatlas',
      label: riskCards?.climate_stress.source ?? 'Climate stress layers',
      status: riskCards ? 'checked' : 'unavailable',
      basis: 'Heat and water stress around the address',
      method: 'Open-data overlay',
      version: [riskCards?.climate_stress.heat_layer, riskCards?.climate_stress.water_layer].filter(Boolean).join(' / '),
      checked_at: PREBID_CHECKED_AT,
      source_date: riskCards?.climate_stress.source_date,
      duration_ms: 610,
      limitation: 'Climate stress is area-level and should be verified against the building, street drainage, and VvE maintenance records.',
      limitation_nl: 'Klimaatstress is gebiedsniveau. Controleer dit met gebouw, straatwaterafvoer en VvE-onderhoudsstukken.',
    },
    {
      id: 'sunlight',
      authority: '3DBAG + SunCalc',
      label: riskCards?.sunlight?.source ?? '3D sunlight context',
      status: sunlight || riskCards?.sunlight ? 'checked' : 'review',
      basis: '3D massing and seasonal sun position',
      method: 'Indicative sunlight model',
      version: sunlight?.methodVersion ?? riskCards?.sunlight?.method_version,
      checked_at: PREBID_CHECKED_AT,
      source_date: riskCards?.sunlight?.source_date ?? sunlight?.analysisYear?.toString(),
      duration_ms: 900,
      limitation: 'Sunlight is indicative and does not describe interior daylight. Verify orientation, nearby massing, and window depth on site.',
      limitation_nl: 'Zonlicht is indicatief en beschrijft geen daglicht binnen. Controleer orientatie, omliggende massa en raamdiepte ter plekke.',
    },
    {
      id: 'neighborhood',
      authority: 'CBS',
      label: neighborhoodStats?.source ?? 'CBS Wijken en Buurten',
      status: neighborhoodStats ? 'checked' : 'skipped',
      basis: neighborhoodStats?.stats?.buurt_name ?? 'Neighborhood-level indicators',
      method: 'CBS neighborhood lookup',
      checked_at: PREBID_CHECKED_AT,
      source_date: neighborhoodStats?.source_year?.toString(),
      duration_ms: 480,
      limitation: 'Neighborhood indicators are aggregated and may not describe the building, street side, or specific block.',
      limitation_nl: 'Buurtindicatoren zijn geaggregeerd en beschrijven niet altijd het gebouw, de straatzijde of het specifieke blok.',
    },
    {
      id: 'livability',
      authority: 'Leefbaarometer',
      label: 'Leefbaarometer',
      status: livability?.available ? 'checked' : 'skipped',
      basis: livability?.available ? livability.buurt_name : 'Not available for this address',
      method: 'Official livability index',
      checked_at: PREBID_CHECKED_AT,
      source_date: livability?.available ? (livability.source_date ?? livability.year) : undefined,
      duration_ms: 520,
      limitation: 'Livability scores are statistical context and do not replace a street visit or buyer due diligence.',
      limitation_nl: 'Leefbaarheidsscores zijn statistische context en vervangen geen straatbezoek of eigen onderzoek.',
    },
  ];
}

function buildPrebidActions(
  rows: PrebidCoverageRow[],
  riskCards: RiskCardsResponse | null,
  buildingResponse: BuildingFactsResponse | null,
  viewingQuestions: ViewingQuestionsResponse | null,
): PrebidVerificationAction[] {
  const noiseRow = findCoverage(rows, 'noise');
  const climateRow = findCoverage(rows, 'climate');
  const sunlightRow = findCoverage(rows, 'sunlight');
  const buildingRow = findCoverage(rows, 'bag-building');
  const noiseQuestion = viewingQuestions?.categories
    .find((category) => category.name.toLowerCase().includes('noise'))
    ?.questions[0];
  const climateQuestion = viewingQuestions?.categories
    .find((category) => category.name.toLowerCase().includes('climate'))
    ?.questions[0];

  const actions: PrebidVerificationAction[] = [
    {
      id: 'noise-viewing-check',
      category: 'noise',
      priority: 1,
      severity: riskCards?.noise.severity ?? levelToSeverity(riskCards?.noise.level ?? 'medium', riskCards?.noise.score),
      finding: riskCards?.noise.summary ?? 'Noise needs a viewing check before you rely on the address.',
      finding_nl: riskCards?.noise.summary_nl ?? 'Geluid vraagt om controle tijdens de bezichtiging.',
      why_it_matters: 'Noise can affect sleep, facade decisions, and renovation expectations. Treat the map as a prompt for an on-site check.',
      why_it_matters_nl: 'Geluid kan slaap, gevelkeuzes en renovatieverwachtingen beinvloeden. Gebruik de kaart als aanleiding voor controle ter plekke.',
      ask_this: {
        en: noiseQuestion?.text_en ?? 'Can you hear traffic or trams with the windows closed in the bedroom?',
        nl: noiseQuestion?.text_nl ?? 'Hoor je verkeer of trams met gesloten ramen in de slaapkamer?',
      },
      request_this: 'Ask for any recent facade, glazing, or ventilation documents if the road side is exposed.',
      request_this_nl: 'Vraag naar recente gevel-, glas- of ventilatiestukken als de straatzijde belast is.',
      who_to_ask: ['Selling agent', 'Seller', 'Inspector'],
      confidence: riskCards?.noise.source_date ? 'medium' : 'data_incomplete',
      limitation: noiseRow.limitation,
      limitation_nl: noiseRow.limitation_nl,
      source_refs: [sourceRef(noiseRow, 'RIVM noise contours')],
      states: { data_incomplete: !riskCards?.noise.source_date },
    },
    {
      id: 'climate-street-check',
      category: 'climate',
      priority: 2,
      severity: riskCards?.climate_stress.severity ?? levelToSeverity(riskCards?.climate_stress.level ?? 'medium', riskCards?.climate_stress.score),
      finding: riskCards?.climate_stress.summary ?? 'Heat or water stress should be checked against the exact street and building.',
      finding_nl: riskCards?.climate_stress.summary_nl ?? 'Hitte of wateroverlast moet met straat en gebouw worden gecontroleerd.',
      why_it_matters: 'Area-level heat and water signals can change what you ask about drainage, shade, and maintenance.',
      why_it_matters_nl: 'Gebiedssignalen voor hitte en water bepalen welke vragen je stelt over afwatering, schaduw en onderhoud.',
      ask_this: {
        en: climateQuestion?.text_en ?? 'Has the seller or VvE had water, heat, or drainage complaints in recent summers?',
        nl: climateQuestion?.text_nl ?? 'Zijn er bij verkoper of VvE klachten geweest over water, hitte of afwatering in recente zomers?',
      },
      request_this: 'Request VvE minutes, drainage notes, or municipality street-work information when relevant.',
      request_this_nl: 'Vraag VvE-notulen, afwateringsinformatie of gemeentelijke informatie over straatwerk op waar relevant.',
      who_to_ask: ['Selling agent', 'VvE', 'Municipality'],
      confidence: riskCards?.climate_stress.source_date ? 'medium' : 'needs_review',
      limitation: climateRow.limitation,
      limitation_nl: climateRow.limitation_nl,
      source_refs: [sourceRef(climateRow, 'Klimaateffectatlas')],
      states: { source_incomplete: !riskCards?.climate_stress.source_date },
    },
    {
      id: 'sunlight-context-check',
      category: 'sunlight',
      priority: 3,
      severity: riskCards?.sunlight?.severity ?? 'moderate',
      finding: riskCards?.sunlight?.summary ?? 'Sunlight context is indicative and should be verified from the rooms you care about.',
      finding_nl: riskCards?.sunlight?.summary_nl ?? 'Zonlichtcontext is indicatief en moet vanuit de relevante kamers worden gecontroleerd.',
      why_it_matters: '3D massing helps frame expectations, but interior daylight depends on floor, window depth, orientation, and nearby buildings.',
      why_it_matters_nl: '3D-massa helpt bij verwachtingen, maar daglicht binnen hangt af van verdieping, raamdiepte, orientatie en omliggende gebouwen.',
      ask_this: {
        en: 'At what time of day do the main living rooms receive direct light in winter and spring?',
        nl: 'Op welk moment van de dag krijgen de belangrijkste woonruimtes direct licht in winter en voorjaar?',
      },
      request_this: 'Check the 3D context, orientation, and any planned nearby construction before bidding.',
      request_this_nl: 'Controleer de 3D-context, orientatie en geplande bouw in de buurt voordat je biedt.',
      who_to_ask: ['Selling agent', 'Municipality', "Buyer's agent"],
      confidence: riskCards?.sunlight?.source_date || riskCards?.sunlight?.score != null ? 'low' : 'needs_review',
      limitation: sunlightRow.limitation,
      limitation_nl: sunlightRow.limitation_nl,
      source_refs: [sourceRef(sunlightRow, '3DBAG + SunCalc')],
      states: { needs_human_review: !riskCards?.sunlight?.source_date },
    },
  ];

  if (buildingResponse?.building?.construction_year && buildingResponse.building.construction_year < 1945) {
    actions.push({
      id: 'older-building-documents',
      category: 'building',
      priority: 4,
      severity: 'moderate',
      finding: 'Older building registration should trigger document checks before you rely on renovation assumptions.',
      finding_nl: 'Een oudere bouwregistratie vraagt om documentcontrole voordat je renovatie-aannames gebruikt.',
      why_it_matters: 'Official registration does not document insulation, foundation, lead-pipe, asbestos, or VvE maintenance status.',
      why_it_matters_nl: 'Officiele registratie documenteert geen isolatie, fundering, loden leidingen, asbest of VvE-onderhoud.',
      ask_this: { en: 'Which renovations are documented, permitted, and included in the sale file?', nl: 'Welke verbouwingen zijn gedocumenteerd, vergund en opgenomen in het verkoopdossier?' },
      request_this: 'Request permits, VvE minutes, maintenance plans, inspection notes, and renovation invoices.',
      request_this_nl: 'Vraag vergunningen, VvE-notulen, onderhoudsplannen, inspectienotities en renovatiefacturen op.',
      who_to_ask: ['Selling agent', 'Seller', 'VvE', 'Notary'],
      confidence: 'medium',
      limitation: buildingRow.limitation,
      limitation_nl: buildingRow.limitation_nl,
      source_refs: [sourceRef(buildingRow, 'BAG building and address')],
    });
  }

  return actions.sort((left, right) => left.priority - right.priority).slice(0, 3);
}

function buildSourceQualityCaps(actions: PrebidVerificationAction[], rows: PrebidCoverageRow[]) {
  const caps: string[] = [];
  const missingSourceRefCount = actions.filter((action) => action.source_refs.length === 0).length;
  const missingRecipientCount = actions.filter((action) => action.who_to_ask.length === 0).length;
  const unknownSourceDateCount = actions.filter((action) => action.source_refs.some((source) => !source.source_date && !source.checked_at)).length;
  const genericConfidenceCount = actions.filter((action) => action.confidence === 'data_incomplete').length;
  const genericLimitationCount = rows.filter((row) => row.limitation.length < 24).length;

  if (missingSourceRefCount > 0) caps.push('missing_source_refs');
  if (missingRecipientCount > 0) caps.push('missing_recipients');
  if (unknownSourceDateCount > Math.max(1, Math.floor(actions.length * 0.15))) caps.push('unknown_source_dates');
  if (genericConfidenceCount > Math.max(0, Math.floor(actions.length * 0.1))) caps.push('generic_confidence');
  if (genericLimitationCount > Math.max(0, Math.floor(rows.length * 0.1))) caps.push('generic_limitations');

  return {
    unknown_source_date_count: unknownSourceDateCount,
    generic_confidence_count: genericConfidenceCount,
    generic_limitation_count: genericLimitationCount,
    missing_source_ref_count: missingSourceRefCount,
    missing_recipient_count: missingRecipientCount,
    caps,
  };
}

function buildLocalPrebidBriefing({
  address,
  reportId,
  buildingResponse,
  riskCards,
  neighborhoodStats,
  livability,
  sunlight,
  viewingQuestions,
}: {
  address: ResolvedAddress | null;
  reportId: string | null;
  buildingResponse: BuildingFactsResponse | null;
  riskCards: RiskCardsResponse | null;
  neighborhoodStats: NeighborhoodStatsResponse | null;
  livability: LivabilityResponse | null;
  sunlight: SunlightResult | null;
  viewingQuestions: ViewingQuestionsResponse | null;
}): PrebidBriefingResponse | null {
  if (!address?.adresseerbaar_object_id) return null;
  const coverage = buildPrebidCoverageRows({
    buildingResponse,
    riskCards,
    neighborhoodStats,
    livability,
    sunlight,
  });
  const topActions = buildPrebidActions(coverage, riskCards, buildingResponse, viewingQuestions);
  const sourceQuality = buildSourceQualityCaps(topActions, coverage);
  const hasIncompleteSources = coverage.some((row) => row.status === 'failed' || row.status === 'unavailable' || row.status === 'review');
  return {
    briefing_id: `local-${address.adresseerbaar_object_id}`,
    address_id: address.adresseerbaar_object_id,
    report_id: reportId ?? undefined,
    address_label: address.display_name,
    checked_at: PREBID_CHECKED_AT,
    result_state: hasIncompleteSources ? 'data_incomplete' : 'ready',
    disclaimer: 'Source-bound briefing for viewing preparation. Confirm decisions with your inspector, adviser, notary, or buyer agent.',
    disclaimer_nl: 'Brongebonden briefing voor bezichtigingsvoorbereiding. Bevestig beslissingen met je bouwkundige, adviseur, notaris of aankoopmakelaar.',
    coverage,
    top_actions: topActions,
    source_quality: sourceQuality,
  };
}

function buildLocalPrebidPack(briefing: PrebidBriefingResponse | null): PrebidPackResponse | null {
  if (!briefing) return null;
  const questionGroups = new Map<string, { questions: Array<{ en: string; nl?: string }>; requests: string[] }>();

  for (const action of briefing.top_actions) {
    for (const recipient of action.who_to_ask) {
      const group = questionGroups.get(recipient) ?? { questions: [], requests: [] };
      group.questions.push(action.ask_this);
      group.requests.push(action.request_this);
      questionGroups.set(recipient, group);
    }
  }

  return {
    pack_id: `pack-${briefing.address_id}`,
    address_id: briefing.address_id,
    report_id: briefing.report_id ?? `report-${briefing.address_id}`,
    address_label: briefing.address_label,
    checked_at: briefing.checked_at,
    status: briefing.result_state === 'ready' ? 'ready' : 'data_incomplete',
    disclaimer: briefing.disclaimer,
    disclaimer_nl: briefing.disclaimer_nl,
    actions: briefing.top_actions,
    question_groups: Array.from(questionGroups.entries()).map(([recipient, value]) => ({
      recipient,
      questions: value.questions,
      requests: Array.from(new Set(value.requests)),
    })),
    coverage: briefing.coverage,
    share_url: `https://app.buurt-check.nl/#/shared-pack/demo-${briefing.address_id}`,
  };
}

function buildSharedPrebidResponse(
  mode: 'briefing' | 'pack',
  token: string | undefined,
  briefing: PrebidBriefingResponse | null,
  pack: PrebidPackResponse | null,
): SharedPrebidResponse {
  const lowerToken = token?.toLowerCase() ?? '';
  if (lowerToken.includes('expired')) return { state: 'expired', mode, support_email: 'support@buurt-check.nl' };
  if (lowerToken.includes('revoked')) return { state: 'revoked', mode, support_email: 'support@buurt-check.nl' };
  if (lowerToken.includes('deleted')) return { state: 'deleted', mode, support_email: 'support@buurt-check.nl' };
  if (lowerToken.includes('forbidden')) return { state: 'forbidden', mode, support_email: 'support@buurt-check.nl' };
  if (mode === 'pack' && pack) return { state: 'valid', mode, pack };
  if (mode === 'briefing' && briefing) return { state: 'valid', mode, briefing };
  return { state: 'not_found', mode, support_email: 'support@buurt-check.nl' };
}

function App() {
  useViewportBottomOffset();
  const { t, i18n } = useTranslation();
  const uiLanguage = normalizeUiLanguage(i18n.resolvedLanguage ?? i18n.language);
  const isNl = uiLanguage === 'nl';
  const analyticsEnabled = isAnalyticsEnabled();
  const serverRenderAvailable = isServerRenderAvailable();
  const dossierSeed = useMemo(readDossierSeed, []);
  const initialHasDossier = !!(dossierSeed?.address && dossierSeed?.buildingResponse);
  const initialRoute = useMemo(() => (
    typeof window === 'undefined' ? parseRoute('/', '') : parseLocationRoute(window.location)
  ), []);
  const initialScreen = useMemo(
    () => initialScreenFromRoute(initialRoute, initialHasDossier),
    [initialHasDossier, initialRoute],
  );
  const initialMatchSessionId = useMemo(() => (
    initialRoute.route.startsWith('match') ? initialRoute.sessionId ?? readStoredMatchSessionId() : initialRoute.matchReturn?.sessionId ?? null
  ), [initialRoute]);
  const initialMatchMapReturnContext = useMemo(() => (
    initialRoute.matchReturn
      ?? (initialRoute.route.startsWith('match') ? readStoredMatchReturnContext(initialRoute.sessionId ?? null) : null)
  ), [initialRoute]);
  const { toasts, showToast, dismissToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>(() => tabForScreen(initialScreen));
  const [activeScreen, setActiveScreen] = useState<Screen>(initialScreen);
  const [activeMatchSessionId, setActiveMatchSessionId] = useState<string | null>(() => (
    initialMatchSessionId
  ));
  const [activeMatchNeighborhoodId, setActiveMatchNeighborhoodId] = useState<string | null>(() => (
    initialRoute.neighborhoodId ?? initialRoute.matchReturn?.neighborhoodId ?? null
  ));
  const [matchReturnContext, setMatchReturnContext] = useState<MatchReturnContext | null>(
    () => (initialScreen === 'dossier' ? initialRoute.matchReturn ?? null : null),
  );
  const [matchMapReturnContext, setMatchMapReturnContext] = useState<MatchReturnContext | null>(
    () => initialMatchMapReturnContext,
  );
  const [activeMatchJobStatus, setActiveMatchJobStatus] = useState<MatchJobStatus | null>(() => (
    readStoredMatchJobStatus(initialMatchSessionId)
  ));
  const [matchQuizResponse] = useState<MatchQuizResponse | null>(null);
  const [matchRecommendations, setMatchRecommendations] = useState<MatchRecommendationsResponse | null>(null);
  const matchRecommendationsLoading = false;
  const matchRecommendationsErrorCode = null;
  const [matchReport] = useState<MatchReportResponse | null>(null);
  const matchReportLoading = false;
  const matchReportErrorCode = null;
  const [activeMatchShareToken, setActiveMatchShareToken] = useState<string | null>(null);
  const [sharedMatchReport, setSharedMatchReport] = useState<MatchReportResponse | null>(null);
  const [sharedMatchReportLoading, setSharedMatchReportLoading] = useState(false);
  const [sharedMatchReportErrorCode, setSharedMatchReportErrorCode] = useState<string | null>(null);
  const [matchListings, setMatchListings] = useState<MatchListingProviderResult | null>(null);
  const [matchListingsLoading, setMatchListingsLoading] = useState(false);
  const [matchListingsErrorCode, setMatchListingsErrorCode] = useState<string | null>(null);
  const [matchAlerts, setMatchAlerts] = useState<MatchAlertRule[]>([]);
  const [matchAlertsLoading, setMatchAlertsLoading] = useState(false);
  const [matchAlertsLoaded, setMatchAlertsLoaded] = useState(false);
  const [matchAlertsErrorCode, setMatchAlertsErrorCode] = useState<string | null>(null);
  const [matchSavedNeighborhoods, setMatchSavedNeighborhoods] = useState<SavedNeighborhood[]>([]);
  const [matchSavedLoading, setMatchSavedLoading] = useState(false);
  const [matchSavedLoaded, setMatchSavedLoaded] = useState(false);
  const [matchSavedErrorCode, setMatchSavedErrorCode] = useState<string | null>(null);
  const [matchShare, setMatchShare] = useState<ReportShareResponse | null>(null);
  const [matchExportReady, setMatchExportReady] = useState(false);
  const [matchAdminHealth, setMatchAdminHealth] = useState<MatchAdminHealthResponse | null>(null);
  const [matchAdminLoading, setMatchAdminLoading] = useState(false);
  const [matchAdminErrorCode, setMatchAdminErrorCode] = useState<string | null>(null);
  const [matchComparisonResponse, setMatchComparisonResponse] = useState<MatchCompareResponse | null>(null);
  const [matchComparisonLoading, setMatchComparisonLoading] = useState(false);
  const [matchComparisonErrorCode, setMatchComparisonErrorCode] = useState<string | null>(null);
  const [matchSimilarResponse, setMatchSimilarResponse] = useState<MatchSimilarResponse | null>(null);
  const [matchSimilarLoading, setMatchSimilarLoading] = useState(false);
  const [matchSimilarErrorCode, setMatchSimilarErrorCode] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(getTheme());
  const [analyticsConsent, setAnalyticsConsentState] = useState<AnalyticsConsentState>(() =>
    analyticsEnabled ? getAnalyticsConsent() : 'unknown',
  );
  const [address, setAddress] = useState<ResolvedAddress | null>(dossierSeed?.address ?? null);
  const [activeLookupId, setActiveLookupId] = useState<string | null>(dossierSeed?.address?.id ?? null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [dossierPriceEur, setDossierPriceEur] = useState(() => getDossierPrice());
  const [billingProvider, setBillingProvider] = useState<BillingProvider>('stripe');
  const [appleLocalizedPriceLabel, setAppleLocalizedPriceLabel] = useState<string | null>(null);
  const [isEntitled, setIsEntitled] = useState(TEMP_FORCE_FULL_DOSSIER_VIEW);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutStatusMessage, setCheckoutStatusMessage] = useState<string | null>(null);
  const [checkoutRetryAvailable, setCheckoutRetryAvailable] = useState(false);
  const [checkoutVerification, setCheckoutVerification] = useState<{
    reportId: string;
    sessionId?: string;
    buyerResume?: string;
  } | null>(null);
  const [queuedPostCheckoutResume, setQueuedPostCheckoutResume] = useState<QueuedPostCheckoutResume | null>(null);
  const [buildingResponse, setBuildingResponse] = useState<BuildingFactsResponse | null>(
    dossierSeed?.buildingResponse ?? null,
  );
  const [buildingLoading, setBuildingLoading] = useState(false);
  const [buildingError, setBuildingError] = useState<string | null>(null);
  const [neighborhood3D, setNeighborhood3D] = useState<Neighborhood3DResponse | null>(
    dossierSeed?.neighborhood3D ?? null,
  );
  const [neighborhood3DLoading, setNeighborhood3DLoading] = useState(false);
  const [neighborhood3DError, setNeighborhood3DError] = useState<string | null>(null);
  const [surroundingLoading, setSurroundingLoading] = useState(false);
  const [riskCards, setRiskCards] = useState<RiskCardsResponse | null>(dossierSeed?.riskCards ?? null);
  const [riskComparisons, setRiskComparisons] = useState<RiskComparisonsResponse | null>(
    dossierSeed?.riskComparisons ?? null,
  );
  const [riskComparisonsError, setRiskComparisonsError] = useState<string | null>(null);
  const [riskComparisonsLoading, setRiskComparisonsLoading] = useState(false);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [neighborhoodStats, setNeighborhoodStats] = useState<NeighborhoodStatsResponse | null>(
    dossierSeed?.neighborhoodStats ?? null,
  );
  const [neighborhoodStatsLoading, setNeighborhoodStatsLoading] = useState(false);
  const [neighborhoodStatsError, setNeighborhoodStatsError] = useState<string | null>(null);
  const [propertyWarnings, setPropertyWarnings] = useState<PropertyWarningsResponse | null>(
    dossierSeed?.propertyWarnings ?? null,
  );
  const [propertyWarningsLoading, setPropertyWarningsLoading] = useState(false);
  const [propertyWarningsError, setPropertyWarningsError] = useState<string | null>(null);
  const [livability, setLivability] = useState<LivabilityResponse | null>(
    dossierSeed?.livability ?? null,
  );
  const [livabilityLoading, setLivabilityLoading] = useState(false);
  const [livabilityError, setLivabilityError] = useState<string | null>(null);
  const [showLivabilityDetail, setShowLivabilityDetail] = useState(false);
  const [sunlight, setSunlight] = useState<SunlightResult | null>(dossierSeed?.sunlight ?? null);
  const [sunlightUnavailable, setSunlightUnavailable] = useState(false);
  const [sunDateTime, setSunDateTime] = useState<Date | undefined>(undefined);
  const [shadowSnapshots, setShadowSnapshots] = useState<ShadowSnapshot[] | null>(
    dossierSeed?.shadowSnapshots ?? null,
  );
  const [shadowSnapshotsUnavailable, setShadowSnapshotsUnavailable] = useState(false);
  const [viewingQuestions, setViewingQuestions] = useState<ViewingQuestionsResponse | null>(
    dossierSeed?.viewingQuestions ?? null,
  );
  const [viewingQuestionsLoading, setViewingQuestionsLoading] = useState(false);
  const [viewingQuestionsError, setViewingQuestionsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingProgressStep>('findingBuilding');
  const [loadingWarningKey, setLoadingWarningKey] = useState<string | null>(null);
  const [progressivePhase, setProgressivePhase] = useState<ProgressivePhase>(
    initialHasDossier ? 'buurt' : 'house',
  );
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(initialHasDossier ? 'half' : 'hidden');
  const [pendingDisplayName, setPendingDisplayName] = useState<string | null>(null);
  const [prebidBriefing, setPrebidBriefing] = useState<PrebidBriefingResponse | null>(null);
  const [remotePrebidPack, setRemotePrebidPack] = useState<PrebidPackResponse | null>(null);
  const [prebidPackLoading, setPrebidPackLoading] = useState(false);
  const [prebidPackError, setPrebidPackError] = useState<string | null>(null);
  const [remoteSharedPrebidResponse, setRemoteSharedPrebidResponse] = useState<SharedPrebidResponse | null>(null);
  const [sharedPrebidLoading, setSharedPrebidLoading] = useState(false);
  const [shareUrls, setShareUrls] = useState<{ pack?: string }>({});
  const [shareProviderUnavailable, setShareProviderUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const neighborhood3DRequestId = useRef(0);
  const addressRef = useRef<ResolvedAddress | null>(dossierSeed?.address ?? null);
  const activeScreenRef = useRef<Screen>(initialScreen);
  const screenScrollPositionsRef = useRef(new Map<Screen, number>());
  const previousScreenForScrollRef = useRef<Screen>(initialScreen);
  const addressRequestAbortRef = useRef<AbortController | null>(null);
  const retryControllersRef = useRef<Set<AbortController>>(new Set());
  const previousScreenRef = useRef<Screen>(initialScreen);
  const previousAnalyticsConsentRef = useRef<AnalyticsConsentState>(analyticsConsent);
  const handledCheckoutParamsRef = useRef<string | null>(null);
  const activatePurchasedEntitlementRef = useRef<
    ((reportId: string, provider: 'stripe' | 'google_play' | 'apple_app_store') => void) | null
  >(null);
  const resumePurchasedExportRef = useRef<
    ((reportId: string, provider: 'stripe' | 'google_play' | 'apple_app_store') => void) | null
  >(null);
  const recoverCheckoutAddressRef = useRef<
    ((details: CheckoutConfirmationResponse) => Promise<boolean>) | null
  >(null);
  const latestEntitlementRef = useRef<{ reportId: string | null; isEntitled: boolean }>({
    reportId: null,
    isEntitled: TEMP_FORCE_FULL_DOSSIER_VIEW,
  });
  const tracked3DOpenKeyRef = useRef<string | null>(null);
  const latestSunlightSubmissionKeyRef = useRef<string | null>(null);
  const sunlightSubmissionPromiseRef = useRef<Promise<void> | null>(null);
  const shadowPrewarmKeyRef = useRef<string | null>(null);
  const shadowPrewarmStatusRef = useRef<ShadowPrewarmStatus>('idle');
  const shadowPrewarmPromiseRef = useRef<Promise<ShadowPrewarmResponse> | null>(null);
  const kickoffPostCheckoutPrerequisitesRef = useRef<(() => void) | null>(null);

  // Deferred 3D fetch: store parameters when address resolves, trigger when viewport-near
  type Deferred3DParams = {
    vboId: string;
    pandId: string;
    rdX: number;
    rdY: number;
    lat: number;
    lng: number;
    building: BuildingFactsResponse['building'] | undefined;
    requestId: number;
  };

  const viewer3DSectionRef = useRef<HTMLDivElement | null>(null);
  const viewer3DObserverRef = useRef<IntersectionObserver | null>(null);
  const deferred3DParamsRef = useRef<Deferred3DParams | null>(null);
  const last3DParamsRef = useRef<Deferred3DParams | null>(null);
  const comparePromptShownRef = useRef(false);
  const [viewer3DTriggered, setViewer3DTriggered] = useState(false);
  const [shortlistItems, setShortlistItems] = useState<ShortlistItem[]>(getShortlist());

  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [exportGenerating, setExportGenerating] = useState(false);
  const [exportInitialTemplate, setExportInitialTemplate] = useState<'quick_brief' | 'full_dossier' | null>(null);
  const [exportInitialLanguage, setExportInitialLanguage] = useState<ExportLanguage | null>(null);
  const [exportAutoGenerateToken, setExportAutoGenerateToken] = useState<string | null>(null);
  const [activePrebidAction, setActivePrebidAction] = useState<PrebidVerificationAction | null>(null);
  const [shareSheetMode, setShareSheetMode] = useState<'pack' | null>(null);
  const [packDeleted, setPackDeleted] = useState(false);
  const [activePackRoute, setActivePackRoute] = useState<{ vboId?: string; reportId?: string } | null>(null);
  const [activeSharedRoute, setActiveSharedRoute] = useState<{ token?: string; mode: 'briefing' | 'pack' } | null>(null);
  const [notFoundRoute, setNotFoundRoute] = useState<string | null>(null);
  const hasShadowSnapshotTriptych = useMemo(
    () => hasRequiredShadowSnapshotTriptych(shadowSnapshots),
    [shadowSnapshots],
  );
  const shadowSnapshotsReady = serverRenderAvailable || hasShadowSnapshotTriptych || shadowSnapshotsUnavailable;
  const shadowSnapshotsFailed = !serverRenderAvailable
    && shadowSnapshotsUnavailable
    && !hasShadowSnapshotTriptych;
  const currentShadowPrewarmKey = address?.adresseerbaar_object_id && reportId
    ? shadowPrewarmKey(address.adresseerbaar_object_id, reportId)
    : null;

  // When an overlay modal (e.g. ExportBottomSheet) is open, mark background
  // content as inert so screen readers cannot access it (WCAG best practice).
  const isOverlayModalOpen = exportSheetOpen
    || activePrebidAction !== null
    || shareSheetMode !== null;

  // Risk detail view state.
  const [activeDetailCategory, setActiveDetailCategory] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [useFallbackDetailTransition, setUseFallbackDetailTransition] = useState(false);
  const [checkedQuestions, setCheckedQuestions] = useState<Set<string>>(new Set());
  const [showDossierJump, setShowDossierJump] = useState(false);
  const [activePhase, setActivePhase] = useState<'house' | 'buurt' | 'action'>('house');
  const animationPerformance = useAnimationPerformance();
  const ignoreNextHashRef = useRef(false);

  const readScreenScrollPosition = useCallback((screen: Screen): number => {
    if (screen === 'dossier') {
      const root = getDossierScrollContainer();
      if (hasInternalDossierScroll(root)) {
        return root.scrollTop;
      }
    }
    return window.scrollY || document.documentElement.scrollTop || 0;
  }, []);

  const restoreScreenScrollPosition = useCallback((screen: Screen, top: number) => {
    const clampedTop = Math.max(0, top);
    if (screen === 'dossier') {
      const root = getDossierScrollContainer();
      if (root) {
        if (typeof root.scrollTo === 'function') {
          root.scrollTo({ top: clampedTop });
        } else {
          root.scrollTop = clampedTop;
        }
        return;
      }
    }
    try {
      window.scrollTo({ top: clampedTop });
    } catch {
      document.documentElement.scrollTop = clampedTop;
    }
  }, []);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  useEffect(() => {
    activeScreenRef.current = activeScreen;
  }, [activeScreen]);

  useEffect(() => {
    if (activeScreen === 'search') {
      setMatchReturnContext(null);
    }
  }, [activeScreen]);

  useEffect(() => {
    const previousScreen = previousScreenForScrollRef.current;
    if (previousScreen !== activeScreen) {
      screenScrollPositionsRef.current.set(
        previousScreen,
        readScreenScrollPosition(previousScreen),
      );
      previousScreenForScrollRef.current = activeScreen;
      const savedTop = screenScrollPositionsRef.current.get(activeScreen);
      if (savedTop != null) {
        requestAnimationFrame(() => restoreScreenScrollPosition(activeScreen, savedTop));
      }
    }
  }, [activeScreen, readScreenScrollPosition, restoreScreenScrollPosition]);

  useEffect(() => {
    const retryControllers = retryControllersRef.current;
    return () => {
      addressRequestAbortRef.current?.abort();
      retryControllers.forEach(c => c.abort());
      retryControllers.clear();
    };
  }, []);

  useEffect(() => {
    const vboId = address?.adresseerbaar_object_id;
    if (!vboId) {
      setCheckedQuestions(new Set());
      return;
    }
    setCheckedQuestions(readChecklistState(vboId));
  }, [address?.adresseerbaar_object_id]);

  useEffect(() => {
    if (!currentShadowPrewarmKey) {
      shadowPrewarmKeyRef.current = null;
      shadowPrewarmStatusRef.current = 'idle';
      shadowPrewarmPromiseRef.current = null;
      return;
    }

    if (shadowPrewarmKeyRef.current !== currentShadowPrewarmKey) {
      shadowPrewarmKeyRef.current = currentShadowPrewarmKey;
      shadowPrewarmStatusRef.current = 'idle';
      shadowPrewarmPromiseRef.current = null;
    }
  }, [currentShadowPrewarmKey]);

  useEffect(() => {
    const vboId = address?.adresseerbaar_object_id;
    if (!vboId) return;
    persistChecklistState(vboId, checkedQuestions);
  }, [address?.adresseerbaar_object_id, checkedQuestions]);

  // Apply theme on mount and listen for system changes
  useEffect(() => {
    applyTheme(themePreference);
    const cleanup = listenForSystemChanges(() => {});
    return cleanup;
  }, [themePreference]);

  useEffect(() => {
    let cancelled = false;
    void fetchPrice().then((price) => {
      if (!cancelled) {
        setDossierPriceEur(price);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void resolveBillingProvider().then((resolution) => {
      if (cancelled) return;
      setBillingProvider(resolution.provider);
      setAppleLocalizedPriceLabel(resolution.localizedPriceLabel ?? null);
    }).catch(() => {
      if (!cancelled) {
        setBillingProvider('stripe');
        setAppleLocalizedPriceLabel(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Mark first visit complete when dossier loads (address + building resolved)
  const hasMarkedVisited = useRef(false);
  useEffect(() => {
    if (address && buildingResponse && !hasMarkedVisited.current) {
      hasMarkedVisited.current = true;
      markVisited();
    }
  }, [address, buildingResponse]);

  useEffect(() => {
    const vboId = address?.adresseerbaar_object_id;
    if (!vboId || !reportId) return;
    storeEntitlement(vboId, reportId, isEntitled);
  }, [address?.adresseerbaar_object_id, isEntitled, reportId]);

  useEffect(() => {
    latestEntitlementRef.current = {
      reportId,
      isEntitled,
    };
  }, [isEntitled, reportId]);

  const handleThemeChange = useCallback((pref: ThemePreference) => {
    setTheme(pref);
    setThemePreference(pref);
  }, []);

  const handleAnalyticsConsentChange = useCallback((
    consent: Exclude<AnalyticsConsentState, 'unknown'>,
  ) => {
    setAnalyticsConsent(consent);
    setAnalyticsConsentState(consent);
  }, []);

  const logCheckoutResumeCheckpoint = useCallback((
    checkpoint: string,
    details?: Record<string, string | number | boolean>,
  ) => {
    const payload = {
      checkpoint,
      ...details,
    };
    if (import.meta.env.DEV) {
      console.info('[checkout-resume]', payload);
    }
    trackEvent('checkout_resume_checkpoint', payload);
  }, []);

  const retryCheckoutVerification = useCallback(() => {
    if (!checkoutVerification?.reportId) return;

    handledCheckoutParamsRef.current = null;
    setCheckoutRetryAvailable(false);
    setCheckoutStatusMessage(t('premium.checkout.processing'));
    logCheckoutResumeCheckpoint('checkout_confirm_manual_retry', {
      has_session_id: Boolean(checkoutVerification.sessionId),
    });
    setCheckoutVerification({
      reportId: checkoutVerification.reportId,
      sessionId: checkoutVerification.sessionId,
      buyerResume: checkoutVerification.buyerResume,
    });
  }, [checkoutVerification, logCheckoutResumeCheckpoint, t]);

  const activatePurchasedEntitlement = useCallback((
    unlockedReportId: string,
    provider: 'stripe' | 'google_play' | 'apple_app_store',
  ) => {
    latestEntitlementRef.current = {
      reportId: unlockedReportId,
      isEntitled: true,
    };
    setReportId(unlockedReportId);
    setIsEntitled(true);
    setCheckoutStatusMessage(null);
    setCheckoutRetryAvailable(false);
    logCheckoutResumeCheckpoint('entitlement_active', { provider });
    trackEvent('dossier_unlocked', { report_id: unlockedReportId, provider });
    if (address?.adresseerbaar_object_id) {
      storeEntitlement(address.adresseerbaar_object_id, unlockedReportId, true);
    }
  }, [address?.adresseerbaar_object_id, logCheckoutResumeCheckpoint]);
  activatePurchasedEntitlementRef.current = activatePurchasedEntitlement;

  const openQueuedPurchasedExport = useCallback((
    unlockedReportId: string,
    details?: Record<string, string | number | boolean>,
  ) => {
    const storedIntent = consumePostCheckoutExportIntent(unlockedReportId, uiLanguage);
    const pendingIntent = storedIntent ?? {
      reportId: unlockedReportId,
      template: 'full_dossier' as const,
      language: uiLanguage,
    };
    if (!storedIntent) {
      logCheckoutResumeCheckpoint('resume_intent_missing', {
        fallback_template: 'full_dossier',
      });
    }

    setExportInitialTemplate(pendingIntent.template);
    setExportInitialLanguage(pendingIntent.language);
    setExportAutoGenerateToken(`${unlockedReportId}:${Date.now()}`);
    setCheckoutStatusMessage(null);
    setExportSheetOpen(true);
    logCheckoutResumeCheckpoint('export_sheet_opened', {
      template: pendingIntent.template,
      language: pendingIntent.language,
      ...details,
    });
    return true;
  }, [logCheckoutResumeCheckpoint, uiLanguage]);

  const resumePurchasedExport = useCallback((
    unlockedReportId: string,
    provider: 'stripe' | 'google_play' | 'apple_app_store',
  ) => {
    setQueuedPostCheckoutResume({
      reportId: unlockedReportId,
      provider,
      queuedAt: Date.now(),
    });
    logCheckoutResumeCheckpoint('resume_queued', {
      provider,
      has_address: Boolean(address?.adresseerbaar_object_id),
      report_matches_current: reportId === unlockedReportId,
      entitled: latestEntitlementRef.current.reportId === unlockedReportId
        ? latestEntitlementRef.current.isEntitled
        : isEntitled && reportId === unlockedReportId,
      loading,
    });
  }, [
    address?.adresseerbaar_object_id,
    isEntitled,
    loading,
    logCheckoutResumeCheckpoint,
    reportId,
  ]);
  resumePurchasedExportRef.current = resumePurchasedExport;

  useEffect(() => {
    if (!queuedPostCheckoutResume) return;
    if (activeScreen !== 'dossier') return;

    const hasAddress = Boolean(address?.adresseerbaar_object_id);
    const reportMatches = reportId === queuedPostCheckoutResume.reportId;
    const entitledForQueuedReport = latestEntitlementRef.current.reportId === queuedPostCheckoutResume.reportId
      ? latestEntitlementRef.current.isEntitled
      : isEntitled && reportMatches;

    if (!hasAddress || !reportMatches || !entitledForQueuedReport || loading) {
      return;
    }

    setQueuedPostCheckoutResume(null);
    openQueuedPurchasedExport(queuedPostCheckoutResume.reportId, {
      provider: queuedPostCheckoutResume.provider,
      queued_delay_ms: Date.now() - queuedPostCheckoutResume.queuedAt,
      resume_mode: 'queued',
    });
  }, [
    activeScreen,
    address?.adresseerbaar_object_id,
    isEntitled,
    loading,
    openQueuedPurchasedExport,
    queuedPostCheckoutResume,
    reportId,
  ]);

  const androidBillingAvailable = billingProvider === 'google_play';
  const appleBillingAvailable = billingProvider === 'apple_app_store';
  const fallbackDossierPriceLabel = `€${dossierPriceEur}`;
  const exportBuyPriceLabel = billingProvider === 'apple_app_store'
    ? appleLocalizedPriceLabel ?? fallbackDossierPriceLabel
    : fallbackDossierPriceLabel;
  const actionBarPrimaryLabel = isEntitled
    ? t('export.downloadDossier')
    : exportBuyPriceLabel
      ? t('action.unlockDossierWithPrice', { price: exportBuyPriceLabel })
      : t('premium.upgrade.cta');

  const setHashRoute = useCallback((hash: string, options?: { replace?: boolean }) => {
    if (typeof window === 'undefined') return;
    const normalized = hash.startsWith('#') ? hash : `#${hash}`;
    if (window.location.hash === normalized) return;
    ignoreNextHashRef.current = true;
    if (options?.replace) {
      window.history.replaceState(null, '', normalized);
    } else {
      window.history.pushState(null, '', normalized);
    }
  }, []);

  const ensureMatchSessionId = useCallback(() => {
    const existing = activeMatchSessionId ?? readStoredMatchSessionId();
    if (existing) {
      setActiveMatchSessionId(existing);
      storeMatchSessionId(existing);
      return existing;
    }
    const created = createMatchSessionId();
    setActiveMatchSessionId(created);
    storeMatchSessionId(created);
    return created;
  }, [activeMatchSessionId]);

  const replaceHashRouteAndClearSearch = useCallback((hash: string) => {
    if (typeof window === 'undefined') return;
    const normalized = hash.startsWith('#') ? hash : `#${hash}`;
    const rawBasePath = import.meta.env.BASE_URL || '/';
    const basePath = rawBasePath === './' ? '/' : rawBasePath;
    const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
    window.history.replaceState(null, '', `${normalizedBasePath}${normalized}`);
  }, []);

  const dossierHash = useCallback((
    vboId?: string | null,
    lookupId?: string | null,
    matchReturn?: MatchReturnContext | null,
  ) => {
    const currentMatchReturn = matchReturn === null
      ? undefined
      : matchReturn ?? (
        typeof window !== 'undefined'
          ? parseLocationRoute(window.location).matchReturn
          : undefined
      );
    return buildHashRoute({
      route: 'dossier',
      vboId: vboId ?? undefined,
      lookupId: lookupId ?? undefined,
      matchReturn: currentMatchReturn,
    });
  }, []);

  const openSettings = useCallback(() => {
    if (activeScreen !== 'settings') {
      previousScreenRef.current = activeScreen;
      setActiveScreen('settings');
      setHashRoute('#/settings');
      return;
    }

    const fallbackScreen = activeTab === 'saved'
      ? (previousScreenRef.current === 'settings' ? 'shortlist' : previousScreenRef.current)
      : (previousScreenRef.current === 'settings' ? 'search' : previousScreenRef.current);

    setActiveScreen(fallbackScreen);

    if (fallbackScreen === 'shortlist') {
      setHashRoute('#/saved');
      return;
    }
    if (fallbackScreen === 'compare') {
      setHashRoute('#/compare');
      return;
    }
    if (fallbackScreen === 'dossier') {
      setHashRoute(dossierHash(address?.adresseerbaar_object_id, activeLookupId, matchReturnContext));
      return;
    }
    setHashRoute('#/search');
  }, [
    activeLookupId,
    activeScreen,
    activeTab,
    address?.adresseerbaar_object_id,
    dossierHash,
    matchReturnContext,
    setHashRoute,
  ]);

  const handleUpgrade = useCallback(async (language: ExportLanguage = uiLanguage) => {
    if (TEMP_DISABLE_PAYMENTS) {
      showToast(t('premium.checkout.startFailed'));
      return;
    }
    if (isCheckingOut) return;
    if (!reportId) {
      showToast(t('premium.checkout.startFailed'));
      return;
    }

    if (activeLookupId) {
      storeReportLookup(reportId, activeLookupId);
    }
    storePostCheckoutExportIntent({
      reportId,
      template: 'full_dossier',
      language,
    });
    kickoffPostCheckoutPrerequisitesRef.current?.();

    setIsCheckingOut(true);
    setCheckoutStatusMessage(null);
    setCheckoutRetryAvailable(false);
    trackEvent('checkout_started', {
      report_id: reportId,
      price_eur: dossierPriceEur,
      provider: billingProvider,
    });

    try {
      if (appleBillingAvailable) {
        const pendingReportId = getPendingAppleBillingReport();
        if (pendingReportId === reportId) {
          const pendingPurchase = await findPendingAppleBillingPurchase();
          if (pendingPurchase) {
            const verification = await verifyAppleAppStorePurchase(
              reportId,
              pendingPurchase.signedTransactionInfo,
              pendingPurchase.productId,
            );
            await finishAppleBillingTransaction(pendingPurchase.transactionId);
            clearPendingAppleBillingReport();
            activatePurchasedEntitlement(verification.report_id, 'apple_app_store');
            resumePurchasedExport(verification.report_id, 'apple_app_store');
            trackEvent('checkout_completed', {
              report_id: verification.report_id,
              provider: 'apple_app_store',
              restored: true,
            });
            showToast(t('premium.checkout.success'));
            return;
          }
          clearPendingAppleBillingReport();
        }

        let purchase = null as Awaited<ReturnType<typeof beginAppleBillingPurchase>> | null;
        try {
          purchase = await beginAppleBillingPurchase(reportId);
          const verification = await verifyAppleAppStorePurchase(
            reportId,
            purchase.signedTransactionInfo,
            purchase.productId,
          );
          await finishAppleBillingTransaction(purchase.transactionId);
          clearPendingAppleBillingReport();
          activatePurchasedEntitlement(verification.report_id, 'apple_app_store');
          resumePurchasedExport(verification.report_id, 'apple_app_store');
          trackEvent('checkout_completed', {
            report_id: verification.report_id,
            provider: 'apple_app_store',
          });
          showToast(t('premium.checkout.success'));
          return;
        } catch (error) {
          if (purchase) {
            trackEvent('checkout_failed', {
              report_id: reportId,
              provider: 'apple_app_store',
              reason: 'verification',
            });
            setCheckoutStatusMessage(t('premium.checkout.delayed'));
            setCheckoutRetryAvailable(false);
            showToast(t('premium.checkout.delayed'));
            return;
          }

          if (isAppleBillingCancelledError(error)) {
            clearPostCheckoutExportIntent();
            clearPendingAppleBillingReport();
            return;
          }
          if (isAppleBillingPendingError(error)) {
            setCheckoutStatusMessage(t('premium.checkout.delayed'));
            setCheckoutRetryAvailable(false);
            showToast(t('premium.checkout.delayed'));
            return;
          }

          throw error;
        }
      }

      if (androidBillingAvailable) {
        const pendingReportId = getPendingPlayBillingReport();
        if (pendingReportId === reportId) {
          const pendingPurchase = await findRestorablePlayBillingPurchase();
          if (pendingPurchase) {
            const verification = await verifyGooglePlayPurchase(
              reportId,
              pendingPurchase.purchaseToken,
              pendingPurchase.productId,
            );
            if (!verification.consumed) {
              await consumePlayBillingPurchaseToken(pendingPurchase.purchaseToken);
            }
            clearPendingPlayBillingReport();
            activatePurchasedEntitlement(verification.report_id, 'google_play');
            resumePurchasedExport(verification.report_id, 'google_play');
            trackEvent('checkout_completed', {
              report_id: verification.report_id,
              provider: 'google_play',
              restored: true,
            });
            showToast(t('premium.checkout.success'));
            return;
          }
          clearPendingPlayBillingReport();
        }

        let purchase = null as Awaited<ReturnType<typeof beginPlayBillingPurchase>> | null;
        try {
          purchase = await beginPlayBillingPurchase(reportId);
          const verification = await verifyGooglePlayPurchase(
            reportId,
            purchase.purchaseToken,
            purchase.productId,
          );
          if (!verification.consumed) {
            await consumePlayBillingPurchaseToken(purchase.purchaseToken);
          }
          await completePlayBillingPurchase(purchase, 'success');
          clearPendingPlayBillingReport();
          activatePurchasedEntitlement(verification.report_id, 'google_play');
          resumePurchasedExport(verification.report_id, 'google_play');
          trackEvent('checkout_completed', {
            report_id: verification.report_id,
            provider: 'google_play',
          });
          showToast(t('premium.checkout.success'));
          return;
        } catch (error) {
          if (purchase) {
            await completePlayBillingPurchase(purchase, 'unknown');
            trackEvent('checkout_failed', {
              report_id: reportId,
              provider: 'google_play',
              reason: 'verification',
            });
            setCheckoutStatusMessage(t('premium.checkout.delayed'));
            setCheckoutRetryAvailable(false);
            showToast(t('premium.checkout.delayed'));
            return;
          }

          if (error instanceof DOMException && error.name === 'AbortError') {
            clearPostCheckoutExportIntent();
            clearPendingPlayBillingReport();
            return;
          }

          throw error;
        }
      }

      const session = await createCheckoutSession(reportId, activeLookupId);
      navigateToExternal(session.checkout_url);
    } catch (error) {
      const checkoutUnavailable = error instanceof ApiError
        && error.errorKey === 'premium.checkout.unavailable';
      const message = checkoutUnavailable
        ? t('premium.checkout.unavailable')
        : t('premium.checkout.startFailed');
      trackEvent('checkout_failed', {
        report_id: reportId,
        provider: billingProvider,
        reason: checkoutUnavailable ? 'billing_not_configured' : 'session_creation',
      });
      clearPostCheckoutExportIntent();
      setCheckoutStatusMessage(message);
      showToast(message);
      return;
    } finally {
      setIsCheckingOut(false);
    }
  }, [
    activatePurchasedEntitlement,
    activeLookupId,
    appleBillingAvailable,
    billingProvider,
    androidBillingAvailable,
    dossierPriceEur,
    isCheckingOut,
    reportId,
    resumePurchasedExport,
    showToast,
    t,
    uiLanguage,
  ]);

  const handleToggleQuestion = useCallback((id: string) => {
    hapticTap();
    setCheckedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleNavigateToCompare = useCallback(() => {
    setActiveTab('saved');
    setActiveScreen('compare');
    setHashRoute('#/compare');
  }, [setHashRoute]);

  const loadMatchComparison = useCallback(async () => {
    setMatchComparisonLoading(true);
    setMatchComparisonErrorCode(null);
    try {
      const response = await compareMatchNeighborhoods({
        neighborhood_ids: DEFAULT_MATCH_COMPARE_IDS,
        locale: normalizeUiLanguage(i18n.language),
      });
      setMatchComparisonResponse(response);
    } catch {
      setMatchComparisonErrorCode('match.warning.compare_failed');
    } finally {
      setMatchComparisonLoading(false);
    }
  }, [i18n.language]);

  const handleMatchSimilarSearch = useCallback(async (
    sourceId: string,
    filters: { cheaper: boolean; greener: boolean; calmer: boolean },
  ) => {
    setMatchSimilarLoading(true);
    setMatchSimilarErrorCode(null);
    try {
      const response = await findSimilarMatchNeighborhoods({
        source_neighborhood_id: sourceId,
        filters,
        limit: 8,
      });
      setMatchSimilarResponse(response);
    } catch {
      setMatchSimilarErrorCode('match.warning.similar_failed');
    } finally {
      setMatchSimilarLoading(false);
    }
  }, []);

  const primaryMatchNeighborhood = useMemo(() => (
    matchRecommendations?.recommendations.top[0]
    ?? matchRecommendations?.recommendations.surprising[0]
    ?? matchRecommendations?.recommendations.stretch[0]
    ?? matchRecommendations?.recommendations.avoid_or_reconsider[0]
    ?? null
  ), [matchRecommendations]);

  const loadMatchListings = useCallback(async () => {
    const neighborhoodId = primaryMatchNeighborhood?.neighborhood_id ?? DEFAULT_MATCH_COMPARE_IDS[0];
    setMatchListingsLoading(true);
    setMatchListingsErrorCode(null);
    try {
      const response = await fetchMatchListings({
        neighborhood_id: neighborhoodId,
        journey_intent: matchQuizResponse?.preference_vector.journey_intent ?? 'both',
        budget_max_cents: matchQuizResponse?.preference_vector.budget_max_cents ?? 62500000,
        rent_max_cents: matchQuizResponse?.preference_vector.monthly_rent_max_cents ?? 250000,
        property_type: matchQuizResponse?.preference_vector.property_types[0] ?? 'apartment',
      });
      setMatchListings(response);
    } catch {
      setMatchListingsErrorCode('match.warning.listings_failed');
    } finally {
      setMatchListingsLoading(false);
    }
  }, [matchQuizResponse, primaryMatchNeighborhood]);

  const loadMatchAlerts = useCallback(async () => {
    setMatchAlertsLoading(true);
    setMatchAlertsErrorCode(null);
    try {
      const response = await fetchMatchAlerts(matchQuizResponse?.preference_vector.session_id ?? undefined);
      setMatchAlerts(response.alerts);
      setMatchAlertsLoaded(true);
    } catch {
      setMatchAlertsErrorCode('match.warning.alert_fetch_failed');
    } finally {
      setMatchAlertsLoading(false);
    }
  }, [matchQuizResponse]);

  const loadMatchSaved = useCallback(async () => {
    setMatchSavedLoading(true);
    setMatchSavedErrorCode(null);
    try {
      const response = await fetchSavedMatchNeighborhoods(matchQuizResponse?.preference_vector.session_id ?? undefined);
      setMatchSavedNeighborhoods(response.saved_neighborhoods);
      setMatchSavedLoaded(true);
    } catch {
      setMatchSavedErrorCode('match.warning.saved_neighborhood_fetch_failed');
    } finally {
      setMatchSavedLoading(false);
    }
  }, [matchQuizResponse]);

  const loadMatchAdmin = useCallback(async () => {
    setMatchAdminLoading(true);
    setMatchAdminErrorCode(null);
    try {
      const response = await fetchMatchAdminHealth();
      setMatchAdminHealth(response);
    } catch {
      setMatchAdminErrorCode('match.warning.admin_health_failed');
    } finally {
      setMatchAdminLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeScreen !== 'matchSharedReport' || !activeMatchShareToken) {
      setSharedMatchReportLoading(false);
      return;
    }

    let cancelled = false;
    setSharedMatchReport(null);
    setSharedMatchReportLoading(true);
    setSharedMatchReportErrorCode(null);
    void fetchSharedMatchReport(activeMatchShareToken)
      .then((response) => {
        if (!cancelled) {
          setSharedMatchReport(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSharedMatchReportErrorCode('match.warning.report_fetch_failed');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSharedMatchReportLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeMatchShareToken, activeScreen]);

  useEffect(() => {
    if (activeScreen === 'matchComparison' && !matchComparisonResponse && !matchComparisonLoading) {
      void loadMatchComparison();
    }
    if (activeScreen === 'matchListings' && !matchListings && !matchListingsLoading) {
      void loadMatchListings();
    }
    if (activeScreen === 'matchAlerts' && !matchAlertsLoaded && !matchAlertsLoading) {
      void loadMatchAlerts();
    }
    if (activeScreen === 'matchSaved' && !matchSavedLoaded && !matchSavedLoading) {
      void loadMatchSaved();
    }
    if (activeScreen === 'matchAdmin' && !matchAdminHealth && !matchAdminLoading) {
      void loadMatchAdmin();
    }
  }, [
    activeScreen,
    loadMatchAdmin,
    loadMatchAlerts,
    loadMatchComparison,
    loadMatchListings,
    loadMatchSaved,
    matchAdminHealth,
    matchAdminLoading,
    matchAlertsLoaded,
    matchAlertsLoading,
    matchComparisonLoading,
    matchComparisonResponse,
    matchListings,
    matchListingsLoading,
    matchSavedLoaded,
    matchSavedLoading,
  ]);

  const handleMatchCreateAlert = useCallback(async (payload: MatchAlertCreatePayload) => {
    setMatchAlertsLoading(true);
    setMatchAlertsErrorCode(null);
    try {
      const response = await createMatchAlert(payload);
      setMatchAlerts((current) => [response.alert, ...current.filter((item) => item.alert_id !== response.alert.alert_id)]);
      setMatchAlertsLoaded(true);
    } catch {
      setMatchAlertsErrorCode('match.warning.alert_create_failed');
    } finally {
      setMatchAlertsLoading(false);
    }
  }, []);

  const handleMatchFeedbackSubmit = useCallback(async (
    payload: MatchFeedbackPayload,
  ): Promise<MatchFeedbackResponse> => {
    const response = await submitMatchFeedback(payload);
    if (response.reranking_available) {
      const boost = new Set(response.reranking_hint.boost_neighborhood_ids);
      const suppress = new Set(response.reranking_hint.suppress_neighborhood_ids);
      setMatchRecommendations((current) => {
        if (!current) return current;
        return {
          ...current,
          recommendations: {
            ...current.recommendations,
            top: current.recommendations.top
              .filter((item) => !suppress.has(item.neighborhood_id))
              .sort((left, right) => Number(boost.has(right.neighborhood_id)) - Number(boost.has(left.neighborhood_id)))
              .map((item, index) => ({ ...item, rank: index + 1 })),
            avoid_or_reconsider: current.recommendations.avoid_or_reconsider
              .map((item, index) => ({ ...item, rank: index + 1 })),
          },
          feedback_adjustment: {
            applied: true,
            explanation_code: response.reranking_hint.explanation_code,
            adjusted_weight_inputs: response.reranking_hint.adjusted_weight_inputs,
          },
        };
      });
    }
    return response;
  }, []);

  const handleMatchUpdateAlertStatus = useCallback(async (alertId: string, status: 'active' | 'paused' | 'deleted') => {
    try {
      const updated = await updateMatchAlertStatus(alertId, status);
      setMatchAlerts((current) => current.map((item) => item.alert_id === alertId ? updated : item));
    } catch {
      setMatchAlertsErrorCode('match.warning.alert_update_failed');
    }
  }, []);

  const handleMatchDeleteAlert = useCallback(async (alertId: string) => {
    try {
      const deleted = await deleteMatchAlert(alertId);
      setMatchAlerts((current) => current.filter((item) => item.alert_id !== deleted.alert_id));
    } catch {
      setMatchAlertsErrorCode('match.warning.alert_delete_failed');
    }
  }, []);

  const handleMatchSaveNeighborhood = useCallback(async (neighborhoodId: string, savedFrom: 'recommendation' | 'map' | 'comparison' | 'listing' | 'manual' = 'recommendation') => {
    setMatchSavedErrorCode(null);
    try {
      const saved = await saveMatchNeighborhood({
        session_id: matchQuizResponse?.preference_vector.session_id ?? null,
        preference_vector_id: matchQuizResponse?.preference_vector.preference_vector_id ?? null,
        report_id: matchReport?.report_id ?? null,
        neighborhood_id: neighborhoodId,
        saved_from: savedFrom,
      });
      setMatchSavedNeighborhoods((current) => [saved, ...current]);
      setMatchSavedLoaded(true);
    } catch {
      setMatchSavedErrorCode('match.warning.saved_neighborhood_failed');
    }
  }, [matchQuizResponse, matchReport]);

  const handleMatchDeleteSavedNeighborhood = useCallback(async (savedNeighborhoodId: string) => {
    try {
      await deleteSavedMatchNeighborhood(savedNeighborhoodId);
      setMatchSavedNeighborhoods((current) => current.filter((item) => item.saved_neighborhood_id !== savedNeighborhoodId));
    } catch {
      setMatchSavedErrorCode('match.warning.saved_neighborhood_delete_failed');
    }
  }, []);

  const handleMatchSaveReport = useCallback(async () => {
    if (!matchReport) return;
    setMatchSavedLoading(true);
    try {
      await saveMatchReport(matchReport.report_id, matchQuizResponse?.preference_vector.session_id ?? null);
    } catch {
      setMatchSavedErrorCode('match.warning.report_save_failed');
    } finally {
      setMatchSavedLoading(false);
    }
  }, [matchQuizResponse, matchReport]);

  const handleMatchShareReport = useCallback(async (consent: boolean) => {
    if (!matchReport) return;
    setMatchSavedLoading(true);
    try {
      const response = await shareMatchReport(matchReport.report_id, {
        scope: 'report_view',
        locale: matchReport.locale,
        consent_to_share: consent,
        expires_in_days: 30,
      });
      setMatchShare(response);
    } catch {
      setMatchSavedErrorCode('match.warning.report_share_failed');
    } finally {
      setMatchSavedLoading(false);
    }
  }, [matchReport]);

  const handleMatchExportReport = useCallback(async (exportType: 'pdf' | 'html' | 'json') => {
    if (!matchReport) return;
    setMatchSavedLoading(true);
    setMatchExportReady(false);
    try {
      await exportMatchReport(matchReport.report_id, {
        export_type: exportType,
        locale: matchReport.locale,
      });
      setMatchExportReady(true);
    } catch {
      setMatchSavedErrorCode('match.warning.report_export_failed');
    } finally {
      setMatchSavedLoading(false);
    }
  }, [matchReport]);

  const handleMatchCreateAlertFromListing = useCallback((listing: MatchListing) => {
    void handleMatchCreateAlert({
      session_id: matchQuizResponse?.preference_vector.session_id ?? null,
      preference_vector_id: matchQuizResponse?.preference_vector.preference_vector_id ?? null,
      source_context: 'listing',
      neighborhood_ids: [listing.neighborhood_id],
      journey_intent: listing.journey_intent,
      budget_max_cents: listing.journey_intent === 'buy' ? (listing.price_cents ?? 62500000) : null,
      rent_max_cents: listing.journey_intent === 'rent' ? (listing.rent_cents ?? 250000) : null,
      property_types: [listing.property_type ?? 'apartment'],
      notification_type: 'mock',
    });
  }, [handleMatchCreateAlert, matchQuizResponse]);

  const buildShortlistItem = useCallback((): ShortlistItem | null => {
    if (!address?.adresseerbaar_object_id) return null;
    return {
      vboId: address.adresseerbaar_object_id,
      lookupId: address.id,
      address: address.display_name,
      postcode: address.postcode,
      city: address.city,
      buildingYear: buildingResponse?.building?.construction_year,
      riskScores: {
        noise: riskCards?.noise.score,
        air: riskCards?.air_quality.score,
        climate: riskCards?.climate_stress.score,
        sunlight: sunlight ? normalizeSunlightScore(sunlight.winter) : riskCards?.sunlight?.score,
      },
      verificationWork: prebidBriefing ? {
        openActions: prebidBriefing.top_actions.length,
        incompleteSources: prebidBriefing.coverage.filter((row) => (
          row.status === 'failed'
          || row.status === 'unavailable'
          || row.status === 'manual_review'
          || row.status === 'review'
        )).length,
        needsReview: prebidBriefing.top_actions.filter((action) => (
          action.states?.needs_human_review || action.states?.queued_for_review
        )).length,
        packStatus: prebidBriefing.result_state === 'needs_human_review'
          ? 'queued_for_review'
          : prebidBriefing.result_state === 'data_incomplete'
            ? 'data_incomplete'
            : 'ready',
      } : undefined,
      savedAt: Date.now(),
    };
  }, [address, buildingResponse?.building?.construction_year, prebidBriefing, riskCards, sunlight]);

  const currentAddressBookmarked = !!address?.adresseerbaar_object_id
    && isInShortlist(address.adresseerbaar_object_id);
  // Wait until risk cards have either resolved, failed, or are impossible for this address
  // before persisting a shortlist snapshot with address-level scores.
  const shortlistRiskSnapshotReady = !address?.adresseerbaar_object_id
    ? false
    : (
        address.rd_x == null
        || address.rd_y == null
        || address.latitude == null
        || address.longitude == null
        || riskCards != null
        || riskError != null
      );
  const bookmarkPending = loading
    || buildingLoading
    || (!currentAddressBookmarked && !shortlistRiskSnapshotReady);

  const handleBookmark = useCallback(() => {
    const item = buildShortlistItem();
    if (!item) return;
    const { vboId } = item;
    if (isInShortlist(vboId)) {
      removeFromShortlist(vboId);
      showToast(t('toast.addressRemoved'));
    } else {
      if (!shortlistRiskSnapshotReady) {
        showToast(t('toast.shortlistScoresPending'));
        return;
      }
      const added = addToShortlist(item);
      if (added) {
        const updatedShortlist = getShortlist();
        if (updatedShortlist.length >= 2 && !comparePromptShownRef.current) {
          comparePromptShownRef.current = true;
          showToast(t('toast.addressSavedCompare'), {
            label: t('toast.compareAction'),
            onClick: handleNavigateToCompare,
          });
        } else {
          showToast(t('toast.addressSaved'));
        }
      } else {
        showToast(t('shortlist.maxReached'));
      }
    }
    setShortlistItems(getShortlist());
  }, [buildShortlistItem, handleNavigateToCompare, shortlistRiskSnapshotReady, showToast, t]);

  useEffect(() => {
    const item = buildShortlistItem();
    if (!item || !shortlistRiskSnapshotReady || !isInShortlist(item.vboId)) return;
    upsertShortlistItem(item);
    setShortlistItems(getShortlist());
  }, [buildShortlistItem, shortlistRiskSnapshotReady]);

  const handleRemoveFromShortlist = useCallback((vboId: string) => {
    removeFromShortlist(vboId);
    setShortlistItems(getShortlist());
    showToast(t('toast.addressRemoved'));
  }, [showToast, t]);

  const handleClearShortlist = useCallback(() => {
    clearShortlist();
    setShortlistItems([]);
    showToast(t('toast.shortlistCleared'));
  }, [showToast, t]);

  const handleClearRecent = useCallback(() => {
    clearRecent();
    clearVisited();
    showToast(t('toast.recentCleared'));
  }, [showToast, t]);

  const handleNavigateToSaved = useCallback(() => {
    setActiveTab('saved');
    setShortlistItems(getShortlist());
    setActiveScreen('shortlist');
    setHashRoute('#/saved');
  }, [setHashRoute]);

  const openExportSheet = useCallback((template?: 'quick_brief' | 'full_dossier') => {
    setExportInitialTemplate(template ?? null);
    setExportInitialLanguage(null);
    setExportAutoGenerateToken(null);
    setExportSheetOpen(true);
  }, []);

  const handleBackToMatchMap = useCallback(() => {
    const target = normalizeMatchReturnTarget(matchReturnContext);
    if (matchReturnContext?.sessionId) {
      setActiveMatchSessionId(matchReturnContext.sessionId);
      storeMatchSessionId(matchReturnContext.sessionId);
      setActiveMatchJobStatus(readStoredMatchJobStatus(matchReturnContext.sessionId));
    }
    if (matchReturnContext?.neighborhoodId) {
      setActiveMatchNeighborhoodId(matchReturnContext.neighborhoodId);
    }
    if (matchReturnContext) {
      setMatchMapReturnContext(matchReturnContext);
      storeMatchReturnContext(matchReturnContext);
    }
    if (matchReturnContext?.language) {
      void i18n.changeLanguage(matchReturnContext.language);
    }
    setActiveTab('home');
    setActiveScreen(target.screen);
    setHashRoute(target.hash);
  }, [i18n, matchReturnContext, setHashRoute]);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'home') {
      setActiveScreen('matchLanding');
      setHashRoute('#/match');
      return;
    }
    if (tab === 'briefing') {
      const hasDossier = !!address;
      setActiveScreen('dossier');
      if (hasDossier) {
        setSheetSnap('half');
        setHashRoute(dossierHash(address?.adresseerbaar_object_id, activeLookupId, matchReturnContext));
      } else {
        setHashRoute('#/briefing');
      }
    } else if (tab === 'saved') {
      setShortlistItems(getShortlist());
      setActiveScreen('shortlist');
      setHashRoute('#/saved');
    }
  }, [activeLookupId, address, dossierHash, matchReturnContext, setHashRoute]);

  useEffect(() => {
    if (activeScreen !== 'dossier') {
      setShowDossierJump(false);
      return;
    }

    const root = getDossierScrollContainer();
    const useInternalScroll = hasInternalDossierScroll(root);

    const updateJumpVisibility = () => {
      if (useInternalScroll && root) {
        setShowDossierJump(root.scrollTop > 360);
      } else {
        const windowScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
        setShowDossierJump(windowScrollTop > 360);
      }

      // Track active phase based on which phase divider is above viewport center
      const actionEl = document.getElementById('section-action-start');
      const buurtEl = document.getElementById('section-buurt-start');
      const viewportMid = window.innerHeight / 2;
      if (actionEl && actionEl.getBoundingClientRect().top < viewportMid) {
        setActivePhase('action');
      } else if (buurtEl && buurtEl.getBoundingClientRect().top < viewportMid) {
        setActivePhase('buurt');
      } else {
        setActivePhase('house');
      }
    };

    updateJumpVisibility();

    if (useInternalScroll && root) {
      root.addEventListener('scroll', updateJumpVisibility, { passive: true });
      return () => root.removeEventListener('scroll', updateJumpVisibility);
    }

    window.addEventListener('scroll', updateJumpVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateJumpVisibility);
  }, [activeScreen, address?.id]);

  const handleRiskTileTap = useCallback((category: string) => {
    if (isTransitioning) return;
    hapticTap();
    setUseFallbackDetailTransition(animationPerformance.shouldUseFallback());
    setActiveDetailCategory(category);
  }, [animationPerformance, isTransitioning]);

  const scrollToDossierTarget = useCallback((elementId: string) => {
    const root = getDossierScrollContainer();
    const target = document.getElementById(elementId);
    if (!target) return;

    if (hasInternalDossierScroll(root)) {
      const rootRect = root.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const top = root.scrollTop + (targetRect.top - rootRect.top) - 68;
      const nextTop = Math.max(0, top);
      if (typeof root.scrollTo === 'function') {
        root.scrollTo({ top: nextTop, behavior: 'smooth' });
      } else {
        root.scrollTop = nextTop;
      }
      return;
    }

    const top = window.scrollY + target.getBoundingClientRect().top - 72;
    try {
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } catch {
      document.documentElement.scrollTop = Math.max(0, top);
    }
  }, []);

  const scrollDossierToTop = useCallback(() => {
    const root = getDossierScrollContainer();
    if (hasInternalDossierScroll(root)) {
      if (typeof root.scrollTo === 'function') {
        root.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        root.scrollTop = 0;
      }
      return;
    }
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      document.documentElement.scrollTop = 0;
    }
  }, []);

  const handleJumpToHouse = useCallback(() => {
    hapticTap();
    scrollToDossierTarget('section-house-start');
  }, [scrollToDossierTarget]);

  const handleJumpToBuurt = useCallback(() => {
    hapticTap();
    scrollToDossierTarget('section-buurt-start');
  }, [scrollToDossierTarget]);

  const handleJumpToChecklist = useCallback(() => {
    hapticTap();
    scrollToDossierTarget('section-viewing-checklist');
  }, [scrollToDossierTarget]);

  const handleJumpToTop = useCallback(() => {
    hapticTap();
    scrollDossierToTop();
  }, [scrollDossierToTop]);

  const submitSunlightForExport = useCallback((
    result: SunlightResult,
    source: 'analysis' | 'entitlement-sync' | 'export',
  ) => {
    const timestamp = new Date().toISOString();
    const vboId = address?.adresseerbaar_object_id;
    if (!vboId || !isEntitled || !reportId) {
      console.warn('[sunlight] submission skipped — missing prerequisites', {
        timestamp,
        source,
        hasVboId: Boolean(vboId),
        isEntitled,
        hasReportId: Boolean(reportId),
      });
      if (source === 'export') {
        return Promise.reject(new Error('[sunlight] export submission blocked by missing prerequisites'));
      }
      return Promise.resolve();
    }

    const submissionKey = sunlightSubmissionKey(vboId, reportId, result);
    if (latestSunlightSubmissionKeyRef.current === submissionKey) {
      if (sunlightSubmissionPromiseRef.current) {
        return sunlightSubmissionPromiseRef.current;
      }
      if (source !== 'export') {
        return Promise.resolve();
      }
    }
    latestSunlightSubmissionKeyRef.current = submissionKey;

    const startedAt = performance.now();
    if (import.meta.env.DEV) {
      console.info('[sunlight] submitting to backend cache', {
        timestamp,
        source,
        vboId,
        reportId,
      });
    }

    let submissionPromise: Promise<void> | null = null;
    submissionPromise = submitSunlightAnalysis(vboId, result, reportId)
      .then((submissionResult) => {
        if (submissionResult.status !== 'ok') {
          throw new Error(`[sunlight] unexpected submission status: ${submissionResult.status}`);
        }
        if (!submissionResult.cached) {
          console.warn('[sunlight] submission acknowledged without cache persistence', {
            timestamp,
            source,
            vboId,
          });
        }
        if (import.meta.env.DEV) {
          console.info('[sunlight] backend cache write succeeded', {
            timestamp,
            source,
            vboId,
            elapsedMs: Math.round(performance.now() - startedAt),
            cached: submissionResult.cached,
            score: submissionResult.score,
          });
        }
      })
      .catch((error) => {
        if (latestSunlightSubmissionKeyRef.current === submissionKey) {
          latestSunlightSubmissionKeyRef.current = null;
        }
        console.error('[sunlight] backend cache write failed', {
          timestamp,
          source,
          vboId,
          error,
        });
        throw error;
      })
      .finally(() => {
        if (sunlightSubmissionPromiseRef.current === submissionPromise) {
          sunlightSubmissionPromiseRef.current = null;
        }
      });

    sunlightSubmissionPromiseRef.current = submissionPromise;
    return submissionPromise;
  }, [address?.adresseerbaar_object_id, isEntitled, reportId]);

  const handleSunlightAnalysis = useCallback((result: SunlightResult) => {
    const completedAt = new Date().toISOString();
    setSunlight(result);
    setSunlightUnavailable(false);
    console.info('[sunlight] analysis completed', {
      timestamp: completedAt,
      winter: result.winter?.toFixed(1),
      equinox: result.equinox?.toFixed(1),
      summer: result.summer?.toFixed(1),
    });
    void submitSunlightForExport(result, 'analysis').catch((error) => {
      console.error('[sunlight] analysis submission failed', {
        timestamp: new Date().toISOString(),
        error,
      });
    });
  }, [submitSunlightForExport]);

  const handleShadowSnapshots = useCallback((snapshots: ShadowSnapshot[]) => {
    setShadowSnapshots(snapshots);
    setShadowSnapshotsUnavailable(false);
  }, []);

  const handleShadowSnapshotsError = useCallback(() => {
    setShadowSnapshotsUnavailable(true);
  }, []);

  const startShadowPrewarm = useCallback(() => {
    const vboId = address?.adresseerbaar_object_id;
    const rdX = address?.rd_x;
    const rdY = address?.rd_y;
    const lat = address?.latitude;
    const lng = address?.longitude;
    if (
      activeScreen !== 'dossier'
      || !vboId
      || !reportId
      || !isEntitled
      || !serverRenderAvailable
      || rdX == null
      || rdY == null
      || lat == null
      || lng == null
    ) {
      return null;
    }

    const key = shadowPrewarmKey(vboId, reportId);
    if (shadowPrewarmKeyRef.current !== key) {
      shadowPrewarmKeyRef.current = key;
      shadowPrewarmStatusRef.current = 'idle';
      shadowPrewarmPromiseRef.current = null;
    }

    if (
      shadowPrewarmStatusRef.current === 'pending'
      && shadowPrewarmPromiseRef.current
    ) {
      return shadowPrewarmPromiseRef.current;
    }
    if (isShadowPrewarmTerminalStatus(shadowPrewarmStatusRef.current)) {
      return null;
    }

    const requestedAt = new Date().toISOString();
    console.info('[shadow-prewarm] starting background request', {
      timestamp: requestedAt,
      vboId,
      reportId,
    });

    shadowPrewarmStatusRef.current = 'pending';
    let prewarmPromise: Promise<ShadowPrewarmResponse> | null = null;
    prewarmPromise = prewarmShadowEvidence(
      vboId,
      { rdX, rdY, lat, lng },
      reportId,
    )
      .then((result) => {
        const isCurrentRequest = shadowPrewarmKeyRef.current === key
          && shadowPrewarmPromiseRef.current === prewarmPromise;
        if (isCurrentRequest) {
          shadowPrewarmStatusRef.current = result.status;
          shadowPrewarmPromiseRef.current = null;
        }
        console.info('[shadow-prewarm] completed', {
          timestamp: new Date().toISOString(),
          requestedAt,
          vboId,
          reportId,
          status: result.status,
        });
        return result;
      })
      .catch((error) => {
        const isCurrentRequest = shadowPrewarmKeyRef.current === key
          && shadowPrewarmPromiseRef.current === prewarmPromise;
        if (isCurrentRequest) {
          shadowPrewarmStatusRef.current = 'failed';
          shadowPrewarmPromiseRef.current = null;
        }
        console.warn('[shadow-prewarm] request failed', {
          timestamp: new Date().toISOString(),
          requestedAt,
          vboId,
          reportId,
          error,
        });
        throw error;
      });

    shadowPrewarmPromiseRef.current = prewarmPromise;
    return prewarmPromise;
  }, [
    activeScreen,
    address?.adresseerbaar_object_id,
    address?.latitude,
    address?.longitude,
    address?.rd_x,
    address?.rd_y,
    isEntitled,
    reportId,
    serverRenderAvailable,
  ]);

  useEffect(() => {
    void startShadowPrewarm()?.catch(() => {});
  }, [startShadowPrewarm]);

  useEffect(() => {
    if (!sunlight) return;
    void submitSunlightForExport(sunlight, 'entitlement-sync').catch((error) => {
      console.warn('[sunlight] entitlement-sync submission failed', {
        timestamp: new Date().toISOString(),
        error,
      });
    });
  }, [sunlight, submitSunlightForExport]);

  // Safety net: if sunlight hasn't completed 180s after surrounding buildings load,
  // mark it as unavailable so the export button isn't stuck disabled forever.
  const SUNLIGHT_TIMEOUT_MS = 180_000;
  useEffect(() => {
    if (surroundingLoading || sunlight || sunlightUnavailable) return;
    const timer = setTimeout(() => {
      if (!sunlight && !sunlightUnavailable) {
        console.warn('[sunlight] timeout — marking as unavailable after', SUNLIGHT_TIMEOUT_MS, 'ms');
        setSunlightUnavailable(true);
      }
    }, SUNLIGHT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [surroundingLoading, sunlight, sunlightUnavailable]);

  const SHADOW_SNAPSHOT_TIMEOUT_MS = 9_000;
  useEffect(() => {
    if (serverRenderAvailable || hasShadowSnapshotTriptych || shadowSnapshotsUnavailable) {
      return;
    }
    if (neighborhood3DLoading || surroundingLoading) {
      return;
    }

    const hasRenderableNeighborhood = Boolean(neighborhood3D && neighborhood3D.buildings.length > 0);
    if (!hasRenderableNeighborhood) {
      if (neighborhood3D || neighborhood3DError) {
        setShadowSnapshotsUnavailable(true);
      }
      return;
    }

    const timer = window.setTimeout(() => {
      if (!hasRequiredShadowSnapshotTriptych(shadowSnapshots)) {
        console.warn(
          '[shadow] timeout — marking snapshot capture unavailable after',
          SHADOW_SNAPSHOT_TIMEOUT_MS,
          'ms',
        );
        setShadowSnapshotsUnavailable(true);
      }
    }, SHADOW_SNAPSHOT_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [
    hasShadowSnapshotTriptych,
    neighborhood3D,
    neighborhood3DError,
    neighborhood3DLoading,
    serverRenderAvailable,
    shadowSnapshots,
    shadowSnapshotsUnavailable,
    surroundingLoading,
  ]);

  const handleBeforeExportGenerate = useCallback(async (
    template: 'quick_brief' | 'full_dossier',
  ) => {
    const exportRequestedAt = new Date().toISOString();
    console.info('[sunlight] pre-export submission', {
      timestamp: exportRequestedAt,
      template,
      hasSunlight: Boolean(sunlight),
    });
    if (template !== 'full_dossier') return;
    if (sunlight) {
      try {
        await submitSunlightForExport(sunlight, 'export');
        if (import.meta.env.DEV) {
          console.info('[sunlight] pre-export submission confirmed', {
            timestamp: new Date().toISOString(),
            requestedAt: exportRequestedAt,
          });
        }
      } catch (error) {
        console.warn('[sunlight] pre-export submission failed; continuing with request payload fallback', {
          timestamp: new Date().toISOString(),
          requestedAt: exportRequestedAt,
          error,
        });
      }
    }

    const vboId = address?.adresseerbaar_object_id;
    const prewarmJoinKey = vboId && reportId ? shadowPrewarmKey(vboId, reportId) : null;
    const prewarmPromise = shadowPrewarmPromiseRef.current;
    if (
      template === 'full_dossier'
      && serverRenderAvailable
      && prewarmJoinKey
      && shadowPrewarmKeyRef.current === prewarmJoinKey
      && shadowPrewarmStatusRef.current === 'pending'
      && prewarmPromise
    ) {
      try {
        await prewarmPromise;
      } catch (error) {
        console.warn('[shadow-prewarm] pre-export join failed; continuing with export fallback', {
          timestamp: new Date().toISOString(),
          requestedAt: exportRequestedAt,
          vboId,
          reportId,
          error,
        });
      }
    }
  }, [
    address?.adresseerbaar_object_id,
    reportId,
    serverRenderAvailable,
    sunlight,
    submitSunlightForExport,
  ]);

  const isActiveDossierRequest = useCallback((requestId: number) => {
    return neighborhood3DRequestId.current === requestId && activeScreenRef.current === 'dossier';
  }, []);

  const handleRetryBuildingFacts = useCallback(() => {
    if (!address?.adresseerbaar_object_id) return;
    setBuildingError(null);
    setBuildingLoading(true);
    const controller = new AbortController();
    retryControllersRef.current.add(controller);
    void (async () => {
      try {
        const building = await getBuildingFacts(address.adresseerbaar_object_id!, controller.signal);
        if (activeScreenRef.current !== 'dossier') return;
        setBuildingResponse(building);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort || activeScreenRef.current !== 'dossier') return;
        setBuildingError(mapApiError(err, t));
      } finally {
        retryControllersRef.current.delete(controller);
        if (activeScreenRef.current === 'dossier') {
          setBuildingLoading(false);
        }
      }
    })();
  }, [address?.adresseerbaar_object_id, t]);

  const handleRetryRiskCards = useCallback(() => {
    if (!address?.adresseerbaar_object_id) return;
    const { adresseerbaar_object_id: vboId, rd_x, rd_y, latitude, longitude } = address;
    if (rd_x == null || rd_y == null || latitude == null || longitude == null) return;
    setRiskError(null);
    setRiskLoading(true);
    const controller = new AbortController();
    retryControllersRef.current.add(controller);
    void (async () => {
      try {
        const risks = await getRiskCards(vboId, rd_x, rd_y, latitude, longitude, controller.signal);
        if (activeScreenRef.current !== 'dossier') return;
        setRiskCards(risks);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort || activeScreenRef.current !== 'dossier') return;
        setRiskError(mapApiError(err, t));
      } finally {
        retryControllersRef.current.delete(controller);
        if (activeScreenRef.current === 'dossier') {
          setRiskLoading(false);
        }
      }
    })();
  }, [address, t]);

  const handleRetryRiskComparisons = useCallback(() => {
    if (!address?.adresseerbaar_object_id) return;
    const { adresseerbaar_object_id: vboId, rd_x, rd_y, latitude, longitude } = address;
    if (rd_x == null || rd_y == null || latitude == null || longitude == null) return;
    setRiskComparisonsError(null);
    setRiskComparisonsLoading(true);
    const controller = new AbortController();
    retryControllersRef.current.add(controller);
    void (async () => {
      try {
        const comparisons = await getRiskComparisons(
          vboId,
          rd_x,
          rd_y,
          latitude,
          longitude,
          address.buurt_code ?? undefined,
          controller.signal,
          reportId ?? undefined,
        );
        if (activeScreenRef.current !== 'dossier') return;
        setRiskComparisons(comparisons);
        setRiskComparisonsError(null);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort || activeScreenRef.current !== 'dossier') return;
        setRiskComparisonsError(mapApiError(err, t));
      } finally {
        retryControllersRef.current.delete(controller);
        if (activeScreenRef.current === 'dossier') {
          setRiskComparisonsLoading(false);
        }
      }
    })();
  }, [address, reportId, t]);

  const handleRetryPropertyWarnings = useCallback(() => {
    if (
      !address?.adresseerbaar_object_id
      || address.rd_x == null
      || address.rd_y == null
      || !isEntitled
      || !reportId
    ) return;
    setPropertyWarningsError(null);
    setPropertyWarningsLoading(true);
    const controller = new AbortController();
    retryControllersRef.current.add(controller);
    void (async () => {
      try {
        const warnings = await getPropertyWarnings(
          address.adresseerbaar_object_id!,
          address.rd_x!,
          address.rd_y!,
          {
            constructionYear: buildingResponse?.building?.construction_year ?? undefined,
            numUnits: buildingResponse?.building?.num_units ?? undefined,
            municipality: address.municipality ?? undefined,
          },
          controller.signal,
          reportId,
        );
        if (activeScreenRef.current !== 'dossier') return;
        setPropertyWarnings(warnings);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort || activeScreenRef.current !== 'dossier') return;
        setPropertyWarningsError(mapApiError(err, t));
      } finally {
        retryControllersRef.current.delete(controller);
        if (activeScreenRef.current === 'dossier') {
          setPropertyWarningsLoading(false);
        }
      }
    })();
  }, [
    address,
    buildingResponse?.building?.construction_year,
    buildingResponse?.building?.num_units,
    isEntitled,
    reportId,
    t,
  ]);

  const handleRetryNeighborhoodStats = useCallback(() => {
    if (!address?.adresseerbaar_object_id || address.latitude == null || address.longitude == null) return;
    setNeighborhoodStatsError(null);
    setNeighborhoodStatsLoading(true);
    const controller = new AbortController();
    retryControllersRef.current.add(controller);
    void (async () => {
      try {
        const stats = await getNeighborhoodStats(
          address.adresseerbaar_object_id!,
          address.latitude!,
          address.longitude!,
          address.buurt_code ?? undefined,
          controller.signal,
        );
        if (activeScreenRef.current !== 'dossier') return;
        setNeighborhoodStats(stats);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort || activeScreenRef.current !== 'dossier') return;
        setNeighborhoodStatsError(mapApiError(err, t));
      } finally {
        retryControllersRef.current.delete(controller);
        if (activeScreenRef.current === 'dossier') {
          setNeighborhoodStatsLoading(false);
        }
      }
    })();
  }, [address, t]);

  const handleRetryLivability = useCallback(() => {
    if (
      !address?.adresseerbaar_object_id
      || address.rd_x == null
      || address.rd_y == null
    ) return;
    setLivabilityError(null);
    setLivabilityLoading(true);
    const controller = new AbortController();
    retryControllersRef.current.add(controller);
    void (async () => {
      try {
        const livData = await getLivability(
          address.adresseerbaar_object_id!,
          address.rd_x!,
          address.rd_y!,
          controller.signal,
          reportId ?? undefined,
        );
        if (activeScreenRef.current !== 'dossier') return;
        setLivability(livData);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort || activeScreenRef.current !== 'dossier') return;
        setLivabilityError(mapApiError(err, t));
      } finally {
        retryControllersRef.current.delete(controller);
        if (activeScreenRef.current === 'dossier') {
          setLivabilityLoading(false);
        }
      }
    })();
  }, [address, reportId, t]);

  const handleRetryViewingQuestions = useCallback(() => {
    if (!address?.adresseerbaar_object_id) return;
    const { adresseerbaar_object_id: vboId, rd_x, rd_y, latitude, longitude } = address;
    if (rd_x == null || rd_y == null || latitude == null || longitude == null) return;
    setViewingQuestionsError(null);
    setViewingQuestionsLoading(true);
    const controller = new AbortController();
    retryControllersRef.current.add(controller);
    void (async () => {
      try {
        const questions = await getViewingQuestions(
          vboId,
          rd_x,
          rd_y,
          latitude,
          longitude,
          {
            street: address.street ?? undefined,
            city: address.city ?? undefined,
            buurtCode: address.buurt_code ?? undefined,
          },
          controller.signal,
          reportId ?? undefined,
        );
        if (activeScreenRef.current !== 'dossier') return;
        setViewingQuestions(questions);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort || activeScreenRef.current !== 'dossier') return;
        setViewingQuestionsError(mapApiError(err, t));
      } finally {
        retryControllersRef.current.delete(controller);
        if (activeScreenRef.current === 'dossier') {
          setViewingQuestionsLoading(false);
        }
      }
    })();
  }, [address, reportId, t]);

  const handleLivabilityTap = useCallback(() => {
    setShowLivabilityDetail(true);
  }, []);

  const handleRetryAllFailed = useCallback(() => {
    if (buildingError) handleRetryBuildingFacts();
    if (riskError) handleRetryRiskCards();
    if (riskComparisonsError) handleRetryRiskComparisons();
    if (propertyWarningsError) handleRetryPropertyWarnings();
    if (livabilityError) handleRetryLivability();
    if (neighborhoodStatsError) handleRetryNeighborhoodStats();
    if (viewingQuestionsError) handleRetryViewingQuestions();
  }, [
    buildingError,
    handleRetryBuildingFacts,
    handleRetryLivability,
    handleRetryNeighborhoodStats,
    handleRetryPropertyWarnings,
    handleRetryRiskComparisons,
    handleRetryRiskCards,
    handleRetryViewingQuestions,
    livabilityError,
    neighborhoodStatsError,
    propertyWarningsError,
    riskComparisonsError,
    riskError,
    viewingQuestionsError,
  ]);

  // Trigger 3D fetch — called by IntersectionObserver when 3D section nears viewport
  const trigger3DFetch = useCallback(() => {
    const params = deferred3DParamsRef.current;
    if (!params) return;
    const { vboId, pandId, rdX, rdY, lat, lng, building, requestId } = params;
    if (!isActiveDossierRequest(requestId)) return;
    // Clear params so we don't re-trigger
    deferred3DParamsRef.current = null;
    last3DParamsRef.current = params;

    setNeighborhood3DError(null);
    setNeighborhood3DLoading(true);
    setSurroundingLoading(true);

    const immediateTargetData = createImmediateTarget3D(
      vboId,
      pandId,
      rdX,
      rdY,
      lat,
      lng,
      building,
    );
    setNeighborhood3D(immediateTargetData);
    setNeighborhood3DLoading(false);

    let phase1TargetData: Neighborhood3DResponse | null = immediateTargetData;
    let phase2Done = false;
    let phase2HasRenderableData = false;
    const requestSignal = addressRequestAbortRef.current?.signal;

    void (async () => {
      try {
        const target3d = await getBuilding3D(
          vboId,
          pandId,
          rdX,
          rdY,
          lat,
          lng,
          requestSignal,
          reportId ?? undefined,
        );
        const hasTargetBuilding = target3d.buildings.length > 0;
        if (hasTargetBuilding) {
          phase1TargetData = target3d;
        }
        if (
          (!phase2Done || !phase2HasRenderableData)
          && isActiveDossierRequest(requestId)
          && hasTargetBuilding
        ) {
          setNeighborhood3D(target3d);
        }
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (!isAbort && import.meta.env.DEV) {
          console.warn('[3D] Target building fetch failed', err);
        }
        // Phase 2 handles fallback.
      }
    })();

    void (async () => {
      try {
        const n3d = await getNeighborhood3D(
          vboId,
          pandId,
          rdX,
          rdY,
          lat,
          lng,
          requestSignal,
          reportId ?? undefined,
        );
        phase2Done = true;
        const merged3d = mergeNeighborhood3DWithFallback(n3d, phase1TargetData);
        phase2HasRenderableData = merged3d.buildings.length > 0;
        if (!isActiveDossierRequest(requestId)) return;
        setNeighborhood3D(merged3d);
        setNeighborhood3DError(null);
        setNeighborhood3DLoading(false);
        setSurroundingLoading(false);
        setSunlightUnavailable(!hasSurroundingContext(merged3d));
      } catch (err) {
        phase2Done = true;
        phase2HasRenderableData = false;
        if (!isActiveDossierRequest(requestId)) return;
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (!isAbort) {
          const mapped = mapApiError(err, t);
          setNeighborhood3DError(mapped);
          trackEvent('3d_view_failed', {
            report_id: reportId ?? 'none',
            vbo_id: vboId,
          });
          trackEvent('report_generation_failed', {
            stage: 'neighborhood_3d',
            report_id: reportId ?? 'none',
            vbo_id: vboId,
          });
        }
        setNeighborhood3DLoading(false);
        setSurroundingLoading(false);
        setSunlightUnavailable(true);
      }
    })();
  }, [isActiveDossierRequest, reportId, t]);

  const kickoffPostCheckoutPrerequisites = useCallback(() => {
    if (sunlight || sunlightUnavailable || neighborhood3DLoading || surroundingLoading) {
      return;
    }

    if (deferred3DParamsRef.current) {
      setViewer3DTriggered(true);
      trigger3DFetch();
      return;
    }

    const hasRenderableNeighborhood = Boolean(neighborhood3D && neighborhood3D.buildings.length > 0);
    if (hasRenderableNeighborhood) {
      return;
    }

    const currentParams = last3DParamsRef.current ?? (
      address?.adresseerbaar_object_id
      && address.rd_x != null
      && address.rd_y != null
      && address.latitude != null
      && address.longitude != null
      && (address.pand_id ?? buildingResponse?.building?.pand_id)
        ? {
          vboId: address.adresseerbaar_object_id,
          pandId: address.pand_id ?? buildingResponse?.building?.pand_id ?? '',
          rdX: address.rd_x,
          rdY: address.rd_y,
          lat: address.latitude,
          lng: address.longitude,
          building: buildingResponse?.building,
          requestId: neighborhood3DRequestId.current,
        }
        : null
    );

    if (!currentParams) {
      return;
    }

    deferred3DParamsRef.current = currentParams;
    setViewer3DTriggered(true);
    trigger3DFetch();
  }, [
    address?.adresseerbaar_object_id,
    address?.latitude,
    address?.longitude,
    address?.pand_id,
    address?.rd_x,
    address?.rd_y,
    buildingResponse?.building,
    neighborhood3D,
    neighborhood3DLoading,
    sunlight,
    sunlightUnavailable,
    surroundingLoading,
    trigger3DFetch,
  ]);
  kickoffPostCheckoutPrerequisitesRef.current = kickoffPostCheckoutPrerequisites;

  const handleRetryNeighborhood3D = useCallback(() => {
    setNeighborhood3DError(null);
    if (deferred3DParamsRef.current) {
      setViewer3DTriggered(true);
      trigger3DFetch();
      return;
    }
    if (!last3DParamsRef.current) return;
    deferred3DParamsRef.current = last3DParamsRef.current;
    setViewer3DTriggered(true);
    trigger3DFetch();
  }, [trigger3DFetch]);

  useEffect(() => {
    if (!exportSheetOpen || exportInitialTemplate !== 'full_dossier' || !exportAutoGenerateToken) {
      return;
    }
    kickoffPostCheckoutPrerequisites();
  }, [
    exportAutoGenerateToken,
    exportInitialTemplate,
    exportSheetOpen,
    kickoffPostCheckoutPrerequisites,
  ]);

  useEffect(() => {
    const vboId = address?.adresseerbaar_object_id;
    if (!vboId || !neighborhood3D || neighborhood3D.buildings.length === 0) return;

    const key = `${vboId}:${reportId ?? 'none'}`;
    if (tracked3DOpenKeyRef.current === key) return;
    tracked3DOpenKeyRef.current = key;

    trackEvent('3d_view_opened', {
      report_id: reportId ?? 'none',
      vbo_id: vboId,
      building_count: neighborhood3D.buildings.length,
    });
  }, [address?.adresseerbaar_object_id, neighborhood3D, reportId]);

  useEffect(() => {
    if (!address?.adresseerbaar_object_id) return;

    if (
      isEntitled
      && reportId
      && buildingResponse?.building
      && !propertyWarnings
      && !propertyWarningsLoading
      && !propertyWarningsError
    ) {
      handleRetryPropertyWarnings();
    }
    if (
      progressivePhase === 'buurt'
      && !riskComparisons
      && !riskComparisonsLoading
      && !riskComparisonsError
    ) {
      handleRetryRiskComparisons();
    }
    if (
      progressivePhase === 'buurt'
      && !viewingQuestions
      && !viewingQuestionsLoading
      && !viewingQuestionsError
    ) {
      handleRetryViewingQuestions();
    }
    if (
      progressivePhase === 'buurt'
      && !livability
      && !livabilityLoading
      && !livabilityError
      && address.rd_x != null
      && address.rd_y != null
    ) {
      handleRetryLivability();
    }
    if (!deferred3DParamsRef.current && !neighborhood3D && !neighborhood3DLoading) {
      const pandId = address.pand_id ?? buildingResponse?.building?.pand_id ?? null;
      if (
        pandId
        && address.rd_x != null
        && address.rd_y != null
        && address.latitude != null
        && address.longitude != null
      ) {
        deferred3DParamsRef.current = {
          vboId: address.adresseerbaar_object_id,
          pandId,
          rdX: address.rd_x,
          rdY: address.rd_y,
          lat: address.latitude,
          lng: address.longitude,
          building: buildingResponse?.building,
          requestId: neighborhood3DRequestId.current,
        };
        if (viewer3DSectionRef.current && !viewer3DObserverRef.current) {
          const node = viewer3DSectionRef.current;
          const observer = new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                observer.disconnect();
                viewer3DObserverRef.current = null;
                setViewer3DTriggered(true);
                trigger3DFetch();
                break;
              }
            },
            { rootMargin: '400px 0px' },
          );
          observer.observe(node);
          viewer3DObserverRef.current = observer;
        }
      }
    }
  }, [
    address,
    buildingResponse?.building,
    handleRetryLivability,
    handleRetryPropertyWarnings,
    handleRetryRiskComparisons,
    handleRetryViewingQuestions,
    livability,
    livabilityError,
    livabilityLoading,
    neighborhood3D,
    neighborhood3DLoading,
    propertyWarnings,
    propertyWarningsError,
    propertyWarningsLoading,
    progressivePhase,
    reportId,
    riskComparisons,
    riskComparisonsLoading,
    riskComparisonsError,
    trigger3DFetch,
    viewingQuestions,
    viewingQuestionsLoading,
    viewingQuestionsError,
    isEntitled,
  ]);

  // IntersectionObserver callback ref for the 3D section
  const viewer3DRefCallback = useCallback((node: HTMLDivElement | null) => {
    // Disconnect existing observer
    if (viewer3DObserverRef.current) {
      viewer3DObserverRef.current.disconnect();
      viewer3DObserverRef.current = null;
    }

    viewer3DSectionRef.current = node;

    if (!node) return;

    // If already triggered (params consumed), nothing to observe
    if (!deferred3DParamsRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.disconnect();
            viewer3DObserverRef.current = null;
            setViewer3DTriggered(true);
            trigger3DFetch();
            break;
          }
        }
      },
      { rootMargin: '400px 0px' },
    );

    observer.observe(node);
    viewer3DObserverRef.current = observer;
  }, [trigger3DFetch]);

  // Clean up observer on unmount
  useEffect(() => {
    return () => {
      if (viewer3DObserverRef.current) {
        viewer3DObserverRef.current.disconnect();
        viewer3DObserverRef.current = null;
      }
    };
  }, []);

  const handleAddressSelect = useCallback(async (
    suggestion: AddressSuggestion,
    options?: {
      forcedReportId?: string;
      recoveryMode?: 'checkout_return';
    },
  ) => {
    addressRequestAbortRef.current?.abort();
    retryControllersRef.current.forEach(c => c.abort());
    retryControllersRef.current.clear();
    const requestAbortController = new AbortController();
    addressRequestAbortRef.current = requestAbortController;
    const requestSignal = requestAbortController.signal;

    const previousVboId = address?.adresseerbaar_object_id;
    if (previousVboId) {
      clearEntitlement(previousVboId);
    }

    setLoading(true);
    setBuildingLoading(true);
    setLoadingStep('findingBuilding');
    setLoadingWarningKey(null);
    setProgressivePhase('house');
    setError(null);
    setAddress(null);
    setPrebidBriefing(null);
    setActiveLookupId(suggestion.id);
    setReportId(null);
    setIsEntitled(TEMP_FORCE_FULL_DOSSIER_VIEW);
    latestEntitlementRef.current = {
      reportId: null,
      isEntitled: TEMP_FORCE_FULL_DOSSIER_VIEW,
    };
    setIsCheckingOut(false);
    setCheckoutStatusMessage(null);
    setCheckoutRetryAvailable(false);
    setQueuedPostCheckoutResume(null);
    setBuildingResponse(null);
    setBuildingError(null);
    setNeighborhood3D(null);
    setNeighborhood3DLoading(false);
    setNeighborhood3DError(null);
    setSurroundingLoading(false);
    setViewer3DTriggered(false);
    deferred3DParamsRef.current = null;
    last3DParamsRef.current = null;
    if (viewer3DObserverRef.current) {
      viewer3DObserverRef.current.disconnect();
      viewer3DObserverRef.current = null;
    }
    setExportSheetOpen(false);
    setExportGenerating(false);
    setExportInitialTemplate(null);
    setExportInitialLanguage(null);
    setExportAutoGenerateToken(null);
    setRiskCards(null);
    setRiskComparisons(null);
    setRiskComparisonsLoading(false);
    setRiskComparisonsError(null);
    setRiskLoading(false);
    setRiskError(null);
    setNeighborhoodStats(null);
    setNeighborhoodStatsLoading(false);
    setNeighborhoodStatsError(null);
    setPropertyWarnings(null);
    setPropertyWarningsLoading(false);
    setPropertyWarningsError(null);
    setLivability(null);
    setLivabilityLoading(false);
    setLivabilityError(null);
    setShowLivabilityDetail(false);
    setSunlight(null);
    setSunlightUnavailable(false);
    setSunDateTime(undefined);
    setShadowSnapshots(null);
    setShadowSnapshotsUnavailable(false);
    setViewingQuestions(null);
    setViewingQuestionsLoading(false);
    setViewingQuestionsError(null);
    setActiveDetailCategory(null);
    setCheckedQuestions(new Set());
    screenScrollPositionsRef.current.set('dossier', 0);
    const requestId = ++neighborhood3DRequestId.current;

    setActiveScreen('dossier');
    // Sync immediately — post-await checks read this ref before useEffect fires
    activeScreenRef.current = 'dossier';
    setActiveTab('briefing');
    setSheetSnap('peek');
    setPendingDisplayName(suggestion.display_name);
    setHashRoute('#/briefing');

    try {
      let activeSuggestion = suggestion;
      let resolved: ResolvedAddress;

      try {
        resolved = await lookupAddress(activeSuggestion.id, requestSignal);
      } catch (err) {
        const isLookupMissing = err instanceof ApiError && err.httpStatus === 404;
        if (!isLookupMissing) {
          throw err;
        }

        let refreshedSuggestion: AddressSuggestion | null = null;
        const recoveryQueries = buildSelectionRecoveryQueries(suggestion.display_name);
        for (const recoveryQuery of recoveryQueries) {
          const candidates = await suggestAddresses(recoveryQuery, 5, requestSignal);
          refreshedSuggestion = pickRecoveredSuggestion(suggestion.display_name, candidates.suggestions);
          if (refreshedSuggestion) {
            break;
          }
        }

        if (!refreshedSuggestion) {
          removeRecent(suggestion.id);
          throw err;
        }

        removeRecent(suggestion.id);
        activeSuggestion = refreshedSuggestion;
        setActiveLookupId(activeSuggestion.id);
        setPendingDisplayName(activeSuggestion.display_name);
        resolved = await lookupAddress(activeSuggestion.id, requestSignal);
      }

      if (!isActiveDossierRequest(requestId)) return;

      setAddress(resolved);
      const vboId = resolved.adresseerbaar_object_id;
      const { rd_x, rd_y, latitude, longitude } = resolved;

      if (!vboId) {
        setLoading(false);
        setBuildingLoading(false);
        setSheetSnap('hidden');
        return;
      }

      let activeReportId = TEMP_FORCE_FULL_DOSSIER_VIEW ? null : (options?.forcedReportId ?? null);
      let entitledForAddress = false;

      if (activeReportId) {
        try {
          const entitlement = await checkEntitlement(activeReportId);
          entitledForAddress = entitlement.entitled;
        } catch (err) {
          if (err instanceof ApiError && err.httpStatus === 404) {
            if (options?.recoveryMode !== 'checkout_return') {
              activeReportId = null;
            }
            // During Stripe return recovery, keep the forced report pinned.
            // confirmStripeCheckoutSession restores the buyer/report context.
          } else {
            throw err;
          }
        }
      }

      if (!activeReportId) {
        const shortReport = await createShortReport(vboId, resolved.display_name);
        activeReportId = shortReport.report_id;
        entitledForAddress = shortReport.already_purchased;
        trackEvent('short_report_generated', { report_id: shortReport.report_id, vbo_id: vboId });
      } else {
        trackEvent('short_report_loaded', { report_id: activeReportId, vbo_id: vboId });
      }

      const effectiveEntitlement = TEMP_FORCE_FULL_DOSSIER_VIEW
        || entitledForAddress
        || (
          latestEntitlementRef.current.reportId === activeReportId
          && latestEntitlementRef.current.isEntitled
        );
      setReportId(activeReportId);
      setIsEntitled(effectiveEntitlement);
      if (activeReportId) {
        storeEntitlement(vboId, activeReportId, effectiveEntitlement);
        storeReportLookup(activeReportId, activeSuggestion.id);
      }

      void fetchPrebidBriefing(vboId, {
        report_id: activeReportId ?? undefined,
        confirmed_address: resolved.display_name,
        postcode: resolved.postcode,
        municipality: resolved.municipality ?? resolved.city,
        rd_x,
        rd_y,
        lat: latitude,
        lng: longitude,
        property_type: 'unknown',
      }, requestSignal)
        .then((briefing) => {
          if (!isActiveDossierRequest(requestId)) return;
          setPrebidBriefing(briefing);
          trackPrebidEvent('briefing_loaded', {
            result_state: briefing.result_state,
            source_count: briefing.coverage.length,
            action_count: briefing.top_actions.length,
          });
        })
        .catch((err) => {
          const isAbort = err instanceof DOMException && err.name === 'AbortError';
          if (isAbort || !isActiveDossierRequest(requestId)) return;
          trackPrebidEvent('briefing_failed', {
            reason: err instanceof ApiError ? 'api_error' : 'network_or_timeout',
          });
        });

      if (activeSuggestion.id !== suggestion.id) {
        removeRecent(suggestion.id);
      }
      addRecent({
        id: activeSuggestion.id,
        display_name: resolved.display_name,
        postcode: resolved.postcode,
        city: resolved.city,
      });

      let building: BuildingFactsResponse | null = null;
      const buildingFetchStartedAt = performance.now();
      try {
        building = await getBuildingFacts(vboId, requestSignal);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort || !isActiveDossierRequest(requestId)) return;
        const mapped = mapApiError(err, t);
        setBuildingError(mapped);
        trackEvent('report_generation_failed', {
          stage: 'building_facts',
          report_id: activeReportId ?? 'none',
          vbo_id: vboId,
        });
      }
      const buildingFetchDurationMs = Math.round(performance.now() - buildingFetchStartedAt);
      if (buildingFetchDurationMs > 5000) {
        trackEvent('slow_report_generation', {
          stage: 'building_facts',
          duration_ms: buildingFetchDurationMs,
          report_id: activeReportId ?? 'none',
          vbo_id: vboId,
        });
      }
      if (!isActiveDossierRequest(requestId)) return;

      setBuildingResponse(building);
      setLoading(false);
      setBuildingLoading(false);
      setSheetSnap('half');
      setHashRoute(dossierHash(vboId, activeSuggestion.id));

      setLoadingStep('loading3D');
      let phase1Promise: Promise<void> | null = null;
      if (effectiveEntitlement && activeReportId && rd_x != null && rd_y != null) {
        setPropertyWarningsLoading(true);
        phase1Promise = (async () => {
          try {
            const warnings = await getPropertyWarnings(
              vboId,
              rd_x,
              rd_y,
              {
                constructionYear: building?.building?.construction_year ?? undefined,
                numUnits: building?.building?.num_units ?? undefined,
                municipality: resolved.municipality ?? undefined,
              },
              requestSignal,
              activeReportId,
            );
            if (!isActiveDossierRequest(requestId)) return;
            setPropertyWarnings(warnings);
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            const mapped = mapApiError(err, t);
            setPropertyWarningsError(mapped);
            trackEvent('report_generation_failed', {
              stage: 'property_warnings',
              report_id: activeReportId ?? 'none',
              vbo_id: vboId,
            });
          } finally {
            if (isActiveDossierRequest(requestId)) {
              setPropertyWarningsLoading(false);
            }
          }
        })();
      }

      if (phase1Promise) {
        await settleWithTimeout(phase1Promise, PHASE_1_TIMEOUT_MS);
      }
      if (!isActiveDossierRequest(requestId)) return;

      setProgressivePhase('risk');
      setLoadingStep('checkingNoise');

      let phase2Promise: Promise<void> | null = null;
      if (rd_x != null && rd_y != null && latitude != null && longitude != null) {
        setRiskLoading(true);
        setRiskComparisonsLoading(true);
        setViewingQuestionsLoading(true);
        phase2Promise = (async () => {
          try {
            const risks = await getRiskCards(vboId, rd_x, rd_y, latitude, longitude, requestSignal);
            if (!isActiveDossierRequest(requestId)) return;
            setRiskCards(risks);
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            const mapped = mapApiError(err, t);
            setRiskError(mapped);
            trackEvent('report_generation_failed', {
              stage: 'risk_cards',
              report_id: activeReportId ?? 'none',
              vbo_id: vboId,
            });
          } finally {
            if (isActiveDossierRequest(requestId)) {
              setRiskLoading(false);
            }
          }
        })();

        void (async () => {
          try {
            const comparisons = await getRiskComparisons(
              vboId,
              rd_x,
              rd_y,
              latitude,
              longitude,
              resolved.buurt_code ?? undefined,
              requestSignal,
              activeReportId ?? undefined,
            );
            if (isActiveDossierRequest(requestId)) {
              setRiskComparisons(comparisons);
              setRiskComparisonsError(null);
            }
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            const mapped = mapApiError(err, t);
            setRiskComparisonsError(mapped);
            trackEvent('report_generation_failed', {
              stage: 'risk_comparisons',
              report_id: activeReportId ?? 'none',
              vbo_id: vboId,
            });
          } finally {
            if (isActiveDossierRequest(requestId)) {
              setRiskComparisonsLoading(false);
            }
          }
        })();

        void (async () => {
          try {
            const questions = await getViewingQuestions(
              vboId,
              rd_x,
              rd_y,
              latitude,
              longitude,
              {
                street: resolved.street ?? undefined,
                city: resolved.city ?? undefined,
                buurtCode: resolved.buurt_code ?? undefined,
              },
              requestSignal,
              activeReportId ?? undefined,
            );
            if (isActiveDossierRequest(requestId)) {
              setViewingQuestions(questions);
              setViewingQuestionsError(null);
            }
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            const mapped = mapApiError(err, t);
            setViewingQuestionsError(mapped);
            trackEvent('report_generation_failed', {
              stage: 'viewing_questions',
              report_id: activeReportId ?? 'none',
              vbo_id: vboId,
            });
          } finally {
            if (isActiveDossierRequest(requestId)) {
              setViewingQuestionsLoading(false);
            }
          }
        })();
      }

      if (phase2Promise) {
        const phase2State = await settleWithTimeout(phase2Promise, PHASE_2_TIMEOUT_MS);
        if (phase2State === 'timeout' && isActiveDossierRequest(requestId)) {
          setLoadingWarningKey('loading.warning.risk');
          window.setTimeout(() => {
            if (isActiveDossierRequest(requestId)) {
              setLoadingWarningKey(null);
            }
          }, 1500);
        }
      }
      if (!isActiveDossierRequest(requestId)) return;

      setProgressivePhase('buurt');
      setLoadingStep('checkingAir');

      if (rd_x != null && rd_y != null && latitude != null && longitude != null) {
        setNeighborhoodStatsLoading(true);
        void (async () => {
          try {
            const stats = await getNeighborhoodStats(
              vboId,
              latitude,
              longitude,
              resolved.buurt_code ?? undefined,
              requestSignal,
            );
            if (!isActiveDossierRequest(requestId)) return;
            setNeighborhoodStats(stats);
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            const mapped = mapApiError(err, t);
            setNeighborhoodStatsError(mapped);
            trackEvent('report_generation_failed', {
              stage: 'neighborhood_stats',
              report_id: activeReportId ?? 'none',
              vbo_id: vboId,
            });
          } finally {
            if (isActiveDossierRequest(requestId)) {
              setNeighborhoodStatsLoading(false);
            }
          }
        })();

        setLivabilityLoading(true);
        void (async () => {
          try {
            const livData = await getLivability(vboId, rd_x, rd_y, requestSignal, activeReportId ?? undefined);
            if (!isActiveDossierRequest(requestId)) return;
            setLivability(livData);
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            const mapped = mapApiError(err, t);
            setLivabilityError(mapped);
            trackEvent('report_generation_failed', {
              stage: 'livability',
              report_id: activeReportId ?? 'none',
              vbo_id: vboId,
            });
          } finally {
            if (isActiveDossierRequest(requestId)) {
              setLivabilityLoading(false);
            }
          }
        })();

      }

      setLoadingStep('checkingClimate');
      const pandId = resolved.pand_id ?? building?.building?.pand_id ?? null;
      if (
        pandId
        && rd_x != null
        && rd_y != null
        && latitude != null
        && longitude != null
      ) {
        // Defer 3D fetch until the 3D section is near the viewport.
        // Store the parameters and let IntersectionObserver trigger the actual fetch.
        deferred3DParamsRef.current = {
          vboId,
          pandId,
          rdX: rd_x,
          rdY: rd_y,
          lat: latitude,
          lng: longitude,
          building: building?.building,
          requestId,
        };
        // Re-attach observer if the section ref is already mounted
        if (viewer3DSectionRef.current && !viewer3DObserverRef.current) {
          const node = viewer3DSectionRef.current;
          const observer = new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (entry.isIntersecting) {
                  observer.disconnect();
                  viewer3DObserverRef.current = null;
                  setViewer3DTriggered(true);
                  trigger3DFetch();
                  break;
                }
              }
            },
            { rootMargin: '400px 0px' },
          );
          observer.observe(node);
          viewer3DObserverRef.current = observer;
        }
      }

      setLoadingStep('calculatingSunlight');
    } catch (err) {
      if (!isActiveDossierRequest(requestId)) return;
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (isAbort) return;
      const mapped = mapApiError(err, t);
      trackEvent('report_generation_failed', {
        stage: 'initial_lookup',
        lookup_id: suggestion.id,
      });
      setError(null);
      setLoading(false);
      setBuildingLoading(false);
      setSheetSnap('hidden');
      showToast(mapped);
      setActiveTab('home');
      setActiveScreen('search');
      setHashRoute('#/search', { replace: true });
    }
  }, [
    address?.adresseerbaar_object_id,
    dossierHash,
    isActiveDossierRequest,
    setHashRoute,
    showToast,
    t,
    trigger3DFetch,
  ]);

  const recoverCheckoutAddress = useCallback(async (
    confirmation: CheckoutConfirmationResponse,
  ): Promise<boolean> => {
    const targetVboId = confirmation.vbo_id ?? undefined;
    if (
      activeScreenRef.current === 'dossier'
      && addressRef.current?.adresseerbaar_object_id
      && (!targetVboId || addressRef.current.adresseerbaar_object_id === targetVboId)
    ) {
      return true;
    }

    const directLookupId = confirmation.lookup_id
      ?? getReportLookup(confirmation.report_id)
      ?? undefined;
    let recoverySuggestion: AddressSuggestion | null = null;
    let recoveryVia: 'lookup_id' | 'address_key' | null = null;

    if (directLookupId) {
      recoverySuggestion = {
        id: directLookupId,
        display_name: confirmation.address_key ?? directLookupId,
        type: 'adres',
        score: 1,
      };
      recoveryVia = 'lookup_id';
    } else if (confirmation.address_key) {
      try {
        const candidates = await suggestAddresses(confirmation.address_key, 5);
        for (const candidate of candidates.suggestions) {
          if (!targetVboId) {
            recoverySuggestion = candidate;
            recoveryVia = 'address_key';
            break;
          }
          try {
            const resolved = await lookupAddress(candidate.id);
            if (resolved.adresseerbaar_object_id === targetVboId) {
              recoverySuggestion = candidate;
              recoveryVia = 'address_key';
              break;
            }
          } catch {
            // Ignore candidate-level lookup failures and continue searching.
          }
        }
      } catch {
        // Fallback handled below.
      }
    }

    if (!recoverySuggestion || !recoveryVia) {
      logCheckoutResumeCheckpoint('route_recovery_missing', {
        has_lookup_id: Boolean(directLookupId),
        has_address_key: Boolean(confirmation.address_key),
        has_vbo_id: Boolean(targetVboId),
      });
      return false;
    }

    logCheckoutResumeCheckpoint('route_recovery_started', {
      via: recoveryVia,
    });
    await handleAddressSelect(recoverySuggestion, {
      forcedReportId: confirmation.report_id,
      recoveryMode: 'checkout_return',
    });
    logCheckoutResumeCheckpoint('route_recovery_completed', {
      via: recoveryVia,
    });
    return true;
  }, [handleAddressSelect, logCheckoutResumeCheckpoint]);
  recoverCheckoutAddressRef.current = recoverCheckoutAddress;

  const handleSelectShortlistAddress = useCallback(async (vboId: string) => {
    const shortlistItem = shortlistItems.find((item) => item.vboId === vboId);
    if (!shortlistItem) return;

    if (shortlistItem.lookupId) {
      try {
        await handleAddressSelect({
          id: shortlistItem.lookupId,
          display_name: shortlistItem.address,
          type: 'adres',
          score: 1,
        });
        return;
      } catch {
        // Fall through to toast below
      }
    }

    try {
      const suggestions = await suggestAddresses(shortlistItem.address, 1);
      const fallbackSuggestion = suggestions.suggestions[0];
      if (fallbackSuggestion) {
        await handleAddressSelect(fallbackSuggestion);
        return;
      }
    } catch {
      // Continue to toast fallback.
    }

    showToast(t('shortlist.reopenError'));
  }, [handleAddressSelect, shortlistItems, showToast, t]);

  // Ref-based applyRoute — always reads current state without triggering effect re-runs
  const applyRouteRef = useRef<() => void>(() => {});
  applyRouteRef.current = () => {
    const parsed = parseLocationRoute(window.location);
    if (parsed.route !== 'dossier') {
      setMatchReturnContext(null);
    }
    if (parsed.route.startsWith('match')) {
      if (parsed.sessionId) {
        setActiveMatchSessionId(parsed.sessionId);
        storeMatchSessionId(parsed.sessionId);
        setActiveMatchJobStatus(readStoredMatchJobStatus(parsed.sessionId));
        setMatchMapReturnContext(readStoredMatchReturnContext(parsed.sessionId));
      } else {
        setActiveMatchJobStatus(null);
      }
      setActiveMatchNeighborhoodId(parsed.neighborhoodId ?? null);
    }
    if (parsed.route === 'shortlist') {
      setActiveTab('saved');
      setActiveScreen('shortlist');
      setShortlistItems(getShortlist());
      return;
    }
    if (parsed.route === 'compare') {
      setActiveTab('saved');
      setActiveScreen('compare');
      return;
    }
    if (parsed.route === 'settings') {
      setActiveScreen('settings');
      return;
    }
    if (parsed.route === 'matchLanding') {
      setActiveTab('home');
      setActiveScreen('matchLanding');
      return;
    }
    if (parsed.route === 'matchSurveyIntro') {
      setActiveTab('home');
      setActiveScreen('matchSurveyIntro');
      return;
    }
    if (parsed.route === 'matchSurvey') {
      setActiveTab('home');
      setActiveScreen('matchSurvey');
      return;
    }
    if (parsed.route === 'matchReview') {
      setActiveTab('home');
      setActiveScreen('matchReview');
      return;
    }
    if (parsed.route === 'matchRun') {
      setActiveTab('home');
      setActiveScreen('matchRun');
      return;
    }
    if (parsed.route === 'matchSuccess') {
      setActiveTab('home');
      setActiveScreen('matchSuccess');
      return;
    }
    if (parsed.route === 'matchResults') {
      setActiveTab('home');
      setActiveScreen('matchResults');
      return;
    }
    if (parsed.route === 'matchNeighborhood') {
      setActiveTab('home');
      setActiveScreen('matchNeighborhood');
      return;
    }
    if (parsed.route === 'matchReport') {
      setActiveTab('home');
      setActiveScreen('matchReport');
      return;
    }
    if (parsed.route === 'matchComparison') {
      setActiveTab('home');
      setActiveScreen('matchComparison');
      return;
    }
    if (parsed.route === 'matchSimilar') {
      setActiveTab('home');
      setActiveScreen('matchSimilar');
      return;
    }
    if (parsed.route === 'matchMap') {
      setActiveTab('home');
      setActiveScreen('matchMap');
      return;
    }
    if (parsed.route === 'matchListings') {
      setActiveTab('home');
      setActiveScreen('matchListings');
      return;
    }
    if (parsed.route === 'matchAlerts') {
      setActiveTab('home');
      setActiveScreen('matchAlerts');
      return;
    }
    if (parsed.route === 'matchSaved') {
      setActiveTab('home');
      setActiveScreen('matchSaved');
      return;
    }
    if (parsed.route === 'matchAdmin') {
      setActiveTab('home');
      setActiveScreen('matchAdmin');
      return;
    }
    if (parsed.route === 'matchSharedReport') {
      setActiveTab('home');
      setActiveScreen('matchSharedReport');
      setActiveMatchShareToken(parsed.matchShareToken ?? null);
      setNotFoundRoute(null);
      return;
    }
    if (parsed.route === 'pack') {
      setActiveTab('briefing');
      setActiveScreen('pack');
      setActivePackRoute({ vboId: parsed.vboId, reportId: parsed.reportId });
      setNotFoundRoute(null);
      return;
    }
    if (parsed.route === 'shared') {
      setActiveTab('briefing');
      setActiveScreen('shared');
      setActiveSharedRoute({
        token: parsed.shareToken,
        mode: parsed.sharedMode ?? 'briefing',
      });
      setNotFoundRoute(null);
      return;
    }
    if (parsed.route === 'not_found') {
      setActiveTab('home');
      setActiveScreen('not_found');
      setNotFoundRoute(parsed.rawPath ?? (window.location.hash || window.location.pathname));
      return;
    }
    if (parsed.route === 'dossier') {
      setActiveTab('briefing');
      setActiveScreen('dossier');
      setMatchReturnContext(parsed.matchReturn ?? null);
      if (parsed.matchReturn) {
        setMatchMapReturnContext(parsed.matchReturn);
        storeMatchReturnContext(parsed.matchReturn);
        setActiveMatchJobStatus(readStoredMatchJobStatus(parsed.matchReturn.sessionId));
      }

      const checkoutKey = parsed.reportId && parsed.sessionId
        ? checkoutVerificationKey(parsed.reportId, parsed.sessionId)
        : null;
      const isFreshCheckoutReturn = checkoutKey !== null
        && handledCheckoutParamsRef.current !== checkoutKey;
      const storedCheckoutReturn = loadCheckoutReturnContext();
      const isBriefingRecoveryRoute = !parsed.vboId;
      // Dev StrictMode can remount while handleAddressSelect has temporarily moved the
      // hash to #/briefing. Rehydrate from the stored checkout context in that window.
      const matchingStoredCheckoutReturn = storedCheckoutReturn && (
        (parsed.vboId && storedCheckoutReturn.vboId === parsed.vboId)
        || (
          isBriefingRecoveryRoute
          && Boolean(storedCheckoutReturn.lookupId)
        )
      )
        ? storedCheckoutReturn
        : null;
      const shortlistMatch = parsed.vboId
        ? getShortlist().find((item) => item.vboId === parsed.vboId)
        : undefined;
      const routeLookupId = parsed.lookupId
        ?? matchingStoredCheckoutReturn?.lookupId
        ?? shortlistMatch?.lookupId
        ?? (parsed.reportId ? getReportLookup(parsed.reportId) ?? undefined : undefined);

      const checkoutReturnContext = isFreshCheckoutReturn && parsed.reportId && parsed.sessionId
        ? {
          reportId: parsed.reportId,
          sessionId: parsed.sessionId,
          buyerResume: parsed.buyerResume,
          vboId: parsed.vboId,
          lookupId: routeLookupId,
        }
        : matchingStoredCheckoutReturn;

      if (isFreshCheckoutReturn && parsed.reportId && parsed.sessionId) {
        storeCheckoutReturnContext({
          reportId: parsed.reportId,
          sessionId: parsed.sessionId,
          buyerResume: parsed.buyerResume,
          vboId: parsed.vboId,
          lookupId: routeLookupId,
        });
        if (parsed.vboId) {
          replaceHashRouteAndClearSearch(dossierHash(parsed.vboId, routeLookupId));
        }
      }

      const shouldSetCheckoutVerification = checkoutReturnContext
        && handledCheckoutParamsRef.current !== checkoutVerificationKey(
          checkoutReturnContext.reportId,
          checkoutReturnContext.sessionId,
        );
      if (shouldSetCheckoutVerification) {
        setCheckoutVerification({
          reportId: checkoutReturnContext.reportId,
          sessionId: checkoutReturnContext.sessionId,
          buyerResume: checkoutReturnContext.buyerResume,
        });
      }
      if (
        address?.adresseerbaar_object_id
        && (buildingResponse || buildingError || buildingLoading)
        && (!parsed.vboId || parsed.vboId === address.adresseerbaar_object_id)
      ) {
        setSheetSnap('half');
        return;
      }
      if (!routeLookupId) {
        if (parsed.vboId) {
          showToast(t('shortlist.reopenError'));
          setActiveTab('home');
          setActiveScreen('search');
          setSheetSnap('hidden');
          setHashRoute('#/search', { replace: true });
        }
        return;
      }
      const isActiveLookup = routeLookupId === activeLookupId;
      if (
        isActiveLookup
        && (loading || (address?.id === routeLookupId && !!(buildingResponse || buildingError || buildingLoading)))
      ) {
        return;
      }
      void handleAddressSelect({
        id: routeLookupId,
        display_name: shortlistMatch?.address ?? pendingDisplayName ?? routeLookupId,
        type: 'adres',
        score: 1,
      }, {
        forcedReportId: checkoutReturnContext?.reportId ?? parsed.reportId,
        recoveryMode: checkoutReturnContext ? 'checkout_return' : undefined,
      });
      return;
    }
    setActiveTab('home');
    setActiveScreen('search');
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasDirectRoutePath = window.location.pathname !== '/'
      && window.location.pathname !== '/index.html';
    const parsedInitialRoute = parseLocationRoute(window.location);

    if (!window.location.hash && !hasDirectRoutePath && parsedInitialRoute.route === 'search') {
      setHashRoute(
        initialHasDossier
          ? dossierHash(address?.adresseerbaar_object_id, activeLookupId)
          : '#/search',
        { replace: true },
      );
    } else {
      applyRouteRef.current();
    }

    const onHashChange = () => {
      if (ignoreNextHashRef.current) {
        ignoreNextHashRef.current = false;
        return;
      }
      applyRouteRef.current();
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activePackRoute?.vboId || !activePackRoute.reportId) {
      setRemotePrebidPack(null);
      setPrebidPackError(null);
      setPrebidPackLoading(false);
      return;
    }

    const controller = new AbortController();
    setPrebidPackLoading(true);
    setPrebidPackError(null);
    setPackDeleted(false);
    void fetchPrebidPack(
      activePackRoute.vboId,
      activePackRoute.reportId,
      controller.signal,
    )
      .then((pack) => {
        setRemotePrebidPack(pack);
        setShareUrls((current) => ({ ...current, pack: pack.share_url ?? current.pack }));
        trackPrebidEvent('pack_loaded', {
          status: pack.status,
          action_count: pack.actions.length,
          source_count: pack.coverage.length,
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setRemotePrebidPack(null);
        setPrebidPackError(mapApiError(err, t));
        trackPrebidEvent('pack_failed', {
          reason: err instanceof ApiError ? 'api_error' : 'network_or_timeout',
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPrebidPackLoading(false);
        }
      });

    return () => controller.abort();
  }, [activePackRoute?.reportId, activePackRoute?.vboId, t]);

  useEffect(() => {
    if (!activeSharedRoute?.token) {
      setRemoteSharedPrebidResponse(null);
      setSharedPrebidLoading(false);
      return;
    }

    const controller = new AbortController();
    setSharedPrebidLoading(true);
    setRemoteSharedPrebidResponse(null);
    const fetchShared = activeSharedRoute.mode === 'pack'
      ? fetchSharedPrebidPack
      : fetchSharedPrebidBriefing;

    void fetchShared(activeSharedRoute.token, controller.signal)
      .then((response) => {
        setRemoteSharedPrebidResponse(response);
        trackPrebidEvent('shared_loaded', {
          mode: response.mode,
          state: response.state,
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setRemoteSharedPrebidResponse({
          state: 'not_found',
          mode: activeSharedRoute.mode,
          support_email: 'support@buurt-check.nl',
        });
        trackPrebidEvent('shared_failed', {
          mode: activeSharedRoute.mode,
          reason: err instanceof ApiError ? 'api_error' : 'network_or_timeout',
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSharedPrebidLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeSharedRoute?.mode, activeSharedRoute?.token]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
      return;
    }

    let cancelled = false;
    let removeListener: (() => Promise<void>) | null = null;

    const applyNativeUrl = (url: string, replace: boolean = false) => {
      const nextHash = hashRouteFromUrl(url);
      if (!nextHash) return;
      setHashRoute(nextHash, { replace });
    };

    const registerListener = async () => {
      try {
        const launchUrl = await CapacitorApp.getLaunchUrl();
        if (!cancelled && launchUrl?.url) {
          applyNativeUrl(launchUrl.url, true);
        }

        const handle = await CapacitorApp.addListener('appUrlOpen', ({ url }) => {
          applyNativeUrl(url);
        });
        removeListener = () => handle.remove();
      } catch {
        // Ignore native URL bridge failures outside the iOS wrapper.
      }
    };

    void registerListener();

    return () => {
      cancelled = true;
      if (removeListener) {
        void removeListener();
      }
    };
  }, [setHashRoute]);

  useEffect(() => {
    if (!checkoutVerification?.reportId) return;
    const key = checkoutVerificationKey(
      checkoutVerification.reportId,
      checkoutVerification.sessionId,
    );
    if (handledCheckoutParamsRef.current === key) return;
    handledCheckoutParamsRef.current = key;

    let cancelled = false;

    const verifyEntitlement = async () => {
      logCheckoutResumeCheckpoint('checkout_confirm_started', {
        has_session_id: Boolean(checkoutVerification.sessionId),
      });

      const finishSuccessfulVerification = async (confirmation: CheckoutConfirmationResponse) => {
        const resolvedReportId = confirmation.report_id;
        clearCheckoutReturnContext();
        const needsRouteRecovery = activeScreenRef.current !== 'dossier'
          || !addressRef.current?.adresseerbaar_object_id
          || (
            Boolean(confirmation.vbo_id)
            && addressRef.current.adresseerbaar_object_id !== confirmation.vbo_id
          );
        if (needsRouteRecovery) {
          try {
            await recoverCheckoutAddressRef.current?.(confirmation);
          } catch {
            logCheckoutResumeCheckpoint('route_recovery_failed');
          }
        }
        activatePurchasedEntitlementRef.current?.(resolvedReportId, 'stripe');
        resumePurchasedExportRef.current?.(resolvedReportId, 'stripe');
        if (checkoutVerification.sessionId) {
          trackEvent('checkout_completed', {
            report_id: resolvedReportId,
            provider: 'stripe',
          });
        }
        showToast(t('premium.checkout.success'));
      };

      const verifyAttempt = async (): Promise<'resolved' | 'pending' | 'failed'> => {
        try {
          const entitlement = checkoutVerification.sessionId
            ? await confirmStripeCheckoutSession(
              checkoutVerification.reportId,
              checkoutVerification.sessionId,
              checkoutVerification.buyerResume,
            )
            : await checkEntitlement(checkoutVerification.reportId);
          if (cancelled) return 'failed';

          if (entitlement.entitled) {
            await finishSuccessfulVerification(entitlement);
            return 'resolved';
          }
          return 'pending';
        } catch (error) {
          if (cancelled) return 'failed';

          if (!checkoutVerification.sessionId || !isRetryableCheckoutVerificationError(error)) {
            clearCheckoutReturnContext();
            trackEvent('checkout_failed', {
              report_id: checkoutVerification.reportId,
              provider: 'stripe',
              reason: 'post_checkout_confirmation_error',
            });
            setCheckoutStatusMessage(t('premium.checkout.failed'));
            setCheckoutRetryAvailable(false);
            showToast(t('premium.checkout.failed'));
            return 'failed';
          }

          try {
            const entitlement = await checkEntitlement(checkoutVerification.reportId);
            if (cancelled) return 'failed';

            if (entitlement.entitled) {
              await finishSuccessfulVerification({
                ...entitlement,
                vbo_id: undefined,
                address_key: undefined,
                lookup_id: undefined,
              });
              return 'resolved';
            }
          } catch {
            if (cancelled) return 'failed';
          }

          return 'pending';
        }
      };

      const immediateAttempts = checkoutVerification.sessionId
        ? POST_CHECKOUT_CONFIRM_ATTEMPTS
        : 1;

      for (let attempt = 1; attempt <= immediateAttempts; attempt += 1) {
        logCheckoutResumeCheckpoint('checkout_confirm_attempt', {
          attempt,
          phase: 'immediate',
        });
        const outcome = await verifyAttempt();
        if (outcome !== 'pending') {
          return;
        }

        if (!checkoutVerification.sessionId || attempt >= immediateAttempts) {
          break;
        }

        if (attempt === 1) {
          setCheckoutStatusMessage(t('premium.checkout.processing'));
          setCheckoutRetryAvailable(false);
        }
        await sleep(POST_CHECKOUT_CONFIRM_DELAY_MS);
      }

      if (!cancelled && checkoutVerification.sessionId) {
        setCheckoutStatusMessage(t('premium.checkout.delayed'));
        setCheckoutRetryAvailable(false);
        showToast(t('premium.checkout.delayed'));

        for (let attempt = 1; attempt <= POST_CHECKOUT_BACKGROUND_ATTEMPTS; attempt += 1) {
          await sleep(POST_CHECKOUT_BACKGROUND_DELAY_MS);
          if (cancelled) return;

          logCheckoutResumeCheckpoint('checkout_confirm_attempt', {
            attempt: immediateAttempts + attempt,
            phase: 'background',
          });
          const outcome = await verifyAttempt();
          if (outcome !== 'pending') {
            return;
          }
        }

        trackEvent('checkout_failed', {
          report_id: checkoutVerification.reportId,
          provider: 'stripe',
          reason: 'post_checkout_entitlement_timeout',
        });
        setCheckoutStatusMessage(t('premium.checkout.timeout'));
        setCheckoutRetryAvailable(true);
        showToast(t('premium.checkout.timeout'));
      }
    };

    void verifyEntitlement();

    return () => {
      cancelled = true;
    };
  }, [checkoutVerification, logCheckoutResumeCheckpoint, showToast, t]);

  useEffect(() => {
    if (!appleBillingAvailable || !reportId || isEntitled) return;
    if (getPendingAppleBillingReport() !== reportId) return;

    let cancelled = false;

    const restorePendingPurchase = async () => {
      try {
        const pendingPurchase = await findPendingAppleBillingPurchase();
        if (cancelled) return;
        if (!pendingPurchase) {
          clearPendingAppleBillingReport();
          return;
        }

        const verification = await verifyAppleAppStorePurchase(
          reportId,
          pendingPurchase.signedTransactionInfo,
          pendingPurchase.productId,
        );
        await finishAppleBillingTransaction(pendingPurchase.transactionId);
        if (cancelled) return;

        clearPendingAppleBillingReport();
        activatePurchasedEntitlement(verification.report_id, 'apple_app_store');
        resumePurchasedExport(verification.report_id, 'apple_app_store');
        trackEvent('checkout_completed', {
          report_id: verification.report_id,
          provider: 'apple_app_store',
          restored: true,
        });
        showToast(t('premium.checkout.success'));
      } catch {
        if (!cancelled) {
          setCheckoutStatusMessage(t('premium.checkout.delayed'));
        }
      }
    };

    void restorePendingPurchase();

    return () => {
      cancelled = true;
    };
  }, [activatePurchasedEntitlement, appleBillingAvailable, isEntitled, reportId, resumePurchasedExport, showToast, t]);

  useEffect(() => {
    if (!androidBillingAvailable || !reportId || isEntitled) return;
    if (getPendingPlayBillingReport() !== reportId) return;

    let cancelled = false;

    const restorePendingPurchase = async () => {
      try {
        const pendingPurchase = await findRestorablePlayBillingPurchase();
        if (cancelled) return;
        if (!pendingPurchase) {
          clearPendingPlayBillingReport();
          return;
        }

        const verification = await verifyGooglePlayPurchase(
          reportId,
          pendingPurchase.purchaseToken,
          pendingPurchase.productId,
        );
        if (!verification.consumed) {
          await consumePlayBillingPurchaseToken(pendingPurchase.purchaseToken);
        }
        if (cancelled) return;

        clearPendingPlayBillingReport();
        activatePurchasedEntitlement(verification.report_id, 'google_play');
        resumePurchasedExport(verification.report_id, 'google_play');
        trackEvent('checkout_completed', {
          report_id: verification.report_id,
          provider: 'google_play',
          restored: true,
        });
        showToast(t('premium.checkout.success'));
      } catch {
        if (!cancelled) {
          setCheckoutStatusMessage(t('premium.checkout.delayed'));
        }
      }
    };

    void restorePendingPurchase();

    return () => {
      cancelled = true;
    };
  }, [activatePurchasedEntitlement, androidBillingAvailable, isEntitled, reportId, resumePurchasedExport, showToast, t]);

  const comparisonLabel = useCallback((row: { label_code: string; label_key?: string }): string => {
    return getRiskComparisonLabel(row, t);
  }, [t]);

  const comparisonColorKey = useCallback((row: {
    label_code: string;
    role?: string;
    benchmark_family?: string;
  }): ComparisonColorKey => {
    return getRiskComparisonColorKey(row);
  }, []);

  const buildComparisons = useCallback((category: string): ComparisonRow[] => {
    if (!riskComparisons) return [];
    const rows = category === 'noise'
      ? riskComparisons.noise
      : category === 'air'
        ? riskComparisons.air_quality
        : category === 'climate'
          ? riskComparisons.climate_stress
          : category === 'sunlight'
            ? riskComparisons.sunlight
          : [];
    return rows.map((row) => ({
      label: comparisonLabel(row),
      value: row.value,
      pattern: row.pattern === 'dashed' ? 'dashed' : undefined,
      colorKey: comparisonColorKey(row),
    }));
  }, [comparisonColorKey, comparisonLabel, riskComparisons]);

  // Get risk detail data for active category
  const getDetailProps = (category: string) => {
    const currentRiskCards = riskCards;
    if (!currentRiskCards) return null;
    switch (category) {
      case 'noise': return {
        titleKey: 'risk.noise.title',
        score: currentRiskCards?.noise.score,
        severity: levelToSeverity(
          currentRiskCards?.noise.level ?? 'unavailable',
          currentRiskCards?.noise.score,
        ),
        meaning: isNl ? currentRiskCards?.noise.summary_nl : currentRiskCards?.noise.summary,
        warnings: currentRiskCards?.noise.warnings ?? (
          currentRiskCards?.noise.message ? [currentRiskCards.noise.message] : []
        ),
        comparisons: buildComparisons('noise'),
        source: currentRiskCards?.noise.source,
        sourceDate: currentRiskCards?.noise.source_date,
        confidence: currentRiskCards?.noise.level === 'unavailable' ? t('risk.confidence.unavailable') : t('risk.confidence.indicative'),
        limitation: t('risk.limitation.noise'),
      };
      case 'air': return {
        titleKey: 'risk.air.title',
        score: currentRiskCards?.air_quality.score,
        severity: levelToSeverity(
          currentRiskCards?.air_quality.level ?? 'unavailable',
          currentRiskCards?.air_quality.score,
        ),
        meaning: isNl
          ? currentRiskCards?.air_quality.summary_nl
          : currentRiskCards?.air_quality.summary,
        warnings: currentRiskCards?.air_quality.warnings ?? (
          currentRiskCards?.air_quality.message ? [currentRiskCards.air_quality.message] : []
        ),
        comparisons: buildComparisons('air'),
        source: currentRiskCards?.air_quality.source,
        sourceDate: currentRiskCards?.air_quality.source_date,
        confidence: currentRiskCards?.air_quality.level === 'unavailable' ? t('risk.confidence.unavailable') : t('risk.confidence.indicative'),
        limitation: t('risk.limitation.air'),
      };
      case 'climate': return {
        titleKey: 'risk.climate.title',
        score: currentRiskCards?.climate_stress.score,
        severity: levelToSeverity(
          currentRiskCards?.climate_stress.level ?? 'unavailable',
          currentRiskCards?.climate_stress.score,
        ),
        meaning: isNl
          ? currentRiskCards?.climate_stress.summary_nl
          : currentRiskCards?.climate_stress.summary,
        warnings: currentRiskCards?.climate_stress.warnings ?? (
          currentRiskCards?.climate_stress.message ? [currentRiskCards.climate_stress.message] : []
        ),
        comparisons: buildComparisons('climate'),
        source: currentRiskCards?.climate_stress.source,
        sourceDate: currentRiskCards?.climate_stress.source_date,
        confidence: currentRiskCards?.climate_stress.level === 'unavailable' ? t('risk.confidence.unavailable') : t('risk.confidence.indicative'),
        limitation: t('risk.limitation.climate'),
      };
      default: return null;
    }
  };

  const topBarTitle = 'buurt-check';
  const analyticsPageHash = activeScreen === 'shortlist'
    ? '#/saved'
    : activeScreen === 'compare'
      ? '#/compare'
      : activeScreen === 'settings'
        ? '#/settings'
        : activeScreen === 'matchLanding'
          ? '#/match'
        : activeScreen === 'matchSurveyIntro'
          ? '#/match/intro'
        : activeScreen === 'matchSurvey'
          ? '#/match/survey'
        : activeScreen === 'matchReview'
          ? activeMatchSessionId ? `#/match/session/${encodeURIComponent(activeMatchSessionId)}/review` : '#/match/survey'
        : activeScreen === 'matchRun'
          ? activeMatchSessionId ? `#/match/session/${encodeURIComponent(activeMatchSessionId)}/run` : '#/match/survey'
        : activeScreen === 'matchSuccess'
          ? activeMatchSessionId ? `#/match/session/${encodeURIComponent(activeMatchSessionId)}/success` : '#/match/survey'
        : activeScreen === 'matchResults'
          ? activeMatchSessionId ? `#/match/session/${encodeURIComponent(activeMatchSessionId)}/results` : '#/match/map'
        : activeScreen === 'matchNeighborhood'
          ? activeMatchSessionId && activeMatchNeighborhoodId
            ? `#/match/session/${encodeURIComponent(activeMatchSessionId)}/neighborhood/${encodeURIComponent(activeMatchNeighborhoodId)}`
            : activeMatchSessionId
              ? `#/match/session/${encodeURIComponent(activeMatchSessionId)}/results`
              : '#/match/map'
        : activeScreen === 'matchReport'
          ? '#/match/report'
        : activeScreen === 'matchComparison'
          ? '#/match/compare'
        : activeScreen === 'matchSimilar'
          ? '#/match/similar'
        : activeScreen === 'matchMap'
          ? '#/match/map'
        : activeScreen === 'matchListings'
          ? '#/match/listings'
        : activeScreen === 'matchAlerts'
          ? '#/match/alerts'
        : activeScreen === 'matchSaved'
          ? '#/match/saved'
        : activeScreen === 'matchAdmin'
          ? '#/match/admin'
        : activeScreen === 'matchSharedReport'
          ? `#/shared/match/report/${activeMatchShareToken ? encodeURIComponent(activeMatchShareToken) : ''}`
        : activeScreen === 'dossier'
              ? '#/address'
              : activeScreen === 'pack'
                ? '#/pack'
                : activeScreen === 'shared'
                  ? '#/shared'
                  : activeScreen === 'not_found'
                    ? '#/not-found'
                    : '#/search';
  const analyticsPageTitle = activeScreen === 'search'
    ? 'Buurt Check'
    : topBarTitle;
  const analyticsPageSignature = activeScreen === 'dossier'
    ? `dossier:${address?.adresseerbaar_object_id ?? activeLookupId ?? 'pending'}`
    : activeScreen;

  useEffect(() => {
    if (!analyticsEnabled || typeof window === 'undefined') {
      return;
    }

    trackPageView({
      pageLocation: `${window.location.origin}/${analyticsPageHash}`,
      pageTitle: analyticsPageTitle,
      signature: analyticsPageSignature,
      language: i18n.language,
    });
  }, [
    activeLookupId,
    activeScreen,
    address?.adresseerbaar_object_id,
    analyticsEnabled,
    analyticsPageHash,
    analyticsPageSignature,
    analyticsPageTitle,
    i18n.language,
  ]);

  useEffect(() => {
    const previousConsent = previousAnalyticsConsentRef.current;
    previousAnalyticsConsentRef.current = analyticsConsent;

    if (!analyticsEnabled || typeof window === 'undefined') {
      return;
    }
    if (analyticsConsent !== 'granted' || previousConsent === 'granted') {
      return;
    }

    trackPageView({
      pageLocation: `${window.location.origin}/${analyticsPageHash}`,
      pageTitle: analyticsPageTitle,
      signature: analyticsPageSignature,
      language: i18n.language,
      force: true,
    });
  }, [
    analyticsConsent,
    analyticsEnabled,
    analyticsPageHash,
    analyticsPageSignature,
    analyticsPageTitle,
    i18n.language,
  ]);

  const failedSourceCount = useMemo(() => {
    const isDossierActive = activeScreen === 'dossier' && !!address?.adresseerbaar_object_id;
    if (!isDossierActive) {
      return 0;
    }

    const sources: Array<{
      key: string;
      status: SourceFetchStatus;
    }> = [
      {
        key: 'building',
        status: resolveSourceFetchStatus(
          true,
          !!buildingResponse?.building,
          buildingLoading,
          !!(buildingError && !buildingResponse),
        ),
      },
      {
        key: 'risk',
        status: resolveSourceFetchStatus(true, !!riskCards, riskLoading, riskError),
      },
      {
        key: 'warnings',
        status: resolveSourceFetchStatus(
          progressivePhase !== 'house',
          !!propertyWarnings,
          propertyWarningsLoading,
          propertyWarningsError,
        ),
      },
      {
        key: 'livability',
        status: resolveSourceFetchStatus(
          progressivePhase === 'buurt',
          !!livability,
          livabilityLoading,
          livabilityError,
        ),
      },
      {
        key: 'neighborhood',
        status: resolveSourceFetchStatus(
          progressivePhase === 'buurt',
          !!neighborhoodStats,
          neighborhoodStatsLoading,
          neighborhoodStatsError,
        ),
      },
      {
        key: 'sunlight',
        status: resolveSourceFetchStatus(
          progressivePhase === 'buurt' && !!neighborhood3D,
          !!sunlight,
          surroundingLoading && !sunlight,
          !!(sunlightUnavailable && !sunlight),
        ),
      },
    ];

    const enabled = sources.filter((source) => source.status !== 'idle');
    return enabled.filter((source) => source.status === 'error').length;
  }, [
    activeScreen,
    address?.adresseerbaar_object_id,
    buildingError,
    buildingLoading,
    buildingResponse,
    livability,
    livabilityError,
    livabilityLoading,
    neighborhood3D,
    neighborhoodStats,
    neighborhoodStatsError,
    neighborhoodStatsLoading,
    progressivePhase,
    propertyWarnings,
    propertyWarningsError,
    propertyWarningsLoading,
    riskCards,
    riskError,
    riskLoading,
    sunlight,
    sunlightUnavailable,
    surroundingLoading,
  ]);

  const attentionSummary = useMemo(
    () => buildAttentionSummary(riskCards, propertyWarnings),
    [propertyWarnings, riskCards],
  );
  const viewer3DStatusMessage = useMemo(
    () => localizeViewer3DMessage(neighborhood3D?.message, t),
    [neighborhood3D?.message, t],
  );

  const localPrebidBriefing = useMemo(() => (
    dossierSeed ? buildLocalPrebidBriefing({
      address,
      reportId,
      buildingResponse,
      riskCards,
      neighborhoodStats,
      livability,
      sunlight,
      viewingQuestions,
    }) : null
  ), [
    address,
    buildingResponse,
    dossierSeed,
    livability,
    neighborhoodStats,
    reportId,
    riskCards,
    sunlight,
    viewingQuestions,
  ]);

  const activePrebidBriefing = prebidBriefing ?? localPrebidBriefing;

  const createCurrentShareLink = useCallback(async (mode: 'pack') => {
    const controller = new AbortController();
    const response = activePackRoute?.vboId && activePackRoute.reportId
      ? await sharePrebidPack(
        activePackRoute.vboId,
        activePackRoute.reportId,
        { consent_to_share: true },
        controller.signal,
      )
      : null;
    if (!response) return null;
    setShareUrls((current) => ({ ...current, [mode]: response.share_url }));
    setShareProviderUnavailable(response.error_code === 'email_provider_unavailable');
    trackPrebidEvent(`${mode}_shared`, { method: 'copy_link' });
    return response.share_url;
  }, [activePackRoute?.reportId, activePackRoute?.vboId]);

  const emailCurrentShareLink = useCallback(async (mode: 'pack', email: string) => {
    const controller = new AbortController();
    const payload = {
      email,
      consent: true as const,
      language: uiLanguage,
    };
    const response = activePackRoute?.vboId && activePackRoute.reportId
      ? await emailPrebidPack(
        activePackRoute.vboId,
        activePackRoute.reportId,
        payload,
        controller.signal,
      )
      : null;
    if (!response) return null;
    setShareUrls((current) => ({ ...current, [mode]: response.share_url }));
    setShareProviderUnavailable(response.error_code === 'email_provider_unavailable');
    trackPrebidEvent(`${mode}_shared`, { method: 'email', provider_unavailable: response.error_code === 'email_provider_unavailable' });
    return response.share_url;
  }, [activePackRoute?.reportId, activePackRoute?.vboId, uiLanguage]);

  const deleteCurrentPrebidOutput = useCallback(async () => {
    if (!activePrebidBriefing) {
      setPackDeleted(true);
      return;
    }
    const controller = new AbortController();
    await deletePrebidBriefing(
      activePrebidBriefing.address_id,
      activePrebidBriefing.briefing_id,
      controller.signal,
    );
    setPackDeleted(true);
    setRemotePrebidPack((pack) => (pack ? { ...pack, status: 'deleted' } : pack));
    setShareUrls({});
    trackPrebidEvent('deleted', { mode: shareSheetMode ?? 'pack' });
  }, [activePrebidBriefing, shareSheetMode]);

  const prebidPack = useMemo(() => {
    if (activePackRoute?.vboId && activePackRoute.reportId) {
      if (!remotePrebidPack) return null;
      return packDeleted ? { ...remotePrebidPack, status: 'deleted' as const } : remotePrebidPack;
    }
    if (packDeleted) {
      const deletedPack = buildLocalPrebidPack(activePrebidBriefing);
      return deletedPack ? { ...deletedPack, status: 'deleted' as const } : null;
    }
    return buildLocalPrebidPack(activePrebidBriefing);
  }, [activePackRoute?.reportId, activePackRoute?.vboId, activePrebidBriefing, packDeleted, remotePrebidPack]);

  const sharedPrebidResponse = useMemo(() => {
    if (!activeSharedRoute) return null;
    return remoteSharedPrebidResponse ?? buildSharedPrebidResponse(
      activeSharedRoute.mode,
      activeSharedRoute.token,
      activePrebidBriefing,
      prebidPack,
    );
  }, [activePrebidBriefing, activeSharedRoute, prebidPack, remoteSharedPrebidResponse]);

  // Get viewing questions for active detail category
  const activeQuestions = activeDetailCategory
    ? (() => {
      const normalized = activeDetailCategory.toLowerCase();
      if (!viewingQuestions) {
        return undefined;
      }
      const category = viewingQuestions.categories.find(c => {
        const name = c.name.toLowerCase();
        if (normalized === 'air') return name === 'air quality' || name === 'air';
        if (normalized === 'climate') return name === 'climate stress' || name === 'climate';
        return name === normalized;
      });
      if (category) return category.questions;
      return undefined;
    })()
    : undefined;

  const showLoadingScreen = (
    activeScreen === 'dossier'
    && loading
    && !buildingResponse
    && !!pendingDisplayName
  );
  const hideGlobalTabBar = (
    activeScreen.startsWith('match')
  );
  const hideTopBarLanguageSwitcher = activeScreen === 'matchLanding';
  const hasStartedMatchJob = activeMatchJobStatus === 'running' || activeMatchJobStatus === 'completed';
  const hasCompletedMatchJob = activeMatchJobStatus === 'completed';
  const restoredMatchMapContext = matchMapReturnContext;

  const startMatchRun = () => {
    const sessionId = ensureMatchSessionId();
    storeMatchJobStatus(sessionId, 'running');
    setActiveMatchJobStatus('running');
    setActiveScreen('matchRun');
    setHashRoute(buildHashRoute({ route: 'matchRun', sessionId }));
  };

  const returnToMatchSurvey = () => {
    const sessionId = ensureMatchSessionId();
    setActiveScreen('matchSurvey');
    setHashRoute(buildHashRoute({ route: 'matchSurvey', sessionId, questionStep: 1 }));
  };

  const renderMatchRecovery = (titleId: string) => (
    <section className="match-first-landing match-first-landing--simple" aria-labelledby={titleId}>
      <div className="match-first-landing__content">
        <p className="match-first-landing__eyebrow">{t('matchFirst.recovery.eyebrow')}</p>
        <h1 id={titleId}>{t('matchFirst.recovery.title')}</h1>
        <p className="match-first-landing__body">{t('matchFirst.recovery.body')}</p>
        <button
          type="button"
          className="match-first-landing__cta"
          onClick={returnToMatchSurvey}
        >
          {t('matchFirst.recovery.cta')}
        </button>
      </div>
    </section>
  );

  const renderMatchMapRecovery = () => (
    <section className="match-first-landing match-first-landing--simple" aria-labelledby="match-map-title">
      <div className="match-first-landing__content">
        <p className="match-first-landing__eyebrow">{t('matchFirst.recovery.eyebrow')}</p>
        <h1 id="match-map-title">{t('match.map.title')}</h1>
        <p className="match-first-landing__body">{t('match.map.finishFirst')}</p>
        <button
          type="button"
          className="match-first-landing__cta"
          onClick={returnToMatchSurvey}
        >
          {t('match.map.goToSurvey')}
        </button>
      </div>
    </section>
  );

  return (
    <div className="app" data-screen={activeScreen}>
      <a href="#main-content" className="sr-only sr-only--focusable" inert={isOverlayModalOpen || undefined}>{t('a11y.skip_to_content')}</a>
      <TopBar
        title={topBarTitle}
        onSettingsClick={openSettings}
        inert={isOverlayModalOpen || undefined}
        activeScreen={activeScreen}
        hideLanguageSwitcher={hideTopBarLanguageSwitcher}
      />

      <main className="app__main" id="main-content" inert={isOverlayModalOpen || undefined}>
        <AnimatePresence initial={false} mode="wait">
          {activeScreen === 'search' && (
            <motion.div
              key="screen-search"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <AddressSearch onSelect={handleAddressSelect} shortlistCount={shortlistItems.length} onNavigateToSaved={handleNavigateToSaved} onNavigateToCompare={handleNavigateToCompare} />
            </motion.div>
          )}

          {activeScreen === 'matchLanding' && (
            <motion.div
              key="screen-match-landing"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <MatchLanding
                  onStartMatch={() => {
                    const sessionId = ensureMatchSessionId();
                    setActiveScreen('matchSurveyIntro');
                    setHashRoute(buildHashRoute({ route: 'matchSurveyIntro', sessionId }));
                  }}
                  onSearchAddress={() => {
                    setActiveScreen('search');
                    setHashRoute('#/search');
                  }}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'matchSurveyIntro' && (
            <motion.div
              key="screen-match-survey-intro"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <MatchSurveyIntro
                  onStartSurvey={() => {
                    const sessionId = ensureMatchSessionId();
                    setActiveScreen('matchSurvey');
                    setHashRoute(buildHashRoute({ route: 'matchSurvey', sessionId, questionStep: 1 }));
                  }}
                  onBack={() => {
                    setActiveScreen('matchLanding');
                    setHashRoute('#/match');
                  }}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'matchSurvey' && (
            <motion.div
              key="screen-match-survey"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <MatchSurveyShell
                  onBack={() => {
                    const sessionId = ensureMatchSessionId();
                    setActiveScreen('matchSurveyIntro');
                    setHashRoute(buildHashRoute({ route: 'matchSurveyIntro', sessionId }));
                  }}
                  onReview={() => {
                    const sessionId = ensureMatchSessionId();
                    setActiveScreen('matchReview');
                    setHashRoute(buildHashRoute({ route: 'matchReview', sessionId }));
                  }}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'matchReview' && (
            <motion.div
              key="screen-match-review"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <MatchSurveyReview
                  onBack={() => {
                    const sessionId = ensureMatchSessionId();
                    setActiveScreen('matchSurvey');
                    setHashRoute(buildHashRoute({ route: 'matchSurvey', sessionId, questionStep: 1 }));
                  }}
                  onComplete={() => {
                    startMatchRun();
                  }}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'matchRun' && (
            <motion.div
              key="screen-match-run"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              {hasStartedMatchJob ? (
              <section className="match-first-landing match-first-landing--simple" aria-labelledby="match-run-title">
                <div className="match-first-landing__content">
                  <p className="match-first-landing__eyebrow">{t('matchFirst.progress.eyebrow')}</p>
                  <h1 id="match-run-title">{t('matchFirst.progress.title')}</h1>
                  <p className="match-first-landing__body" role="status">{t('matchFirst.progress.placeholder')}</p>
                  <p className="match-first-landing__body">{t('matchFirst.progress.honesty')}</p>
                  <button
                    type="button"
                    className="match-first-landing__cta"
                    onClick={() => {
                      const sessionId = ensureMatchSessionId();
                      setActiveScreen('matchSurvey');
                      setHashRoute(buildHashRoute({ route: 'matchSurvey', sessionId, questionStep: 1 }));
                    }}
                  >
                    {t('matchFirst.progress.backToSurvey')}
                  </button>
                </div>
              </section>
              ) : renderMatchRecovery('match-run-title')}
            </motion.div>
          )}

          {activeScreen === 'matchSuccess' && (
            <motion.div
              key="screen-match-success"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              {hasCompletedMatchJob ? (
              <section className="match-first-landing match-first-landing--simple" aria-labelledby="match-success-title">
                <div className="match-first-landing__content">
                  <p className="match-first-landing__eyebrow">{t('matchFirst.success.eyebrow')}</p>
                  <h1 id="match-success-title">{t('matchFirst.success.title')}</h1>
                  <p className="match-first-landing__body">{t('matchFirst.success.placeholder')}</p>
                </div>
              </section>
              ) : renderMatchRecovery('match-success-title')}
            </motion.div>
          )}

          {activeScreen === 'matchResults' && (
            <motion.div
              key="screen-match-results"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              {hasCompletedMatchJob ? renderMatchMapRecovery() : renderMatchRecovery('match-results-title')}
            </motion.div>
          )}

          {activeScreen === 'matchNeighborhood' && (
            <motion.div
              key="screen-match-neighborhood"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              {hasCompletedMatchJob ? (
              <section
                className="match-first-landing match-first-landing--simple"
                aria-labelledby="match-neighborhood-title"
                data-session-id={activeMatchSessionId ?? undefined}
                data-neighborhood-id={activeMatchNeighborhoodId ?? undefined}
                data-map-center={formatMatchCenterAttribute(restoredMatchMapContext?.mapCenter)}
                data-map-zoom={formatNumberAttribute(restoredMatchMapContext?.mapZoom)}
                data-list-scroll={formatNumberAttribute(restoredMatchMapContext?.listScroll)}
                data-selected-house-id={restoredMatchMapContext?.selectedHouseId}
              >
                <div className="match-first-landing__content">
                  <p className="match-first-landing__eyebrow">{t('matchFirst.neighborhood.eyebrow')}</p>
                  <h1 id="match-neighborhood-title">{t('matchFirst.neighborhood.title')}</h1>
                  <p className="match-first-landing__body">{t('matchFirst.neighborhood.placeholder')}</p>
                  <p className="match-first-landing__body">{t('matchFirst.neighborhood.no3dBeforeSelection')}</p>
                </div>
              </section>
              ) : renderMatchRecovery('match-neighborhood-title')}
            </motion.div>
          )}

          {activeScreen === 'matchReport' && (
            <motion.div
              key="screen-match-report"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <section className="match-flow-actions" aria-label={t('match.navigation.actions')}>
                  <button type="button" onClick={() => { setActiveScreen('matchListings'); setHashRoute('#/match/listings'); }}>
                    {t('match.navigation.listings')}
                  </button>
                  <button type="button" onClick={() => { setActiveScreen('matchAlerts'); setHashRoute('#/match/alerts'); }}>
                    {t('match.navigation.alerts')}
                  </button>
                  <button type="button" onClick={() => { setActiveScreen('matchSaved'); setHashRoute('#/match/saved'); }}>
                    {t('match.navigation.saved')}
                  </button>
                  <button type="button" onClick={() => { setActiveScreen('matchAdmin'); setHashRoute('#/match/admin'); }}>
                    {t('match.navigation.admin')}
                  </button>
                </section>

                <section className="match-recommendations" aria-labelledby="match-recommendations-title">
                  <header>
                    <p>{t('match.recommendations.eyebrow')}</p>
                    <h1 id="match-recommendations-title">{t('match.recommendations.title')}</h1>
                  </header>
                  {matchRecommendationsLoading && <p role="status">{t('match.recommendations.loading')}</p>}
                  {matchRecommendationsErrorCode && <p role="alert">{t(matchRecommendationsErrorCode)}</p>}
                  {matchRecommendations && ([
                    ['top', matchRecommendations.recommendations.top],
                    ['surprising', matchRecommendations.recommendations.surprising],
                    ['stretch', matchRecommendations.recommendations.stretch],
                    ['avoid_or_reconsider', matchRecommendations.recommendations.avoid_or_reconsider],
                  ] as const).map(([category, items]) => (
                    <section key={category} aria-label={t(`match.recommendations.category.${category}`)}>
                      <h2>{t(`match.recommendations.category.${category}`)}</h2>
                      {items.map((item) => (
                        <article key={item.recommendation_id} className="match-recommendations__card">
                          <h3>{item.name}</h3>
                          <p>{t('match.recommendations.score', { score: item.fit_score })}</p>
                          <p>{t('match.recommendations.method')}</p>
                          <p>{t('match.recommendations.confidence', { score: item.confidence.score })}</p>
                          <p>{t('match.recommendations.freshness', {
                            status: item.data_freshness_indicator || item.freshness_status,
                          })}</p>
                          <p>{t('match.recommendations.sources', {
                            sources: item.source_refs.join(', ') || t('match.common.noSource'),
                          })}</p>
                          <ul>
                            {item.why_it_fits.slice(0, 3).map((reason) => (
                              <li key={reason.code}>{reason.code}</li>
                            ))}
                          </ul>
                          <p>{t('match.recommendations.tradeoffs', { count: item.tradeoffs.length })}</p>
                          <button type="button" onClick={() => void handleMatchSaveNeighborhood(item.neighborhood_id, 'recommendation')}>
                            {t('match.recommendations.save')}
                          </button>
                          <MatchFeedbackControls
                            sessionId={matchQuizResponse?.preference_vector.session_id ?? null}
                            reportId={matchReport?.report_id ?? null}
                            recommendationId={item.recommendation_id}
                            neighborhoodId={item.neighborhood_id}
                            onSubmit={handleMatchFeedbackSubmit}
                          />
                        </article>
                      ))}
                    </section>
                  ))}
                </section>
                <MatchReport
                  report={matchReport}
                  loading={matchReportLoading}
                  errorCode={matchReportErrorCode}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'matchSharedReport' && (
            <motion.div
              key="screen-match-shared-report"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <MatchReport
                  report={sharedMatchReport}
                  loading={sharedMatchReportLoading}
                  errorCode={sharedMatchReportErrorCode}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'matchComparison' && (
            <motion.div
              key="screen-match-comparison"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <MatchComparison
                  comparison={matchComparisonResponse}
                  loading={matchComparisonLoading}
                  errorCode={matchComparisonErrorCode}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'matchSimilar' && (
            <motion.div
              key="screen-match-similar"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <MatchSimilarSearch
                  knownNeighborhoods={DEFAULT_MATCH_KNOWN_NEIGHBORHOODS}
                  response={matchSimilarResponse}
                  loading={matchSimilarLoading}
                  errorCode={matchSimilarErrorCode}
                  onSearch={handleMatchSimilarSearch}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'matchMap' && (
            <motion.div
              key="screen-match-map"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              {renderMatchMapRecovery()}
            </motion.div>
          )}

          {activeScreen === 'matchListings' && (
            <motion.div
              key="screen-match-listings"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <MatchListings
                  result={matchListings}
                  loading={matchListingsLoading}
                  errorCode={matchListingsErrorCode}
                  onCreateAlert={handleMatchCreateAlertFromListing}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'matchAlerts' && (
            <motion.div
              key="screen-match-alerts"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <MatchAlerts
                  alerts={matchAlerts}
                  suggestedAlerts={primaryMatchNeighborhood ? [{
                    neighborhood_id: primaryMatchNeighborhood.neighborhood_id,
                    neighborhood_name: primaryMatchNeighborhood.name,
                    journey_intent: matchQuizResponse?.preference_vector.journey_intent ?? 'buy',
                    budget_max_cents: matchQuizResponse?.preference_vector.budget_max_cents ?? 62500000,
                    rent_max_cents: matchQuizResponse?.preference_vector.monthly_rent_max_cents ?? 250000,
                    property_type: matchQuizResponse?.preference_vector.property_types[0] ?? 'apartment',
                    source_context: 'recommendation',
                  }] : []}
                  loading={matchAlertsLoading}
                  errorCode={matchAlertsErrorCode}
                  onCreate={handleMatchCreateAlert}
                  onUpdateStatus={handleMatchUpdateAlertStatus}
                  onDelete={handleMatchDeleteAlert}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'matchSaved' && (
            <motion.div
              key="screen-match-saved"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <MatchSaved
                  neighborhoods={matchSavedNeighborhoods}
                  reportId={matchReport?.report_id ?? null}
                  locale={matchReport?.locale ?? normalizeUiLanguage(i18n.language)}
                  loading={matchSavedLoading}
                  errorCode={matchSavedErrorCode}
                  share={matchShare}
                  exportReady={matchExportReady}
                  onDeleteNeighborhood={handleMatchDeleteSavedNeighborhood}
                  onSaveReport={handleMatchSaveReport}
                  onShareReport={handleMatchShareReport}
                  onExportReport={handleMatchExportReport}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'matchAdmin' && (
            <motion.div
              key="screen-match-admin"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <MatchAdminDashboard
                  health={matchAdminHealth}
                  loading={matchAdminLoading}
                  errorCode={matchAdminErrorCode}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'dossier' && (
            <motion.div
              key="screen-dossier"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
            {error && <p className="app__error">{error}</p>}
            {checkoutStatusMessage && (
              <div>
                <p className="app__error">{checkoutStatusMessage}</p>
                {checkoutRetryAvailable && (
                  <button
                    type="button"
                    className="app__retry-button"
                    onClick={retryCheckoutVerification}
                  >
                    {t('error.retry')}
                  </button>
                )}
              </div>
            )}

            {showLoadingScreen ? (
              <LoadingScreen
                address={address}
                pendingDisplayName={pendingDisplayName}
                step={loadingStep}
                warningKey={loadingWarningKey}
              />
            ) : !address ? (
              <div className="app__briefing-empty">
                <svg className="app__briefing-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" />
                </svg>
                <h2 className="app__briefing-empty-title">{t('nav.briefingEmptyTitle')}</h2>
                <p className="app__briefing-empty-description">{t('nav.briefingEmptyDescription')}</p>
                <button
                  type="button"
                  className="app__briefing-empty-action"
                  onClick={() => {
                    setActiveTab('home');
                    setActiveScreen('search');
                    setHashRoute('#/search');
                  }}
                >
                  {t('nav.briefingEmptyAction')}
                </button>
              </div>
            ) : (
              <ErrorBoundary key={address?.adresseerbaar_object_id ?? 'none'} fallback={<div className="app__chunk-error"><p>{t('error.dossierLoadFailed')}</p></div>}>
              <DossierSheet snap={sheetSnap}>
                {matchReturnContext && (
                  <div className="app__match-return">
                    <button
                      type="button"
                      className="app__match-return-button"
                      onClick={handleBackToMatchMap}
                    >
                      <svg className="app__match-return-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M12.5 4.5 7 10l5.5 5.5M7.5 10H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {t('dossier.backToMatchMap')}
                    </button>
                  </div>
                )}

                {address && showDossierJump && (
                  <div className="app__dossier-jump-nav">
                    <div className="app__dossier-jump-header">
                      <button type="button" className="app__dossier-jump-address" onClick={handleJumpToHouse}>
                        {address.display_name}
                      </button>
                      <button
                        type="button"
                        className="app__dossier-jump-top"
                        onClick={handleJumpToTop}
                      >
                        {t('nav.backToTop')}
                      </button>
                    </div>
                    <div className="app__dossier-jump-actions">
                      <button type="button" className={activePhase === 'house' ? 'app__jump-btn--active' : ''} onClick={handleJumpToHouse}>{t('nav.jumpHouse')}</button>
                      <button type="button" className={activePhase === 'buurt' ? 'app__jump-btn--active' : ''} onClick={handleJumpToBuurt}>{t('nav.neighborhood')}</button>
                      <button type="button" className={activePhase === 'action' ? 'app__jump-btn--active' : ''} onClick={handleJumpToChecklist}>{t('nav.jumpBriefing')}</button>
                    </div>
                  </div>
                )}

                {address?.latitude && address?.longitude && (
                  <Suspense fallback={<div className="viewer-3d-status"><p>{t('viewer3d.loading')}</p></div>}>
                    <BuildingFootprintMap
                      lat={address.latitude}
                      lng={address.longitude}
                      rdX={address.rd_x ?? undefined}
                      rdY={address.rd_y ?? undefined}
                      footprint={buildingResponse?.building?.footprint_geojson}
                      zoom={15}
                      reportId={isEntitled ? reportId ?? undefined : undefined}
                    />
                  </Suspense>
                )}

                <div className="app__phase-divider app__phase-divider--first" id="section-house-start">
                  <div className="app__phase-divider-header">
                    <span className="app__phase-divider-step">{t('dossier.phaseOf', { current: 1, total: 3 })}</span>
                    <svg className="app__phase-divider-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M3 10.5V17h5v-4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V17h5v-6.5M1 11l9-8 9 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="app__phase-divider-title">{t('dossier.houseDivider')}</span>
                  </div>
                  <p className="app__phase-divider-subtitle">{t('dossier.houseSubtitle')}</p>
                </div>

                <section role="region" aria-label={t('nav.jumpHouse')}>
                  {(!riskLoading && (riskCards || riskError || propertyWarnings)) && (
                    <div
                      className="dossier-section"
                      style={dossierSectionStyle(0)}
                      data-section-index={0}
                      data-dossier-section="attention-summary"
                    >
                      <AttentionSummary
                        summary={attentionSummary}
                        error={riskError}
                        onRetry={riskError ? handleRetryRiskCards : undefined}
                      />
                    </div>
                  )}

                  {address && (
                    <div className="dossier-section" style={dossierSectionStyle(1)} data-section-index={1}>
                      <BuildingFactsCard
                        address={address}
                        building={buildingResponse?.building ?? undefined}
                        loading={buildingLoading}
                        error={buildingError}
                        onRetry={buildingError ? handleRetryBuildingFacts : undefined}
                        onChangeAddress={() => {
                          hapticTap();
                          setActiveTab('home');
                          setActiveScreen('search');
                          setHashRoute('#/search');
                        }}
                      />
                    </div>
                  )}

                  {((loading && !riskCards) || riskLoading || riskCards || riskError || activeDetailCategory) && (
                    <div
                      className="dossier-section dossier-section--risk-grid"
                      style={dossierSectionStyle(2)}
                      data-section-index={2}
                    >
                      {failedSourceCount > 0 && (
                        <div className="app__failed-banner">
                          <span>{t('dossier.retryBanner', { count: failedSourceCount })}</span>
                          <button
                            type="button"
                            className="app__retry-button"
                            onClick={handleRetryAllFailed}
                          >
                            {t('error.retry')}
                          </button>
                        </div>
                      )}
                      {loading && !riskCards && <RiskTileSkeleton />}
                      {(riskLoading || riskCards || riskError || activeDetailCategory) && (
                        <LayoutGroup>
                          {(riskLoading || riskCards || riskError) && (
                            <RiskTilesGrid
                              risks={riskCards ?? undefined}
                              questions={viewingQuestions ?? undefined}
                              onTileTap={handleRiskTileTap}
                            />
                          )}
                          <AnimatePresence initial={false} mode="wait">
                            {activeDetailCategory && (() => {
                              const detail = getDetailProps(activeDetailCategory);
                              if (!detail) return null;
                              return (
                                <RiskDetailView
                                  key={`${activeDetailCategory}:${useFallbackDetailTransition ? 'fallback' : 'shared'}`}
                                  category={activeDetailCategory}
                                  titleKey={detail.titleKey}
                                  score={detail.score}
                                  severity={detail.severity}
                                  meaning={detail.meaning}
                                  warnings={detail.warnings}
                                  comparisons={detail.comparisons}
                                  comparisonsError={riskComparisonsError}
                                  onRetryComparisons={riskComparisonsError ? handleRetryRiskComparisons : undefined}
                                  questions={activeQuestions}
                                  source={detail.source}
                                  sourceDate={detail.sourceDate}
                                  confidence={detail.confidence}
                                  limitation={detail.limitation}
                                  useSharedElement={!useFallbackDetailTransition}
                                  onBack={() => {
                                    animationPerformance.stopMonitoring();
                                    setActiveDetailCategory(null);
                                    setIsTransitioning(false);
                                  }}
                                  onAnimationStart={() => {
                                    setIsTransitioning(true);
                                    animationPerformance.startMonitoring();
                                  }}
                                  onAnimationComplete={() => {
                                    animationPerformance.stopMonitoring();
                                    setIsTransitioning(false);
                                  }}
                                />
                              );
                            })()}
                          </AnimatePresence>
                        </LayoutGroup>
                      )}
                    </div>
                  )}

                  {/* Premium warnings remain PDF-only per product contract. */}

                </section>

                {progressivePhase === 'buurt' && (
                  <>
                    <div className="app__phase-divider" id="section-buurt-start">
                      <div className="app__phase-divider-header">
                        <span className="app__phase-divider-step">{t('dossier.phaseOf', { current: 2, total: 3 })}</span>
                        <svg className="app__phase-divider-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M3 3h4v4H3zM8 3h4v4H8zM13 3h4v4h-4zM3 8h4v4H3zM8 8h4v4H8zM13 8h4v4h-4zM3 13h4v4H3zM8 13h4v4H8zM13 13h4v4h-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        </svg>
                        <span className="app__phase-divider-title">{t('dossier.buurtDivider')}</span>
                      </div>
                      <p className="app__phase-divider-subtitle">{t('dossier.buurtSubtitle')}</p>
                    </div>
                    <section role="region" aria-label={t('nav.neighborhood')}>
                      {(livabilityLoading || livability || livabilityError) && (
                        <div className="dossier-section" style={dossierSectionStyle(4)} data-section-index={4}>
                          <h3 id="section-livability" className="app__section-label">{t('dossier.livability', 'Livability')}</h3>
                          <LivabilityCard
                            data={livability ?? undefined}
                            loading={livabilityLoading}
                            error={livabilityError}
                            onRetry={livabilityError ? handleRetryLivability : undefined}
                            onTap={livability?.available ? handleLivabilityTap : undefined}
                          />
                        </div>
                      )}

                      {showLivabilityDetail && livability?.available && (
                        <LivabilityDetailView
                          data={livability}
                          onClose={() => setShowLivabilityDetail(false)}
                        />
                      )}

                      <div ref={viewer3DRefCallback} className="dossier-section" style={dossierSectionStyle(5)} data-section-index={5} data-testid="viewer-3d-sentinel">
                        {!viewer3DTriggered && !neighborhood3D && (
                          <div className="viewer-3d-status">
                            <p>{t('viewer3d.loading')}</p>
                            <p>{t('viewer3d.loadingLong')}</p>
                          </div>
                        )}

                        {neighborhood3DLoading && (
                          <div className="viewer-3d-status">
                            <p>{t('viewer3d.loading')}</p>
                            <p>{t('viewer3d.loadingLong')}</p>
                          </div>
                        )}

                        {!neighborhood3DLoading && neighborhood3DError && (!neighborhood3D || neighborhood3D.buildings.length === 0) && (
                          <div className="viewer-3d-status" data-state="error">
                            <p>{neighborhood3DError}</p>
                            <button
                              type="button"
                              className="app__retry-button"
                              onClick={handleRetryNeighborhood3D}
                            >
                              {t('error.retry')}
                            </button>
                          </div>
                        )}

                        {!neighborhood3DLoading && !neighborhood3DError && neighborhood3D && neighborhood3D.buildings.length === 0 && (
                          <div className="viewer-3d-status">
                            <p>{viewer3DStatusMessage ?? t('viewer3d.noData')}</p>
                          </div>
                        )}

                        {neighborhood3D && neighborhood3D.buildings.length > 0 && (
                          <Suspense fallback={<div className="viewer-3d-status"><p>{t('viewer3d.loading')}</p></div>}>
                            <NeighborhoodViewer3D
                              addressId={address.adresseerbaar_object_id ?? undefined}
                              reportId={isEntitled ? reportId ?? undefined : undefined}
                              buildings={neighborhood3D.buildings}
                              targetPandId={neighborhood3D.target_pand_id ?? undefined}
                              center={neighborhood3D.center}
                              sunDateTime={sunDateTime}
                              onSunlightAnalysis={handleSunlightAnalysis}
                              onSunlightError={() => setSunlightUnavailable(true)}
                              onShadowSnapshots={surroundingLoading ? undefined : handleShadowSnapshots}
                              onShadowSnapshotsError={surroundingLoading ? undefined : handleShadowSnapshotsError}
                              loading={surroundingLoading}
                              error={neighborhood3DError}
                              onRetry={neighborhood3DError ? handleRetryNeighborhood3D : undefined}
                            />
                          </Suspense>
                        )}

                        {neighborhood3D && neighborhood3D.buildings.length > 0 && (
                          <ShadowTimeSlider
                            lat={neighborhood3D.center.lat}
                            lng={neighborhood3D.center.lng}
                            onChange={setSunDateTime}
                          />
                        )}
                      </div>

                      {/* Sunlight evidence remains PDF-only and is not rendered in the viewer. */}
                      {(neighborhoodStatsLoading || neighborhoodStats || neighborhoodStatsError) && (
                        <div className="dossier-section" style={dossierSectionStyle(6)} data-section-index={6}>
                          <h3 id="section-neighborhood" className="app__section-label">{t('dossier.neighborhood')}</h3>
                          <NeighborhoodStatsCard
                            stats={neighborhoodStats ?? undefined}
                            loading={neighborhoodStatsLoading}
                            error={neighborhoodStatsError}
                            onRetry={neighborhoodStatsError ? handleRetryNeighborhoodStats : undefined}
                          />
                        </div>
                      )}

                    </section>
                  </>
                )}

                {(progressivePhase === 'buurt' || viewingQuestions || viewingQuestionsError) && (
                  <>
                  <div className="app__phase-divider" id="section-action-start">
                    <div className="app__phase-divider-header">
                      <span className="app__phase-divider-step">{t('dossier.phaseOf', { current: 3, total: 3 })}</span>
                      <svg className="app__phase-divider-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="app__phase-divider-title">{t('dossier.actionDivider')}</span>
                    </div>
                    <p className="app__phase-divider-subtitle">{t('dossier.actionSubtitle')}</p>
                  </div>
                  <div className="dossier-section" style={dossierSectionStyle(8)} data-section-index={8}>
                    <section role="region" aria-label={t('nav.jumpBriefing')}>
                      <h3 id="section-viewing-checklist" className="app__section-label">{t('dossier.viewingChecklist')}</h3>
                      <ViewingChecklist
                        categories={viewingQuestions?.categories}
                        checkedQuestions={checkedQuestions}
                        onToggleQuestion={handleToggleQuestion}
                        error={viewingQuestionsError}
                        onRetry={viewingQuestionsError ? handleRetryViewingQuestions : undefined}
                      />
                    </section>
                  </div>
                  </>
                )}

                {address && (
                  <div
                    className="app__next-steps"
                    data-testid="next-steps"
                  >
                    <h3 className="app__next-steps-title">{t('dossier.nextSteps.title')}</h3>
                    <ul className="app__next-steps-list">
                      <li>
                        <button
                          type="button"
                          className={`app__next-steps-action${currentAddressBookmarked ? ' app__next-steps-action--saved' : ''}`}
                          disabled={!currentAddressBookmarked && bookmarkPending}
                          aria-busy={!currentAddressBookmarked && bookmarkPending ? true : undefined}
                          onClick={() => {
                            hapticTap();
                            if (currentAddressBookmarked) {
                              setActiveScreen('search');
                              setActiveTab('home');
                              setHashRoute('#/search');
                            } else {
                              handleBookmark();
                            }
                          }}
                        >
                          <svg className="app__next-steps-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            {currentAddressBookmarked ? (
                              <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="currentColor"/>
                            ) : (
                              <path d="M5 4a1 1 0 00-1 1v11.586l5.707-3.805a1 1 0 011.086 0L16 16.586V5a1 1 0 00-1-1H5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                            )}
                          </svg>
                          {currentAddressBookmarked
                            ? t('dossier.nextSteps.saved')
                            : t('dossier.nextSteps.save')}
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="app__next-steps-action"
                          aria-haspopup="dialog"
                          aria-expanded={exportSheetOpen}
                          onClick={() => {
                            hapticTap();
                            openExportSheet('quick_brief');
                          }}
                        >
                          <svg className="app__next-steps-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M10 3v8m0 0L6.5 7.5M10 11l3.5-3.5M4 14.5v1A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          {t('dossier.nextSteps.export')}
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="app__next-steps-action"
                          onClick={() => {
                            hapticTap();
                            setActiveScreen('search');
                            setActiveTab('home');
                            setHashRoute('#/search');
                          }}
                        >
                          <svg className="app__next-steps-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M14.5 14.5L18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          {t('dossier.nextSteps.search')}
                        </button>
                      </li>
                    </ul>
                  </div>
                )}

                {address && (
                  // Keep the fixed action bar outside animated dossier sections.
                  // A transformed ancestor changes fixed-position containing-block
                  // behavior on mobile browsers, which can leave the hidden bar
                  // visually peeking above the tab bar while remaining untappable.
                  <ActionBar
                    isBookmarked={currentAddressBookmarked}
                    onAddToShortlist={handleBookmark}
                    onPrimaryAction={() => {
                      hapticTap();
                      openExportSheet('full_dossier');
                    }}
                    primaryLabel={actionBarPrimaryLabel}
                    showBookmarkTooltip={!!address}
                    bookmarkPending={bookmarkPending}
                    primaryPending={exportGenerating}
                  />
                )}
              </DossierSheet>
              </ErrorBoundary>
            )}
            </motion.div>
          )}

          {activeScreen === 'shortlist' && (
            <motion.div
              key="screen-shortlist"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <ShortlistScreen
                items={shortlistItems}
                onRemove={handleRemoveFromShortlist}
                onCompare={() => {
                  setActiveScreen('compare');
                  setHashRoute('#/compare');
                }}
                onSelectAddress={handleSelectShortlistAddress}
                onSearchAddress={() => {
                  setActiveScreen('search');
                  setActiveTab('home');
                  setHashRoute('#/search');
                }}
              />
            </motion.div>
          )}

          {activeScreen === 'compare' && (
            <motion.div
              key="screen-compare"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <CompareScreen
                  items={shortlistItems}
                  onBack={() => {
                    setActiveScreen('shortlist');
                    setHashRoute('#/saved');
                  }}
                  onSearchAddress={() => {
                    setActiveScreen('search');
                    setActiveTab('home');
                    setHashRoute('#/search');
                  }}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'settings' && (
            <motion.div
              key="screen-settings"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <Suspense fallback={null}>
                <SettingsScreen
                  onClearRecent={handleClearRecent}
                  onClearShortlist={handleClearShortlist}
                  theme={themePreference}
                  onThemeChange={handleThemeChange}
                  analyticsEnabled={analyticsEnabled}
                  analyticsConsent={analyticsConsent}
                  onAnalyticsConsentChange={handleAnalyticsConsentChange}
                />
              </Suspense>
            </motion.div>
          )}

          {activeScreen === 'pack' && (
            <motion.div
              key="screen-pack"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              {prebidPackLoading ? (
                <div className="app__briefing-empty" role="status">
                  <h2 className="app__briefing-empty-title">{t('prebid.pack.loading', 'Loading Questions Pack')}</h2>
                  <p className="app__briefing-empty-description">{t('prebid.pack.loadingBody', 'Fetching the buyer-bound pack for this report.')}</p>
                </div>
              ) : prebidPackError ? (
                <div className="app__briefing-empty" role="status">
                  <h2 className="app__briefing-empty-title">{t('prebid.pack.errorTitle', 'Questions Pack unavailable')}</h2>
                  <p className="app__briefing-empty-description">{prebidPackError}</p>
                  <button
                    type="button"
                    className="app__briefing-empty-action"
                    onClick={() => {
                      setActiveScreen('dossier');
                      setActiveTab('briefing');
                      setHashRoute(dossierHash(address?.adresseerbaar_object_id, activeLookupId, matchReturnContext));
                    }}
                  >
                    {t('prebid.pack.back', 'Back to briefing')}
                  </button>
                </div>
              ) : prebidPack && activePackRoute?.vboId && activePackRoute?.reportId ? (
                <PackView
                  pack={{
                    ...prebidPack,
                    report_id: activePackRoute.reportId,
                    status: packDeleted ? 'deleted' : prebidPack.status,
                  }}
                  onBackToBriefing={() => {
                    setActiveScreen('dossier');
                    setActiveTab('briefing');
                    setHashRoute(dossierHash(address?.adresseerbaar_object_id, activeLookupId, matchReturnContext));
                  }}
                  onShare={() => setShareSheetMode('pack')}
                  onDownload={() => openExportSheet('full_dossier')}
                  onDelete={() => {
                    void deleteCurrentPrebidOutput().catch(() => {
                      showToast(t('error.generic'));
                    });
                  }}
                  onOpenAction={setActivePrebidAction}
                />
              ) : (
                <NotFoundScreen
                  route={activePackRoute?.reportId ? `#/pack/${activePackRoute.vboId}/${activePackRoute.reportId}` : '#/pack'}
                  onSearch={() => {
                    setActiveTab('home');
                    setActiveScreen('search');
                    setHashRoute('#/search');
                  }}
                  onSaved={() => {
                    setActiveTab('saved');
                    setActiveScreen('shortlist');
                    setHashRoute('#/saved');
                  }}
                />
              )}
            </motion.div>
          )}

          {activeScreen === 'shared' && (
            <motion.div
              key="screen-shared"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              {sharedPrebidLoading ? (
                <div className="app__briefing-empty" role="status">
                  <h2 className="app__briefing-empty-title">{t('prebid.shared.loading', 'Loading shared link')}</h2>
                  <p className="app__briefing-empty-description">{t('prebid.shared.loadingBody', 'Checking the scoped share token.')}</p>
                </div>
              ) : (
                <SharedPrebidScreen
                  response={sharedPrebidResponse ?? {
                    state: 'not_found',
                    mode: activeSharedRoute?.mode ?? 'briefing',
                    support_email: 'support@buurt-check.nl',
                  }}
                  onSearch={() => {
                    setActiveTab('home');
                    setActiveScreen('search');
                    setHashRoute('#/search');
                  }}
                  onSaved={() => {
                    setActiveTab('saved');
                    setActiveScreen('shortlist');
                    setHashRoute('#/saved');
                  }}
                  onOpenPrivacy={() => navigateToExternal('/privacy.html')}
                  onOpenTerms={() => navigateToExternal('/terms.html')}
                />
              )}
            </motion.div>
          )}

          {activeScreen === 'not_found' && (
            <motion.div
              key="screen-not-found"
              className="app__screen"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING_TAB}
            >
              <NotFoundScreen
                route={notFoundRoute ?? undefined}
                onSearch={() => {
                  setActiveTab('home');
                  setActiveScreen('search');
                  setHashRoute('#/search');
                }}
                onSaved={() => {
                  setActiveTab('saved');
                  setActiveScreen('shortlist');
                  setHashRoute('#/saved');
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {activePrebidAction && (
        <VerificationActionDetailSheet
          action={activePrebidAction}
          onClose={() => setActivePrebidAction(null)}
        />
      )}

      {shareSheetMode && (
        <SharePackSheet
          shareUrl={shareUrls.pack ?? prebidPack?.share_url}
          providerUnavailable={shareProviderUnavailable}
          onCopyLink={() => {
            void createCurrentShareLink(shareSheetMode)
              .then((url) => {
                if (url && navigator.clipboard) {
                  void navigator.clipboard.writeText(url).catch(() => undefined);
                }
                showToast(t('prebid.share.copyReady', 'Scoped link ready to copy.'));
              })
              .catch(() => {
                showToast(t('error.generic'));
              });
          }}
          onEmail={(email) => {
            void emailCurrentShareLink(shareSheetMode, email)
              .then(() => {
                showToast(t('prebid.share.emailReady', 'Email share link prepared with consent.'));
              })
              .catch(() => {
                showToast(t('error.generic'));
              });
          }}
          onDelete={() => {
            void deleteCurrentPrebidOutput()
              .then(() => setShareSheetMode(null))
              .catch(() => showToast(t('error.generic')));
          }}
          onClose={() => setShareSheetMode(null)}
        />
      )}

      {analyticsEnabled && analyticsConsent === 'unknown' && (
        <AnalyticsConsentBanner
          onAccept={() => handleAnalyticsConsentChange('granted')}
          onReject={() => handleAnalyticsConsentChange('denied')}
        />
      )}

      {/* Export bottom sheet */}
      {address?.adresseerbaar_object_id && address.rd_x != null && address.rd_y != null && address.latitude != null && address.longitude != null && (
        <ErrorBoundary key={`export-${address?.adresseerbaar_object_id ?? 'none'}`} fallback={null}>
        <Suspense fallback={null}>
          <ExportBottomSheet
            isOpen={exportSheetOpen}
            onClose={() => {
              setExportSheetOpen(false);
              setExportGenerating(false);
              setExportInitialTemplate(null);
              setExportInitialLanguage(null);
              setExportAutoGenerateToken(null);
            }}
            vboId={address.adresseerbaar_object_id}
            rdX={address.rd_x}
            rdY={address.rd_y}
            lat={address.latitude}
            lng={address.longitude}
            address={address.display_name}
            reportId={isEntitled ? reportId ?? undefined : undefined}
            street={address.street ?? undefined}
            city={address.city ?? undefined}
            municipality={address.municipality ?? undefined}
            buurtCode={address.buurt_code ?? undefined}
            postcode={address.postcode ?? undefined}
            houseNumber={address.house_number ?? undefined}
            houseLetter={address.house_letter ?? undefined}
            addition={address.addition ?? undefined}
            sunlightPayload={sunlight ? toSunlightSubmissionPayload(sunlight) : undefined}
            shadowSnapshots={shadowSnapshots}
            sunlightReady={sunlight !== null || sunlightUnavailable}
            sunlightFailed={sunlightUnavailable && sunlight === null}
            shadowSnapshotsReady={shadowSnapshotsReady}
            shadowSnapshotsFailed={shadowSnapshotsFailed}
            onBeforeGenerate={handleBeforeExportGenerate}
            isEntitled={isEntitled}
            onBuyFullDossier={(language) => {
              void handleUpgrade(language);
            }}
            buyLabel={
              appleBillingAvailable
                ? t('export.buyFullDossierApple')
                : androidBillingAvailable
                  ? t('export.buyFullDossierPlay')
                  : undefined
            }
            buyPriceLabel={exportBuyPriceLabel}
            buyPending={isCheckingOut}
            onGenerateStart={() => {
              setExportGenerating(true);
              showToast(t('toast.exportStarted'));
            }}
            onGenerateSuccess={() => {
              setExportGenerating(false);
              showToast(t('toast.exportReady'));
            }}
            onGenerateError={() => {
              setExportGenerating(false);
              showToast(t('export.error'));
            }}
            initialTemplate={exportInitialTemplate ?? undefined}
            initialExportLanguage={exportInitialLanguage ?? undefined}
            autoGenerateToken={exportAutoGenerateToken}
          />
        </Suspense>
        </ErrorBoundary>
      )}

      {!hideGlobalTabBar && (
        <TabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          savedCount={shortlistItems.length}
          inert={isOverlayModalOpen || undefined}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;

