import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './MatchFirstLanding.css';

export type MatchFirstSurveyIntent = 'buy' | 'rent' | 'both';

export interface MatchFirstSurveyAnswers {
  intent: MatchFirstSurveyIntent;
}

interface SurveyShellProps {
  onComplete?: (answers: MatchFirstSurveyAnswers) => void;
  onReview?: (answers: MatchFirstSurveyAnswers) => void;
  onBack?: () => void;
}

interface StoredSurveyAnswers {
  intent?: MatchFirstSurveyIntent;
}

const STORAGE_KEY = 'buurt-check-match-first-survey';
const INTENT_OPTIONS: { value: MatchFirstSurveyIntent; labelKey: string }[] = [
  { value: 'buy', labelKey: 'matchFirst.survey.intent.buy' },
  { value: 'rent', labelKey: 'matchFirst.survey.intent.rent' },
  { value: 'both', labelKey: 'matchFirst.survey.intent.both' },
];

function readStoredSurveyAnswers(): StoredSurveyAnswers {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredSurveyAnswers;
    return INTENT_OPTIONS.some((option) => option.value === parsed.intent) ? parsed : {};
  } catch {
    return {};
  }
}

function storeSurveyAnswers(answers: StoredSurveyAnswers) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
}

export { STORAGE_KEY as MATCH_FIRST_SURVEY_STORAGE_KEY, readStoredSurveyAnswers };

export default function SurveyShell({ onComplete, onReview, onBack }: SurveyShellProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<StoredSurveyAnswers>(readStoredSurveyAnswers);
  const [showValidation, setShowValidation] = useState(false);
  const progressLabel = t('matchFirst.survey.progressLabel', { current: 1, total: 1 });
  const validationId = 'match-first-survey-intent-validation';

  const handleSelectIntent = (intent: MatchFirstSurveyIntent) => {
    const nextAnswers = { intent };
    setAnswers(nextAnswers);
    storeSurveyAnswers(nextAnswers);
    setShowValidation(false);
  };

  const handleReview = () => {
    if (!answers.intent) {
      setShowValidation(true);
      return;
    }
    const completedAnswers = { intent: answers.intent };
    if (onReview) {
      onReview(completedAnswers);
      return;
    }
    onComplete?.(completedAnswers);
  };

  return (
    <section className="match-first-landing match-first-landing--simple" aria-labelledby="match-survey-shell-title">
      <div className="match-first-landing__content">
        <progress
          role="progressbar"
          aria-label={progressLabel}
          max={1}
          value={1}
        />
        <p className="match-first-landing__body">{progressLabel}</p>

        <p className="match-first-landing__eyebrow">{t('matchFirst.survey.questionEyebrow', { current: 1, total: 1 })}</p>
        <h1 id="match-survey-shell-title">{t('matchFirst.survey.intentQuestion')}</h1>
        <fieldset
          className="match-first-landing__actions match-first-landing__radio-group"
          aria-describedby={showValidation ? validationId : undefined}
        >
          <legend className="sr-only">{t('matchFirst.survey.intentQuestion')}</legend>
          {INTENT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`match-first-landing__cta match-first-landing__radio-choice${answers.intent === option.value ? ' match-first-landing__radio-choice--selected' : ''}`}
            >
              <input
                type="radio"
                name="match-first-intent"
                value={option.value}
                checked={answers.intent === option.value}
                aria-describedby={showValidation ? validationId : undefined}
                onChange={() => handleSelectIntent(option.value)}
              />
              {t(option.labelKey)}
            </label>
          ))}
        </fieldset>
        {showValidation && (
          <p id={validationId} className="match-first-landing__validation" role="alert">
            {t('matchFirst.survey.validationRequired')}
          </p>
        )}
        <div className="match-first-landing__actions">
          <button type="button" className="match-first-landing__address-link" onClick={onBack}>
            {t('matchFirst.survey.back')}
          </button>
          <button type="button" className="match-first-landing__cta" onClick={handleReview}>
            {t('matchFirst.survey.review')}
          </button>
        </div>
      </div>
    </section>
  );
}
