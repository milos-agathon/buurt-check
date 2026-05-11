import { useTranslation } from 'react-i18next';
import type { MatchReportResponse, ReportClaim } from '../../types/match';
import './MatchReport.css';

interface MatchReportProps {
  report: MatchReportResponse | null;
  loading?: boolean;
  errorCode?: string | null;
}

function formatSourceRefs(sourceRefs: string[]): string {
  return sourceRefs.length > 0 ? sourceRefs.join(', ') : '-';
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
        <dd>{claim.freshness_status}</dd>
      </div>
      <div>
        <dt>{t('match.report.sources')}</dt>
        <dd>{formatSourceRefs(claim.source_refs)}</dd>
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
