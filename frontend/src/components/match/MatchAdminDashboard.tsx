import { useTranslation } from 'react-i18next';
import type { MatchAdminHealthResponse } from '../../types/match';
import {
  getMatchAdminAnomalyLabel,
  getMatchAdminErrorLabel,
  getMatchAdminEventLabel,
  getMatchAdminSeverityLabel,
  getMatchAdminStatusLabel,
  getMatchAdminTraceStatusLabel,
  getMatchDimensionLabel,
  getMatchFreshnessStatusLabel,
  getMatchProviderHealthLabel,
  getMatchProviderModeLabel,
} from './matchDisplayLabels';
import './MatchAdminDashboard.css';

interface MatchAdminDashboardProps {
  health: MatchAdminHealthResponse | null;
  loading?: boolean;
  errorCode?: string | null;
}

function CountList({
  items,
  render,
  empty,
}: {
  items: unknown[];
  render: (item: unknown, index: number) => string;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="match-admin__muted">{empty}</p>;
  }
  return (
    <ul>
      {items.map((item, index) => (
        <li key={`${render(item, index)}-${index}`}>{render(item, index)}</li>
      ))}
    </ul>
  );
}

export default function MatchAdminDashboard({
  health,
  loading = false,
  errorCode = null,
}: MatchAdminDashboardProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <section className="match-admin" aria-busy="true">
        <h1>{t('match.admin.title')}</h1>
        <p role="status">{t('match.admin.loading')}</p>
      </section>
    );
  }

  if (errorCode) {
    return (
      <section className="match-admin" role="alert">
        <h1>{t('match.admin.title')}</h1>
        <p>{t(errorCode)}</p>
      </section>
    );
  }

  if (!health) {
    return (
      <section className="match-admin">
        <h1>{t('match.admin.title')}</h1>
        <p>{t('match.admin.empty')}</p>
      </section>
    );
  }

  return (
    <section className="match-admin" aria-labelledby="match-admin-title">
      <header className="match-admin__header">
        <div>
          <p className="match-admin__eyebrow">{t('match.admin.eyebrow')}</p>
          <h1 id="match-admin-title">{t('match.admin.title')}</h1>
        </div>
        <strong>{getMatchAdminStatusLabel(health.overall_status, t)}</strong>
      </header>

      <div className="match-admin__grid">
        <article>
          <h2>{t('match.admin.dataFreshness')}</h2>
          <CountList
            items={health.data_freshness}
            empty={t('match.admin.none')}
            render={(item) => {
              const indicator = item as MatchAdminHealthResponse['data_freshness'][number];
              return `${indicator.label}: ${getMatchFreshnessStatusLabel(indicator.status, t)} (${indicator.count})`;
            }}
          />
        </article>
        <article>
          <h2>{t('match.admin.missingData')}</h2>
          <CountList
            items={health.missing_data}
            empty={t('match.admin.none')}
            render={(item) => {
              const indicator = item as MatchAdminHealthResponse['missing_data'][number];
              return `${getMatchDimensionLabel(indicator.metric_key, t)}: ${indicator.count} ${getMatchAdminSeverityLabel(indicator.severity, t)}`;
            }}
          />
        </article>
        <article>
          <h2>{t('match.admin.sourceFailures')}</h2>
          <CountList
            items={health.source_failures}
            empty={t('match.admin.none')}
            render={(item) => {
              const failure = item as MatchAdminHealthResponse['source_failures'][number];
              return `${failure.provider_name}: ${getMatchAdminStatusLabel(failure.status, t)} - ${getMatchAdminErrorLabel(failure.error_code, t)}`;
            }}
          />
        </article>
        <article>
          <h2>{t('match.admin.scoringAnomalies')}</h2>
          <CountList
            items={health.scoring_anomalies}
            empty={t('match.admin.none')}
            render={(item) => {
              const anomaly = item as MatchAdminHealthResponse['scoring_anomalies'][number];
              return `${getMatchAdminAnomalyLabel(anomaly.anomaly_type, t)}: ${anomaly.count} ${getMatchAdminSeverityLabel(anomaly.severity, t)}`;
            }}
          />
        </article>
        <article>
          <h2>{t('match.admin.listingProviderStatus')}</h2>
          <CountList
            items={health.listing_provider_status}
            empty={t('match.admin.none')}
            render={(item) => {
              const provider = item as MatchAdminHealthResponse['listing_provider_status'][number];
              return `${provider.name}: ${getMatchProviderModeLabel(provider.mode, t)} - ${getMatchProviderHealthLabel(provider.health, t)}`;
            }}
          />
        </article>
        <article>
          <h2>{t('match.admin.alertDispatcherStatus')}</h2>
          <p>{`${health.alert_dispatcher_status.provider_name}: ${getMatchProviderHealthLabel(health.alert_dispatcher_status.health, t)}`}</p>
          <CountList
            items={health.alert_dispatcher_status.failures}
            empty={t('match.admin.none')}
            render={(item) => {
              const failure = item as MatchAdminHealthResponse['alert_dispatcher_status']['failures'][number];
              return `${failure.alert_id}: ${getMatchAdminErrorLabel(failure.error_code, t)}`;
            }}
          />
        </article>
        <article>
          <h2>{t('match.admin.reportGenerationFailures')}</h2>
          <CountList
            items={health.report_generation_failures}
            empty={t('match.admin.none')}
            render={(item) => {
              const failure = item as Record<string, unknown>;
              const reportId = failure.report_id == null || String(failure.report_id).trim() === ''
                ? t('match.admin.reportUnknown')
                : String(failure.report_id);
              return `${reportId}: ${getMatchAdminErrorLabel(String(failure.error_code ?? ''), t)}`;
            }}
          />
        </article>
        <article>
          <h2>{t('match.admin.mockVsLiveData')}</h2>
          <CountList
            items={[...health.mock_data_indicators, ...health.live_data_indicators]}
            empty={t('match.admin.none')}
            render={(item) => {
              const indicator = item as MatchAdminHealthResponse['mock_data_indicators'][number];
              return `${indicator.label}: ${getMatchFreshnessStatusLabel(indicator.status, t)} (${indicator.count})`;
            }}
          />
        </article>
        <article>
          <h2>{t('match.admin.productMetrics')}</h2>
          <CountList
            items={health.success_metrics}
            empty={t('match.admin.none')}
            render={(item) => {
              const metric = item as MatchAdminHealthResponse['success_metrics'][number];
              return `${getMatchAdminEventLabel(metric.event_name, t)}: ${metric.count}`;
            }}
          />
        </article>
        <article>
          <h2>{t('match.admin.prdTraceability')}</h2>
          <CountList
            items={health.prd_traceability}
            empty={t('match.admin.none')}
            render={(item) => {
              const trace = item as MatchAdminHealthResponse['prd_traceability'][number];
              return `${trace.fr_id}: ${trace.label} (${getMatchAdminTraceStatusLabel(trace.status, t)})`;
            }}
          />
        </article>
      </div>
    </section>
  );
}
