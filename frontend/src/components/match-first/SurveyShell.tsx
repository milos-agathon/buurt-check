import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  MatchFirstBudgetAnswer,
  MatchFirstIntent,
  MatchFirstSurveyAnswer,
  MatchFirstSurveyAnswers,
  MatchFirstSurveyQuestion,
  MatchFirstSurveyQuestionId,
  MatchSessionRecoveryHandler,
} from '../../types/matchFirst';
import { recordMatchFirstEvent } from '../../services/matchFirstAnalytics';
import { MatchFirstApiError, patchMatchSessionAnswers } from '../../services/matchFirstApi';
import {
  readMatchSessionSnapshot,
  saveMatchSessionSnapshot,
} from '../../services/matchSessionStorage';
import AnchorLocationQuestion from './AnchorLocationQuestion';
import BudgetRangeQuestion from './BudgetRangeQuestion';
import CommuteSliderQuestion from './CommuteSliderQuestion';
import MultiSelectQuestion from './MultiSelectQuestion';
import SingleSelectQuestion from './SingleSelectQuestion';
import SurveyQuestionScreen from './SurveyQuestionScreen';
import { MATCH_FIRST_SURVEY_QUESTION_COUNT, matchFirstSurveyQuestions } from './surveyQuestions';
import { answerIsValid } from './surveyValidation';
import './MatchFirstLanding.css';
import './SurveyShell.css';

interface SurveyShellProps {
  sessionId?: string | null;
  step?: number;
  onStepChange?: (step: number, sessionId?: string) => void;
  onComplete?: (answers: MatchFirstSurveyAnswers) => void;
  onReview?: (answers: MatchFirstSurveyAnswers) => void;
  onBack?: () => void;
  onRecoverSession?: MatchSessionRecoveryHandler;
}

function clampStep(step: number | undefined): number {
  if (!step || !Number.isInteger(step)) return 1;
  return Math.min(Math.max(step, 1), MATCH_FIRST_SURVEY_QUESTION_COUNT);
}

function normalizeLocale(language: string | undefined): 'en' | 'nl' {
  return language?.startsWith('nl') ? 'nl' : 'en';
}

function readStoredSurveyAnswers(sessionId?: string | null): MatchFirstSurveyAnswers {
  return readMatchSessionSnapshot(sessionId)?.answers ?? {};
}

function readAnswer(answers: MatchFirstSurveyAnswers, questionId: MatchFirstSurveyQuestionId): MatchFirstSurveyAnswer | undefined {
  return answers[questionId] as MatchFirstSurveyAnswer | undefined;
}

function analyticsAnswerType(question: MatchFirstSurveyQuestion): string {
  if (question.type === 'budgetRange') return 'range';
  if (question.type === 'commuteSlider') return 'slider';
  if (question.type === 'anchor') return 'anchor';
  return question.type;
}

function analyticsAnswerCount(value: MatchFirstSurveyAnswer): number {
  if (Array.isArray(value)) return value.length;
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string' && value.trim().length === 0) return 0;
  return 1;
}

function syncErrorKeyFromError(error: unknown): string {
  return error instanceof Error && error.message.startsWith('match.warning.')
    ? error.message
    : 'matchFirst.survey.syncFailed';
}

function isMissingSessionError(error: unknown): boolean {
  if (error instanceof MatchFirstApiError) {
    return error.detail === 'match.session.not_found';
  }
  return error instanceof Error && error.message === 'match.session.not_found';
}

function analyticsErrorCodeFromError(error: unknown): string {
  return error instanceof Error && error.message.startsWith('match.warning.')
    ? error.message
    : 'match.survey.answer_save_failed';
}

function budgetHasValues(value: MatchFirstBudgetAnswer): boolean {
  return value.buy_min !== undefined || value.buy_max !== undefined || value.rent_max !== undefined;
}

function budgetForIntent(
  value: MatchFirstBudgetAnswer | undefined,
  intent: MatchFirstIntent | undefined,
): MatchFirstBudgetAnswer {
  const next: MatchFirstBudgetAnswer = {};
  if (intent !== 'rent') {
    if (value?.buy_min !== undefined) next.buy_min = value.buy_min;
    if (value?.buy_max !== undefined) next.buy_max = value.buy_max;
  }
  if (intent === 'rent' || intent === 'both') {
    if (value?.rent_max !== undefined) next.rent_max = value.rent_max;
  }
  return next;
}

function answersWithUpdatedValue(
  currentAnswers: MatchFirstSurveyAnswers,
  questionId: MatchFirstSurveyQuestionId,
  value: MatchFirstSurveyAnswer,
): MatchFirstSurveyAnswers {
  if (questionId === 'intent') {
    const nextIntent = value as MatchFirstIntent;
    const nextBudget = budgetForIntent(currentAnswers.budget, nextIntent);
    const answersWithoutBudget: MatchFirstSurveyAnswers = { ...currentAnswers };
    delete answersWithoutBudget.budget;
    return budgetHasValues(nextBudget)
      ? { ...answersWithoutBudget, intent: nextIntent, budget: nextBudget }
      : { ...answersWithoutBudget, intent: nextIntent };
  }
  if (questionId === 'budget') {
    return {
      ...currentAnswers,
      budget: budgetForIntent(value as MatchFirstBudgetAnswer, currentAnswers.intent),
    };
  }
  return { ...currentAnswers, [questionId]: value };
}

export type { MatchFirstSurveyAnswers };

export default function SurveyShell({
  sessionId,
  ...props
}: SurveyShellProps) {
  return (
    <SurveyShellSession
      key={sessionId ?? 'default'}
      sessionId={sessionId}
      {...props}
    />
  );
}

function SurveyShellSession({
  sessionId,
  step = 1,
  onStepChange,
  onComplete,
  onReview,
  onBack,
  onRecoverSession,
}: SurveyShellProps) {
  const { t, i18n } = useTranslation();
  const activeStep = clampStep(step);
  const question = matchFirstSurveyQuestions[activeStep - 1];
  const [answers, setAnswers] = useState(() => readStoredSurveyAnswers(sessionId));
  const [showValidation, setShowValidation] = useState(false);
  const [syncErrorKey, setSyncErrorKey] = useState<string | null>(null);
  const validationRef = useRef<HTMLParagraphElement | null>(null);
  const completedRef = useRef(false);
  const syncAttemptRef = useRef(0);
  const effectiveSessionIdRef = useRef(sessionId ?? null);
  const visibleStepRef = useRef(activeStep);
  const latestAnalyticsContext = useRef({
    activeStep,
    questionId: question.id,
    locale: normalizeLocale(i18n.resolvedLanguage ?? i18n.language),
    sessionKey: sessionId || 'default',
  });
  const sessionKey = sessionId || 'default';
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
  const progressLabel = t('matchFirst.survey.progressLabel', {
    current: activeStep,
    total: MATCH_FIRST_SURVEY_QUESTION_COUNT,
  });
  const validationId = `match-first-survey-${question.id}-validation`;
  const nextLabel = activeStep === MATCH_FIRST_SURVEY_QUESTION_COUNT
    ? t('matchFirst.survey.review')
    : t('matchFirst.survey.next');

  useEffect(() => {
    if (showValidation) {
      validationRef.current?.focus({ preventScroll: true });
    }
  }, [showValidation]);

  useEffect(() => {
    latestAnalyticsContext.current = { activeStep, questionId: question.id, locale, sessionKey };
    visibleStepRef.current = activeStep;
  }, [activeStep, locale, question.id, sessionKey]);

  useEffect(() => {
    recordMatchFirstEvent('match_survey_question_shown', {
      locale,
      source: 'survey',
      session_id: sessionKey,
      question_id: question.id,
      step: activeStep,
      total_steps: MATCH_FIRST_SURVEY_QUESTION_COUNT,
    });
  }, [activeStep, locale, question.id, sessionKey]);

  useEffect(() => {
    return () => {
      if (completedRef.current) return;
      const latest = latestAnalyticsContext.current;
      recordMatchFirstEvent('match_survey_question_abandoned', {
        locale: latest.locale,
        source: 'survey',
        session_id: latest.sessionKey,
        question_id: latest.questionId,
        step: latest.activeStep,
        total_steps: MATCH_FIRST_SURVEY_QUESTION_COUNT,
        reason: 'route_change',
      });
    };
  }, []);

  const saveAnswersLocally = (nextAnswers: MatchFirstSurveyAnswers, nextStep: number) => {
    const targetSessionId = effectiveSessionIdRef.current;
    const storageSessionId = targetSessionId ?? sessionKey;
    const previous = readMatchSessionSnapshot(storageSessionId);
    const nextVersion = (previous?.answerVersion ?? 0) + 1;
    saveMatchSessionSnapshot(storageSessionId, {
      sessionId: storageSessionId,
      locale,
      step: nextStep,
      answerVersion: nextVersion,
      staleResults: true,
      answers: nextAnswers,
    });
  };

  const persistAnswers = async (nextAnswers: MatchFirstSurveyAnswers, nextStep = activeStep) => {
    const targetSessionId = effectiveSessionIdRef.current;
    saveAnswersLocally(nextAnswers, nextStep);
    if (!targetSessionId) return;
    const payload = {
      locale,
      current_step: nextStep,
      answers: nextAnswers,
    };
    try {
      await patchMatchSessionAnswers(targetSessionId, payload);
    } catch (error) {
      if (!isMissingSessionError(error) || !onRecoverSession) {
        throw error;
      }
      const requestedRecoveryStep = Math.max(nextStep, visibleStepRef.current);
      const recoveredSessionId = await onRecoverSession(nextAnswers, requestedRecoveryStep);
      effectiveSessionIdRef.current = recoveredSessionId;
      const recoveredStep = Math.max(requestedRecoveryStep, visibleStepRef.current);
      saveMatchSessionSnapshot(recoveredSessionId, {
        sessionId: recoveredSessionId,
        locale,
        step: recoveredStep,
        answerVersion: 0,
        staleResults: true,
        answers: nextAnswers,
      });
      await patchMatchSessionAnswers(recoveredSessionId, {
        ...payload,
        current_step: recoveredStep,
      });
      if (recoveredSessionId !== sessionId) {
        onStepChange?.(recoveredStep, recoveredSessionId);
      }
    }
  };

  const recordAnswerSaved = (
    questionId: MatchFirstSurveyQuestionId,
    stepNumber: number,
    answerType: ReturnType<typeof analyticsAnswerType>,
    answerCount: number,
  ) => {
    recordMatchFirstEvent('match_survey_answer_saved', {
      locale,
      source: 'survey',
      session_id: sessionKey,
      question_id: questionId,
      step: stepNumber,
      total_steps: MATCH_FIRST_SURVEY_QUESTION_COUNT,
      answer_type: answerType,
      answer_count: answerCount,
    });
  };

  const recordAnswerSaveFailed = (
    questionId: MatchFirstSurveyQuestionId,
    stepNumber: number,
    error: unknown,
  ) => {
    recordMatchFirstEvent('match_survey_answer_save_failed', {
      locale,
      source: 'survey',
      session_id: sessionKey,
      question_id: questionId,
      step: stepNumber,
      total_steps: MATCH_FIRST_SURVEY_QUESTION_COUNT,
      error_code: analyticsErrorCodeFromError(error),
    });
  };

  const markSyncSuccess = (attempt: number) => {
    if (attempt === syncAttemptRef.current) {
      setSyncErrorKey(null);
    }
  };

  const markSyncFailure = (
    attempt: number,
    error: unknown,
    questionId: MatchFirstSurveyQuestionId,
    stepNumber: number,
  ) => {
    recordAnswerSaveFailed(questionId, stepNumber, error);
    if (attempt === syncAttemptRef.current) {
      setSyncErrorKey(syncErrorKeyFromError(error));
    }
  };

  const updateAnswer = (questionId: MatchFirstSurveyQuestionId, value: MatchFirstSurveyAnswer) => {
    const nextAnswers = answersWithUpdatedValue(answers, questionId, value);
    const answerType = analyticsAnswerType(question);
    const answerCount = analyticsAnswerCount(value);
    setAnswers(nextAnswers);
    const syncAttempt = ++syncAttemptRef.current;
    void persistAnswers(nextAnswers)
      .then(() => {
        recordAnswerSaved(questionId, activeStep, answerType, answerCount);
        markSyncSuccess(syncAttempt);
      })
      .catch((error: unknown) => markSyncFailure(syncAttempt, error, questionId, activeStep));
    setShowValidation(false);
  };

  const goBack = () => {
    if (activeStep <= 1) {
      onBack?.();
      return;
    }
    const previousStep = activeStep - 1;
    const syncAttempt = ++syncAttemptRef.current;
    void persistAnswers(answers, previousStep)
      .then(() => markSyncSuccess(syncAttempt))
      .catch((error: unknown) => markSyncFailure(syncAttempt, error, question.id, activeStep));
    setShowValidation(false);
    recordMatchFirstEvent('match_first_survey_back_clicked', {
      locale,
      source: 'survey',
      session_id: sessionKey,
      question_id: question.id,
      from_step: activeStep,
      to_step: previousStep,
      total_steps: MATCH_FIRST_SURVEY_QUESTION_COUNT,
    });
    const effectiveSessionId = effectiveSessionIdRef.current;
    onStepChange?.(
      previousStep,
      effectiveSessionId && effectiveSessionId !== sessionId ? effectiveSessionId : undefined,
    );
  };

  const goNext = async () => {
    const answersForStep = question.id === 'commute' && !answers.commute
      ? { ...answers, commute: { max_minutes: 45 } }
      : answers;
    if (!answerIsValid(question, answersForStep)) {
      setShowValidation(true);
      return;
    }
    if (activeStep < MATCH_FIRST_SURVEY_QUESTION_COUNT) {
      const nextStep = activeStep + 1;
      setAnswers(answersForStep);
      saveAnswersLocally(answersForStep, nextStep);
      setShowValidation(false);
      visibleStepRef.current = nextStep;
      const effectiveSessionId = effectiveSessionIdRef.current;
      onStepChange?.(
        nextStep,
        effectiveSessionId && effectiveSessionId !== sessionId ? effectiveSessionId : undefined,
      );
      return;
    }
    const completedAnswers = { ...answersForStep };
    const syncAttempt = ++syncAttemptRef.current;
    void persistAnswers(completedAnswers, activeStep)
      .then(() => markSyncSuccess(syncAttempt))
      .catch((error: unknown) => markSyncFailure(syncAttempt, error, question.id, activeStep));
    completedRef.current = true;
    recordMatchFirstEvent('match_survey_completed', {
      locale,
      source: 'survey',
      session_id: sessionKey,
      step: activeStep,
      total_steps: MATCH_FIRST_SURVEY_QUESTION_COUNT,
    });
    if (onReview) {
      onReview(completedAnswers);
      return;
    }
    onComplete?.(completedAnswers);
  };

  const helperText = useMemo(() => (
    question.helperKey ? t(question.helperKey) : null
  ), [question.helperKey, t]);

  const renderQuestionInput = () => {
    const describedBy = showValidation ? validationId : undefined;
    const legend = t(question.titleKey);
    if (question.type === 'single') {
      return (
        <SingleSelectQuestion
          questionId={question.id}
          legend={legend}
          options={question.options ?? []}
          value={readAnswer(answers, question.id) as string | undefined}
          validationId={describedBy}
          onChange={(value) => updateAnswer(question.id, value as MatchFirstSurveyAnswer)}
        />
      );
    }
    if (question.type === 'multi') {
      return (
        <MultiSelectQuestion
          questionId={question.id}
          legend={legend}
          options={question.options ?? []}
          value={readAnswer(answers, question.id) as string[] | undefined}
          maxSelections={question.maxSelections}
          validationId={describedBy}
          onChange={(value) => updateAnswer(question.id, value as MatchFirstSurveyAnswer)}
        />
      );
    }
    if (question.type === 'budgetRange') {
      return (
        <BudgetRangeQuestion
          value={answers.budget}
          intent={answers.intent}
          validationId={describedBy}
          onChange={(value) => updateAnswer(question.id, value)}
        />
      );
    }
    if (question.type === 'commuteSlider') {
      return (
        <CommuteSliderQuestion
          value={answers.commute}
          validationId={describedBy}
          onChange={(value) => updateAnswer(question.id, value)}
        />
      );
    }
    return (
      <AnchorLocationQuestion
        value={answers.anchor_location}
        validationId={describedBy}
        onChange={(value) => updateAnswer(question.id, value)}
      />
    );
  };

  return (
    <SurveyQuestionScreen
      progressLabel={progressLabel}
      currentStep={activeStep}
      totalSteps={MATCH_FIRST_SURVEY_QUESTION_COUNT}
      eyebrowLabel={t('matchFirst.survey.questionEyebrow', {
        current: activeStep,
        total: MATCH_FIRST_SURVEY_QUESTION_COUNT,
      })}
      title={t(question.titleKey)}
      helperText={helperText}
      validationId={validationId}
      showValidation={showValidation}
      validationText={t('matchFirst.survey.validationRequired')}
      validationRef={validationRef}
      syncErrorText={syncErrorKey ? t(syncErrorKey) : null}
      showBack={activeStep > 1}
      backLabel={t('matchFirst.survey.back')}
      nextLabel={nextLabel}
      onBack={goBack}
      onNext={goNext}
    >
      {renderQuestionInput()}
    </SurveyQuestionScreen>
  );
}
