import { useTranslation } from 'react-i18next';
import type { MatchCompareResponse } from '../../types/match';
import {
  getMatchComparisonValueLabel,
  getMatchDimensionLabel,
  getMatchFreshnessStatusLabel,
} from './matchDisplayLabels';
import './MatchComparison.css';

interface MatchComparisonProps {
  comparison: MatchCompareResponse | null;
  loading?: boolean;
  errorCode?: string | null;
}

export default function MatchComparison({
  comparison,
  loading = false,
  errorCode = null,
}: MatchComparisonProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <section className="match-comparison" aria-busy="true">
        <h1>{t('match.comparison.title')}</h1>
        <p role="status">{t('match.comparison.loading')}</p>
      </section>
    );
  }

  if (errorCode) {
    return (
      <section className="match-comparison" role="alert">
        <h1>{t('match.comparison.title')}</h1>
        <p>{t(errorCode)}</p>
      </section>
    );
  }

  if (!comparison || comparison.neighborhoods.length === 0) {
    return (
      <section className="match-comparison">
        <h1>{t('match.comparison.title')}</h1>
        <p>{t('match.comparison.empty')}</p>
      </section>
    );
  }

  return (
    <section className="match-comparison" aria-labelledby="match-comparison-title">
      <header className="match-comparison__header">
        <p>{t('match.comparison.eyebrow')}</p>
        <h1 id="match-comparison-title">{t('match.comparison.title')}</h1>
        <p>{t('match.comparison.selectionCount', { count: comparison.neighborhoods.length })}</p>
      </header>

      <div className="match-comparison__summary" aria-label={t('match.comparison.summary')}>
        {comparison.neighborhoods.map((neighborhood) => (
          <article className="match-comparison__card" key={neighborhood.neighborhood_id}>
            <h2>{neighborhood.name}</h2>
            <p>{neighborhood.municipality}</p>
            <dl>
              <div>
                <dt>{t('match.comparison.score')}</dt>
                <dd>{neighborhood.score}/100</dd>
              </div>
              <div>
                <dt>{t('match.comparison.confidence')}</dt>
                <dd>{neighborhood.confidence.score}/100</dd>
              </div>
              <div>
                <dt>{t('match.comparison.freshness')}</dt>
                <dd>{getMatchFreshnessStatusLabel(neighborhood.freshness_status, t)}</dd>
              </div>
            </dl>
            <p>{t('match.comparison.evidenceCount', { count: neighborhood.evidence.length })}</p>
            <p>{t('match.comparison.tradeoffCount', { count: neighborhood.tradeoffs.length })}</p>
            {neighborhood.missing_data.length > 0 && (
              <p className="match-comparison__missing">
                {t('match.comparison.missingData', {
                  items: neighborhood.missing_data
                    .map((item) => getMatchDimensionLabel(item, t))
                    .join(', '),
                })}
              </p>
            )}
          </article>
        ))}
      </div>

      <div className="match-comparison__table-wrap">
        <table className="match-comparison__table">
          <caption>{t('match.comparison.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('match.comparison.indicator')}</th>
              {comparison.neighborhoods.map((neighborhood) => (
                <th scope="col" key={neighborhood.neighborhood_id}>{neighborhood.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.indicators.map((row) => (
              <tr key={row.indicator_key}>
                <th scope="row">{t(row.label_code)}</th>
                {comparison.neighborhoods.map((neighborhood) => {
                  const cell = row.cells[neighborhood.neighborhood_id];
                  return (
                    <td
                      key={neighborhood.neighborhood_id}
                      data-column-label={neighborhood.name}
                      data-state={cell.state}
                    >
                      <strong>{getMatchComparisonValueLabel(cell.display_value, t)}</strong>
                      <span>{t(`match.comparison.state.${cell.state}`)}</span>
                      <small>
                        {t('match.comparison.cellMeta', {
                          confidence: cell.confidence,
                          freshness: getMatchFreshnessStatusLabel(cell.freshness_status, t),
                        })}
                      </small>
                      <small>{cell.sources.map((source) => source.source_name).join(', ') || t('match.common.noSource')}</small>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
