import { useTranslation } from 'react-i18next';
import type { MatchReportResponse, ReportClaim } from '../../types/match';
import {
  getMatchFreshnessStatusLabel,
  getMatchGenerationModeLabel,
} from './matchDisplayLabels';
import './MatchReport.css';

interface MatchReportProps {
  report: MatchReportResponse | null;
  loading?: boolean;
  errorCode?: string | null;
}

function SourceBadges({ sourceRefs }: { sourceRefs: string[] }) {
  const { t } = useTranslation();

  if (sourceRefs.length === 0) {
    return <span>{t('match.report.noSources')}</span>;
  }

  return (
    <span className="match-source-badges">
      {sourceRefs.map((sourceRef) => (
        <span className="match-source-badge" key={sourceRef}>{sourceRef}</span>
      ))}
    </span>
  );
}

function ClaimMetadata({ claim }: { claim: ReportClaim }) {
  const { t } = useTranslation();
  return (
    <dl className="match-report__claim-meta" aria-label={t('match.report.claimMetadata')}>
      <div>
        <dt>{t('match.report.confidence')}</dt>
        <dd>{claim.confidence.score}/100</dd>
      </div>
      <div>
        <dt>{t('match.report.freshness')}</dt>
        <dd>{getMatchFreshnessStatusLabel(claim.freshness_status, t)}</dd>
      </div>
      <div>
        <dt>{t('match.report.sources')}</dt>
        <dd><SourceBadges sourceRefs={claim.source_refs} /></dd>
      </div>
    </dl>
  );
}

export default function MatchReport({ report, loading = false, errorCode = null }: MatchReportProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <section className="match-report" aria-busy="true">
        <h1>{t('match.report.title')}</h1>
        <p role="status">{t('match.report.loading')}</p>
      </section>
    );
  }

  if (errorCode) {
    return (
      <section className="match-report" role="alert">
        <h1>{t('match.report.title')}</h1>
        <p>{t(errorCode)}</p>
      </section>
    );
  }

  if (!report) {
    return (
      <section className="match-report">
        <h1>{t('match.report.title')}</h1>
        <p>{t('match.report.empty')}</p>
      </section>
    );
  }

  return (
    <section className="match-report" aria-labelledby="match-report-title">
      <header className="match-report__header">
        <div>
          <p className="match-report__eyebrow">{t('match.report.eyebrow')}</p>
          <h1 id="match-report-title">{t('match.report.title')}</h1>
        </div>
        <p className="match-report__status">
          {report.generated_by === 'ai'
            ? t('match.report.status.ai')
            : t('match.report.status.fallback')}
        </p>
      </header>
      <div className="match-report__generation" aria-label={t('match.report.generationMetadata')}>
        <p>{t('match.report.aiLayer', { mode: getMatchGenerationModeLabel(report.generation_metadata.resolved_mode, t) })}</p>
        <p>{t('match.report.aiScoringBoundary')}</p>
      </div>

      {report.guardrail_events.length > 0 && (
        <p className="match-report__guardrail">
          {t('match.report.guardrailEvents', { count: report.guardrail_events.length })}
        </p>
      )}

      {report.sections.length === 0 ? (
        <p className="match-report__empty">{t('match.report.empty')}</p>
      ) : (
        <div className="match-report__sections">
          {report.sections.map((section) => (
            <article className="match-report__section" key={section.section_type}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
              {section.claims.map((claim) => (
                <article className="match-report__claim" key={`${section.section_type}-${claim.text}`}>
                  <p>{claim.text}</p>
                  <ClaimMetadata claim={claim} />
                </article>
              ))}
            </article>
          ))}
        </div>
      )}

      {report.limitations.length > 0 && (
        <footer className="match-report__limitations">
          <h2>{t('match.report.limitations')}</h2>
          <ul>
            {report.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </footer>
      )}
    </section>
  );
}
