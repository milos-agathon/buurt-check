import { useTranslation } from 'react-i18next';
import type { MatchFirstCommuteAnswer } from '../../types/matchFirst';

interface CommuteSliderQuestionProps {
  value?: MatchFirstCommuteAnswer;
  validationId?: string;
  onChange: (value: MatchFirstCommuteAnswer) => void;
}

export default function CommuteSliderQuestion({
  value,
  validationId,
  onChange,
}: CommuteSliderQuestionProps) {
  const { t } = useTranslation();
  const minutes = value?.max_minutes ?? 45;

  return (
    <div className="survey-question__slider" aria-describedby={validationId}>
      <label htmlFor="match-first-commute-slider">{t('matchFirst.survey.inputs.commute')}</label>
      <input
        id="match-first-commute-slider"
        type="range"
        min={15}
        max={90}
        step={5}
        value={minutes}
        aria-label={t('matchFirst.survey.inputs.commute')}
        onChange={(event) => onChange({ max_minutes: Number(event.target.value) })}
      />
      <output htmlFor="match-first-commute-slider">
        {t('matchFirst.survey.inputs.commuteValue', { minutes })}
      </output>
    </div>
  );
}
