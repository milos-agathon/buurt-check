import { lazy, Suspense, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AddressSearch from './components/AddressSearch';
import AddressHeader from './components/AddressHeader';
import SummaryStrip from './components/SummaryStrip';
import BuildingFactsCard from './components/BuildingFactsCard';
import SunlightRiskCard from './components/SunlightRiskCard';
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
import { LayoutGroup, motion } from 'framer-motion';
import DossierSheet from './components/DossierSheet';
import type { SheetSnap } from './components/DossierSheet';
import { SkeletonCard, SkeletonGrid, SkeletonLine } from './components/SkeletonCard';
import { SPRING_REVEAL } from './config/springs';
import { hapticTap, hapticSuccess } from './utils/haptic';
import ActionBar from './components/ActionBar';
import ExportBottomSheet from './components/ExportBottomSheet';
import ShortlistScreen from './components/ShortlistScreen';
import TabBar from './components/TabBar';
import TopBar from './components/TopBar';
import type { TabId } from './components/TabBar';
import {
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
} from './services/api';
import { getShortlist, addToShortlist, removeFromShortlist, isInShortlist, clearShortlist } from './services/shortlist';
import { clearRecent } from './services/recentSearches';
import { getTheme, setTheme, applyTheme, listenForSystemChanges, type ThemePreference } from './services/theme';
import { ToastContainer, useToast } from './components/ui/Toast';
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

function App() {
  const { t, i18n } = useTranslation();
  const isNl = i18n.language === 'nl';
  const dossierSeed = useMemo(readDossierSeed, []);
  const { toasts, showToast, dismissToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('search');
  const [activeScreen, setActiveScreen] = useState<Screen>(
    dossierSeed?.address && dossierSeed?.buildingResponse ? 'dossier' : 'search',
  );
  const [themePreference, setThemePreference] = useState<ThemePreference>(getTheme());
  const [address, setAddress] = useState<ResolvedAddress | null>(dossierSeed?.address ?? null);
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
  const [shadowSnapshots, setShadowSnapshots] = useState<ShadowSnapshot[] | null>(
    dossierSeed?.shadowSnapshots ?? null,
  );
  const [viewingQuestions, setViewingQuestions] = useState<ViewingQuestionsResponse | null>(
    dossierSeed?.viewingQuestions ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('hidden');
  const [pendingDisplayName, setPendingDisplayName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const neighborhood3DRequestId = useRef(0);
  const previousScreenRef = useRef<Screen>('search');
  const [shortlistItems, setShortlistItems] = useState<ShortlistItem[]>(getShortlist());

  const [exportSheetOpen, setExportSheetOpen] = useState(false);

  // Risk detail view state.
  const [activeDetailCategory, setActiveDetailCategory] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [checkedQuestions, setCheckedQuestions] = useState<Set<string>>(new Set());

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

  const openSettings = useCallback(() => {
    if (activeScreen !== 'settings') {
      previousScreenRef.current = activeScreen;
      setActiveScreen('settings');
      return;
    }

    if (activeTab === 'saved') {
      setActiveScreen(
        previousScreenRef.current === 'settings' ? 'shortlist' : previousScreenRef.current,
      );
      return;
    }
    setActiveScreen(previousScreenRef.current === 'settings' ? 'search' : previousScreenRef.current);
  }, [activeScreen, activeTab]);

  const handleToggleQuestion = useCallback((id: string) => {
    setCheckedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBookmark = useCallback(() => {
    hapticTap();
    if (!address?.adresseerbaar_object_id) return;
    const vboId = address.adresseerbaar_object_id;
    if (isInShortlist(vboId)) {
      removeFromShortlist(vboId);
      showToast(t('toast.addressRemoved'));
    } else {
      const item: ShortlistItem = {
        vboId,
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
    hapticTap();
    setActiveTab(tab);
    if (tab === 'search' || tab === 'briefing') {
      setActiveScreen(address && buildingResponse ? 'dossier' : 'search');
    } else if (tab === 'saved') {
      setShortlistItems(getShortlist());
      setActiveScreen('shortlist');
    }
  }, [address, buildingResponse]);

  const handleRiskTileTap = useCallback((category: string) => {
    if (isTransitioning) return;
    setActiveDetailCategory(category);
  }, [isTransitioning]);

  const handleAddressSelect = async (suggestion: AddressSuggestion) => {
    setLoading(true);
    setError(null);
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
    setShadowSnapshots(null);
    setViewingQuestions(null);
    setActiveDetailCategory(null);
    setCheckedQuestions(new Set());
    const requestId = ++neighborhood3DRequestId.current;

    // T+0: immediately show dossier screen with sheet at peek
    setActiveScreen('dossier');
    setActiveTab('search');
    setSheetSnap('peek');
    setPendingDisplayName(suggestion.display_name);

    try {
      const resolved = await lookupAddress(suggestion.id);
      setAddress(resolved);

      const vboId = resolved.adresseerbaar_object_id;
      const { rd_x, rd_y, latitude, longitude } = resolved;
      if (vboId && rd_x != null && rd_y != null && latitude != null && longitude != null) {
        setRiskLoading(true);
        void (async () => {
          try {
            const risks = await getRiskCards(vboId, rd_x, rd_y, latitude, longitude);
            if (neighborhood3DRequestId.current === requestId) {
              setRiskCards(risks);
              setRiskLoading(false);
            }
          } catch {
            if (neighborhood3DRequestId.current === requestId) {
              setRiskError(true);
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
            // Risk comparisons are optional — silently ignore
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
            // Viewing questions are optional — silently ignore
          }
        })();

        setNeighborhoodStatsLoading(true);
        void (async () => {
          try {
            const stats = await getNeighborhoodStats(
              vboId, latitude, longitude, resolved.buurt_code ?? undefined,
            );
            if (neighborhood3DRequestId.current === requestId) {
              setNeighborhoodStats(stats);
              setNeighborhoodStatsLoading(false);
            }
          } catch {
            if (neighborhood3DRequestId.current === requestId) {
              setNeighborhoodStatsError(true);
              setNeighborhoodStatsLoading(false);
            }
          }
        })();

        setLivabilityLoading(true);
        void (async () => {
          try {
            const livData = await getLivability(vboId, rd_x, rd_y);
            if (neighborhood3DRequestId.current === requestId) {
              setLivability(livData);
              setLivabilityLoading(false);
            }
          } catch {
            if (neighborhood3DRequestId.current === requestId) {
              setLivabilityError(true);
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
            if (neighborhood3DRequestId.current === requestId) {
              setTierBData(tierB);
              setTierBLoading(false);
            }
          } catch {
            if (neighborhood3DRequestId.current === requestId) {
              setTierBError(true);
              setTierBLoading(false);
            }
          }
        })();

      }

      if (vboId) {
        const building = await getBuildingFacts(vboId);
        if (neighborhood3DRequestId.current !== requestId) return;
        setBuildingResponse(building);
        setLoading(false);
        setSheetSnap('half');

        // Chain property warnings AFTER building facts — needs constructionYear + numUnits
        if (rd_x != null && rd_y != null) {
          setPropertyWarningsLoading(true);
          const rdXVal = rd_x;
          const rdYVal = rd_y;
          void (async () => {
            try {
              const warnings = await getPropertyWarnings(vboId, rdXVal, rdYVal, {
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

        const pandId = building.building?.pand_id;
        if (pandId && rd_x != null && rd_y != null && latitude != null && longitude != null) {
          setNeighborhood3DLoading(true);
          setSurroundingLoading(true);
          let phase2Done = false;

          void (async () => {
            try {
              const target3d = await getBuilding3D(vboId, pandId, rd_x, rd_y, latitude, longitude);
              if (!phase2Done && neighborhood3DRequestId.current === requestId) {
                setNeighborhood3D(target3d);
                setNeighborhood3DLoading(false);
              }
            } catch { /* Phase 2 handles full fetch */ }
          })();

          void (async () => {
            try {
              const n3d = await getNeighborhood3D(vboId, pandId, rd_x, rd_y, latitude, longitude);
              phase2Done = true;
              if (neighborhood3DRequestId.current === requestId) {
                setNeighborhood3D(n3d);
                setNeighborhood3DLoading(false);
                setSurroundingLoading(false);
                const canCompute = n3d.buildings.length > 0 && !!n3d.target_pand_id;
                setSunlightUnavailable(!canCompute);
              }
            } catch {
              phase2Done = true;
              if (neighborhood3DRequestId.current === requestId) {
                setNeighborhood3DLoading(false);
                setSurroundingLoading(false);
                setSunlightUnavailable(true);
              }
            }
          })();
        } else {
          setSunlightUnavailable(true);
        }
      } else {
        setLoading(false);
      }
    } catch {
      setError(t('error.generic'));
      setLoading(false);
    }
  };

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
        ? t('sunlight.meaning.low')
        : sunlightScore >= 40
          ? t('sunlight.meaning.medium')
          : t('sunlight.meaning.high');

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
        : 'buurt-check';

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

  return (
    <div className="app">
      <TopBar title={topBarTitle} onSettingsClick={openSettings} />

      <main className="app__main">
        {(activeScreen === 'search' || activeScreen === 'dossier') && (
          <>
            <AddressSearch onSelect={handleAddressSelect} />
            {error && <p className="app__error">{error}</p>}

            {/* Map visible behind the sheet */}
            {address?.latitude && address?.longitude && (
              <Suspense fallback={<div className="viewer-3d-status"><p>{t('viewer3d.loading')}</p></div>}>
                <BuildingFootprintMap
                  lat={address.latitude}
                  lng={address.longitude}
                  footprint={buildingResponse?.building?.footprint_geojson}
                  zoom={15}
                />
              </Suspense>
            )}

            {/* DossierSheet slides up over the map */}
            <DossierSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
              {/* Skeleton address header while loading */}
              {loading && !buildingResponse && pendingDisplayName && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_REVEAL}
                >
                  <SkeletonCard>
                    <SkeletonLine width="70%" className="skeleton-line--lg" />
                    <SkeletonLine width="40%" />
                  </SkeletonCard>
                </motion.div>
              )}

              {address && buildingResponse && (
                <AddressHeader
                  address={address}
                  building={buildingResponse.building ?? undefined}
                  isBookmarked={!!address.adresseerbaar_object_id && isInShortlist(address.adresseerbaar_object_id)}
                  onBookmarkToggle={handleBookmark}
                />
              )}

              {/* AttentionSummary — delayed until both risks and warnings resolve */}
              {((!riskLoading && (riskCards || riskError)) &&
                (!propertyWarningsLoading && (propertyWarnings || propertyWarningsError))) && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_REVEAL}
                >
                  <AttentionSummary
                    riskCards={riskCards ?? undefined}
                    warnings={propertyWarnings ?? undefined}
                    sunlightScore={sunlight ? normalizeSunlightScore(sunlight.winter) : undefined}
                    livability={livability ?? undefined}
                  />
                </motion.div>
              )}

              {summaryPills.length > 0 && (
                <SummaryStrip
                  pills={summaryPills}
                  onPillTap={handleRiskTileTap}
                />
              )}

              {/* Skeleton risk grid while loading */}
              {loading && !riskCards && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_REVEAL}
                >
                  <SkeletonGrid />
                </motion.div>
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
                    onSunlightAnalysis={surroundingLoading ? undefined : setSunlight}
                    onShadowSnapshots={surroundingLoading ? undefined : setShadowSnapshots}
                  />
                </Suspense>
              )}
              {surroundingLoading && (
                <div className="viewer-3d-status">
                  <p>{t('viewer3d.loading')}</p>
                </div>
              )}

              {(() => {
                const canComputeSunlight = !!neighborhood3D
                  && neighborhood3D.buildings.length > 0
                  && !!neighborhood3D.target_pand_id
                  && !surroundingLoading;
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
                  />
                );
              })()}

              {(shadowSnapshots || (neighborhood3D && neighborhood3D.buildings.length > 0 && !shadowSnapshots)) && (
                <ShadowSnapshots
                  snapshots={shadowSnapshots ?? undefined}
                  loading={!!neighborhood3D && neighborhood3D.buildings.length > 0 && !shadowSnapshots}
                />
              )}

              {(riskLoading || riskCards || riskError || activeDetailCategory) && (
                <LayoutGroup>
                  {(riskLoading || riskCards || riskError) && (
                    <>
                      <h3 className="app__section-label">{t('dossier.riskAssessment')}</h3>
                      <RiskTilesGrid
                        risks={riskCards ?? undefined}
                        sunlight={sunlight ?? undefined}
                        onTileTap={handleRiskTileTap}
                      />
                      <RiskCardsPanel
                        risks={riskCards ?? undefined}
                        loading={riskLoading}
                        error={riskError}
                      />
                    </>
                  )}
                  {activeDetailCategory && (() => {
                    const detail = getDetailProps(activeDetailCategory);
                    if (!detail) return null;
                    return (
                      <RiskDetailView
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
                        onBack={() => {
                          setActiveDetailCategory(null);
                          setIsTransitioning(false);
                        }}
                        onAnimationStart={() => setIsTransitioning(true)}
                        onAnimationComplete={() => setIsTransitioning(false)}
                      />
                    );
                  })()}
                </LayoutGroup>
              )}

              {(neighborhoodStatsLoading || neighborhoodStats || neighborhoodStatsError) && (
                <>
                  <h3 className="app__section-label">{t('dossier.neighborhood')}</h3>
                  <NeighborhoodStatsCard
                    stats={neighborhoodStats ?? undefined}
                    loading={neighborhoodStatsLoading}
                    error={neighborhoodStatsError}
                  />
                </>
              )}

              {(livabilityLoading || livability || livabilityError) && (
                <>
                  <h3 className="app__section-label">{t('dossier.livability', 'Livability')}</h3>
                  <LivabilityCard
                    data={livability ?? undefined}
                    loading={livabilityLoading}
                    error={livabilityError}
                    onTap={livability ? () => setShowLivabilityDetail(true) : undefined}
                  />
                </>
              )}

              {showLivabilityDetail && livability && (
                <LivabilityDetailView
                  data={livability}
                  onClose={() => setShowLivabilityDetail(false)}
                />
              )}

              {(tierBLoading || tierBData || tierBError) && (
                <>
                  <h3 className="app__section-label">{t('dossier.tierB')}</h3>
                  <TierBSignalsCard
                    data={tierBData ?? undefined}
                    loading={tierBLoading}
                    error={tierBError}
                  />
                </>
              )}

              {(propertyWarningsLoading || propertyWarnings || propertyWarningsError) && (
                <>
                  <h3 className="app__section-label">{t('warnings.sectionTitle')}</h3>
                  <PropertyWarningsCard
                    data={propertyWarnings ?? undefined}
                    loading={propertyWarningsLoading}
                    error={propertyWarningsError}
                  />
                </>
              )}

              {/* Soil info — always shown when property warnings loaded (static info card) */}
              {propertyWarnings && (
                <>
                  <h3 className="app__section-label">{t('dossier.soilInfo', 'Soil & Pipes')}</h3>
                  <SoilInfoCard warnings={propertyWarnings ?? undefined} />
                </>
              )}

              {(loading || buildingResponse) && (
                <BuildingFactsCard
                  building={buildingResponse?.building ?? undefined}
                  loading={loading}
                />
              )}

              {viewingQuestions && viewingQuestions.categories.length > 0 && (
                <>
                  <h3 className="app__section-label">{t('dossier.viewingChecklist')}</h3>
                  <ViewingChecklist
                    categories={viewingQuestions.categories}
                    checkedQuestions={checkedQuestions}
                    onToggleQuestion={handleToggleQuestion}
                  />
                </>
              )}

              {address && buildingResponse && (
                <ActionBar
                  isBookmarked={!!address.adresseerbaar_object_id && isInShortlist(address.adresseerbaar_object_id)}
                  onAddToShortlist={handleBookmark}
                  onExportBriefing={() => setExportSheetOpen(true)}
                />
              )}
            </DossierSheet>
          </>
        )}

        {activeScreen === 'shortlist' && (
          <ShortlistScreen
            items={shortlistItems}
            onRemove={handleRemoveFromShortlist}
            onCompare={() => setActiveScreen('compare')}
            onSelectAddress={() => {}}
          />
        )}

        {activeScreen === 'compare' && (
          <Suspense fallback={<div className="viewer-3d-status"><p>{t('viewer3d.loading')}</p></div>}>
            <CompareScreen
              items={shortlistItems}
              onBack={() => setActiveScreen('shortlist')}
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
          onGenerateSuccess={() => { hapticSuccess(); showToast(t('toast.exportReady')); }}
          onGenerateError={() => showToast(t('export.error'))}
        />
      )}

      <TabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        savedCount={shortlistItems.length}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
