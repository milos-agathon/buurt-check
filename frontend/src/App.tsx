import { lazy, Suspense, useState, useRef, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import AddressSearch from './components/AddressSearch';
import ErrorBoundary from './components/ErrorBoundary';
import RiskTileSkeleton from './components/RiskTileSkeleton';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { SheetSnap } from './components/DossierSheet';
import LoadingScreen, { type LoadingProgressStep } from './components/LoadingScreen';
import { SPRING_TAB } from './config/springs';
import { hapticTap } from './utils/haptic';
import { useAnimationPerformance } from './hooks/useAnimationPerformance';
import ShortlistScreen from './components/ShortlistScreen';
import TabBar from './components/TabBar';
import TopBar from './components/TopBar';
import type { TabId } from './components/TabBar';

// Lazy-loaded dossier components — loaded in parallel with API calls
const AddressHeader = lazy(() => import('./components/AddressHeader'));
const SummaryStrip = lazy(() => import('./components/SummaryStrip'));
const BuildingFactsCard = lazy(() => import('./components/BuildingFactsCard'));
const SunlightRiskCard = lazy(() => import('./components/SunlightRiskCard'));
const ShadowTimeSlider = lazy(() => import('./components/ShadowTimeSlider'));
const ShadowSnapshots = lazy(() => import('./components/ShadowSnapshots'));
const RiskTilesGrid = lazy(() => import('./components/RiskTilesGrid'));
const RiskDetailView = lazy(() => import('./components/RiskDetailView'));
const NeighborhoodStatsCard = lazy(() => import('./components/NeighborhoodStatsCard'));
const TierBSignalsCard = lazy(() => import('./components/TierBSignalsCard'));
const AttentionSummary = lazy(() => import('./components/AttentionSummary'));
const PropertyWarningsCard = lazy(() => import('./components/PropertyWarningsCard'));
const LivabilityCard = lazy(() => import('./components/LivabilityCard'));
const LivabilityDetailView = lazy(() => import('./components/LivabilityDetailView'));
const SoilInfoCard = lazy(() => import('./components/SoilInfoCard'));
const ViewingChecklist = lazy(() => import('./components/ViewingChecklist'));
const DossierSheet = lazy(() => import('./components/DossierSheet'));

const ActionBar = lazy(() => import('./components/ActionBar'));
const ExportBottomSheet = lazy(() => import('./components/ExportBottomSheet'));
import {
  suggestAddresses,
  lookupAddress,
  getBuildingFacts,
  getBuilding3D,
  getNeighborhood3D,
  getRiskCards,
  getRiskComparisons,
  getNeighborhoodStats,
  getViewingQuestions,
  getTierBData,
  getPropertyWarnings,
  getLivability,
  submitSunlightAnalysis,
  mapApiError,
} from './services/api';
import { getShortlist, addToShortlist, removeFromShortlist, isInShortlist, clearShortlist } from './services/shortlist';
import { clearRecent } from './services/recentSearches';
import { markVisited } from './services/firstVisit';
import { getTheme, setTheme, applyTheme, listenForSystemChanges, type ThemePreference } from './services/theme';
import { ToastContainer, useToast } from './components/ui/Toast';
import type { Geometry, Position } from 'geojson';
import type {
  AddressSuggestion,
  ResolvedAddress,
  BuildingFactsResponse,
  LivabilityResponse,
  Neighborhood3DResponse,
  NeighborhoodStatsResponse,
  RiskCardsResponse,
  RiskComparisonsResponse,
  SunlightResult,
  ShadowSnapshot,
  ViewingQuestionsResponse,
  TierBResponse,
  PropertyWarningsResponse,
  SeverityLevel,
  RiskLevel,
  ShortlistItem,
} from './types/api';
import {
  formatCoverageDate,
  parseSourceDateValue,
  resolveSourceFetchStatus,
  staleThresholdDate,
  type SourceFetchStatus,
  type ParsedSourceDate,
} from './utils/dataCoverage';
import './App.css';

const BuildingFootprintMap = lazy(() => import('./components/BuildingFootprintMap'));
const NeighborhoodViewer3D = lazy(() => import('./components/NeighborhoodViewer3D'));
const CompareScreen = lazy(() => import('./components/CompareScreen'));
const SettingsScreen = lazy(() => import('./components/SettingsScreen'));

type Screen = 'search' | 'dossier' | 'shortlist' | 'compare' | 'settings';
type ComparisonColorKey = 'address' | 'city' | 'nl' | 'who';
type ComparisonRow = { label: string; value: number; pattern?: 'dashed'; colorKey: ComparisonColorKey };

interface DossierSeedState {
  address?: ResolvedAddress;
  buildingResponse?: BuildingFactsResponse;
  riskCards?: RiskCardsResponse;
  riskComparisons?: RiskComparisonsResponse;
  neighborhoodStats?: NeighborhoodStatsResponse;
  tierBData?: TierBResponse;
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

function fallbackSunlightQuestions(score: number | undefined) {
  const enBase = score != null
    ? `Sunlight score is ${score}/100.`
    : 'Sunlight data is indicative only.';
  const nlBase = score != null
    ? `De zonlichtscore is ${score}/100.`
    : 'Zonlichtgegevens zijn indicatief.';
  return [
    {
      text_en: `${enBase} Check daylight in living and bedroom spaces around noon.`,
      text_nl: `${nlBase} Controleer daglicht in woon- en slaapkamers rond het middaguur.`,
    },
    {
      text_en: 'Ask whether nearby buildings or trees block winter sunlight.',
      text_nl: 'Vraag of nabijgelegen gebouwen of bomen winterzon blokkeren.',
    },
  ];
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
type HashRoute = 'search' | 'dossier' | 'shortlist' | 'compare' | 'settings';

const PHASE_1_TIMEOUT_MS = 7000;
const PHASE_2_TIMEOUT_MS = 9000;
const CHECKLIST_SESSION_KEY = 'buurt-check:viewing-checklist';

interface ParsedHashRoute {
  route: HashRoute;
  vboId?: string;
  lookupId?: string;
}

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

function parseHashRoute(hash: string): ParsedHashRoute {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathPart = '', queryPart = ''] = value.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const params = new URLSearchParams(queryPart);

  if (path === '/saved') return { route: 'shortlist' };
  if (path === '/compare') return { route: 'compare' };
  if (path === '/settings') return { route: 'settings' };

  const dossierMatch = path.match(/^\/address\/([^/]+)$/);
  if (dossierMatch) {
    try {
      return {
        route: 'dossier',
        vboId: decodeURIComponent(dossierMatch[1]),
        lookupId: params.get('lookup') ?? undefined,
      };
    } catch {
      return { route: 'search' };
    }
  }

  if (path === '/briefing') return { route: 'dossier' };
  return { route: 'search' };
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

function App() {
  const { t, i18n } = useTranslation();
  const isNl = i18n.language === 'nl';
  const dossierSeed = useMemo(readDossierSeed, []);
  const initialHasDossier = !!(dossierSeed?.address && dossierSeed?.buildingResponse);
  const { toasts, showToast, dismissToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>(initialHasDossier ? 'briefing' : 'home');
  const [activeScreen, setActiveScreen] = useState<Screen>(
    initialHasDossier ? 'dossier' : 'search',
  );
  const [themePreference, setThemePreference] = useState<ThemePreference>(getTheme());
  const [address, setAddress] = useState<ResolvedAddress | null>(dossierSeed?.address ?? null);
  const [activeLookupId, setActiveLookupId] = useState<string | null>(dossierSeed?.address?.id ?? null);
  const [buildingResponse, setBuildingResponse] = useState<BuildingFactsResponse | null>(
    dossierSeed?.buildingResponse ?? null,
  );
  const [buildingLoading, setBuildingLoading] = useState(false);
  const [buildingError, setBuildingError] = useState<string | null>(null);
  const [neighborhood3D, setNeighborhood3D] = useState<Neighborhood3DResponse | null>(null);
  const [neighborhood3DLoading, setNeighborhood3DLoading] = useState(false);
  const [neighborhood3DError, setNeighborhood3DError] = useState<string | null>(null);
  const [surroundingLoading, setSurroundingLoading] = useState(false);
  const [riskCards, setRiskCards] = useState<RiskCardsResponse | null>(dossierSeed?.riskCards ?? null);
  const [riskComparisons, setRiskComparisons] = useState<RiskComparisonsResponse | null>(
    dossierSeed?.riskComparisons ?? null,
  );
  const [riskComparisonsError, setRiskComparisonsError] = useState<string | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [neighborhoodStats, setNeighborhoodStats] = useState<NeighborhoodStatsResponse | null>(
    dossierSeed?.neighborhoodStats ?? null,
  );
  const [neighborhoodStatsLoading, setNeighborhoodStatsLoading] = useState(false);
  const [neighborhoodStatsError, setNeighborhoodStatsError] = useState<string | null>(null);
  const [tierBData, setTierBData] = useState<TierBResponse | null>(dossierSeed?.tierBData ?? null);
  const [tierBLoading, setTierBLoading] = useState(false);
  const [tierBError, setTierBError] = useState<string | null>(null);
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
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [shadowSnapshots, setShadowSnapshots] = useState<ShadowSnapshot[] | null>(
    dossierSeed?.shadowSnapshots ?? null,
  );
  const [viewingQuestions, setViewingQuestions] = useState<ViewingQuestionsResponse | null>(
    dossierSeed?.viewingQuestions ?? null,
  );
  const [viewingQuestionsError, setViewingQuestionsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingProgressStep>('findingBuilding');
  const [loadingWarningKey, setLoadingWarningKey] = useState<string | null>(null);
  const [progressivePhase, setProgressivePhase] = useState<ProgressivePhase>(
    initialHasDossier ? 'buurt' : 'house',
  );
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(initialHasDossier ? 'half' : 'hidden');
  const [pendingDisplayName, setPendingDisplayName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const neighborhood3DRequestId = useRef(0);
  const activeScreenRef = useRef<Screen>(initialHasDossier ? 'dossier' : 'search');
  const screenScrollPositionsRef = useRef(new Map<Screen, number>());
  const previousScreenForScrollRef = useRef<Screen>(initialHasDossier ? 'dossier' : 'search');
  const addressRequestAbortRef = useRef<AbortController | null>(null);
  const retryControllersRef = useRef<Set<AbortController>>(new Set());
  const riskTilePulseTimeoutRef = useRef<number | null>(null);
  const previousScreenRef = useRef<Screen>('search');

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

  // ActionBar visibility: shown when ViewingChecklist section enters viewport
  // or user has scrolled past 75% of dossier content.
  const [actionBarVisible, setActionBarVisible] = useState(false);
  const actionBarObserverRef = useRef<IntersectionObserver | null>(null);
  const actionBarSentinelRef = useRef<HTMLDivElement | null>(null);

  // When an overlay modal (e.g. ExportBottomSheet) is open, mark background
  // content as inert so screen readers cannot access it (WCAG best practice).
  const isOverlayModalOpen = exportSheetOpen;

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
    activeScreenRef.current = activeScreen;
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
    return () => {
      addressRequestAbortRef.current?.abort();
      retryControllersRef.current.forEach(c => c.abort());
      retryControllersRef.current.clear();
      if (riskTilePulseTimeoutRef.current != null) {
        window.clearTimeout(riskTilePulseTimeoutRef.current);
      }
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

  // Mark first visit complete when dossier loads (address + building resolved)
  const hasMarkedVisited = useRef(false);
  useEffect(() => {
    if (address && buildingResponse && !hasMarkedVisited.current) {
      hasMarkedVisited.current = true;
      markVisited();
    }
  }, [address, buildingResponse]);

  const handleThemeChange = useCallback((pref: ThemePreference) => {
    setTheme(pref);
    setThemePreference(pref);
  }, []);

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

  const dossierHash = useCallback((vboId?: string | null, lookupId?: string | null) => {
    if (!vboId) return '#/briefing';
    const params = new URLSearchParams();
    if (lookupId) params.set('lookup', lookupId);
    const query = params.toString();
    return `#/address/${encodeURIComponent(vboId)}${query ? `?${query}` : ''}`;
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
      setHashRoute(dossierHash(address?.adresseerbaar_object_id, activeLookupId));
      return;
    }
    setHashRoute('#/search');
  }, [
    activeLookupId,
    activeScreen,
    activeTab,
    address?.adresseerbaar_object_id,
    dossierHash,
    setHashRoute,
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

  const handleBookmark = useCallback(() => {
    if (!address?.adresseerbaar_object_id) return;
    const vboId = address.adresseerbaar_object_id;
    if (isInShortlist(vboId)) {
      removeFromShortlist(vboId);
      showToast(t('toast.addressRemoved'));
    } else {
      const item: ShortlistItem = {
        vboId,
        lookupId: address.id,
        address: address.display_name,
        postcode: address.postcode,
        city: address.city,
        buildingYear: buildingResponse?.building?.construction_year,
        riskScores: {
          noise: riskCards?.noise.score,
          air: riskCards?.air_quality.score,
          climate: riskCards?.climate_stress.score,
          sunlight: sunlight ? normalizeSunlightScore(sunlight.winter) : undefined,
        },
        savedAt: Date.now(),
      };
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
  }, [address, buildingResponse, riskCards, showToast, sunlight, t, handleNavigateToCompare]);

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
    showToast(t('toast.recentCleared'));
  }, [showToast, t]);

  const handleNavigateToSaved = useCallback(() => {
    setActiveTab('saved');
    setShortlistItems(getShortlist());
    setActiveScreen('shortlist');
    setHashRoute('#/saved');
  }, [setHashRoute]);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'home') {
      setActiveScreen('search');
      setHashRoute('#/search');
      return;
    }
    if (tab === 'briefing') {
      const hasDossier = !!address;
      setActiveScreen('dossier');
      if (hasDossier) {
        setSheetSnap('half');
        setHashRoute(dossierHash(address?.adresseerbaar_object_id, activeLookupId));
      } else {
        setHashRoute('#/briefing');
      }
    } else if (tab === 'saved') {
      setShortlistItems(getShortlist());
      setActiveScreen('shortlist');
      setHashRoute('#/saved');
    }
  }, [activeLookupId, address, dossierHash, setHashRoute]);

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

  const highlightRiskTile = useCallback((category: string) => {
    const tile = document.getElementById(`section-risk-${category}`);
    if (!tile) return;
    tile.classList.remove('risk-tile--pulse');
    // Force reflow so repeated taps still replay the pulse animation.
    void tile.getBoundingClientRect();
    tile.classList.add('risk-tile--pulse');
    if (riskTilePulseTimeoutRef.current != null) {
      window.clearTimeout(riskTilePulseTimeoutRef.current);
    }
    riskTilePulseTimeoutRef.current = window.setTimeout(() => {
      tile.classList.remove('risk-tile--pulse');
      riskTilePulseTimeoutRef.current = null;
    }, 320);
  }, []);

  const handleSummaryPillTap = useCallback((category: string) => {
    hapticTap();
    scrollToDossierTarget(`section-risk-${category}`);
    highlightRiskTile(category);
  }, [highlightRiskTile, scrollToDossierTarget]);

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

  const handleSunlightAnalysis = useCallback((result: SunlightResult) => {
    setSunlight(result);
    setSunlightUnavailable(false);
    const vboId = address?.adresseerbaar_object_id;
    if (!vboId) return;
    void submitSunlightAnalysis(vboId, result).catch(() => {
      // Client-side card still works even when backend caching fails.
    });
  }, [address?.adresseerbaar_object_id]);

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
      }
    })();
  }, [address, t]);

  const handleRetryPropertyWarnings = useCallback(() => {
    if (!address?.adresseerbaar_object_id || address.rd_x == null || address.rd_y == null) return;
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
  }, [address, buildingResponse?.building?.construction_year, buildingResponse?.building?.num_units, t]);

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

  const handleRetryTierB = useCallback(() => {
    if (!address?.adresseerbaar_object_id) return;
    setTierBError(null);
    setTierBLoading(true);
    const controller = new AbortController();
    retryControllersRef.current.add(controller);
    void (async () => {
      try {
        const tierB = await getTierBData(
          address.adresseerbaar_object_id!,
          {
            buurtCode: address.buurt_code ?? undefined,
            postcode: address.postcode ?? undefined,
            houseNumber: address.house_number ?? undefined,
            houseLetter: address.house_letter ?? undefined,
            addition: address.addition ?? undefined,
          },
          controller.signal,
        );
        if (activeScreenRef.current !== 'dossier') return;
        setTierBData(tierB);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort || activeScreenRef.current !== 'dossier') return;
        setTierBError(mapApiError(err, t));
      } finally {
        retryControllersRef.current.delete(controller);
        if (activeScreenRef.current === 'dossier') {
          setTierBLoading(false);
        }
      }
    })();
  }, [address, t]);

  const handleRetryLivability = useCallback(() => {
    if (!address?.adresseerbaar_object_id || address.rd_x == null || address.rd_y == null) return;
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
  }, [address, t]);

  const handleRetryViewingQuestions = useCallback(() => {
    if (!address?.adresseerbaar_object_id) return;
    const { adresseerbaar_object_id: vboId, rd_x, rd_y, latitude, longitude } = address;
    if (rd_x == null || rd_y == null || latitude == null || longitude == null) return;
    setViewingQuestionsError(null);
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
          },
          controller.signal,
        );
        if (activeScreenRef.current !== 'dossier') return;
        setViewingQuestions(questions);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort || activeScreenRef.current !== 'dossier') return;
        setViewingQuestionsError(mapApiError(err, t));
      } finally {
        retryControllersRef.current.delete(controller);
      }
    })();
  }, [address, t]);

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
    if (tierBError) handleRetryTierB();
    if (viewingQuestionsError) handleRetryViewingQuestions();
  }, [
    buildingError,
    handleRetryBuildingFacts,
    handleRetryLivability,
    handleRetryNeighborhoodStats,
    handleRetryPropertyWarnings,
    handleRetryRiskComparisons,
    handleRetryRiskCards,
    handleRetryTierB,
    handleRetryViewingQuestions,
    livabilityError,
    neighborhoodStatsError,
    propertyWarningsError,
    riskComparisonsError,
    riskError,
    tierBError,
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
        const target3d = await getBuilding3D(vboId, pandId, rdX, rdY, lat, lng, requestSignal);
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
        const n3d = await getNeighborhood3D(vboId, pandId, rdX, rdY, lat, lng, requestSignal);
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
          setNeighborhood3DError(mapApiError(err, t));
        }
        setNeighborhood3DLoading(false);
        setSurroundingLoading(false);
        setSunlightUnavailable(true);
      }
    })();
  }, [isActiveDossierRequest, t]);

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

  // ActionBar visibility — IntersectionObserver on ViewingChecklist sentinel.
  // Shows ActionBar when user scrolls near the checklist section or past 75% of dossier.
  const actionBarSentinelRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (actionBarObserverRef.current) {
      actionBarObserverRef.current.disconnect();
      actionBarObserverRef.current = null;
    }

    actionBarSentinelRef.current = node;

    if (!node) {
      // Sentinel removed from DOM — hide ActionBar
      setActionBarVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setActionBarVisible(entry.isIntersecting);
        }
      },
      // rootMargin: trigger when section is within 200px of the viewport bottom
      { rootMargin: '200px 0px' },
    );

    observer.observe(node);
    actionBarObserverRef.current = observer;
  }, []);

  // Clean up ActionBar observer on unmount
  useEffect(() => {
    return () => {
      if (actionBarObserverRef.current) {
        actionBarObserverRef.current.disconnect();
        actionBarObserverRef.current = null;
      }
    };
  }, []);

  const handleAddressSelect = useCallback(async (suggestion: AddressSuggestion) => {
    addressRequestAbortRef.current?.abort();
    retryControllersRef.current.forEach(c => c.abort());
    retryControllersRef.current.clear();
    const requestAbortController = new AbortController();
    addressRequestAbortRef.current = requestAbortController;
    const requestSignal = requestAbortController.signal;

    setLoading(true);
    setBuildingLoading(true);
    setLoadingStep('findingBuilding');
    setLoadingWarningKey(null);
    setProgressivePhase('house');
    setError(null);
    setAddress(null);
    setActiveLookupId(suggestion.id);
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
    setActionBarVisible(false);
    setRiskCards(null);
    setRiskComparisons(null);
    setRiskComparisonsError(null);
    setRiskLoading(false);
    setRiskError(null);
    setNeighborhoodStats(null);
    setNeighborhoodStatsLoading(false);
    setNeighborhoodStatsError(null);
    setTierBData(null);
    setTierBLoading(false);
    setTierBError(null);
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
    setShowHeatmap(false);
    setShadowSnapshots(null);
    setViewingQuestions(null);
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
      const resolved = await lookupAddress(suggestion.id, requestSignal);
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

      let building: BuildingFactsResponse | null = null;
      try {
        building = await getBuildingFacts(vboId, requestSignal);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort || !isActiveDossierRequest(requestId)) return;
        setBuildingError(mapApiError(err, t));
      }
      if (!isActiveDossierRequest(requestId)) return;

      setBuildingResponse(building);
      setLoading(false);
      setBuildingLoading(false);
      setSheetSnap('half');
      setHashRoute(dossierHash(vboId, suggestion.id));

      setLoadingStep('loading3D');
      let phase1Promise: Promise<void> | null = null;
      if (rd_x != null && rd_y != null) {
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
            );
            if (!isActiveDossierRequest(requestId)) return;
            setPropertyWarnings(warnings);
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            setPropertyWarningsError(mapApiError(err, t));
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
        phase2Promise = (async () => {
          try {
            const risks = await getRiskCards(vboId, rd_x, rd_y, latitude, longitude, requestSignal);
            if (!isActiveDossierRequest(requestId)) return;
            setRiskCards(risks);
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            setRiskError(mapApiError(err, t));
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
            );
            if (isActiveDossierRequest(requestId)) {
              setRiskComparisons(comparisons);
              setRiskComparisonsError(null);
            }
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            setRiskComparisonsError(mapApiError(err, t));
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
              },
              requestSignal,
            );
            if (isActiveDossierRequest(requestId)) {
              setViewingQuestions(questions);
              setViewingQuestionsError(null);
            }
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            setViewingQuestionsError(mapApiError(err, t));
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
            setNeighborhoodStatsError(mapApiError(err, t));
          } finally {
            if (isActiveDossierRequest(requestId)) {
              setNeighborhoodStatsLoading(false);
            }
          }
        })();

        setLivabilityLoading(true);
        void (async () => {
          try {
            const livData = await getLivability(vboId, rd_x, rd_y, requestSignal);
            if (!isActiveDossierRequest(requestId)) return;
            setLivability(livData);
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            setLivabilityError(mapApiError(err, t));
          } finally {
            if (isActiveDossierRequest(requestId)) {
              setLivabilityLoading(false);
            }
          }
        })();

        setTierBLoading(true);
        void (async () => {
          try {
            const tierB = await getTierBData(
              vboId,
              {
                buurtCode: resolved.buurt_code ?? undefined,
                postcode: resolved.postcode ?? undefined,
                houseNumber: resolved.house_number ?? undefined,
                houseLetter: resolved.house_letter ?? undefined,
                addition: resolved.addition ?? undefined,
              },
              requestSignal,
            );
            if (!isActiveDossierRequest(requestId)) return;
            setTierBData(tierB);
          } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (isAbort || !isActiveDossierRequest(requestId)) return;
            setTierBError(mapApiError(err, t));
          } finally {
            if (isActiveDossierRequest(requestId)) {
              setTierBLoading(false);
            }
          }
        })();
      }

      setLoadingStep('checkingClimate');
      const pandId = resolved.pand_id ?? building?.building?.pand_id ?? null;
      if (pandId && rd_x != null && rd_y != null && latitude != null && longitude != null) {
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
      } else {
        setSunlightUnavailable(true);
      }

      setLoadingStep('calculatingSunlight');
    } catch (err) {
      if (!isActiveDossierRequest(requestId)) return;
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (isAbort) return;
      const mapped = mapApiError(err, t);
      setError(null);
      setLoading(false);
      setBuildingLoading(false);
      setSheetSnap('hidden');
      showToast(mapped);
      setActiveTab('home');
      setActiveScreen('search');
      setHashRoute('#/search', { replace: true });
    }
  }, [dossierHash, isActiveDossierRequest, setHashRoute, showToast, t, trigger3DFetch]);

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

    showToast(t('shortlist.reopenError', 'Could not reopen this address. Search for it again.'));
  }, [handleAddressSelect, shortlistItems, showToast, t]);

  // Ref-based applyRoute — always reads current state without triggering effect re-runs
  const applyRouteRef = useRef<() => void>(() => {});
  applyRouteRef.current = () => {
    const parsed = parseHashRoute(window.location.hash || '#/search');
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
    if (parsed.route === 'dossier') {
      setActiveTab('briefing');
      setActiveScreen('dossier');
      if (
        address?.adresseerbaar_object_id
        && (buildingResponse || buildingError || buildingLoading)
        && (!parsed.vboId || parsed.vboId === address.adresseerbaar_object_id)
      ) {
        setSheetSnap('half');
        return;
      }
      const shortlistMatch = parsed.vboId
        ? getShortlist().find((item) => item.vboId === parsed.vboId)
        : undefined;
      const routeLookupId = parsed.lookupId ?? shortlistMatch?.lookupId;
      if (!routeLookupId) {
        if (parsed.vboId) {
          showToast(t('shortlist.reopenError', 'Could not reopen this address. Search for it again.'));
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
      });
      return;
    }
    setActiveTab('home');
    setActiveScreen('search');
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!window.location.hash) {
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

  // Build summary strip pills from risk data (memoized to prevent new array on every render)
  const summaryPills = useMemo(() => {
    if (!riskCards && !sunlight) return [];
    const pills = [];
    if (riskCards) {
      pills.push(
        { category: 'noise', labelKey: 'risk.noise.title', score: riskCards.noise.score, severity: levelToSeverity(riskCards.noise.level, riskCards.noise.score) },
        { category: 'air', labelKey: 'risk.air.title', score: riskCards.air_quality.score, severity: levelToSeverity(riskCards.air_quality.level, riskCards.air_quality.score) },
        { category: 'climate', labelKey: 'risk.climate.title', score: riskCards.climate_stress.score, severity: levelToSeverity(riskCards.climate_stress.level, riskCards.climate_stress.score) },
      );
    }
    const sunlightScore = sunlight ? normalizeSunlightScore(sunlight.winter) : undefined;
    const sunlightSeverity: SeverityLevel = sunlightScore != null
      ? (sunlightScore >= 70 ? 'good' : sunlightScore >= 40 ? 'moderate' : sunlightScore >= 20 ? 'poor' : 'critical')
      : 'unavailable';
    pills.push({ category: 'sunlight', labelKey: 'sunlight.title', score: sunlightScore, severity: sunlightSeverity });
    return pills;
  }, [riskCards, sunlight]);

  const comparisonLabel = useCallback((code: string): string => {
    if (code === 'city_avg') return t('risk.detail.cityAvg');
    if (code === 'nl_avg') return t('risk.detail.nlAvg');
    if (code === 'who_limit') return t('risk.detail.whoLimit');
    if (code === 'adaptation_target') return t('risk.detail.adaptationTarget');
    if (code === 'daylight_target') return t('risk.detail.daylightTarget');
    return t('risk.detail.address');
  }, [t]);

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
      label: comparisonLabel(row.label_code),
      value: row.value,
      pattern: row.pattern === 'dashed' ? 'dashed' : undefined,
      colorKey: (
        row.label_code === 'city_avg' ? 'city'
        : row.label_code === 'nl_avg' ? 'nl'
        : row.label_code === 'who_limit' || row.label_code === 'adaptation_target' || row.label_code === 'daylight_target' ? 'who'
        : 'address'
      ) as ComparisonColorKey,
    }));
  }, [comparisonLabel, riskComparisons]);

  // Get risk detail data for active category
  const getDetailProps = (category: string) => {
    const sunlightScore = sunlight ? normalizeSunlightScore(sunlight.winter) : undefined;
    const sunlightSeverity: SeverityLevel = sunlightScore != null
      ? (sunlightScore >= 70 ? 'good' : sunlightScore >= 40 ? 'moderate' : sunlightScore >= 20 ? 'poor' : 'critical')
      : 'unavailable';
    const sunlightMeaning = sunlightScore == null
      ? t('sunlight.meaning.unavailable')
      : sunlightScore >= 70
        ? t('sunlight.meaning.good')
        : sunlightScore >= 40
          ? t('sunlight.meaning.moderate')
          : sunlightScore >= 20
            ? t('sunlight.meaning.poor')
            : t('sunlight.meaning.critical');

    const currentRiskCards = riskCards;
    if (!currentRiskCards && category !== 'sunlight') return null;
    switch (category) {
      case 'noise': return {
        titleKey: 'risk.noise.title',
        score: currentRiskCards?.noise.score,
        severity: levelToSeverity(
          currentRiskCards?.noise.level ?? 'unavailable',
          currentRiskCards?.noise.score,
        ),
        meaning: isNl ? currentRiskCards?.noise.summary_nl : currentRiskCards?.noise.summary,
        comparisons: buildComparisons('noise'),
        source: currentRiskCards?.noise.source,
        sourceDate: currentRiskCards?.noise.source_date,
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
        comparisons: buildComparisons('air'),
        source: currentRiskCards?.air_quality.source,
        sourceDate: currentRiskCards?.air_quality.source_date,
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
        comparisons: buildComparisons('climate'),
        source: currentRiskCards?.climate_stress.source,
        sourceDate: currentRiskCards?.climate_stress.source_date,
      };
      case 'sunlight': return {
        titleKey: 'sunlight.title',
        score: sunlightScore,
        severity: sunlightSeverity,
        meaning: sunlightMeaning,
        comparisons: buildComparisons('sunlight'),
        source: '3DBAG + SunCalc',
        sourceDate: sunlight?.analysisYear ? String(sunlight.analysisYear) : undefined,
      };
      default: return null;
    }
  };

  const topBarTitle = activeScreen === 'shortlist'
    ? t('shortlist.title')
    : activeScreen === 'compare'
      ? t('compare.title')
      : activeScreen === 'settings'
        ? t('nav.settings')
        : activeTab === 'home'
          ? 'buurt-check'
          : activeScreen === 'dossier'
            ? t('nav.briefing')
            : 'buurt-check';

  const coverageSummary = useMemo(() => {
    const isDossierActive = activeScreen === 'dossier' && !!address?.adresseerbaar_object_id;
    if (!isDossierActive) {
      return null;
    }

    const sources: Array<{
      key: string;
      status: SourceFetchStatus;
      date?: string | number | null;
    }> = [
      {
        key: 'building',
        status: resolveSourceFetchStatus(
          true,
          !!buildingResponse?.building,
          buildingLoading,
          !!(buildingError && !buildingResponse),
        ),
        date: buildingResponse?.building?.document_date ?? null,
      },
      {
        key: 'risk',
        status: resolveSourceFetchStatus(true, !!riskCards, riskLoading, riskError),
        date: riskCards?.climate_stress.source_date
          ?? riskCards?.air_quality.source_date
          ?? riskCards?.noise.source_date
          ?? null,
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
        date: livability?.available ? (livability.source_date ?? livability.year) : null,
      },
      {
        key: 'neighborhood',
        status: resolveSourceFetchStatus(
          progressivePhase === 'buurt',
          !!neighborhoodStats,
          neighborhoodStatsLoading,
          neighborhoodStatsError,
        ),
        date: neighborhoodStats?.source_year ?? null,
      },
      {
        key: 'tierB',
        status: resolveSourceFetchStatus(
          progressivePhase === 'buurt',
          !!tierBData,
          tierBLoading,
          tierBError,
        ),
        date: tierBData?.crime.source_date ?? tierBData?.energy_label.source_date ?? null,
      },
      {
        key: 'sunlight',
        status: resolveSourceFetchStatus(
          progressivePhase === 'buurt' && !!neighborhood3D,
          !!sunlight,
          surroundingLoading && !sunlight,
          !!(sunlightUnavailable && !sunlight),
        ),
        date: sunlight?.analysisYear ?? null,
      },
    ];

    const enabled = sources.filter((source) => source.status !== 'idle');
    const loaded = enabled.filter((source) => source.status === 'success').length;
    const failed = enabled.filter((source) => source.status === 'error').length;

    const parsedDates = enabled
      .map((source) => parseSourceDateValue(source.date))
      .filter((value): value is ParsedSourceDate => value != null);

    let newest: ParsedSourceDate | null = null;
    let oldest: ParsedSourceDate | null = null;
    for (const parsed of parsedDates) {
      if (!newest || parsed.recencyDate > newest.recencyDate) newest = parsed;
      if (!oldest || parsed.recencyDate < oldest.recencyDate) oldest = parsed;
    }

    const staleThreshold = staleThresholdDate();
    const staleCount = parsedDates.filter((date) => date.recencyDate < staleThreshold).length;

    return {
      loaded,
      total: enabled.length,
      failed,
      staleCount,
      newest: newest ? formatCoverageDate(newest, i18n.language) : null,
      oldest: oldest ? formatCoverageDate(oldest, i18n.language) : null,
    };
  }, [
    activeScreen,
    address?.adresseerbaar_object_id,
    buildingError,
    buildingLoading,
    buildingResponse,
    i18n.language,
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
    tierBData,
    tierBError,
    tierBLoading,
  ]);

  // Get viewing questions for active detail category
  const activeQuestions = activeDetailCategory
    ? (() => {
      const normalized = activeDetailCategory.toLowerCase();
      if (!viewingQuestions) {
        if (normalized === 'sunlight') {
          const score = sunlight ? normalizeSunlightScore(sunlight.winter) : undefined;
          return fallbackSunlightQuestions(score);
        }
        return undefined;
      }
      const category = viewingQuestions.categories.find(c => {
        const name = c.name.toLowerCase();
        if (normalized === 'air') return name === 'air quality' || name === 'air';
        if (normalized === 'climate') return name === 'climate stress' || name === 'climate';
        return name === normalized;
      });
      if (category) return category.questions;
      if (normalized === 'sunlight') {
        const score = sunlight ? normalizeSunlightScore(sunlight.winter) : undefined;
        return fallbackSunlightQuestions(score);
      }
      return undefined;
    })()
    : undefined;

  const showLoadingScreen = (
    activeScreen === 'dossier'
    && loading
    && !buildingResponse
    && !!pendingDisplayName
  );

  return (
    <div className="app">
      <a href="#main-content" className="sr-only sr-only--focusable" inert={isOverlayModalOpen || undefined}>{t('a11y.skip_to_content')}</a>
      <TopBar
        title={topBarTitle}
        onSettingsClick={openSettings}
        inert={isOverlayModalOpen || undefined}
        activeScreen={activeScreen}
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
              <Suspense fallback={null}>
              <DossierSheet snap={sheetSnap} actionBarVisible={actionBarVisible}>
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
                  {((!riskLoading && (riskCards || riskError)) &&
                    (!propertyWarningsLoading && (propertyWarnings || propertyWarningsError))) && (
                    <div
                      className="dossier-section"
                      style={dossierSectionStyle(0)}
                      data-section-index={0}
                      data-dossier-section="attention-summary"
                    >
                      <AttentionSummary
                        riskCards={riskCards ?? undefined}
                        warnings={propertyWarnings ?? undefined}
                        sunlightScore={sunlight ? normalizeSunlightScore(sunlight.winter) : undefined}
                        livability={livability ?? undefined}
                      />
                    </div>
                  )}

                  {address && (
                    <div className="dossier-section" style={dossierSectionStyle(1)} data-section-index={1}>
                      <AddressHeader
                        address={address}
                        building={buildingResponse?.building ?? undefined}
                        onChangeAddress={() => {
                          hapticTap();
                          setActiveTab('home');
                          setActiveScreen('search');
                          setHashRoute('#/search');
                        }}
                      />
                      {coverageSummary && (
                        <div className="app__coverage-strip">
                          <span>{t('dossier.coverage.loaded', { loaded: coverageSummary.loaded, total: coverageSummary.total })}</span>
                          {coverageSummary.newest && (
                            <span>{t('dossier.coverage.newest', { date: coverageSummary.newest })}</span>
                          )}
                          {coverageSummary.oldest && (
                            <span>{t('dossier.coverage.oldest', { date: coverageSummary.oldest })}</span>
                          )}
                          {coverageSummary.staleCount > 0 && (
                            <span className="app__coverage-stale">
                              {t('dossier.coverage.stale', { count: coverageSummary.staleCount })}
                            </span>
                          )}
                        </div>
                      )}
                      {!!coverageSummary?.failed && (
                        <div className="app__failed-banner">
                          <span>{t('dossier.retryBanner', { count: coverageSummary.failed })}</span>
                          <button
                            type="button"
                            className="app__retry-button"
                            onClick={handleRetryAllFailed}
                          >
                            {t('error.retry')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {progressivePhase !== 'house' && summaryPills.length > 0 && (
                    <div className="dossier-section" style={dossierSectionStyle(2)} data-section-index={2}>
                      <SummaryStrip
                        pills={summaryPills}
                        onPillTap={handleSummaryPillTap}
                      />
                    </div>
                  )}

                  {(buildingLoading || buildingResponse || buildingError) && (
                    <div className="dossier-section" style={dossierSectionStyle(3)} data-section-index={3}>
                      <BuildingFactsCard
                        building={buildingResponse?.building ?? undefined}
                        loading={buildingLoading}
                        error={buildingError}
                        onRetry={buildingError ? handleRetryBuildingFacts : undefined}
                      />
                    </div>
                  )}

                  {progressivePhase !== 'house' &&
                    ((loading && !riskCards) || riskLoading || riskCards || riskError || activeDetailCategory) && (
                      <div className="dossier-section" style={dossierSectionStyle(4)} data-section-index={4}>
                        {loading && !riskCards && <RiskTileSkeleton />}
                        {(riskLoading || riskCards || riskError || activeDetailCategory) && (
                          <LayoutGroup>
                            {(riskLoading || riskCards || riskError) && (
                              <RiskTilesGrid
                                risks={riskCards ?? undefined}
                                sunlight={sunlight ?? undefined}
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
                                    comparisons={detail.comparisons}
                                    comparisonsError={riskComparisonsError}
                                    onRetryComparisons={riskComparisonsError ? handleRetryRiskComparisons : undefined}
                                    questions={activeQuestions}
                                    source={detail.source}
                                    sourceDate={detail.sourceDate}
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

                  {progressivePhase !== 'house' && (propertyWarningsLoading || propertyWarnings || propertyWarningsError) && (
                    <div className="dossier-section" style={dossierSectionStyle(5)} data-section-index={5}>
                      <h3 id="section-warnings" className="app__section-label">{t('warnings.sectionTitle')}</h3>
                      <PropertyWarningsCard
                        data={propertyWarnings ?? undefined}
                        loading={propertyWarningsLoading}
                        error={propertyWarningsError}
                        onRetry={propertyWarningsError ? handleRetryPropertyWarnings : undefined}
                      />
                    </div>
                  )}

                  {progressivePhase !== 'house' && (
                    <div className="dossier-section" style={dossierSectionStyle(6)} data-section-index={6}>
                      <h3 id="section-soil" className="app__section-label">{t('dossier.soilInfo', 'Soil & Pipes')}</h3>
                      <SoilInfoCard
                        leadPipeFlagged={propertyWarnings?.lead_pipe?.flagged}
                        constructionYear={buildingResponse?.building?.construction_year}
                      />
                    </div>
                  )}
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
                        <div className="dossier-section" style={dossierSectionStyle(7)} data-section-index={7}>
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

                      <div ref={viewer3DRefCallback} className="dossier-section" style={dossierSectionStyle(8)} data-section-index={8} data-testid="viewer-3d-sentinel">
                        {!viewer3DTriggered && !neighborhood3D && (
                          <div className="viewer-3d-status">
                            <p>{t('viewer3d.loading')}</p>
                          </div>
                        )}

                        {neighborhood3DLoading && (
                          <div className="viewer-3d-status">
                            <p>{t('viewer3d.loading')}</p>
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
                            <p>{t('viewer3d.noData')}</p>
                          </div>
                        )}


                        {neighborhood3D && neighborhood3D.buildings.length > 0 && (
                          <Suspense fallback={<div className="viewer-3d-status"><p>{t('viewer3d.loading')}</p></div>}>
                            <NeighborhoodViewer3D
                              buildings={neighborhood3D.buildings}
                              targetPandId={neighborhood3D.target_pand_id ?? undefined}
                              center={neighborhood3D.center}
                              sunDateTime={sunDateTime}
                              showHeatmap={showHeatmap}
                              onSunlightAnalysis={surroundingLoading ? undefined : handleSunlightAnalysis}
                              onSunlightError={surroundingLoading ? undefined : () => setSunlightUnavailable(true)}
                              onShadowSnapshots={surroundingLoading ? undefined : setShadowSnapshots}
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

                        {(shadowSnapshots || (neighborhood3D && neighborhood3D.buildings.length > 0 && !shadowSnapshots)) && (
                          <ShadowSnapshots
                            snapshots={shadowSnapshots ?? undefined}
                            loading={!!neighborhood3D && neighborhood3D.buildings.length > 0 && !shadowSnapshots}
                          />
                        )}
                      </div>

                      {(() => {
                        const canComputeSunlight = hasSurroundingContext(neighborhood3D) && !surroundingLoading;
                        const sunlightLoading = canComputeSunlight && !sunlight;
                        const showSunlightCard = sunlightLoading || !!sunlight || sunlightUnavailable;
                        if (!showSunlightCard) return null;
                        const targetOrientation = neighborhood3D?.buildings.find(
                          b => b.pand_id === neighborhood3D.target_pand_id
                        )?.orientation_deg;
                        return (
                          <div className="dossier-section" style={dossierSectionStyle(9)} data-section-index={9}>
                            <SunlightRiskCard
                              sunlight={sunlight ?? undefined}
                              loading={sunlightLoading}
                              unavailable={sunlightUnavailable}
                              orientationDeg={targetOrientation}
                              showHeatmap={showHeatmap}
                              onToggleHeatmap={setShowHeatmap}
                            />
                          </div>
                        );
                      })()}
                      {(neighborhoodStatsLoading || neighborhoodStats || neighborhoodStatsError) && (
                        <div className="dossier-section" style={dossierSectionStyle(10)} data-section-index={10}>
                          <h3 id="section-neighborhood" className="app__section-label">{t('dossier.neighborhood')}</h3>
                          <NeighborhoodStatsCard
                            stats={neighborhoodStats ?? undefined}
                            loading={neighborhoodStatsLoading}
                            error={neighborhoodStatsError}
                            onRetry={neighborhoodStatsError ? handleRetryNeighborhoodStats : undefined}
                          />
                        </div>
                      )}

                      {(tierBLoading || tierBData || tierBError) && (
                        <div className="dossier-section" style={dossierSectionStyle(11)} data-section-index={11}>
                          <h3 id="section-tier-b" className="app__section-label">{t('dossier.tierB')}</h3>
                          <TierBSignalsCard
                            data={tierBData ?? undefined}
                            loading={tierBLoading}
                            error={tierBError}
                            onRetry={tierBError ? handleRetryTierB : undefined}
                          />
                        </div>
                      )}
                    </section>
                  </>
                )}

                {((viewingQuestions && viewingQuestions.categories.length > 0) || viewingQuestionsError) && (
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
                  <div ref={actionBarSentinelRefCallback} className="dossier-section" style={dossierSectionStyle(12)} data-section-index={12}>
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
                  <div className="app__next-steps" data-testid="next-steps">
                    <h3 className="app__next-steps-title">{t('dossier.nextSteps.title')}</h3>
                    <ul className="app__next-steps-list">
                      <li>
                        <button
                          type="button"
                          className={`app__next-steps-action${address.adresseerbaar_object_id && isInShortlist(address.adresseerbaar_object_id) ? ' app__next-steps-action--saved' : ''}`}
                          onClick={() => {
                            hapticTap();
                            if (address.adresseerbaar_object_id && isInShortlist(address.adresseerbaar_object_id)) {
                              setActiveScreen('search');
                              setActiveTab('home');
                              setHashRoute('#/search');
                            } else {
                              handleBookmark();
                            }
                          }}
                        >
                          <svg className="app__next-steps-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            {address.adresseerbaar_object_id && isInShortlist(address.adresseerbaar_object_id) ? (
                              <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="currentColor"/>
                            ) : (
                              <path d="M5 4a1 1 0 00-1 1v11.586l5.707-3.805a1 1 0 011.086 0L16 16.586V5a1 1 0 00-1-1H5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                            )}
                          </svg>
                          {address.adresseerbaar_object_id && isInShortlist(address.adresseerbaar_object_id)
                            ? t('dossier.nextSteps.saved')
                            : t('dossier.nextSteps.save')}
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="app__next-steps-action"
                          onClick={() => {
                            hapticTap();
                            setExportSheetOpen(true);
                          }}
                        >
                          <svg className="app__next-steps-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414a1 1 0 00-.293-.707l-3.414-3.414A1 1 0 0011.586 3H6z" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M10 10v4m0 0l-2-2m2 2l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
                  <div className="dossier-section" style={dossierSectionStyle(13)} data-section-index={13}>
                    <ActionBar
                      isBookmarked={!!address.adresseerbaar_object_id && isInShortlist(address.adresseerbaar_object_id)}
                      onAddToShortlist={handleBookmark}
                      onExportBriefing={() => {
                        hapticTap();
                        setExportSheetOpen(true);
                      }}
                      showBookmarkTooltip={!!address}
                      bookmarkPending={loading || buildingLoading}
                      exportPending={exportGenerating}
                      visible={actionBarVisible}
                    />
                  </div>
                )}
              </DossierSheet>
              </Suspense>
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
                />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Export bottom sheet */}
      {address?.adresseerbaar_object_id && address.rd_x != null && address.rd_y != null && address.latitude != null && address.longitude != null && (
        <ErrorBoundary key={`export-${address?.adresseerbaar_object_id ?? 'none'}`} fallback={null}>
        <Suspense fallback={null}>
          <ExportBottomSheet
            isOpen={exportSheetOpen}
            onClose={() => {
              setExportSheetOpen(false);
              setExportGenerating(false);
            }}
            vboId={address.adresseerbaar_object_id}
            rdX={address.rd_x}
            rdY={address.rd_y}
            lat={address.latitude}
            lng={address.longitude}
            address={address.display_name}
            street={address.street ?? undefined}
            city={address.city ?? undefined}
            buurtCode={address.buurt_code ?? undefined}
            postcode={address.postcode ?? undefined}
            houseNumber={address.house_number ?? undefined}
            houseLetter={address.house_letter ?? undefined}
            addition={address.addition ?? undefined}
            shadowSnapshots={shadowSnapshots}
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
          />
        </Suspense>
        </ErrorBoundary>
      )}

      <TabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        savedCount={shortlistItems.length}
        inert={isOverlayModalOpen || undefined}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
