import { useTranslation } from 'react-i18next';
import type { SunlightResult } from '../types/api';
import './SunlightRiskCard.css';

interface Props {
  sunlight?: SunlightResult;
  loading?: boolean;
  unavailable?: boolean;
}

function getRiskLevel(winterHours: number): 'low' | 'medium' | 'high' {
  if (winterHours < 2) return 'high';
  if (winterHours <= 4) return 'medium';
  return 'low';
}

export default function SunlightRiskCard({ sunlight, loading, unavailable }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="sunlight-card">
        <h2 className="sunlight-card__title">{t('sunlight.title')}</h2>
        <p className="sunlight-card__loading">{t('sunlight.loading')}</p>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="sunlight-card">
        <h2 className="sunlight-card__title">{t('sunlight.title')}</h2>
        <p className="sunlight-card__unavailable">{t('sunlight.unavailable')}</p>
      </div>
    );
  }

  if (!sunlight) return null;

  const risk = getRiskLevel(sunlight.winter);
  const sourceDate = sunlight.analysisYear ? String(sunlight.analysisYear) : t('sunlight.currentYear');

  return (
    <div className="sunlight-card">
      <h2 className="sunlight-card__title">{t('sunlight.title')}</h2>

      <div className={`sunlight-card__badge sunlight-card__badge--${risk}`}>
        {t(`sunlight.level.${risk}`)}
      </div>

      <p className="sunlight-card__meaning">
        {t(`sunlight.meaning.${risk}`)}
      </p>

      <table className="sunlight-card__table">
        <tbody>
          <tr>
            <td>{t('sunlight.winterHours')}</td>
            <td className="sunlight-card__value">{sunlight.winter} {t('sunlight.hoursUnit')}</td>
          </tr>
          <tr>
            <td>{t('sunlight.equinoxHours')}</td>
            <td className="sunlight-card__value">{sunlight.equinox} {t('sunlight.hoursUnit')}</td>
          </tr>
          <tr>
            <td>{t('sunlight.summerHours')}</td>
            <td className="sunlight-card__value">{sunlight.summer} {t('sunlight.hoursUnit')}</td>
          </tr>
          <tr>
            <td>{t('sunlight.annualAverage')}</td>
            <td className="sunlight-card__value sunlight-card__value--annual">
              {sunlight.annualAverage} {t('sunlight.hoursUnit')}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="sunlight-card__tip">{t('sunlight.viewingTip')}</p>
      <p className="sunlight-card__source">{t('sunlight.sourceWithDate', { date: sourceDate })}</p>
    </div>
  );
}
