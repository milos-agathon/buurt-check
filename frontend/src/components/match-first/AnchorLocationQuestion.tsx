import { useTranslation } from 'react-i18next';
import type { MatchFirstAnchorAnswer } from '../../types/matchFirst';

interface AnchorLocationQuestionProps {
  value?: MatchFirstAnchorAnswer;
  validationId?: string;
  onChange: (value: MatchFirstAnchorAnswer) => void;
}

export default function AnchorLocationQuestion({
  value,
  validationId,
  onChange,
}: AnchorLocationQuestionProps) {
  const { t } = useTranslation();

  return (
    <label className="survey-question__anchor">
      <span>{t('matchFirst.survey.inputs.anchor')}</span>
      <input
        type="text"
        value={value?.label ?? ''}
        aria-label={t('matchFirst.survey.inputs.anchor')}
        aria-describedby={validationId}
        autoComplete="address-level2"
        onChange={(event) => onChange({ type: 'city', label: event.target.value })}
      />
    </label>
  );
}
