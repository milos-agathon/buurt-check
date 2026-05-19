import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMatchResults, getMatchStatus } from '../../services/matchFirstApi';
import { recordMatchFirstEvent } from '../../services/matchFirstAnalytics';
import type {
  MatchJobPublicStatus,
  MatchJobStage,
  MatchJobStatusResponse,
  MatchResultsResponse,
  MatchRunResponse,
} from '../../types/matchFirst';
import './MatchFirstLanding.css';
import './MatchingProgressScreen.css';

type ProgressInput = MatchRunResponse | MatchJobStatusResponse;

interface MatchingProgressScreenProps {
  sessionId: string;
  initialStatus?: ProgressInput | null;
  onBackToSurvey: () => void;
  onRetry: () => void;
  onComplete: (status: MatchJobStatusResponse, results: MatchResultsResponse) => void;
}

const DEFAULT_POLL_AFTER_MS = 1000;
const TERMINAL_SUCCESS_STATUSES = new Set<MatchJobPublicStatus>([
  'completed',
  'completed_with_fallback',
  'completed_no_strong_matches',
]);
const TERMINAL_FAILED_STATUSES = new Set<MatchJobPublicStatus>(['failed', 'expired', 'cancelled']);

const STAGE_MESSAGE_KEYS: Record<MatchJobStage, string> = {
  created: 'matchFirst.progress.created',
  queued: 'matchFirst.progress.queued',
  reading_preferences: 'matchFirst.progress.reading_preferences',
  building_profile: 'matchFirst.progress.building_profile',
  loading_neighborhood_data: 'matchFirst.progress.loading_neighborhood_data',
  applying_filters: 'matchFirst.progress.applying_filters',
  running_models: 'matchFirst.progress.running_models',
  scoring_tradeoffs: 'matchFirst.progress.scoring_tradeoffs',
  preparing_map: 'matchFirst.progress.preparing_map',
  completed: 'matchFirst.progress.completed',
  completed_with_fallback: 'matchFirst.progress.completed_with_fallback',
  completed_no_strong_matches: 'matchFirst.progress.completed_no_strong_matches',
  failed: 'matchFirst.progress.failed',
  expired: 'matchFirst.progress.expired',
};

function statusEventName(status: MatchJobPublicStatus) {
  if (status === 'created' || status === 'queued') return 'match_job_queued';
  if (status === 'running') return 'match_job_running';
  if (status === 'matching_slow') return 'match_job_slow';
  if (status === 'completed') return 'match_job_completed';
  if (status === 'completed_with_fallback') return 'match_job_completed_with_fallback';
  if (status === 'completed_no_strong_matches') return 'match_job_completed_no_strong_matches';
  if (TERMINAL_FAILED_STATUSES.has(status)) return 'match_job_failed';
  return null;
}

function progressMessageKey(status: ProgressInput | null): string {
  if (!status) return 'matchFirst.progress.queued';
  if (status.status === 'matching_slow') return 'matchFirst.progress.matching_slow';
  if (status.status === 'cancelled') return 'matchFirst.progress.cancelled';
  return STAGE_MESSAGE_KEYS[status.stage] ?? 'matchFirst.progress.queued';
}

function isStatusResponse(status: ProgressInput): status is MatchJobStatusResponse {
  return 'updated_at' in status;
}

function terminalResultsMatch(status: MatchJobStatusResponse, results: MatchResultsResponse): boolean {
  return Boolean(status.result_set_id)
    && results.session_id === status.session_id
    && results.job_id === status.job_id
    && results.status === status.status
    && results.result_set_id === status.result_set_id;
}

function toStatusResponse(status: ProgressInput): MatchJobStatusResponse {
  if (isStatusResponse(status)) return status;
  return {
    ...status,
    model_mode: 'weighted_scoring',
    model_version: 'match-score-v1',
    scoring_version: 'match-score-v1',
    evaluation_status: 'not_validated_no_labels',
    fallback_used: false,
    fallback_reason_code: null,
    result_set_id: null,
    error_code: null,
    runtime_ms: 0,
    updated_at: new Date(0).toISOString(),
  };
}

export default function MatchingProgressScreen({
  sessionId,
  initialStatus = null,
  onBackToSurvey,
  onRetry,
  onComplete,
}: MatchingProgressScreenProps) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<ProgressInput | null>(initialStatus);
  const [unavailable, setUnavailable] = useState(false);
  const [resultsUnavailable, setResultsUnavailable] = useState(false);
  const [terminalStatusPendingResults, setTerminalStatusPendingResults] = useState<MatchJobStatusResponse | null>(null);
  const completedRef = useRef(false);
  const recordedStatusesRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const locale = i18n.resolvedLanguage?.startsWith('nl') ? 'nl' : 'en';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const recordStatus = useCallback((nextStatus: ProgressInput) => {
    const key = `${nextStatus.job_id}:${nextStatus.status}:${nextStatus.stage}`;
    if (recordedStatusesRef.current.has(key)) return;
    recordedStatusesRef.current.add(key);
    const eventName = statusEventName(nextStatus.status);
    if (!eventName) return;
    recordMatchFirstEvent(eventName, {
      locale,
      source: 'progress',
      session_id: sessionId,
      job_id: nextStatus.job_id,
      status: nextStatus.status,
      stage: nextStatus.stage,
      progress: nextStatus.progress,
      runtime_ms: isStatusResponse(nextStatus) ? nextStatus.runtime_ms : 0,
      fallback_reason_code: isStatusResponse(nextStatus) ? nextStatus.fallback_reason_code ?? undefined : undefined,
      error_code: isStatusResponse(nextStatus) ? nextStatus.error_code ?? undefined : undefined,
    });
  }, [locale, sessionId]);

  const verifyTerminalResults = useCallback(async (terminalStatus: MatchJobStatusResponse) => {
    if (completedRef.current) return;
    setTerminalStatusPendingResults(terminalStatus);
    setResultsUnavailable(false);
    let reason = 'result_fetch_failed';
    try {
      const results = await getMatchResults(sessionId);
      if (!terminalStatus.result_set_id) {
        reason = 'missing_result_set_id';
        throw new Error('match.results.missing_result_set_id');
      }
      if (!terminalResultsMatch(terminalStatus, results)) {
        reason = 'result_mismatch';
        throw new Error('match.results.mismatch');
      }
      if (!mountedRef.current) return;
      completedRef.current = true;
      onComplete(terminalStatus, results);
    } catch {
      if (!mountedRef.current) return;
      setResultsUnavailable(true);
      recordMatchFirstEvent('match_results_unavailable', {
        locale,
        source: 'progress',
        session_id: terminalStatus.session_id,
        job_id: terminalStatus.job_id,
        result_set_id: terminalStatus.result_set_id ?? undefined,
        status: terminalStatus.status,
        reason,
      });
    }
  }, [locale, onComplete, sessionId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    completedRef.current = false;
    recordedStatusesRef.current = new Set();
    setResultsUnavailable(false);
    setTerminalStatusPendingResults(null);

    const handleStatus = async (
      nextStatus: ProgressInput,
      options: { pollImmediately?: boolean } = {},
    ) => {
      if (cancelled) return;
      setUnavailable(false);
      setResultsUnavailable(false);
      setStatus(nextStatus);
      recordStatus(nextStatus);
      if (TERMINAL_SUCCESS_STATUSES.has(nextStatus.status)) {
        await verifyTerminalResults(toStatusResponse(nextStatus));
        return;
      }
      if (TERMINAL_FAILED_STATUSES.has(nextStatus.status)) return;
      if (
        options.pollImmediately
        && !isStatusResponse(nextStatus)
        && (nextStatus.status === 'created' || nextStatus.status === 'queued')
      ) {
        void pollStatus();
        return;
      }
      const pollAfterMs = 'poll_after_ms' in nextStatus && typeof nextStatus.poll_after_ms === 'number'
        ? nextStatus.poll_after_ms
        : DEFAULT_POLL_AFTER_MS;
      timer = window.setTimeout(() => {
        void pollStatus();
      }, pollAfterMs);
    };

    const pollStatus = async () => {
      try {
        const nextStatus = await getMatchStatus(sessionId);
        await handleStatus(nextStatus);
      } catch {
        if (!cancelled) {
          setStatus(null);
          setUnavailable(true);
          setResultsUnavailable(false);
        }
      }
    };

    if (initialStatus) {
      void handleStatus(initialStatus, { pollImmediately: true });
    } else {
      void pollStatus();
    }

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [initialStatus, recordStatus, sessionId, verifyTerminalResults]);

  const messageKey = useMemo(() => {
    if (unavailable) return 'matchFirst.recovery.body';
    if (status?.status === 'matching_slow') return 'matchFirst.failure.slowBackend';
    if (status && TERMINAL_FAILED_STATUSES.has(status.status)) return 'matchFirst.failure.failedBackend';
    return progressMessageKey(status);
  }, [status, unavailable]);

  if (unavailable && !status) {
    return (
      <section className="match-first-landing match-first-landing--simple matching-progress" aria-labelledby="match-run-title">
        <div className="match-first-landing__content">
          <p className="match-first-landing__eyebrow">{t('matchFirst.recovery.eyebrow')}</p>
          <h1 id="match-run-title">{t('matchFirst.recovery.title')}</h1>
          <p className="match-first-landing__body" role="status">{t(messageKey)}</p>
          <div className="match-first-landing__actions">
            <button type="button" className="match-first-landing__cta" onClick={onBackToSurvey}>
              {t('matchFirst.recovery.cta')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (resultsUnavailable && terminalStatusPendingResults) {
    return (
      <section className="match-first-landing match-first-landing--simple matching-progress" aria-labelledby="match-run-title">
        <div className="match-first-landing__content">
          <p className="match-first-landing__eyebrow">{t('matchFirst.results.eyebrow')}</p>
          <h1 id="match-run-title">{t('matchFirst.results.unavailableTitle')}</h1>
          <p className="match-first-landing__body" role="status" aria-live="polite">
            {t('matchFirst.results.unavailableBody')}
          </p>
          <p className="matching-progress__hint">{t('matchFirst.results.runRequired')}</p>
          <div className="match-first-landing__actions">
            <button
              type="button"
              className="match-first-landing__cta"
              onClick={() => {
                void verifyTerminalResults(terminalStatusPendingResults);
              }}
            >
              {t('matchFirst.results.retry')}
            </button>
            <button type="button" className="match-first-landing__address-link" onClick={onBackToSurvey}>
              {t('matchFirst.results.backToSurvey')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const progressValue = Math.max(0, Math.min(100, status?.progress ?? 5));
  const failed = status ? TERMINAL_FAILED_STATUSES.has(status.status) : false;
  const progressLabel = t('matchFirst.progress.progressLabel', { progress: progressValue });

  return (
    <section className="match-first-landing match-first-landing--simple matching-progress" aria-labelledby="match-run-title">
      <div className="match-first-landing__content">
        <div className="matching-progress__map-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="match-first-landing__eyebrow">{t('matchFirst.progress.eyebrow')}</p>
        <h1 id="match-run-title">
          {failed ? t('matchFirst.results.unavailableTitle') : t('matchFirst.progress.title')}
        </h1>
        <p className="match-first-landing__body" role="status" aria-live="polite">
          {t(messageKey)}
        </p>
        {!failed && (
          <>
            <progress
              className="matching-progress__bar"
              aria-label={progressLabel}
              aria-valuenow={progressValue}
              max={100}
              value={progressValue}
            />
            <p className="matching-progress__hint">{t('matchFirst.progress.honesty')}</p>
          </>
        )}
        <div className="match-first-landing__actions">
          {failed && (
            <button
              type="button"
              className="match-first-landing__cta"
              onClick={() => {
                recordMatchFirstEvent('match_job_retry_clicked', {
                  locale,
                  source: 'progress',
                  session_id: sessionId,
                  job_id: status?.job_id,
                  status: status?.status,
                });
                onRetry();
              }}
            >
              {t('matchFirst.progress.retry')}
            </button>
          )}
          <button
            type="button"
            className={failed ? 'match-first-landing__address-link' : 'match-first-landing__cta'}
            onClick={onBackToSurvey}
          >
            {t('matchFirst.progress.backToSurvey')}
          </button>
        </div>
      </div>
    </section>
  );
}
