import { useTranslation } from 'react-i18next';
import {
  MATCH_FIRST_SURVEY_STORAGE_KEY,
  type MatchFirstSurveyAnswers,
  type MatchFirstSurveyIntent,
} from './SurveyShell';
import './MatchFirstLanding.css';

interface SurveyReviewProps {
  onBack: () => void;
  onComplete: (answers: MatchFirstSurveyAnswers) => void;
}

const VALID_INTENTS: MatchFirstSurveyIntent[] = ['buy', 'rent', 'both'];

function readStoredReviewAnswers(): MatchFirstSurveyAnswers | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MATCH_FIRST_SURVEY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MatchFirstSurveyAnswers>;
    return parsed.intent && VALID_INTENTS.includes(parsed.intent) ? { intent: parsed.intent } : null;
  } catch {
    return null;
  }
}

export default function SurveyReview({ onBack, onComplete }: SurveyReviewProps) {
  const { t } = useTranslation();
  const answers = readStoredReviewAnswers();
  const progressLabel = t('matchFirst.survey.progressLabel', { current: 1, total: 1 });

  if (!answers) {
    return (
      <section className="match-first-landing match-first-landing--simple" aria-labelledby="match-survey-review-title">
        <div className="match-first-landing__content">
          <p className="match-first-landing__eyebrow">{t('matchFirst.review.eyebrow')}</p>
          <h1 id="match-survey-review-title">{t('matchFirst.review.title')}</h1>
          <p className="match-first-landing__body" role="alert">{t('matchFirst.review.missingAnswer')}</p>
          <div className="match-first-landing__actions">
            <button type="button" className="match-first-landing__cta" onClick={onBack}>
              {t('matchFirst.common.backToSurvey')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="match-first-landing match-first-landing--simple" aria-labelledby="match-survey-review-title">
      <div className="match-first-landing__content">
        <progress
          role="progressbar"
          aria-label={progressLabel}
          max={1}
          value={1}
        />
        <p className="match-first-landing__body">{progressLabel}</p>

        <p className="match-first-landing__eyebrow">{t('matchFirst.review.eyebrow')}</p>
        <h1 id="match-survey-review-title">{t('matchFirst.review.title')}</h1>
        <p className="match-first-landing__body">{t('matchFirst.review.body')}</p>
        <dl className="match-first-landing__review">
          <div>
            <dt>{t('matchFirst.review.answerLabel')}</dt>
            <dd>{t(`matchFirst.survey.intent.${answers.intent}`)}</dd>
          </div>
        </dl>
        <div className="match-first-landing__actions">
          <button type="button" className="match-first-landing__address-link" onClick={onBack}>
            {t('matchFirst.survey.back')}
          </button>
          <button type="button" className="match-first-landing__cta" onClick={() => onComplete(answers)}>
            {t('matchFirst.review.showMatches')}
          </button>
        </div>
      </div>
    </section>
  );
}
