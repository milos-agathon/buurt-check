import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import AddressSearch from './components/AddressSearch';
import BuildingFactsCard from './components/BuildingFactsCard';
import BuildingFootprintMap from './components/BuildingFootprintMap';
import LanguageToggle from './components/LanguageToggle';
import NeighborhoodViewer3D from './components/NeighborhoodViewer3D';
import SunlightRiskCard from './components/SunlightRiskCard';
import ShadowSnapshots from './components/ShadowSnapshots';
import RiskCardsPanel from './components/RiskCardsPanel';
import { lookupAddress, getBuildingFacts, getNeighborhood3D, getRiskCards } from './services/api';
import type {
  AddressSuggestion,
  ResolvedAddress,
  BuildingFactsResponse,
  Neighborhood3DResponse,
  RiskCardsResponse,
  SunlightResult,
  ShadowSnapshot,
} from './types/api';
import './App.css';

function App() {
  const { t } = useTranslation();
  const [address, setAddress] = useState<ResolvedAddress | null>(null);
  const [buildingResponse, setBuildingResponse] = useState<BuildingFactsResponse | null>(null);
  const [neighborhood3D, setNeighborhood3D] = useState<Neighborhood3DResponse | null>(null);
  const [neighborhood3DLoading, setNeighborhood3DLoading] = useState(false);
  const [riskCards, setRiskCards] = useState<RiskCardsResponse | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState(false);
  const [sunlight, setSunlight] = useState<SunlightResult | null>(null);
  const [sunlightUnavailable, setSunlightUnavailable] = useState(false);
  const [shadowSnapshots, setShadowSnapshots] = useState<ShadowSnapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const neighborhood3DRequestId = useRef(0);

  const handleAddressSelect = async (suggestion: AddressSuggestion) => {
    setLoading(true);
    setError(null);
    setBuildingResponse(null);
    setNeighborhood3D(null);
    setNeighborhood3DLoading(false);
    setRiskCards(null);
    setRiskLoading(false);
    setRiskError(false);
    setSunlight(null);
    setSunlightUnavailable(false);
    setShadowSnapshots(null);
    const requestId = ++neighborhood3DRequestId.current;

    try {
      const resolved = await lookupAddress(suggestion.id);
      setAddress(resolved);

      const vboId = resolved.adresseerbaar_object_id;
      const { rd_x, rd_y, latitude, longitude } = resolved;
      if (vboId && rd_x != null && rd_y != null && latitude != null && longitude != null) {
        setRiskLoading(true);
        void (async () => {
          try {
            const risks = await getRiskCards(
              vboId,
              rd_x,
              rd_y,
              latitude,
              longitude,
            );
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
      }

      if (vboId) {
        const building = await getBuildingFacts(vboId);
        setBuildingResponse(building);
        setLoading(false);

        // Fire 3D fetch in background (non-blocking, does not delay building facts)
        const pandId = building.building?.pand_id;
        if (pandId && rd_x != null && rd_y != null && latitude != null && longitude != null) {
          setNeighborhood3DLoading(true);
          void (async () => {
            try {
              const n3d = await getNeighborhood3D(
                vboId,
                pandId,
                rd_x,
                rd_y,
                latitude,
                longitude,
              );
              if (neighborhood3DRequestId.current === requestId) {
                setNeighborhood3D(n3d);
                setNeighborhood3DLoading(false);
                const canCompute = n3d.buildings.length > 0 && !!n3d.target_pand_id;
                setSunlightUnavailable(!canCompute);
              }
            } catch {
              if (neighborhood3DRequestId.current === requestId) {
                setNeighborhood3DLoading(false);
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

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">{t('app.title')}</h1>
          <p className="app__subtitle">{t('app.subtitle')}</p>
        </div>
        <LanguageToggle />
      </header>

      <main className="app__main">
        <AddressSearch onSelect={handleAddressSelect} />

        {error && <p className="app__error">{error}</p>}

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
            onSunlightAnalysis={setSunlight}
            onShadowSnapshots={setShadowSnapshots}
          />
        )}

        {(riskLoading || riskCards || riskError) && (
          <RiskCardsPanel
            risks={riskCards ?? undefined}
            loading={riskLoading}
            error={riskError}
          />
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
            && !!neighborhood3D.target_pand_id;
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
      </main>
    </div>
  );
}

export default App;
