import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchNeighborhoodRecommendation } from '../../types/matchFirst';
import RecommendationCard from './RecommendationCard';

interface RecommendationListProps {
  recommendations: MatchNeighborhoodRecommendation[];
  selectedRecommendationId?: string;
  onSelect: (recommendation: MatchNeighborhoodRecommendation) => void;
}

const RecommendationList = forwardRef<HTMLOListElement, RecommendationListProps>(function RecommendationList(
  {
    recommendations,
    selectedRecommendationId,
    onSelect,
  },
  ref,
) {
  const { t } = useTranslation();

  if (recommendations.length === 0) {
    return (
      <div className="recommendation-list__empty" role="status">
        {t('matchFirst.results.noRecommendations')}
      </div>
    );
  }

  return (
    <ol
      ref={ref}
      className="recommendation-list"
      aria-label={t('matchFirst.results.listLabel')}
    >
      {recommendations.map((recommendation) => (
        <li key={recommendation.recommendation_id} className="recommendation-list__item">
          <RecommendationCard
            recommendation={recommendation}
            selected={recommendation.recommendation_id === selectedRecommendationId}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ol>
  );
});

export default RecommendationList;
