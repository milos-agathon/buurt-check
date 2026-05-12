import type {
  FeedbackRerankingHint,
  MatchRecommendationsResponse,
  NeighborhoodMatchScore,
} from '../types/match';

type RecommendationCategory = NonNullable<NeighborhoodMatchScore['category']>;

const CATEGORIES: RecommendationCategory[] = [
  'top',
  'surprising',
  'stretch',
  'avoid_or_reconsider',
];

function withCategoryAndRanks(
  items: NeighborhoodMatchScore[],
  category: RecommendationCategory,
): NeighborhoodMatchScore[] {
  return items.map((item, index) => ({
    ...item,
    category,
    rank: index + 1,
  }));
}

function uniqueByNeighborhood(items: NeighborhoodMatchScore[]): NeighborhoodMatchScore[] {
  const seen = new Set<string>();
  const unique: NeighborhoodMatchScore[] = [];
  for (const item of items) {
    if (seen.has(item.neighborhood_id)) continue;
    seen.add(item.neighborhood_id);
    unique.push(item);
  }
  return unique;
}

function flatten(response: MatchRecommendationsResponse): NeighborhoodMatchScore[] {
  return CATEGORIES.flatMap((category) => response.recommendations[category]);
}

export function applyFeedbackReranking(
  response: MatchRecommendationsResponse,
  hint: FeedbackRerankingHint,
): MatchRecommendationsResponse {
  const boost = new Set(hint.boost_neighborhood_ids);
  const suppress = new Set(hint.suppress_neighborhood_ids);
  if (boost.size === 0 && suppress.size === 0 && hint.soften_neighborhood_ids.length === 0) {
    return response;
  }

  const all = flatten(response);
  const boosted = all.filter((item) => boost.has(item.neighborhood_id));
  const suppressed = all.filter((item) => suppress.has(item.neighborhood_id));
  const remainingTop = [
    ...response.recommendations.top,
    ...response.recommendations.surprising,
  ].filter((item) => !boost.has(item.neighborhood_id) && !suppress.has(item.neighborhood_id));
  const remainingSurprising = response.recommendations.surprising.filter(
    (item) => !boost.has(item.neighborhood_id) && !suppress.has(item.neighborhood_id),
  );

  return {
    ...response,
    recommendations: {
      ...response.recommendations,
      top: withCategoryAndRanks(uniqueByNeighborhood([...boosted, ...remainingTop]).slice(0, 10), 'top'),
      surprising: withCategoryAndRanks(uniqueByNeighborhood(remainingSurprising).slice(0, 5), 'surprising'),
      avoid_or_reconsider: withCategoryAndRanks(
        uniqueByNeighborhood([...suppressed, ...response.recommendations.avoid_or_reconsider]),
        'avoid_or_reconsider',
      ),
    },
    feedback_adjustment: {
      applied: true,
      explanation_code: hint.explanation_code,
      adjusted_weight_inputs: hint.adjusted_weight_inputs,
    },
  };
}
