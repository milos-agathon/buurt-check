import type {
  MatchFirstBudgetAnswer,
  MatchFirstIntent,
  MatchFirstSurveyAnswer,
  MatchFirstSurveyAnswers,
  MatchFirstSurveyQuestion,
} from '../../types/matchFirst';
import { matchFirstSurveyQuestions } from './surveyQuestions';

export function answerIsMissing(value: MatchFirstSurveyAnswer | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    return Object.values(value).every((item) => item === undefined || item === null || item === '');
  }
  return false;
}

function optionValues(question: MatchFirstSurveyQuestion): Set<string> {
  return new Set((question.options ?? []).map((option) => option.value));
}

export function budgetIsValid(
  value: MatchFirstBudgetAnswer | undefined,
  intent?: MatchFirstIntent,
): boolean {
  if (!value) return false;
  const hasBuyRange = typeof value.buy_min === 'number'
    && typeof value.buy_max === 'number'
    && value.buy_min >= 0
    && value.buy_max > 0
    && value.buy_min <= value.buy_max;
  const hasRentCap = typeof value.rent_max === 'number' && value.rent_max > 0;
  if (intent === 'buy') return hasBuyRange;
  if (intent === 'rent') return hasRentCap;
  if (intent === 'both') return hasBuyRange && hasRentCap;
  return hasBuyRange || hasRentCap;
}

export function answerIsValid(
  question: MatchFirstSurveyQuestion,
  answers: MatchFirstSurveyAnswers,
): boolean {
  const value = answers[question.id];
  if (!question.required && answerIsMissing(value as MatchFirstSurveyAnswer | undefined)) return true;
  if (question.id === 'budget') {
    return budgetIsValid(value as MatchFirstBudgetAnswer | undefined, answers.intent);
  }
  if (question.id === 'anchor_location') {
    return typeof answers.anchor_location?.label === 'string'
      && answers.anchor_location.label.trim().length > 0;
  }
  if (question.id === 'commute') {
    return typeof answers.commute?.max_minutes === 'number' && answers.commute.max_minutes >= 5;
  }
  if (question.type === 'single') {
    return typeof value === 'string' && optionValues(question).has(value);
  }
  if (question.type === 'multi') {
    if (!Array.isArray(value)) return false;
    if (question.maxSelections && value.length > question.maxSelections) return false;
    const allowedValues = optionValues(question);
    return value.every((item) => typeof item === 'string' && allowedValues.has(item));
  }
  return !answerIsMissing(value as MatchFirstSurveyAnswer | undefined);
}

export function surveyAnswersAreComplete(answers: MatchFirstSurveyAnswers | null): answers is MatchFirstSurveyAnswers {
  if (!answers) return false;
  return matchFirstSurveyQuestions
    .filter((question) => question.required)
    .every((question) => answerIsValid(question, answers));
}

export function firstIncompleteSurveyStep(answers: MatchFirstSurveyAnswers | null): number {
  if (!answers) return 1;
  const firstIncompleteIndex = matchFirstSurveyQuestions.findIndex((question) => (
    question.required && !answerIsValid(question, answers)
  ));
  return firstIncompleteIndex === -1 ? matchFirstSurveyQuestions.length : firstIncompleteIndex + 1;
}
