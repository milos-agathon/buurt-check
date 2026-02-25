import { useTranslation } from 'react-i18next';
import SeverityBadge from './ui/SeverityBadge';
import type { SunlightResult } from '../types/api';
import type { SeverityLevel } from '../types/api';
import './SunlightRiskCard.css';

interface Props {
  sunlight?: SunlightResult;
  loading?: boolean;
  unavailable?: boolean;
  orientationDeg?: number;
  showHeatmap?: boolean;
  onToggleHeatmap?: (show: boolean) => void;
}

const AXIS_LABELS: [number, string][] = [
  [22.5, 'ns'],
  [67.5, 'nesw'],
  [112.5, 'ew'],
  [157.5, 'senw'],
  [180.1, 'ns'],
];

export function getAxisLabel(deg: number): string {
  const normalized = ((deg % 180) + 180) % 180;
  for (const [threshold, key] of AXIS_LABELS) {
    if (normalized < threshold) return key;
  }
  return 'ns';
}

function getSeverity(winterHours: number): SeverityLevel {
  const score = Math.max(0, Math.min(100, Math.round((winterHours / 6) * 100)));
  if (score >= 70) return 'good';
  if (score >= 40) return 'moderate';
  if (score >= 20) return 'poor';
  return 'critical';
}

function svfMeaningKey(svf: number): 'open' | 'moderate' | 'enclosed' {
  if (svf >= 0.6) return 'open';
  if (svf >= 0.3) return 'moderate';
  return 'enclosed';
}

export default function SunlightRiskCard({
  sunlight,
  loading,
  unavailable,
  orientationDeg,
  showHeatmap = false,
  onToggleHeatmap,
}: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="sunlight-card">
        <h2 className="sunlight-card__title">{t('sunlight.title_full')}</h2>
        <p className="sunlight-card__subtitle">{t('sunlight.subtitle')}</p>
        <p className="sunlight-card__loading">{t('sunlight.loading')}</p>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="sunlight-card" data-state="unavailable">
        <h2 className="sunlight-card__title">{t('sunlight.title_full')}</h2>
        <p className="sunlight-card__subtitle">{t('sunlight.subtitle')}</p>
        <SeverityBadge severity="unavailable" />
        <p className="sunlight-card__meaning">{t('sunlight.meaning.unavailable')}</p>
        <p className="sunlight-card__tip">{t('sunlight.viewingTip')}</p>
        <p className="sunlight-card__source">{t('sunlight.sourceUnavailable')}</p>
      </div>
    );
  }

  if (!sunlight) return null;

  const severity = getSeverity(sunlight.winter);
  const sourceDate = sunlight.analysisYear ? String(sunlight.analysisYear) : t('sunlight.currentYear');
  const hasHeatmapData = (
    (sunlight.perPointAnnual?.length ?? 0) > 0
    && (sunlight.roofGridPoints?.length ?? 0) > 0
    && sunlight.perPointAnnual?.length === sunlight.roofGridPoints?.length
  );
  const svfValue = sunlight.svf;
  const svfPercent = svfValue != null ? Math.round(svfValue * 100) : null;

  return (
    <div className="sunlight-card">
      <h2 className="sunlight-card__title">{t('sunlight.title_full')}</h2>
      <p className="sunlight-card__subtitle">{t('sunlight.subtitle')}</p>

      <SeverityBadge severity={severity} />

      <p className="sunlight-card__meaning">
        {t(`sunlight.meaning.${severity}`)}
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

      {hasHeatmapData && (
        <label className="sunlight-card__heatmap-toggle">
          <input
            type="checkbox"
            checked={showHeatmap}
            onChange={(event) => onToggleHeatmap?.(event.target.checked)}
          />
          {t('sunlight.heatmap_toggle')}
        </label>
      )}

      {svfPercent != null && svfValue != null && (
        <div className="sunlight-card__svf">
          <h3 className="sunlight-card__svf-title">{t('sunlight.svf_title')}</h3>
          <p className="sunlight-card__svf-subtitle">{t('sunlight.svf_subtitle')}</p>
          <p className="sunlight-card__svf-value">{svfPercent}%</p>
          <p className="sunlight-card__svf-meaning">
            {t(`sunlight.svf_meaning.${svfMeaningKey(svfValue)}`)}
          </p>
          <p className="sunlight-card__svf-note">{t('sunlight.svf_note')}</p>
        </div>
      )}

      {orientationDeg != null && (
        <div className="sunlight-card__orientation">
          <p className="sunlight-card__orientation-label">
            {t('sunlight.orientation')}: {t(`sunlight.axis.${getAxisLabel(orientationDeg)}`)} ({Math.round(orientationDeg)}°)
          </p>
          <p className="sunlight-card__orientation-note">{t('sunlight.orientationNote')}</p>
        </div>
      )}

      <div className="sunlight-card__disclaimers">
        <p className="sunlight-card__disclaimer">{t('sunlight.disclaimer_geometry')}</p>
        <p className="sunlight-card__disclaimer">{t('sunlight.disclaimer_objects')}</p>
        <p className="sunlight-card__disclaimer">{t('sunlight.disclaimer_approx')}</p>
      </div>

      <p className="sunlight-card__tip">{t('sunlight.viewingTip')}</p>
      <p className="sunlight-card__source">{t('sunlight.sourceWithDate', { date: sourceDate })}</p>
    </div>
  );
}
