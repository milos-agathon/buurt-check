import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchNeighborhoodRecommendation } from '../../types/matchFirst';

interface RecommendationCardProps {
  recommendation: MatchNeighborhoodRecommendation;
  selected: boolean;
  onSelect: (recommendation: MatchNeighborhoodRecommendation) => void;
}

function normalizeTranslationKey(code: string, prefix: string): string {
  return code.startsWith(`${prefix}.`) ? code : `${prefix}.${code}`;
}

function useRecommendationReasonLines(recommendation: MatchNeighborhoodRecommendation): string[] {
  const { t, i18n } = useTranslation();
  return useMemo(() => (
    recommendation.reason_codes
      .slice(0, 2)
      .map((code) => normalizeTranslationKey(code, 'match.results.reasons'))
      .map((key) => (i18n.exists(key) ? t(key) : t('matchFirst.results.reasonUnavailable')))
  ), [i18n, recommendation.reason_codes, t]);
}

export default function RecommendationCard({
  recommendation,
  selected,
  onSelect,
}: RecommendationCardProps) {
  const { t, i18n } = useTranslation();
  const reasonLines = useRecommendationReasonLines(recommendation);
  const fitLabelKey = i18n.exists(recommendation.fit_label_key)
    ? recommendation.fit_label_key
    : 'matchFirst.results.fitLabel.dataBacked';
  const confidenceLabelKey = `matchFirst.results.confidenceLevel.${recommendation.confidence.level}`;

  return (
    <article
      className={`recommendation-card${selected ? ' recommendation-card--selected' : ''}`}
      aria-current={selected ? 'true' : undefined}
      data-testid={`recommendation-card-${recommendation.recommendation_id}`}
      data-neighborhood-id={recommendation.neighborhood_id}
    >
      <button
        type="button"
        className="recommendation-card__button"
        onClick={() => onSelect(recommendation)}
      >
        <span className="recommendation-card__rank">
          {t('matchFirst.results.rankLabel', { rank: recommendation.rank })}
        </span>
        <span className="recommendation-card__main">
          <span className="recommendation-card__name">{recommendation.name}</span>
          <span className="recommendation-card__municipality">{recommendation.municipality}</span>
        </span>
        <span className="recommendation-card__score">
          <span>{t('matchFirst.results.fitScore', { score: recommendation.fit_score })}</span>
          <span>{t(fitLabelKey)}</span>
        </span>
      </button>
      {reasonLines.length > 0 && (
        <ul className="recommendation-card__reasons" aria-label={t('matchFirst.results.reasonLinesLabel')}>
          {reasonLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <p className="recommendation-card__confidence">
        {t('matchFirst.results.confidenceSummary', {
          level: t(confidenceLabelKey),
          score: recommendation.confidence.score,
        })}
      </p>
    </article>
  );
}
