from __future__ import annotations

from app.models.match import (
    SUPPORTED_FEATURE_KEYS,
    ConfidenceScore,
    DataFreshnessStatus,
    MatchRecommendationsResponse,
    Neighborhood,
    NeighborhoodFeatureVector,
    NeighborhoodMatchScore,
    PreferenceVector,
    RecommendationEvidence,
    RecommendationSet,
)
from app.services.match.scoring import score_neighborhoods


def _with_category(
    item: NeighborhoodMatchScore,
    category: str,
    rank: int,
) -> NeighborhoodMatchScore:
    return item.model_copy(update={"category": category, "rank": rank})


def _unique_by_id(items: list[NeighborhoodMatchScore]) -> list[NeighborhoodMatchScore]:
    seen: set[str] = set()
    unique: list[NeighborhoodMatchScore] = []
    for item in items:
        if item.neighborhood_id in seen:
            continue
        seen.add(item.neighborhood_id)
        unique.append(item)
    return unique


def _source_coverage(items: list[NeighborhoodMatchScore]) -> list[str]:
    return sorted({source for item in items for source in item.source_refs})


def _relaxations(items: list[NeighborhoodMatchScore]) -> list[str]:
    failures: set[str] = set()
    for item in items:
        failures.update(item.failed_filters)
    return sorted(failures)


def build_recommendation_set(
    scored_neighborhoods: list[NeighborhoodMatchScore],
    *,
    limit: int = 10,
) -> RecommendationSet:
    eligible = [
        item
        for item in scored_neighborhoods
        if item.eligibility_status == "eligible" and item.fit_score >= 50
    ]
    top = [_with_category(item, "top", rank) for rank, item in enumerate(eligible[:limit], start=1)]

    top_municipality = top[0].municipality if top else None
    top_three_ids = {item.neighborhood_id for item in top[:3]}
    surprising_pool = [
        item
        for item in eligible
        if item.municipality != top_municipality and item.neighborhood_id not in top_three_ids
    ]
    if len(surprising_pool) < 3:
        surprising_pool = _unique_by_id(
            [
                *surprising_pool,
                *[
                    item
                    for item in eligible
                    if item.neighborhood_id not in top_three_ids
                ],
            ]
        )
    surprising = [
        _with_category(item, "surprising", rank)
        for rank, item in enumerate(surprising_pool[:5], start=1)
    ]
    if len(surprising) > 3:
        surprising = surprising[:5]

    stretch_pool = [
        item
        for item in scored_neighborhoods
        if item.eligibility_status == "stretch"
        or item.component_scores.get("budget_realism", 0) < 45
        or item.component_scores.get("commute_feasibility", 0) < 45
        or item.component_scores.get("housing_availability", 0) < 40
    ]
    stretch_pool = _unique_by_id(
        sorted(stretch_pool, key=lambda item: (-item.fit_score, item.name, item.neighborhood_id))
    )
    stretch = [
        _with_category(item, "stretch", rank)
        for rank, item in enumerate(stretch_pool[:3], start=1)
    ]

    avoid_pool = [
        item
        for item in scored_neighborhoods
        if item.eligibility_status in {"failed_hard_filter", "insufficient_data"}
        or item.fit_score < 50
    ]
    avoid_pool = _unique_by_id(
        sorted(
            avoid_pool,
            key=lambda item: (
                item.eligibility_status != "failed_hard_filter",
                item.eligibility_status != "insufficient_data",
                item.fit_score,
                item.name,
            ),
        )
    )
    avoid = [
        _with_category(item, "avoid_or_reconsider", rank)
        for rank, item in enumerate(avoid_pool[:3], start=1)
    ]

    return RecommendationSet(
        top=top,
        surprising=surprising,
        stretch=stretch,
        avoid_or_reconsider=avoid,
        empty_result_relaxations=[] if top else _relaxations(scored_neighborhoods),
        source_coverage=_source_coverage(scored_neighborhoods),
    )


def _all_recommendations(recommendations: RecommendationSet) -> list[NeighborhoodMatchScore]:
    return [
        *recommendations.top,
        *recommendations.surprising,
        *recommendations.stretch,
        *recommendations.avoid_or_reconsider,
    ]


def _evidence_items(items: list[NeighborhoodMatchScore]) -> list[RecommendationEvidence]:
    evidence: dict[str, RecommendationEvidence] = {}
    feature_keys = sorted(SUPPORTED_FEATURE_KEYS, key=len, reverse=True)
    for item in items:
        for ref in item.evidence_refs:
            suffix = ref.removeprefix("ev_")
            metric_key = next(
                (feature for feature in feature_keys if suffix.startswith(f"{feature}_")),
                "match_score",
            )
            source_ref = (
                suffix.removeprefix(f"{metric_key}_")
                if metric_key != "match_score"
                else ref
            )
            evidence[ref] = RecommendationEvidence(
                evidence_id=ref,
                claim_code=f"match.recommendations.evidence.{metric_key}",
                metric_keys=[metric_key],
                source_refs=[source_ref],
                confidence=ConfidenceScore(
                    score=item.confidence.score,
                    reasons=item.confidence.reasons
                    or ["match.results.confidence.recommendation_evidence_coverage"],
                ),
                freshness_status=item.freshness_status,
                limitations=[
                    "match.results.limitations.seed_mock_recommendation_evidence",
                ],
            )
    if not evidence and items:
        first = items[0]
        evidence["ev_match_seed"] = RecommendationEvidence(
            evidence_id="ev_match_seed",
            claim_code="match.recommendations.evidence.seed",
            metric_keys=["match_score"],
            source_refs=first.source_refs or ["seed"],
            confidence=first.confidence,
            freshness_status=DataFreshnessStatus.mock,
            limitations=["match.results.limitations.seed_mock_recommendation_evidence"],
        )
    return sorted(evidence.values(), key=lambda item: item.evidence_id)


def build_match_recommendations(
    preference: PreferenceVector,
    *,
    neighborhoods: list[Neighborhood],
    feature_vectors: list[NeighborhoodFeatureVector],
    limit: int = 10,
    locale: str = "en",
) -> MatchRecommendationsResponse:
    scored = score_neighborhoods(preference, neighborhoods, feature_vectors)
    recommendations = build_recommendation_set(scored, limit=limit)
    items = _all_recommendations(recommendations)
    return MatchRecommendationsResponse(
        preference_vector_id=preference.preference_vector_id,
        locale=locale,  # type: ignore[arg-type]
        recommendations=recommendations,
        evidence_items=_evidence_items(items),
        source_coverage=recommendations.source_coverage,
        empty_state_code=None if recommendations.top else "match.recommendations.empty",
    )
