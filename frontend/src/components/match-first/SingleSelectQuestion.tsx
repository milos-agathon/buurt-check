import { useTranslation } from 'react-i18next';
import type { MatchFirstSurveyOption, MatchFirstSurveyQuestionId } from '../../types/matchFirst';

interface SingleSelectQuestionProps {
  questionId: MatchFirstSurveyQuestionId;
  legend: string;
  options: MatchFirstSurveyOption[];
  value?: string;
  validationId?: string;
  onChange: (value: string) => void;
}

export default function SingleSelectQuestion({
  questionId,
  legend,
  options,
  value,
  validationId,
  onChange,
}: SingleSelectQuestionProps) {
  const { t } = useTranslation();

  return (
    <fieldset className="survey-question__choices" aria-describedby={validationId}>
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={`survey-question__choice${value === option.value ? ' survey-question__choice--selected' : ''}`}
        >
          <input
            type="radio"
            name={`match-first-${questionId}`}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {t(option.labelKey)}
        </label>
      ))}
    </fieldset>
  );
}
