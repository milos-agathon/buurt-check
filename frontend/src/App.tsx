import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import AddressSearch from './components/AddressSearch';
import AddressHeader from './components/AddressHeader';
import SummaryStrip from './components/SummaryStrip';
import BuildingFactsCard from './components/BuildingFactsCard';
import BuildingFootprintMap from './components/BuildingFootprintMap';
import NeighborhoodViewer3D from './components/NeighborhoodViewer3D';
import SunlightRiskCard from './components/SunlightRiskCard';
import ShadowSnapshots from './components/ShadowSnapshots';
import RiskCardsPanel from './components/RiskCardsPanel';
import RiskTilesGrid from './components/RiskTilesGrid';
import RiskDetailView from './components/RiskDetailView';
import NeighborhoodStatsCard from './components/NeighborhoodStatsCard';
import ViewingChecklist from './components/ViewingChecklist';
import ActionBar from './components/ActionBar';
import ShortlistScreen from './components/ShortlistScreen';
import CompareScreen from './components/CompareScreen';
import SettingsScreen from './components/SettingsScreen';
import TabBar from './components/TabBar';
import TopBar from './components/TopBar';
import type { TabId } from './components/TabBar';
import { lookupAddress, getBuildingFacts, getBuilding3D, getNeighborhood3D, getRiskCards, getNeighborhoodStats, getViewingQuestions } from './services/api';
import { getShortlist, addToShortlist, removeFromShortlist, isInShortlist, clearShortlist } from './services/shortlist';
import { clearRecent } from './services/recentSearches';
import { getTheme, setTheme, applyTheme, listenForSystemChanges, type ThemePreference } from './services/theme';
import type {
  AddressSuggestion,
  ResolvedAddress,
  BuildingFactsResponse,
  Neighborhood3DResponse,
  NeighborhoodStatsResponse,
  RiskCardsResponse,
  SunlightResult,
  ShadowSnapshot,
  ViewingQuestionsResponse,
  SeverityLevel,
  RiskLevel,
  ShortlistItem,
} from './types/api';
import './App.css';

type Screen = 'search' | 'dossier' | 'shortlist' | 'compare' | 'settings';

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

function App() {
  const { t, i18n } = useTranslation();
  const isNl = i18n.language === 'nl';
  const [activeTab, setActiveTab] = useState<TabId>('search');
  const [activeScreen, setActiveScreen] = useState<Screen>('search');
  const [themePreference, setThemePreference] = useState<ThemePreference>(getTheme());

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

  const [address, setAddress] = useState<ResolvedAddress | null>(null);
  const [buildingResponse, setBuildingResponse] = useState<BuildingFactsResponse | null>(null);
  const [neighborhood3D, setNeighborhood3D] = useState<Neighborhood3DResponse | null>(null);
  const [neighborhood3DLoading, setNeighborhood3DLoading] = useState(false);
  const [surroundingLoading, setSurroundingLoading] = useState(false);
  const [riskCards, setRiskCards] = useState<RiskCardsResponse | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState(false);
  const [neighborhoodStats, setNeighborhoodStats] = useState<NeighborhoodStatsResponse | null>(null);
  const [neighborhoodStatsLoading, setNeighborhoodStatsLoading] = useState(false);
  const [neighborhoodStatsError, setNeighborhoodStatsError] = useState(false);
  const [sunlight, setSunlight] = useState<SunlightResult | null>(null);
  const [sunlightUnavailable, setSunlightUnavailable] = useState(false);
  const [shadowSnapshots, setShadowSnapshots] = useState<ShadowSnapshot[] | null>(null);
  const [viewingQuestions, setViewingQuestions] = useState<ViewingQuestionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const neighborhood3DRequestId = useRef(0);
  const [shortlistItems, setShortlistItems] = useState<ShortlistItem[]>(getShortlist());

  // Risk detail view state
  const [activeDetailCategory, setActiveDetailCategory] = useState<string | null>(null);
  const [checkedQuestions, setCheckedQuestions] = useState<Set<string>>(new Set());

  const handleToggleQuestion = useCallback((id: string) => {
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
      addToShortlist(item);
    }
    setShortlistItems(getShortlist());
  }, [address, buildingResponse, riskCards, sunlight]);

  const handleRemoveFromShortlist = useCallback((vboId: string) => {
    removeFromShortlist(vboId);
    setShortlistItems(getShortlist());
  }, []);

  const handleClearShortlist = useCallback(() => {
    clearShortlist();
    setShortlistItems([]);
  }, []);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'search' || tab === 'briefing') {
      setActiveScreen(address && buildingResponse ? 'dossier' : 'search');
    } else if (tab === 'saved') {
      setShortlistItems(getShortlist());
      setActiveScreen('shortlist');
    }
  }, [address, buildingResponse]);

  const handleAddressSelect = async (suggestion: AddressSuggestion) => {
    setLoading(true);
    setError(null);
    setBuildingResponse(null);
    setNeighborhood3D(null);
    setNeighborhood3DLoading(false);
    setSurroundingLoading(false);
    setRiskCards(null);
    setRiskLoading(false);
    setRiskError(false);
    setNeighborhoodStats(null);
    setNeighborhoodStatsLoading(false);
    setNeighborhoodStatsError(false);
    setSunlight(null);
    setSunlightUnavailable(false);
    setShadowSnapshots(null);
    setViewingQuestions(null);
    setActiveDetailCategory(null);
    setCheckedQuestions(new Set());
    const requestId = ++neighborhood3DRequestId.current;

    try {
      const resolved = await lookupAddress(suggestion.id);
      setAddress(resolved);
      setActiveScreen('dossier');
      setActiveTab('search');

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

        // Fetch viewing questions
        void (async () => {
          try {
            const questions = await getViewingQuestions(vboId, rd_x, rd_y, latitude, longitude);
            if (neighborhood3DRequestId.current === requestId) {
              setViewingQuestions(questions);
            }
          } catch { /* Non-critical, silently fail */ }
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
      }

      if (vboId) {
        const building = await getBuildingFacts(vboId);
        setBuildingResponse(building);
        setLoading(false);

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

  // Get risk detail data for active category
  const getDetailProps = (category: string) => {
    if (!riskCards) return null;
    switch (category) {
      case 'noise': return {
        titleKey: 'risk.noise.title',
        score: riskCards.noise.score,
        severity: levelToSeverity(riskCards.noise.level, riskCards.noise.score),
        meaning: isNl ? riskCards.noise.summary_nl : riskCards.noise.summary,
        source: riskCards.noise.source,
        sourceDate: riskCards.noise.source_date,
      };
      case 'air': return {
        titleKey: 'risk.air.title',
        score: riskCards.air_quality.score,
        severity: levelToSeverity(riskCards.air_quality.level, riskCards.air_quality.score),
        meaning: isNl ? riskCards.air_quality.summary_nl : riskCards.air_quality.summary,
        source: riskCards.air_quality.source,
        sourceDate: riskCards.air_quality.source_date,
      };
      case 'climate': return {
        titleKey: 'risk.climate.title',
        score: riskCards.climate_stress.score,
        severity: levelToSeverity(riskCards.climate_stress.level, riskCards.climate_stress.score),
        meaning: isNl ? riskCards.climate_stress.summary_nl : riskCards.climate_stress.summary,
        source: riskCards.climate_stress.source,
        sourceDate: riskCards.climate_stress.source_date,
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
  const activeQuestions = activeDetailCategory && viewingQuestions
    ? viewingQuestions.categories
        .find(c => c.name.toLowerCase() === activeDetailCategory)
        ?.questions
    : undefined;

  return (
    <div className="app">
      <TopBar title={topBarTitle} />

      <main className="app__main">
        {(activeScreen === 'search' || activeScreen === 'dossier') && (
          <>
            <AddressSearch onSelect={handleAddressSelect} />

            {error && <p className="app__error">{error}</p>}

            {address && buildingResponse && (
              <AddressHeader
                address={address}
                building={buildingResponse.building ?? undefined}
                isBookmarked={!!address.adresseerbaar_object_id && isInShortlist(address.adresseerbaar_object_id)}
                onBookmarkToggle={handleBookmark}
              />
            )}

            {summaryPills.length > 0 && (
              <SummaryStrip
                pills={summaryPills}
                onPillTap={(category) => setActiveDetailCategory(category)}
              />
            )}

            {address?.latitude && address?.longitude && (
              <BuildingFootprintMap
                lat={address.latitude}
                lng={address.longitude}
                footprint={buildingResponse?.building?.footprint_geojson}
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
              <NeighborhoodViewer3D
                buildings={neighborhood3D.buildings}
                targetPandId={neighborhood3D.target_pand_id ?? undefined}
                center={neighborhood3D.center}
                onSunlightAnalysis={surroundingLoading ? undefined : setSunlight}
                onShadowSnapshots={surroundingLoading ? undefined : setShadowSnapshots}
              />
            )}
            {surroundingLoading && neighborhood3D && neighborhood3D.buildings.length > 0 && (
              <div className="viewer-3d-status">
                <p>{t('viewer3d.loading')}</p>
              </div>
            )}

            {(riskLoading || riskCards || riskError) && (
              <>
                <h3 className="app__section-label">{t('dossier.riskAssessment')}</h3>
                <RiskTilesGrid
                  risks={riskCards ?? undefined}
                  sunlight={sunlight ?? undefined}
                  onTileTap={(category) => setActiveDetailCategory(category)}
                />
                <RiskCardsPanel
                  risks={riskCards ?? undefined}
                  loading={riskLoading}
                  error={riskError}
                />
              </>
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

            {(loading || buildingResponse) && (
              <BuildingFactsCard
                building={buildingResponse?.building ?? undefined}
                loading={loading}
              />
            )}

            {(() => {
              const canComputeSunlight = !!neighborhood3D
                && neighborhood3D.buildings.length > 0
                && !!neighborhood3D.target_pand_id
                && !surroundingLoading;
              const sunlightLoading = canComputeSunlight && !sunlight;
              const showSunlightCard = sunlightLoading || !!sunlight || sunlightUnavailable;
              if (!showSunlightCard) return null;
              return (
                <SunlightRiskCard
                  sunlight={sunlight ?? undefined}
                  loading={sunlightLoading}
                  unavailable={sunlightUnavailable}
                />
              );
            })()}

            {(shadowSnapshots || (neighborhood3D && neighborhood3D.buildings.length > 0 && !shadowSnapshots)) && (
              <ShadowSnapshots
                snapshots={shadowSnapshots ?? undefined}
                loading={!!neighborhood3D && neighborhood3D.buildings.length > 0 && !shadowSnapshots}
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
              />
            )}
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
          <CompareScreen
            items={shortlistItems}
            onBack={() => setActiveScreen('shortlist')}
          />
        )}

        {activeScreen === 'settings' && (
          <SettingsScreen
            onClearRecent={clearRecent}
            onClearShortlist={handleClearShortlist}
            theme={themePreference}
            onThemeChange={handleThemeChange}
          />
        )}
      </main>

      {/* Risk detail overlay */}
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
            questions={activeQuestions}
            checkedQuestions={checkedQuestions}
            onToggleQuestion={handleToggleQuestion}
            source={detail.source}
            sourceDate={detail.sourceDate}
            onBack={() => setActiveDetailCategory(null)}
          />
        );
      })()}

      <TabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        savedCount={shortlistItems.length}
      />
    </div>
  );
}

export default App;
