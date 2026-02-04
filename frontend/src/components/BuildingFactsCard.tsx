import { useTranslation } from 'react-i18next';
import type { BuildingFacts } from '../types/api';
import './BuildingFactsCard.css';

interface Props {
  building: BuildingFacts | undefined;
  loading: boolean;
}

export default function BuildingFactsCard({ building, loading }: Props) {
  const { t, i18n } = useTranslation();
  const isNl = i18n.language === 'nl';

  if (loading) {
    return <div className="building-card building-card--loading">{t('building.loading')}</div>;
  }

  if (!building) {
    return <div className="building-card building-card--empty">{t('building.noBuilding')}</div>;
  }

  const status = isNl ? building.status : (building.status_en || building.status);
  const use = isNl ? building.intended_use : building.intended_use_en;

  return (
    <div className="building-card">
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
        <dd className="building-card__mono">{building.pand_id}</dd>
      </dl>
      <p className="building-card__source">{t('building.source')}</p>
    </div>
  );
}
