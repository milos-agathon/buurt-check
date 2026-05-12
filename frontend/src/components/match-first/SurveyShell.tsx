import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './MatchFirstLanding.css';

export type MatchFirstSurveyIntent = 'buy' | 'rent' | 'both';

export interface MatchFirstSurveyAnswers {
  intent: MatchFirstSurveyIntent;
}

interface SurveyShellProps {
  onComplete?: (answers: MatchFirstSurveyAnswers) => void;
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

export default function SurveyShell({ onComplete }: SurveyShellProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<StoredSurveyAnswers>(readStoredSurveyAnswers);
  const [stage, setStage] = useState<'question' | 'review'>('question');
  const [showValidation, setShowValidation] = useState(false);
  const progressLabel = t('matchFirst.survey.progressLabel', { current: 1, total: 1 });

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
    setStage('review');
  };

  const handleComplete = () => {
    if (!answers.intent) {
      setStage('question');
      setShowValidation(true);
      return;
    }
    onComplete?.({ intent: answers.intent });
  };

  if (stage === 'review' && answers.intent) {
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
            <button type="button" className="match-first-landing__address-link" onClick={() => setStage('question')}>
              {t('matchFirst.survey.back')}
            </button>
            <button type="button" className="match-first-landing__cta" onClick={handleComplete}>
              {t('matchFirst.review.showMatches')}
            </button>
          </div>
        </div>
      </section>
    );
  }

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
        <div className="match-first-landing__actions" role="group" aria-label={t('matchFirst.survey.intentQuestion')}>
          {INTENT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="match-first-landing__cta"
              aria-pressed={answers.intent === option.value}
              onClick={() => handleSelectIntent(option.value)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
        {showValidation && (
          <p className="match-first-landing__validation" role="alert">
            {t('matchFirst.survey.validationRequired')}
          </p>
        )}
        <div className="match-first-landing__actions">
          <button type="button" className="match-first-landing__cta" onClick={handleReview}>
            {t('matchFirst.survey.review')}
          </button>
        </div>
      </div>
    </section>
  );
}
