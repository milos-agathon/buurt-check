import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BuildingFacts, ResolvedAddress } from '../types/api';
import AddressHeader from './AddressHeader';
import SectionSkeleton from './ui/SectionSkeleton';
import './BuildingFactsCard.css';

interface Props {
  address?: ResolvedAddress;
  building: BuildingFacts | undefined;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onChangeAddress?: () => void;
}

function BuildingFactsCard({
  address,
  building,
  loading,
  error,
  onRetry,
  onChangeAddress,
}: Props) {
  const { t, i18n } = useTranslation();
  const isNl = i18n.language === 'nl';
  const cardClassName = `building-card${address ? ' building-card--with-address' : ''}`;
  const addressHeader = address ? (
    <AddressHeader
      address={address}
      building={building}
      onChangeAddress={onChangeAddress}
      variant="embedded"
    />
  ) : null;

  if (loading) {
    return (
      <div
        className={cardClassName}
        data-testid="building-facts-skeleton"
        data-state="loading"
        aria-busy="true"
        aria-label={t('building.loading')}
      >
        {addressHeader}
        <div className="building-card__body">
          <SectionSkeleton variant="building-facts" />
        </div>
      </div>
    );
  }

  if (error && !building) {
    return (
      <div className={`${cardClassName} building-card--error`} data-state="error">
        {addressHeader}
        <div className="building-card__body building-card__body--error">
          <p className="building-card__error">{error}</p>
          {onRetry && (
            <button
              type="button"
              className="app__retry-button building-card__retry"
              onClick={onRetry}
            >
              {t('error.retry', 'Retry')}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!building) {
    return (
      <div className={`${cardClassName} building-card--empty`}>
        {addressHeader}
        <div className="building-card__body">{t('building.noBuilding')}</div>
      </div>
    );
  }

  const status = isNl ? building.status : (building.status_en || building.status);
  const use = isNl ? building.intended_use : building.intended_use_en;
  const hasMultipleAddressUnits = building.num_units != null && building.num_units > 1;

  return (
    <div className={cardClassName}>
      {addressHeader}
      <div className="building-card__body">
        <h2 className="building-card__title">{t('building.title')}</h2>
        <dl className="building-card__facts">
          {building.construction_year && (
            <>
              <dt>{t('building.constructionYear')}</dt>
              <dd>{building.construction_year}</dd>
            </>
          )}
          {status && (
            <>
              <dt>{t('building.status')}</dt>
              <dd>{status}</dd>
            </>
          )}
          {use.length > 0 && (
            <>
              <dt>{t('building.intendedUse')}</dt>
              <dd>{use.join(', ')}</dd>
            </>
          )}
          {building.floor_area_m2 != null && (
            <>
              <dt>{t('building.floorArea')}</dt>
              <dd>{building.floor_area_m2} m²</dd>
            </>
          )}
          {building.num_units != null && (
            <>
              <dt>{t('building.units')}</dt>
              <dd>{building.num_units}</dd>
            </>
          )}
          <dt>{t('building.pandId')}</dt>
          <dd>
            <span className="building-card__mono">{building.pand_id}</span>
            <span className="building-card__field-note">{t('building.pandIdNote')}</span>
          </dd>
        </dl>
        {hasMultipleAddressUnits && (
          <p className="building-card__notice">
            {t('building.multipleUnitsNotice', { count: building.num_units })}
          </p>
        )}
        <p className="building-card__source">{t('building.source')}</p>
      </div>
    </div>
  );
}

export default memo(BuildingFactsCard);
