import { describe, expect, it } from 'vitest';
import { applyFeedbackReranking } from './matchReranking';
import type {
  FeedbackRerankingHint,
  MatchRecommendationsResponse,
  NeighborhoodMatchScore,
} from '../types/match';

function recommendation(
  id: string,
  rank: number,
  category: NonNullable<NeighborhoodMatchScore['category']> = 'top',
): NeighborhoodMatchScore {
  return {
    recommendation_id: `rec_${id}`,
    neighborhood_id: id,
    name: id,
    municipality: 'Amsterdam',
    rank,
    category,
    fit_score: 80 - rank,
    eligibility_status: 'eligible',
    component_scores: {},
    why_it_fits: [{ code: 'green_fit', evidence_refs: ['ev_green'] }],
    tradeoffs: [{ code: 'review_source_limitations', evidence_refs: ['ev_green'] }],
    score_drivers: [],
    failed_filters: [],
    confidence: { score: 80, label: 'high', reasons: ['seed'] },
    freshness_status: 'mock',
    data_freshness_indicator: 'mock_data',
    source_refs: ['src_green'],
    evidence_refs: ['ev_green'],
    missing_features: [],
  };
}

function recommendations(): MatchRecommendationsResponse {
  return {
    preference_vector_id: 'pv_test',
    locale: 'en',
    recommendations: {
      top: [recommendation('nh_keep', 1), recommendation('nh_reject', 2)],
      surprising: [recommendation('nh_boost', 1, 'surprising')],
      stretch: [],
      avoid_or_reconsider: [],
      empty_result_relaxations: [],
      source_coverage: ['src_green'],
    },
    evidence_items: [],
    source_coverage: ['src_green'],
  };
}

describe('applyFeedbackReranking', () => {
  it('deterministically boosts loved neighborhoods and moves rejected ones to avoid-or-reconsider', () => {
    const hint: FeedbackRerankingHint = {
      boost_neighborhood_ids: ['nh_boost'],
      soften_neighborhood_ids: [],
      suppress_neighborhood_ids: ['nh_reject'],
      adjusted_weight_inputs: { green_access: 0.12 },
      explanation_code: 'match.feedback.explanation.updatedRanking',
      historical_recommendations_mutated: false,
    };

    const result = applyFeedbackReranking(recommendations(), hint);

    expect(result.recommendations.top.map((item) => item.neighborhood_id)).toEqual([
      'nh_boost',
      'nh_keep',
    ]);
    expect(result.recommendations.top.map((item) => item.rank)).toEqual([1, 2]);
    expect(result.recommendations.avoid_or_reconsider[0]).toMatchObject({
      neighborhood_id: 'nh_reject',
      category: 'avoid_or_reconsider',
      rank: 1,
    });
    expect(result.feedback_adjustment).toEqual({
      applied: true,
      explanation_code: 'match.feedback.explanation.updatedRanking',
      adjusted_weight_inputs: { green_access: 0.12 },
    });
  });
});
