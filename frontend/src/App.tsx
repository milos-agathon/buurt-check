import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddressSearch from './components/AddressSearch';
import BuildingFactsCard from './components/BuildingFactsCard';
import BuildingFootprintMap from './components/BuildingFootprintMap';
import LanguageToggle from './components/LanguageToggle';
import { lookupAddress, getBuildingFacts } from './services/api';
import type { AddressSuggestion, ResolvedAddress, BuildingFactsResponse } from './types/api';
import './App.css';

function App() {
  const { t } = useTranslation();
  const [address, setAddress] = useState<ResolvedAddress | null>(null);
  const [buildingResponse, setBuildingResponse] = useState<BuildingFactsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddressSelect = async (suggestion: AddressSuggestion) => {
    setLoading(true);
    setError(null);
    setBuildingResponse(null);

    try {
      const resolved = await lookupAddress(suggestion.id);
      setAddress(resolved);

      if (resolved.adresseerbaar_object_id) {
        const building = await getBuildingFacts(resolved.adresseerbaar_object_id);
        setBuildingResponse(building);
      }
    } catch {
      setError(t('error.generic'));
    } finally {
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

        {(loading || buildingResponse) && (
          <BuildingFactsCard
            building={buildingResponse?.building ?? undefined}
            loading={loading}
          />
        )}
      </main>
    </div>
  );
}

export default App;
