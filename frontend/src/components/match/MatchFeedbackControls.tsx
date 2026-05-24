import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  MatchFeedbackPayload,
  MatchFeedbackResponse,
  MatchFeedbackType,
} from '../../types/match';
import './MatchFeedbackControls.css';

interface MatchFeedbackControlsProps {
  sessionId?: string | null;
  reportId?: string | null;
  recommendationId?: string | null;
  neighborhoodId: string;
  onSubmit: (payload: MatchFeedbackPayload) => Promise<Partial<MatchFeedbackResponse>> | Partial<MatchFeedbackResponse>;
}

const feedbackOptions: Array<{ type: MatchFeedbackType; key: string }> = [
  { type: 'love', key: 'love' },
  { type: 'maybe', key: 'maybe' },
  { type: 'not_for_me', key: 'notForMe' },
];

export default function MatchFeedbackControls({
  sessionId = null,
  reportId = null,
  recommendationId = null,
  neighborhoodId,
  onSubmit,
}: MatchFeedbackControlsProps) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<MatchFeedbackType | null>(null);
  const [loadingType, setLoadingType] = useState<MatchFeedbackType | null>(null);
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const resolvedMessageKey = messageKey && i18n.exists(messageKey)
    ? messageKey
    : 'match.feedback.explanation.updatedRanking';

  const submit = async (feedbackType: MatchFeedbackType) => {
    setLoadingType(feedbackType);
    setError(false);
    try {
      const response = await onSubmit({
        session_id: sessionId,
        report_id: reportId,
        recommendation_id: recommendationId,
        neighborhood_id: neighborhoodId,
        feedback_type: feedbackType,
        payload: { source: 'recommendation_card' },
      });
      setSelected(feedbackType);
      setMessageKey(response.explanation_code ?? 'match.feedback.explanation.updatedRanking');
    } catch {
      setError(true);
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <section className="match-feedback" aria-label={t('match.feedback.title')}>
      <div className="match-feedback__buttons">
        {feedbackOptions.map((option) => (
          <button
            type="button"
            key={option.type}
            className={selected === option.type ? 'match-feedback__button match-feedback__button--active' : 'match-feedback__button'}
            aria-pressed={selected === option.type}
            disabled={loadingType !== null}
            onClick={() => void submit(option.type)}
          >
            {loadingType === option.type
              ? t('match.feedback.saving')
              : t(`match.feedback.${option.key}`)}
          </button>
        ))}
      </div>
      {messageKey && (
        <p role="status">
          {t(resolvedMessageKey)}
        </p>
      )}
      {error && <p role="alert">{t('match.feedback.error')}</p>}
    </section>
  );
}
