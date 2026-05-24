import { useTranslation } from 'react-i18next';
import type { MatchFirstBudgetAnswer, MatchFirstIntent } from '../../types/matchFirst';

interface BudgetRangeQuestionProps {
  value?: MatchFirstBudgetAnswer;
  intent?: MatchFirstIntent;
  validationId?: string;
  onChange: (value: MatchFirstBudgetAnswer) => void;
}

function centsToEuros(value: number | undefined): string {
  return value === undefined ? '' : String(Math.round(value / 100));
}

function eurosToCents(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
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

export default function BudgetRangeQuestion({
  value,
  intent,
  validationId,
  onChange,
}: BudgetRangeQuestionProps) {
  const { t } = useTranslation();
  const showBuyRange = intent !== 'rent';
  const showRentCap = intent === 'rent' || intent === 'both';
  const emitBudget = (nextValue: MatchFirstBudgetAnswer) => {
    onChange(budgetForIntent(nextValue, intent));
  };

  return (
    <div className="survey-question__range" aria-describedby={validationId}>
      {showBuyRange && (
        <>
          <label>
            <span>{t('matchFirst.survey.inputs.budgetMin')}</span>
            <input
              type="number"
              min={0}
              step={25000}
              inputMode="numeric"
              aria-label={t('matchFirst.survey.inputs.budgetMin')}
              value={centsToEuros(value?.buy_min)}
              onChange={(event) => emitBudget({ ...value, buy_min: eurosToCents(event.target.value) })}
            />
          </label>
          <label>
            <span>{t('matchFirst.survey.inputs.budgetMax')}</span>
            <input
              type="number"
              min={0}
              step={25000}
              inputMode="numeric"
              aria-label={t('matchFirst.survey.inputs.budgetMax')}
              value={centsToEuros(value?.buy_max)}
              onChange={(event) => emitBudget({ ...value, buy_max: eurosToCents(event.target.value) })}
            />
          </label>
        </>
      )}
      {showRentCap && (
        <label>
          <span>{t('matchFirst.survey.inputs.rentMax')}</span>
          <input
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            aria-label={t('matchFirst.survey.inputs.rentMax')}
            value={centsToEuros(value?.rent_max)}
            onChange={(event) => emitBudget({ ...value, rent_max: eurosToCents(event.target.value) })}
          />
        </label>
      )}
    </div>
  );
}
