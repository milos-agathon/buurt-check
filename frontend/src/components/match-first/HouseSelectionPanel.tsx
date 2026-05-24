import { useTranslation } from 'react-i18next';
import type {
  MatchDossierCandidateAddress,
  MatchNeighborhoodBuildingFeature,
} from '../../types/matchFirst';

interface HouseSelectionPanelProps {
  buildings: MatchNeighborhoodBuildingFeature[];
  loading?: boolean;
  failed?: boolean;
  selectedBuildingId?: string | null;
  pendingBuildingId?: string | null;
  pendingCandidateId?: string | null;
  selectedBuilding?: MatchNeighborhoodBuildingFeature | null;
  fallbackKey?: string | null;
  candidateAddresses?: MatchDossierCandidateAddress[];
  candidateBuildingId?: string | null;
  onPreviewHouse?: SelectHouseHandler;
  onSelectCandidateAddress?: SelectCandidateAddressHandler;
  onSearchManually?: () => void;
  onBackToResults?: () => void;
}

type MaybeAsyncVoid = void | Promise<void>;
type SelectHouseHandler = (building: MatchNeighborhoodBuildingFeature) => MaybeAsyncVoid;
type SelectCandidateAddressHandler = (candidateAddress: MatchDossierCandidateAddress) => MaybeAsyncVoid;

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
  pendingBuildingId = null,
  pendingCandidateId = null,
  selectedBuilding = null,
  fallbackKey = null,
  candidateAddresses = [],
  candidateBuildingId = null,
  onPreviewHouse,
  onSelectCandidateAddress,
  onSearchManually,
  onBackToResults,
}: HouseSelectionPanelProps) {
  const { t } = useTranslation();
  const candidates = buildings.filter(isSelectableCandidate);
  const candidateHouseIndex = Math.max(
    1,
    candidates.findIndex((building) => building.building_id === candidateBuildingId) + 1,
  );
  const showRecoveryActions = fallbackKey === 'matchFirst.neighborhood.noReliableAddress'
    || fallbackKey === 'matchFirst.neighborhood.manualAddressRequired'
    || candidateAddresses.length > 0;
  const recoveryActions = showRecoveryActions ? (
    <div className="house-selection__actions">
      <button type="button" onClick={onSearchManually}>
        {t('matchFirst.neighborhood.searchManually')}
      </button>
      <button type="button" onClick={onBackToResults}>
        {t('matchFirst.neighborhood.backToResults')}
      </button>
    </div>
  ) : null;

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
        {recoveryActions}
      </div>
    );
  }

  return (
    <div className="house-selection" data-testid="house-selection-panel">
      <p className="house-selection__summary">
        {t('matchFirst.neighborhood.loadedHousesSummary', { count: candidates.length })}
      </p>
      <ul className="house-selection__list" aria-label={t('matchFirst.neighborhood.houseCandidatesLabel')}>
        {candidates.map((building, index) => {
          const descriptionId = `house-candidate-${index + 1}`;
          const isSelected = selectedBuildingId === building.building_id;
          return (
            <li key={building.building_id}>
              <button
                type="button"
                aria-label={t('matchFirst.neighborhood.showHouseOnMapForHouse', { index: index + 1 })}
                aria-describedby={descriptionId}
                disabled={!onPreviewHouse}
                aria-busy={pendingBuildingId === building.building_id}
                aria-pressed={isSelected}
                onClick={() => onPreviewHouse?.(building)}
              >
                {isSelected
                  ? t('matchFirst.neighborhood.houseSelected')
                  : t('matchFirst.neighborhood.showHouseOnMap')}
                <span id={descriptionId} className="sr-only">
                  {t(building.fallback_label_key ?? 'matchFirst.neighborhood.addressCandidate')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selectedBuilding && (
        <div className="house-selection__selected">
          <h3>{t('matchFirst.neighborhood.selectedHouseTitle', {
            index: Math.max(
              1,
              candidates.findIndex((building) => building.building_id === selectedBuilding.building_id) + 1,
            ),
          })}</h3>
          <p className="neighborhood-detail__muted">
            {t(selectedBuilding.fallback_label_key ?? 'matchFirst.neighborhood.addressCandidate')}
          </p>
        </div>
      )}
      {candidateAddresses.length > 0 && (
        <div className="house-selection__candidates">
          <p className="neighborhood-detail__muted">{t('matchFirst.neighborhood.candidateAddressesIntro')}</p>
          <ul
            className="house-selection__candidate-list"
            aria-label={t('matchFirst.neighborhood.candidateAddressesLabel')}
          >
            {candidateAddresses.map((candidateAddress, index) => {
              const label = t(
                candidateAddress.display_label_key,
                candidateAddress.display_params ?? {},
              );
              const descriptionId = `candidate-address-${index + 1}`;
              const sourceRefs = candidateAddress.source_refs.length > 0
                ? candidateAddress.source_refs.join(', ')
                : t('matchFirst.neighborhood.sourceUnavailable');
              return (
                <li key={candidateAddress.candidate_id}>
                  <button
                    type="button"
                    aria-label={t('matchFirst.neighborhood.chooseCandidateAddressForHouse', {
                      label,
                      houseIndex: candidateHouseIndex,
                    })}
                    aria-describedby={descriptionId}
                    disabled={!onSelectCandidateAddress || pendingCandidateId === candidateAddress.candidate_id}
                    aria-busy={pendingCandidateId === candidateAddress.candidate_id}
                    onClick={() => onSelectCandidateAddress?.(candidateAddress)}
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
      {fallbackKey && <p className="neighborhood-detail__muted" role="status">{t(fallbackKey)}</p>}
      {recoveryActions}
    </div>
  );
}
