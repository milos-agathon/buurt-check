import { useEffect } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { MatchFirstSurveyAnswers } from '../../types/matchFirst';
import { recordMatchFirstEvent } from '../../services/matchFirstAnalytics';
import { readMatchSessionSnapshot } from '../../services/matchSessionStorage';
import { MATCH_FIRST_SURVEY_QUESTION_COUNT, matchFirstSurveyQuestions } from './surveyQuestions';
import { surveyAnswersAreComplete } from './surveyValidation';
import './MatchFirstLanding.css';

interface SurveyReviewProps {
  sessionId?: string | null;
  answers?: MatchFirstSurveyAnswers | null;
  syncErrorKey?: string | null;
  syncing?: boolean;
  onBack: () => void;
  onComplete: (answers: MatchFirstSurveyAnswers) => void;
}

function readStoredReviewAnswers(sessionId?: string | null): MatchFirstSurveyAnswers | null {
  return readMatchSessionSnapshot(sessionId)?.answers ?? null;
}

function findOptionLabel(questionId: string, value: string | undefined): string | null {
  if (!value) return null;
  const question = matchFirstSurveyQuestions.find((item) => item.id === questionId);
  return question?.options?.find((option) => option.value === value)?.labelKey ?? null;
}

function findOptionLabels(questionId: string, values: string[] | undefined): string[] {
  if (!values?.length) return [];
  return values
    .map((value) => findOptionLabel(questionId, value))
    .filter((labelKey): labelKey is string => Boolean(labelKey));
}

function normalizeLocale(language: string | undefined): 'en' | 'nl' {
  return language?.startsWith('nl') ? 'nl' : 'en';
}

function formatCurrencyCents(value: number, locale: 'en' | 'nl'): string {
  return new Intl.NumberFormat(locale === 'nl' ? 'nl-NL' : 'en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.round(value / 100));
}

function joinLabels(labels: string[]): string | null {
  return labels.length > 0 ? labels.join(', ') : null;
}

function formatBudgetSummary(
  answers: MatchFirstSurveyAnswers,
  t: TFunction,
  locale: 'en' | 'nl',
): string | null {
  const budget = answers.budget;
  if (!budget) return null;
  const parts: string[] = [];
  if (typeof budget.buy_min === 'number' && typeof budget.buy_max === 'number') {
    parts.push(t('matchFirst.review.budgetBuyRange', {
      min: formatCurrencyCents(budget.buy_min, locale),
      max: formatCurrencyCents(budget.buy_max, locale),
    }));
  }
  if (typeof budget.rent_max === 'number') {
    parts.push(t('matchFirst.review.budgetRentMax', {
      amount: formatCurrencyCents(budget.rent_max, locale),
    }));
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

export default function SurveyReview({
  sessionId,
  answers: providedAnswers,
  syncErrorKey,
  syncing = false,
  onBack,
  onComplete,
}: SurveyReviewProps) {
  const { t, i18n } = useTranslation();
  const answers = providedAnswers ?? readStoredReviewAnswers(sessionId);
  const hasCompleteAnswers = surveyAnswersAreComplete(answers);
  const progressLabel = t('matchFirst.survey.progressLabel', {
    current: MATCH_FIRST_SURVEY_QUESTION_COUNT,
    total: MATCH_FIRST_SURVEY_QUESTION_COUNT,
  });
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    if (!hasCompleteAnswers) return;
    recordMatchFirstEvent('match_first_survey_review_shown', {
      locale,
      source: 'review',
      session_id: sessionId ?? 'default',
      total_steps: MATCH_FIRST_SURVEY_QUESTION_COUNT,
    });
  }, [hasCompleteAnswers, locale, sessionId]);

  if (!hasCompleteAnswers) {
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

  const priorityLabels = joinLabels(findOptionLabels('lifestyle_priorities', answers.lifestyle_priorities).map((key) => t(key)));
  const mustHaveLabels = joinLabels(findOptionLabels('must_haves', answers.must_haves).map((key) => t(key)));
  const housingLabels = joinLabels(findOptionLabels('housing_types', answers.housing_types).map((key) => t(key)));
  const intentLabelKey = findOptionLabel('intent', answers.intent);
  const areaLabelKey = findOptionLabel('area_character', answers.area_character);
  const budgetSummary = formatBudgetSummary(answers, t, locale);
  const commuteSummary = typeof answers.commute?.max_minutes === 'number'
    ? t('matchFirst.survey.inputs.commuteValue', { minutes: answers.commute.max_minutes })
    : null;

  return (
    <section className="match-first-landing match-first-landing--simple" aria-labelledby="match-survey-review-title">
      <div className="match-first-landing__content">
        <progress
          role="progressbar"
          aria-label={progressLabel}
          max={MATCH_FIRST_SURVEY_QUESTION_COUNT}
          value={MATCH_FIRST_SURVEY_QUESTION_COUNT}
        />
        <p className="match-first-landing__body">{progressLabel}</p>

        <p className="match-first-landing__eyebrow">{t('matchFirst.review.eyebrow')}</p>
        <h1 id="match-survey-review-title">{t('matchFirst.review.title')}</h1>
        <p className="match-first-landing__body">{t('matchFirst.review.body')}</p>
        <dl className="match-first-landing__review">
          <div>
            <dt>{t('matchFirst.review.answerLabel')}</dt>
            <dd>{intentLabelKey ? t(intentLabelKey) : ''}</dd>
          </div>
          {budgetSummary && (
            <div>
              <dt>{t('matchFirst.review.budgetLabel')}</dt>
              <dd>{budgetSummary}</dd>
            </div>
          )}
          <div>
            <dt>{t('matchFirst.review.anchorLabel')}</dt>
            <dd>{answers.anchor_location?.label}</dd>
          </div>
          {commuteSummary && (
            <div>
              <dt>{t('matchFirst.review.commuteLabel')}</dt>
              <dd>{commuteSummary}</dd>
            </div>
          )}
          {priorityLabels && (
            <div>
              <dt>{t('matchFirst.review.prioritiesLabel')}</dt>
              <dd>{priorityLabels}</dd>
            </div>
          )}
          {mustHaveLabels && (
            <div>
              <dt>{t('matchFirst.review.mustHavesLabel')}</dt>
              <dd>{mustHaveLabels}</dd>
            </div>
          )}
          {housingLabels && (
            <div>
              <dt>{t('matchFirst.review.housingLabel')}</dt>
              <dd>{housingLabels}</dd>
            </div>
          )}
          {areaLabelKey && (
            <div>
              <dt>{t('matchFirst.review.areaLabel')}</dt>
              <dd>{t(areaLabelKey)}</dd>
            </div>
          )}
        </dl>
        {syncErrorKey && (
          <p className="match-first-landing__validation" role="alert">
            {t(syncErrorKey)}
          </p>
        )}
        <div className="match-first-landing__actions">
          <button type="button" className="match-first-landing__address-link" onClick={onBack}>
            {t('matchFirst.survey.back')}
          </button>
          <button
            type="button"
            className="match-first-landing__cta"
            disabled={syncing}
            onClick={() => onComplete(answers)}
          >
            {t('matchFirst.review.showMatches')}
          </button>
        </div>
      </div>
    </section>
  );
}
