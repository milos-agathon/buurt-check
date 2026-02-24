import { lazy, Suspense, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AddressSearch from './components/AddressSearch';
import AddressHeader from './components/AddressHeader';
import SummaryStrip from './components/SummaryStrip';
import BuildingFactsCard from './components/BuildingFactsCard';
import SunlightRiskCard from './components/SunlightRiskCard';
import ShadowTimeSlider from './components/ShadowTimeSlider';
import ShadowSnapshots from './components/ShadowSnapshots';
import RiskCardsPanel from './components/RiskCardsPanel';
import RiskTilesGrid from './components/RiskTilesGrid';
import RiskDetailView from './components/RiskDetailView';
import NeighborhoodStatsCard from './components/NeighborhoodStatsCard';
import TierBSignalsCard from './components/TierBSignalsCard';
import AttentionSummary from './components/AttentionSummary';
import PropertyWarningsCard from './components/PropertyWarningsCard';
import LivabilityCard from './components/LivabilityCard';
import LivabilityDetailView from './components/LivabilityDetailView';
import SoilInfoCard from './components/SoilInfoCard';
import ViewingChecklist from './components/ViewingChecklist';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import DossierSheet from './components/DossierSheet';
import type { SheetSnap } from './components/DossierSheet';
import RiskTileSkeleton from './components/RiskTileSkeleton';
import LoadingScreen, { type LoadingProgressStep } from './components/LoadingScreen';
import { SPRING_REVEAL } from './config/springs';
import { hapticTap } from './utils/haptic';
import { useAnimationPerformance } from './hooks/useAnimationPerformance';
import ActionBar from './components/ActionBar';
import ExportBottomSheet from './components/ExportBottomSheet';
import ShortlistScreen from './components/ShortlistScreen';
import TabBar from './components/TabBar';
import TopBar from './components/TopBar';
import type { TabId } from './components/TabBar';
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
} from './services/api';
import { getShortlist, addToShortlist, removeFromShortlist, isInShortlist, clearShortlist } from './services/shortlist';
import { clearRecent } from './services/recentSearches';
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
type ComparisonRow = { label: string; value: number; pattern?: 'dashed' };

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
    return {
      route: 'dossier',
      vboId: decodeURIComponent(dossierMatch[1]),
      lookupId: params.get('lookup') ?? undefined,
    };
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
  const [neighborhood3D, setNeighborhood3D] = useState<Neighborhood3DResponse | null>(null);
  const [neighborhood3DLoading, setNeighborhood3DLoading] = useState(false);
  const [surroundingLoading, setSurroundingLoading] = useState(false);
  const [riskCards, setRiskCards] = useState<RiskCardsResponse | null>(dossierSeed?.riskCards ?? null);
  const [riskComparisons, setRiskComparisons] = useState<RiskComparisonsResponse | null>(
    dossierSeed?.riskComparisons ?? null,
  );
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState(false);
  const [neighborhoodStats, setNeighborhoodStats] = useState<NeighborhoodStatsResponse | null>(
    dossierSeed?.neighborhoodStats ?? null,
  );
  const [neighborhoodStatsLoading, setNeighborhoodStatsLoading] = useState(false);
  const [neighborhoodStatsError, setNeighborhoodStatsError] = useState(false);
  const [tierBData, setTierBData] = useState<TierBResponse | null>(dossierSeed?.tierBData ?? null);
  const [tierBLoading, setTierBLoading] = useState(false);
  const [tierBError, setTierBError] = useState(false);
  const [propertyWarnings, setPropertyWarnings] = useState<PropertyWarningsResponse | null>(
    dossierSeed?.propertyWarnings ?? null,
  );
  const [propertyWarningsLoading, setPropertyWarningsLoading] = useState(false);
  const [propertyWarningsError, setPropertyWarningsError] = useState(false);
  const [livability, setLivability] = useState<LivabilityResponse | null>(
    dossierSeed?.livability ?? null,
  );
  const [livabilityLoading, setLivabilityLoading] = useState(false);
  const [livabilityError, setLivabilityError] = useState(false);
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
  const previousScreenRef = useRef<Screen>('search');
  const [shortlistItems, setShortlistItems] = useState<ShortlistItem[]>(getShortlist());

  const [exportSheetOpen, setExportSheetOpen] = useState(false);

  // When an overlay modal (e.g. ExportBottomSheet) is open, mark background
  // content as inert so screen readers cannot access it (WCAG best practice).
  const isOverlayModalOpen = exportSheetOpen;

  // Risk detail view state.
  const [activeDetailCategory, setActiveDetailCategory] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [useFallbackDetailTransition, setUseFallbackDetailTransition] = useState(false);
  const [checkedQuestions, setCheckedQuestions] = useState<Set<string>>(new Set());
  const [showDossierJump, setShowDossierJump] = useState(false);
  const animationPerformance = useAnimationPerformance();
  const ignoreNextHashRef = useRef(false);

  // Apply theme on mount and listen for system changes
  useEffect(() => {
    applyTheme(themePreference);
    const cleanup = listenForSystemChanges(() => {});
    return cleanup;
  }, [themePreference]);

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
        hapticTap();
        showToast(t('toast.addressSaved'));
      } else {
        showToast(t('shortlist.maxReached'));
      }
    }
    setShortlistItems(getShortlist());
  }, [address, buildingResponse, riskCards, showToast, sunlight, t]);

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

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'home') {
      const hasDossier = !!(address && buildingResponse);
      setActiveScreen(hasDossier ? 'dossier' : 'search');
      if (hasDossier) {
        setSheetSnap('half');
        setHashRoute(dossierHash(address?.adresseerbaar_object_id, activeLookupId));
      } else {
        setHashRoute('#/search');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const el = document.getElementById('dossier-content');
      if (el) el.scrollTop = 0;
      return;
    }
    if (tab === 'briefing') {
      const hasDossier = !!(address && buildingResponse);
      setActiveScreen(hasDossier ? 'dossier' : 'search');
      if (hasDossier) {
        setSheetSnap('half');
        setHashRoute(dossierHash(address?.adresseerbaar_object_id, activeLookupId));
      } else {
        setHashRoute('#/search');
      }
    } else if (tab === 'saved') {
      setShortlistItems(getShortlist());
      setActiveScreen('shortlist');
      setHashRoute('#/saved');
    }
  }, [activeLookupId, address, buildingResponse, dossierHash, setHashRoute]);

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
        return;
      }
      const windowScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      setShowDossierJump(windowScrollTop > 360);
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
      root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      return;
    }

    const top = window.scrollY + target.getBoundingClientRect().top - 72;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, []);

  const scrollDossierToTop = useCallback(() => {
    const root = getDossierScrollContainer();
    if (hasInternalDossierScroll(root)) {
      root.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const highlightRiskTile = useCallback((category: string) => {
    const tile = document.getElementById(`section-risk-${category}`);
    if (!tile) return;
    tile.classList.remove('risk-tile--pulse');
    // Force reflow so repeated taps still replay the pulse animation.
    void tile.getBoundingClientRect();
    tile.classList.add('risk-tile--pulse');
    window.setTimeout(() => tile.classList.remove('risk-tile--pulse'), 320);
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

  const handleRetryRiskCards = useCallback(() => {
    if (!address?.adresseerbaar_object_id) return;
    const { adresseerbaar_object_id: vboId, rd_x, rd_y, latitude, longitude } = address;
    if (rd_x == null || rd_y == null || latitude == null || longitude == null) return;
    setRiskError(false);
    setRiskLoading(true);
    void (async () => {
      try {
        const risks = await getRiskCards(vboId, rd_x, rd_y, latitude, longitude);
        setRiskCards(risks);
      } catch {
        setRiskError(true);
      } finally {
        setRiskLoading(false);
      }
    })();
  }, [address]);

  const handleRetryPropertyWarnings = useCallback(() => {
    if (!address?.adresseerbaar_object_id || address.rd_x == null || address.rd_y == null) return;
    setPropertyWarningsError(false);
    setPropertyWarningsLoading(true);
    void (async () => {
      try {
        const warnings = await getPropertyWarnings(address.adresseerbaar_object_id!, address.rd_x!, address.rd_y!, {
          constructionYear: buildingResponse?.building?.construction_year ?? undefined,
          numUnits: buildingResponse?.building?.num_units ?? undefined,
          municipality: address.municipality ?? undefined,
        });
        setPropertyWarnings(warnings);
      } catch {
        setPropertyWarningsError(true);
      } finally {
        setPropertyWarningsLoading(false);
      }
    })();
  }, [address, buildingResponse?.building?.construction_year, buildingResponse?.building?.num_units]);

  const handleRetryNeighborhoodStats = useCallback(() => {
    if (!address?.adresseerbaar_object_id || address.latitude == null || address.longitude == null) return;
    setNeighborhoodStatsError(false);
    setNeighborhoodStatsLoading(true);
    void (async () => {
      try {
        const stats = await getNeighborhoodStats(
          address.adresseerbaar_object_id!,
          address.latitude!,
          address.longitude!,
          address.buurt_code ?? undefined,
        );
        setNeighborhoodStats(stats);
      } catch {
        setNeighborhoodStatsError(true);
      } finally {
        setNeighborhoodStatsLoading(false);
      }
    })();
  }, [address]);

  const handleRetryTierB = useCallback(() => {
    if (!address?.adresseerbaar_object_id) return;
    setTierBError(false);
    setTierBLoading(true);
    void (async () => {
      try {
        const tierB = await getTierBData(address.adresseerbaar_object_id!, {
          buurtCode: address.buurt_code ?? undefined,
          postcode: address.postcode ?? undefined,
          houseNumber: address.house_number ?? undefined,
          houseLetter: address.house_letter ?? undefined,
          addition: address.addition ?? undefined,
        });
        setTierBData(tierB);
      } catch {
        setTierBError(true);
      } finally {
        setTierBLoading(false);
      }
    })();
  }, [address]);

  const handleRetryLivability = useCallback(() => {
    if (!address?.adresseerbaar_object_id || address.rd_x == null || address.rd_y == null) return;
    setLivabilityError(false);
    setLivabilityLoading(true);
    void (async () => {
      try {
        const livData = await getLivability(address.adresseerbaar_object_id!, address.rd_x!, address.rd_y!);
        setLivability(livData);
      } catch {
        setLivabilityError(true);
      } finally {
        setLivabilityLoading(false);
      }
    })();
  }, [address]);

  const handleRetryAllFailed = useCallback(() => {
    if (riskError) handleRetryRiskCards();
    if (propertyWarningsError) handleRetryPropertyWarnings();
    if (livabilityError) handleRetryLivability();
    if (neighborhoodStatsError) handleRetryNeighborhoodStats();
    if (tierBError) handleRetryTierB();
  }, [
    handleRetryLivability,
    handleRetryNeighborhoodStats,
    handleRetryPropertyWarnings,
    handleRetryRiskCards,
    handleRetryTierB,
    livabilityError,
    neighborhoodStatsError,
    propertyWarningsError,
    riskError,
    tierBError,
  ]);

  const handleAddressSelect = useCallback(async (suggestion: AddressSuggestion) => {
    setLoading(true);
    setLoadingStep('findingBuilding');
    setLoadingWarningKey(null);
    setProgressivePhase('house');
    setError(null);
    setAddress(null);
    setActiveLookupId(suggestion.id);
    setBuildingResponse(null);
    setNeighborhood3D(null);
    setNeighborhood3DLoading(false);
    setSurroundingLoading(false);
    setRiskCards(null);
    setRiskComparisons(null);
    setRiskLoading(false);
    setRiskError(false);
    setNeighborhoodStats(null);
    setNeighborhoodStatsLoading(false);
    setNeighborhoodStatsError(false);
    setTierBData(null);
    setTierBLoading(false);
    setTierBError(false);
    setPropertyWarnings(null);
    setPropertyWarningsLoading(false);
    setPropertyWarningsError(false);
    setLivability(null);
    setLivabilityLoading(false);
    setLivabilityError(false);
    setShowLivabilityDetail(false);
    setSunlight(null);
    setSunlightUnavailable(false);
    setSunDateTime(undefined);
    setShowHeatmap(false);
    setShadowSnapshots(null);
    setViewingQuestions(null);
    setActiveDetailCategory(null);
    setCheckedQuestions(new Set());
    const requestId = ++neighborhood3DRequestId.current;

    setActiveScreen('dossier');
    setActiveTab('briefing');
    setSheetSnap('peek');
    setPendingDisplayName(suggestion.display_name);
    setHashRoute('#/briefing');

    try {
      const resolved = await lookupAddress(suggestion.id);
      if (neighborhood3DRequestId.current !== requestId) return;

      setAddress(resolved);
      const vboId = resolved.adresseerbaar_object_id;
      const { rd_x, rd_y, latitude, longitude } = resolved;

      if (!vboId) {
        setLoading(false);
        setSheetSnap('hidden');
        return;
      }

      const building = await getBuildingFacts(vboId);
      if (neighborhood3DRequestId.current !== requestId) return;

      setBuildingResponse(building);
      setLoading(false);
      setSheetSnap('half');
      setHashRoute(dossierHash(vboId, suggestion.id));

      setLoadingStep('loading3D');
      let phase1Promise: Promise<void> | null = null;
      if (rd_x != null && rd_y != null) {
        setPropertyWarningsLoading(true);
        phase1Promise = (async () => {
          try {
            const warnings = await getPropertyWarnings(vboId, rd_x, rd_y, {
              constructionYear: building?.building?.construction_year ?? undefined,
              numUnits: building?.building?.num_units ?? undefined,
              municipality: resolved.municipality ?? undefined,
            });
            if (neighborhood3DRequestId.current !== requestId) return;
            setPropertyWarnings(warnings);
          } catch {
            if (neighborhood3DRequestId.current !== requestId) return;
            setPropertyWarningsError(true);
          } finally {
            if (neighborhood3DRequestId.current === requestId) {
              setPropertyWarningsLoading(false);
            }
          }
        })();
      }

      if (phase1Promise) {
        await settleWithTimeout(phase1Promise, PHASE_1_TIMEOUT_MS);
      }
      if (neighborhood3DRequestId.current !== requestId) return;

      setProgressivePhase('risk');
      setLoadingStep('checkingNoise');

      let phase2Promise: Promise<void> | null = null;
      if (rd_x != null && rd_y != null && latitude != null && longitude != null) {
        setRiskLoading(true);
        phase2Promise = (async () => {
          try {
            const risks = await getRiskCards(vboId, rd_x, rd_y, latitude, longitude);
            if (neighborhood3DRequestId.current !== requestId) return;
            setRiskCards(risks);
          } catch {
            if (neighborhood3DRequestId.current !== requestId) return;
            setRiskError(true);
          } finally {
            if (neighborhood3DRequestId.current === requestId) {
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
            );
            if (neighborhood3DRequestId.current === requestId) {
              setRiskComparisons(comparisons);
            }
          } catch {
            // Optional source.
          }
        })();

        void (async () => {
          try {
            const questions = await getViewingQuestions(vboId, rd_x, rd_y, latitude, longitude, {
              street: resolved.street ?? undefined,
              city: resolved.city ?? undefined,
            });
            if (neighborhood3DRequestId.current === requestId) {
              setViewingQuestions(questions);
            }
          } catch {
            // Optional source.
          }
        })();
      }

      if (phase2Promise) {
        const phase2State = await settleWithTimeout(phase2Promise, PHASE_2_TIMEOUT_MS);
        if (phase2State === 'timeout' && neighborhood3DRequestId.current === requestId) {
          setLoadingWarningKey('loading.warning.risk');
          window.setTimeout(() => {
            if (neighborhood3DRequestId.current === requestId) {
              setLoadingWarningKey(null);
            }
          }, 1500);
        }
      }
      if (neighborhood3DRequestId.current !== requestId) return;

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
            );
            if (neighborhood3DRequestId.current !== requestId) return;
            setNeighborhoodStats(stats);
          } catch {
            if (neighborhood3DRequestId.current !== requestId) return;
            setNeighborhoodStatsError(true);
          } finally {
            if (neighborhood3DRequestId.current === requestId) {
              setNeighborhoodStatsLoading(false);
            }
          }
        })();

        setLivabilityLoading(true);
        void (async () => {
          try {
            const livData = await getLivability(vboId, rd_x, rd_y);
            if (neighborhood3DRequestId.current !== requestId) return;
            setLivability(livData);
          } catch {
            if (neighborhood3DRequestId.current !== requestId) return;
            setLivabilityError(true);
          } finally {
            if (neighborhood3DRequestId.current === requestId) {
              setLivabilityLoading(false);
            }
          }
        })();

        setTierBLoading(true);
        void (async () => {
          try {
            const tierB = await getTierBData(vboId, {
              buurtCode: resolved.buurt_code ?? undefined,
              postcode: resolved.postcode ?? undefined,
              houseNumber: resolved.house_number ?? undefined,
              houseLetter: resolved.house_letter ?? undefined,
              addition: resolved.addition ?? undefined,
            });
            if (neighborhood3DRequestId.current !== requestId) return;
            setTierBData(tierB);
          } catch {
            if (neighborhood3DRequestId.current !== requestId) return;
            setTierBError(true);
          } finally {
            if (neighborhood3DRequestId.current === requestId) {
              setTierBLoading(false);
            }
          }
        })();
      }

      setLoadingStep('checkingClimate');
      const pandId = resolved.pand_id ?? building.building?.pand_id ?? null;
      if (pandId && rd_x != null && rd_y != null && latitude != null && longitude != null) {
        setNeighborhood3DLoading(true);
        setSurroundingLoading(true);

        const immediateTargetData = createImmediateTarget3D(
          vboId,
          pandId,
          rd_x,
          rd_y,
          latitude,
          longitude,
          building.building,
        );
        setNeighborhood3D(immediateTargetData);
        setNeighborhood3DLoading(false);

        let phase1TargetData: Neighborhood3DResponse | null = immediateTargetData;
        let phase2Done = false;
        let phase2HasRenderableData = false;

        void (async () => {
          try {
            const target3d = await getBuilding3D(vboId, pandId, rd_x, rd_y, latitude, longitude);
            const hasTargetBuilding = target3d.buildings.length > 0;
            if (hasTargetBuilding) {
              phase1TargetData = target3d;
            }
            if (
              (!phase2Done || !phase2HasRenderableData)
              && neighborhood3DRequestId.current === requestId
              && hasTargetBuilding
            ) {
              setNeighborhood3D(target3d);
            }
          } catch {
            // Phase 2 handles fallback.
          }
        })();

        void (async () => {
          try {
            const n3d = await getNeighborhood3D(vboId, pandId, rd_x, rd_y, latitude, longitude);
            phase2Done = true;
            const merged3d = mergeNeighborhood3DWithFallback(n3d, phase1TargetData);
            phase2HasRenderableData = merged3d.buildings.length > 0;
            if (neighborhood3DRequestId.current !== requestId) return;
            setNeighborhood3D(merged3d);
            setNeighborhood3DLoading(false);
            setSurroundingLoading(false);
            setSunlightUnavailable(!hasSurroundingContext(merged3d));
          } catch {
            phase2Done = true;
            phase2HasRenderableData = false;
            if (neighborhood3DRequestId.current !== requestId) return;
            setNeighborhood3DLoading(false);
            setSurroundingLoading(false);
            setSunlightUnavailable(true);
          }
        })();
      } else {
        setSunlightUnavailable(true);
      }

      setLoadingStep('calculatingSunlight');
    } catch {
      if (neighborhood3DRequestId.current !== requestId) return;
      setError(t('error.generic'));
      setLoading(false);
      setSheetSnap('hidden');
    }
  }, [dossierHash, setHashRoute, t]);

  const handleSelectShortlistAddress = useCallback(async (vboId: string) => {
    const shortlistItem = shortlistItems.find((item) => item.vboId === vboId);
    if (!shortlistItem) return;

    if (shortlistItem.lookupId) {
      await handleAddressSelect({
        id: shortlistItem.lookupId,
        display_name: shortlistItem.address,
        type: 'adres',
        score: 1,
      });
      return;
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyRoute = () => {
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
          && buildingResponse
          && (!parsed.vboId || parsed.vboId === address.adresseerbaar_object_id)
        ) {
          setSheetSnap('half');
          return;
        }
        const shortlistMatch = parsed.vboId
          ? getShortlist().find((item) => item.vboId === parsed.vboId)
          : undefined;
        const routeLookupId = parsed.lookupId ?? shortlistMatch?.lookupId;
        if (routeLookupId) {
          const isActiveLookup = routeLookupId === activeLookupId;
          if (isActiveLookup && (loading || (address?.id === routeLookupId && !!buildingResponse))) {
            return;
          }
          void handleAddressSelect({
            id: routeLookupId,
            display_name: shortlistMatch?.address ?? pendingDisplayName ?? routeLookupId,
            type: 'adres',
            score: 1,
          });
        }
        return;
      }
      setActiveTab('home');
      setActiveScreen(address && buildingResponse ? 'dossier' : 'search');
    };

    if (!window.location.hash) {
      setHashRoute(
        initialHasDossier
          ? dossierHash(address?.adresseerbaar_object_id, activeLookupId)
          : '#/search',
        { replace: true },
      );
    } else {
      applyRoute();
    }

    const onHashChange = () => {
      if (ignoreNextHashRef.current) {
        ignoreNextHashRef.current = false;
        return;
      }
      applyRoute();
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [
    activeLookupId,
    address,
    buildingResponse,
    dossierHash,
    handleAddressSelect,
    initialHasDossier,
    loading,
    pendingDisplayName,
    setHashRoute,
  ]);

  // Build summary strip pills from risk data
  const summaryPills = (() => {
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
  })();

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
          loading,
          !!(error && !buildingResponse),
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
    buildingResponse,
    error,
    i18n.language,
    livability,
    livabilityError,
    livabilityLoading,
    loading,
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
    (activeScreen === 'search' || activeScreen === 'dossier')
    && loading
    && !buildingResponse
    && !!pendingDisplayName
  );

  return (
    <div className="app">
      <a href="#main-content" className="sr-only sr-only--focusable" inert={isOverlayModalOpen || undefined}>{t('a11y.skip_to_content')}</a>
      <TopBar title={topBarTitle} onSettingsClick={openSettings} inert={isOverlayModalOpen || undefined} />

      <main className="app__main" id="main-content" inert={isOverlayModalOpen || undefined}>
        {(activeScreen === 'search' || activeScreen === 'dossier') && (
          <>
            {!showLoadingScreen && <AddressSearch onSelect={handleAddressSelect} />}
            {error && <p className="app__error">{error}</p>}

            {showLoadingScreen ? (
              <LoadingScreen
                address={address}
                pendingDisplayName={pendingDisplayName}
                step={loadingStep}
                warningKey={loadingWarningKey}
              />
            ) : (
              <DossierSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
                {address && buildingResponse && showDossierJump && (
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
                      <button type="button" onClick={handleJumpToHouse}>{t('nav.jumpHouse')}</button>
                      <button type="button" onClick={handleJumpToBuurt}>{t('nav.jumpBuurt')}</button>
                      <button type="button" onClick={handleJumpToChecklist}>{t('nav.jumpBriefing')}</button>
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

                <section id="section-house-start" role="region" aria-label={t('nav.jumpHouse')}>
                  {((!riskLoading && (riskCards || riskError)) &&
                    (!propertyWarningsLoading && (propertyWarnings || propertyWarningsError))) && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={SPRING_REVEAL}
                      data-dossier-section="attention-summary"
                    >
                      <AttentionSummary
                        riskCards={riskCards ?? undefined}
                        warnings={propertyWarnings ?? undefined}
                        sunlightScore={sunlight ? normalizeSunlightScore(sunlight.winter) : undefined}
                        livability={livability ?? undefined}
                      />
                    </motion.div>
                  )}

                  {address && buildingResponse && (
                    <>
                      <AddressHeader
                        address={address}
                        building={buildingResponse.building ?? undefined}
                        isBookmarked={!!address.adresseerbaar_object_id && isInShortlist(address.adresseerbaar_object_id)}
                        onBookmarkToggle={handleBookmark}
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
                    </>
                  )}

                  {progressivePhase !== 'house' && summaryPills.length > 0 && (
                    <SummaryStrip
                      pills={summaryPills}
                      onPillTap={handleSummaryPillTap}
                    />
                  )}

                  {(loading || buildingResponse) && (
                    <BuildingFactsCard
                      building={buildingResponse?.building ?? undefined}
                      loading={loading}
                    />
                  )}

                  {progressivePhase !== 'house' && loading && !riskCards && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={SPRING_REVEAL}
                    >
                      <RiskTileSkeleton />
                    </motion.div>
                  )}

                  {progressivePhase !== 'house' && (riskLoading || riskCards || riskError || activeDetailCategory) && (
                    <LayoutGroup>
                      {(riskLoading || riskCards || riskError) && (
                        <>
                          <RiskTilesGrid
                            risks={riskCards ?? undefined}
                            sunlight={sunlight ?? undefined}
                            onTileTap={handleRiskTileTap}
                          />
                          <RiskCardsPanel
                            risks={riskCards ?? undefined}
                            loading={riskLoading}
                            error={riskError}
                            onRetry={riskError ? handleRetryRiskCards : undefined}
                          />
                        </>
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
                              questions={activeQuestions}
                              checkedQuestions={checkedQuestions}
                              onToggleQuestion={handleToggleQuestion}
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

                  {progressivePhase !== 'house' && (propertyWarningsLoading || propertyWarnings || propertyWarningsError) && (
                    <>
                      <h3 id="section-warnings" className="app__section-label">{t('warnings.sectionTitle')}</h3>
                      <PropertyWarningsCard
                        data={propertyWarnings ?? undefined}
                        loading={propertyWarningsLoading}
                        error={propertyWarningsError}
                        onRetry={propertyWarningsError ? handleRetryPropertyWarnings : undefined}
                      />
                    </>
                  )}

                  {progressivePhase !== 'house' && (
                    <>
                      <h3 id="section-soil" className="app__section-label">{t('dossier.soilInfo', 'Soil & Pipes')}</h3>
                      <SoilInfoCard
                        leadPipeFlagged={propertyWarnings?.lead_pipe?.flagged}
                        constructionYear={buildingResponse?.building?.construction_year}
                      />
                    </>
                  )}
                </section>

                {progressivePhase === 'buurt' && (
                  <>
                    <div className="app__phase-divider" id="section-buurt-start">
                      <span>{t('dossier.buurtDivider')}</span>
                    </div>
                    <section role="region" aria-label={t('nav.jumpBuurt')}>
                      {(livabilityLoading || livability || livabilityError) && (
                        <>
                          <h3 id="section-livability" className="app__section-label">{t('dossier.livability', 'Livability')}</h3>
                          <LivabilityCard
                            data={livability ?? undefined}
                            loading={livabilityLoading}
                            error={livabilityError}
                            onRetry={livabilityError ? handleRetryLivability : undefined}
                            onTap={livability?.available ? () => setShowLivabilityDetail(true) : undefined}
                          />
                        </>
                      )}

                      {showLivabilityDetail && livability?.available && (
                        <LivabilityDetailView
                          data={livability}
                          onClose={() => setShowLivabilityDetail(false)}
                        />
                      )}

                      {neighborhood3DLoading && (
                        <div className="viewer-3d-status">
                          <p>{t('viewer3d.loading')}</p>
                        </div>
                      )}

                      {!neighborhood3DLoading && neighborhood3D && neighborhood3D.buildings.length === 0 && (
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

                      {(() => {
                        const canComputeSunlight = hasSurroundingContext(neighborhood3D) && !surroundingLoading;
                        const sunlightLoading = canComputeSunlight && !sunlight;
                        const showSunlightCard = sunlightLoading || !!sunlight || sunlightUnavailable;
                        if (!showSunlightCard) return null;
                        const targetOrientation = neighborhood3D?.buildings.find(
                          b => b.pand_id === neighborhood3D.target_pand_id
                        )?.orientation_deg;
                        return (
                          <SunlightRiskCard
                            sunlight={sunlight ?? undefined}
                            loading={sunlightLoading}
                            unavailable={sunlightUnavailable}
                            orientationDeg={targetOrientation}
                            showHeatmap={showHeatmap}
                            onToggleHeatmap={setShowHeatmap}
                          />
                        );
                      })()}

                      {(shadowSnapshots || (neighborhood3D && neighborhood3D.buildings.length > 0 && !shadowSnapshots)) && (
                        <ShadowSnapshots
                          snapshots={shadowSnapshots ?? undefined}
                          loading={!!neighborhood3D && neighborhood3D.buildings.length > 0 && !shadowSnapshots}
                        />
                      )}

                      {(neighborhoodStatsLoading || neighborhoodStats || neighborhoodStatsError) && (
                        <>
                          <h3 id="section-neighborhood" className="app__section-label">{t('dossier.neighborhood')}</h3>
                          <NeighborhoodStatsCard
                            stats={neighborhoodStats ?? undefined}
                            loading={neighborhoodStatsLoading}
                            error={neighborhoodStatsError}
                            onRetry={neighborhoodStatsError ? handleRetryNeighborhoodStats : undefined}
                          />
                        </>
                      )}

                      {(tierBLoading || tierBData || tierBError) && (
                        <>
                          <h3 id="section-tier-b" className="app__section-label">{t('dossier.tierB')}</h3>
                          <TierBSignalsCard
                            data={tierBData ?? undefined}
                            loading={tierBLoading}
                            error={tierBError}
                            onRetry={tierBError ? handleRetryTierB : undefined}
                          />
                        </>
                      )}
                    </section>
                  </>
                )}

                {viewingQuestions && viewingQuestions.categories.length > 0 && (
                  <section role="region" aria-label={t('nav.jumpBriefing')}>
                    <h3 id="section-viewing-checklist" className="app__section-label">{t('dossier.viewingChecklist')}</h3>
                    <ViewingChecklist
                      categories={viewingQuestions.categories}
                      checkedQuestions={checkedQuestions}
                      onToggleQuestion={handleToggleQuestion}
                    />
                  </section>
                )}

                {address && buildingResponse && (
                  <ActionBar
                    isBookmarked={!!address.adresseerbaar_object_id && isInShortlist(address.adresseerbaar_object_id)}
                    onAddToShortlist={handleBookmark}
                    onExportBriefing={() => {
                      hapticTap();
                      setExportSheetOpen(true);
                    }}
                  />
                )}
              </DossierSheet>
            )}
          </>
        )}

        {activeScreen === 'shortlist' && (
          <ShortlistScreen
            items={shortlistItems}
            onRemove={handleRemoveFromShortlist}
            onCompare={() => {
              setActiveScreen('compare');
              setHashRoute('#/compare');
            }}
            onSelectAddress={handleSelectShortlistAddress}
          />
        )}

        {activeScreen === 'compare' && (
          <Suspense fallback={<div className="viewer-3d-status"><p>{t('viewer3d.loading')}</p></div>}>
            <CompareScreen
              items={shortlistItems}
              onBack={() => {
                setActiveScreen('shortlist');
                setHashRoute('#/saved');
              }}
            />
          </Suspense>
        )}

        {activeScreen === 'settings' && (
          <Suspense fallback={<div className="viewer-3d-status"><p>{t('viewer3d.loading')}</p></div>}>
            <SettingsScreen
              onClearRecent={handleClearRecent}
              onClearShortlist={handleClearShortlist}
              theme={themePreference}
              onThemeChange={handleThemeChange}
            />
          </Suspense>
        )}
      </main>

      {/* Export bottom sheet */}
      {address?.adresseerbaar_object_id && address.rd_x != null && address.rd_y != null && address.latitude != null && address.longitude != null && (
        <ExportBottomSheet
          isOpen={exportSheetOpen}
          onClose={() => setExportSheetOpen(false)}
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
          onGenerateStart={() => showToast(t('toast.exportStarted'))}
          onGenerateSuccess={() => showToast(t('toast.exportReady'))}
          onGenerateError={() => showToast(t('export.error'))}
        />
      )}

      <TabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        savedCount={shortlistItems.length}
        hasDossier={!!(address && buildingResponse)}
        inert={isOverlayModalOpen || undefined}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
