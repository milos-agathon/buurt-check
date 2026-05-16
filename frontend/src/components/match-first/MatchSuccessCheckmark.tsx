import { useTranslation } from 'react-i18next';
import type { MatchJobTerminalSuccessStatus } from '../../types/matchFirst';
import './MatchFirstLanding.css';
import './MatchSuccessCheckmark.css';

interface MatchSuccessCheckmarkProps {
  status: MatchJobTerminalSuccessStatus;
  reducedMotion: boolean;
  onOpenResults: () => void;
}

function bodyKeyForStatus(status: MatchJobTerminalSuccessStatus): string {
  if (status === 'completed_with_fallback') return 'matchFirst.failure.completedWithFallback';
  if (status === 'completed_no_strong_matches') return 'matchFirst.failure.noStrongMatches';
  return 'matchFirst.success.readyBody';
}

export default function MatchSuccessCheckmark({
  status,
  reducedMotion,
  onOpenResults,
}: MatchSuccessCheckmarkProps) {
  const { t } = useTranslation();
  const markClassName = reducedMotion
    ? 'match-success-checkmark__mark match-success-checkmark__mark--static'
    : 'match-success-checkmark__mark match-success-checkmark__mark--animated';

  return (
    <section
      className="match-first-landing match-first-landing--simple match-success-checkmark"
      aria-labelledby="match-success-title"
    >
      <div className="match-success-checkmark__content">
        <div
          className={markClassName}
          role="img"
          aria-label={t('matchFirst.success.checkmarkLabel')}
          data-testid="match-success-checkmark"
          data-motion={reducedMotion ? 'reduced' : 'animated'}
        >
          <svg viewBox="0 0 160 160" aria-hidden="true" focusable="false">
            <circle className="match-success-checkmark__circle" cx="80" cy="80" r="62" />
            <path className="match-success-checkmark__path" d="M47 82.5 70.5 106 116 56" />
          </svg>
        </div>
        <p className="match-first-landing__eyebrow">{t('matchFirst.success.eyebrow')}</p>
        <h1 id="match-success-title">{t('matchFirst.success.readyTitle')}</h1>
        <p className="match-first-landing__body" role="status">{t(bodyKeyForStatus(status))}</p>
        <div className="match-first-landing__actions match-success-checkmark__actions">
          <button type="button" className="match-first-landing__cta" onClick={onOpenResults}>
            {t('matchFirst.success.openMap')}
          </button>
        </div>
      </div>
    </section>
  );
}
