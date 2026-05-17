import { useTranslation } from 'react-i18next';
import type { MatchNeighborhoodBuildingFeature } from '../../types/matchFirst';

interface HouseSelectionPanelProps {
  buildings: MatchNeighborhoodBuildingFeature[];
  loading?: boolean;
  failed?: boolean;
  selectedBuildingId?: string | null;
  fallbackKey?: string | null;
  onSelectHouse?: (building: MatchNeighborhoodBuildingFeature) => void;
}

function isSelectableCandidate(building: MatchNeighborhoodBuildingFeature): boolean {
  return building.address_resolution === 'resolved'
    || building.address_resolution === 'candidate'
    || building.address_resolution === 'manual_required';
}

export default function HouseSelectionPanel({
  buildings,
  loading = false,
  failed = false,
  selectedBuildingId = null,
  fallbackKey = null,
  onSelectHouse,
}: HouseSelectionPanelProps) {
  const { t } = useTranslation();
  const candidates = buildings.filter(isSelectableCandidate);

  if (loading) {
    return <p className="neighborhood-detail__muted" role="status">{t('matchFirst.neighborhood.housesLoading')}</p>;
  }

  if (failed) {
    return <p className="neighborhood-detail__muted" role="status">{t('matchFirst.neighborhood.housesUnavailable')}</p>;
  }

  if (candidates.length === 0) {
    return (
      <div className="house-selection" data-testid="house-selection-panel">
        <p className="neighborhood-detail__muted">{t('matchFirst.neighborhood.noReliableAddress')}</p>
        {fallbackKey && <p className="neighborhood-detail__muted" role="status">{t(fallbackKey)}</p>}
      </div>
    );
  }

  return (
    <div className="house-selection" data-testid="house-selection-panel">
      <ul className="house-selection__list" aria-label={t('matchFirst.neighborhood.houseCandidatesLabel')}>
        {candidates.map((building) => (
          <li key={building.building_id}>
            <button
              type="button"
              aria-label={t('matchFirst.neighborhood.selectHouse')}
              disabled={!onSelectHouse || selectedBuildingId === building.building_id}
              aria-pressed={selectedBuildingId === building.building_id}
              onClick={() => onSelectHouse?.(building)}
            >
              {selectedBuildingId === building.building_id
                ? t('matchFirst.neighborhood.houseSelected')
                : t('matchFirst.neighborhood.selectHouse')}
              <span className="sr-only" aria-hidden="true">
                {t(building.fallback_label_key ?? 'matchFirst.neighborhood.addressCandidate')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {fallbackKey && <p className="neighborhood-detail__muted" role="status">{t(fallbackKey)}</p>}
    </div>
  );
}