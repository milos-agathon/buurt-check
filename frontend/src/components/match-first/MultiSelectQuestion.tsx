import { useTranslation } from 'react-i18next';
import type { MatchFirstSurveyOption, MatchFirstSurveyQuestionId } from '../../types/matchFirst';

interface MultiSelectQuestionProps {
  questionId: MatchFirstSurveyQuestionId;
  legend: string;
  options: MatchFirstSurveyOption[];
  value?: string[];
  maxSelections?: number;
  validationId?: string;
  onChange: (value: string[]) => void;
}

export default function MultiSelectQuestion({
  questionId,
  legend,
  options,
  value = [],
  maxSelections,
  validationId,
  onChange,
}: MultiSelectQuestionProps) {
  const { t } = useTranslation();
  const selected = new Set(value);
  const capReached = maxSelections !== undefined && selected.size >= maxSelections;
  const capMessageId = `${questionId}-max-selection-message`;
  const describedBy = [validationId, capReached ? capMessageId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <fieldset className="survey-question__choices" aria-describedby={describedBy}>
      <legend className="sr-only">{legend}</legend>
      {capReached && (
        <p id={capMessageId} className="survey-question__hint" role="status">
          {t('matchFirst.survey.maxSelectionsReached', { max: maxSelections })}
        </p>
      )}
      {options.map((option) => {
        const checked = selected.has(option.value);
        const disabled = !checked && capReached;
        return (
          <label
            key={option.value}
            className={`survey-question__choice${checked ? ' survey-question__choice--selected' : ''}`}
          >
            <input
              type="checkbox"
              name={`match-first-${questionId}`}
              value={option.value}
              checked={checked}
              disabled={disabled}
              onChange={() => {
                if (checked) {
                  onChange(value.filter((item) => item !== option.value));
                  return;
                }
                onChange([...value, option.value]);
              }}
            />
            {t(option.labelKey)}
          </label>
        );
      })}
    </fieldset>
  );
}
