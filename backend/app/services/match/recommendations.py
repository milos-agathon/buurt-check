from __future__ import annotations

from app.models.match import NeighborhoodMatchScore, RecommendationSet


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
