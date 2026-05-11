from __future__ import annotations

from math import sqrt

from app.models.match import (
    ConfidenceScore,
    Neighborhood,
    NeighborhoodFeatureVector,
    RecommendationExplanation,
    ScoreDriver,
    SimilarNeighborhoodResult,
)

PROTECTED_SIMILARITY_FIELDS = frozenset(
    {
        "age",
        "disability",
        "ethnicity",
        "gender",
        "immigration_status",
        "income_class_identity",
        "nationality",
        "race",
        "religion",
        "sexual_orientation",
    }
)


def _source_refs(vector: NeighborhoodFeatureVector) -> list[str]:
    return sorted(
        {
            source_ref
            for source_refs in vector.feature_sources.values()
            for source_ref in source_refs
        }
    )


def _passes_filters(
    source: NeighborhoodFeatureVector,
    candidate: NeighborhoodFeatureVector,
    filters: dict[str, bool],
) -> bool:
    if filters.get("cheaper") and (
        candidate.features.get("affordability_buy") or 0
    ) <= (source.features.get("affordability_buy") or 0):
        return False
    if filters.get("greener") and (candidate.features.get("green_access") or 0) <= (
        source.features.get("green_access") or 0
    ):
        return False
    if filters.get("calmer") and (candidate.features.get("calmness") or 0) <= (
        source.features.get("calmness") or 0
    ):
        return False
    return True


def _common_features(
    source: NeighborhoodFeatureVector,
    candidate: NeighborhoodFeatureVector,
) -> list[str]:
    return sorted(
        key
        for key, value in source.features.items()
        if key not in PROTECTED_SIMILARITY_FIELDS
        and value is not None
        and candidate.features.get(key) is not None
    )


def _similarity_score(
    source: NeighborhoodFeatureVector,
    candidate: NeighborhoodFeatureVector,
    common_features: list[str],
) -> int:
    if not common_features:
        return 0
    distance = sqrt(
        sum(
            (float(source.features[key] or 0) - float(candidate.features[key] or 0)) ** 2
            for key in common_features
        )
    )
    normalized_distance = distance / sqrt(len(common_features))
    return max(0, min(100, int(100 - normalized_distance)))


def _drivers(
    source: NeighborhoodFeatureVector,
    candidate: NeighborhoodFeatureVector,
    common_features: list[str],
) -> tuple[list[ScoreDriver], list[ScoreDriver]]:
    shared: list[ScoreDriver] = []
    differences: list[ScoreDriver] = []
    for feature in common_features:
        source_value = float(source.features[feature] or 0)
        candidate_value = float(candidate.features[feature] or 0)
        diff = abs(source_value - candidate_value)
        driver = ScoreDriver(
            feature=feature,
            impact=round(diff, 3),
            score=candidate_value,
            source_refs=candidate.feature_sources.get(feature, []),
        )
        if diff <= 10:
            shared.append(driver)
        else:
            differences.append(driver)
    shared.sort(key=lambda item: (item.impact, item.feature))
    differences.sort(key=lambda item: (-item.impact, item.feature))
    return shared[:4], differences[:4]


def _confidence(
    source: NeighborhoodFeatureVector,
    candidate: NeighborhoodFeatureVector,
) -> ConfidenceScore:
    score = min(source.confidence.score, candidate.confidence.score)
    reasons = [*source.confidence.reasons, *candidate.confidence.reasons]
    if candidate.completeness_score < 80 or candidate.missing_features:
        score -= 15
        reasons.append("Similar-neighborhood result has missing feature data.")
    return ConfidenceScore(score=max(0, min(100, score)), reasons=reasons)


def _constraints(candidate: NeighborhoodFeatureVector) -> list[RecommendationExplanation]:
    constraints: list[RecommendationExplanation] = []
    for feature in candidate.missing_features:
        constraints.append(RecommendationExplanation(code=f"missing_{feature}"))
    if candidate.completeness_score < 80:
        constraints.append(RecommendationExplanation(code="sparse_data"))
    return constraints


def find_similar_neighborhoods(
    source_neighborhood_id: str,
    neighborhoods: list[Neighborhood],
    feature_vectors: list[NeighborhoodFeatureVector],
    *,
    filters: dict[str, bool] | None = None,
    limit: int = 8,
) -> list[SimilarNeighborhoodResult]:
    filters = filters or {}
    vectors_by_id = {vector.neighborhood_id: vector for vector in feature_vectors}
    neighborhoods_by_id = {item.neighborhood_id: item for item in neighborhoods}
    source = vectors_by_id.get(source_neighborhood_id)
    if source is None:
        raise ValueError(f"Unknown source neighborhood: {source_neighborhood_id}")

    results: list[SimilarNeighborhoodResult] = []
    for candidate in feature_vectors:
        if candidate.neighborhood_id == source_neighborhood_id:
            continue
        if not _passes_filters(source, candidate, filters):
            continue
        common = _common_features(source, candidate)
        score = _similarity_score(source, candidate, common)
        shared, differences = _drivers(source, candidate, common)
        neighborhood = neighborhoods_by_id[candidate.neighborhood_id]
        results.append(
            SimilarNeighborhoodResult(
                neighborhood_id=candidate.neighborhood_id,
                name=neighborhood.name_en or neighborhood.name_nl,
                municipality=neighborhood.municipality,
                similarity_score=score,
                shared_drivers=shared,
                meaningful_differences=differences,
                constraints=_constraints(candidate),
                confidence=_confidence(source, candidate),
                source_refs=_source_refs(candidate),
            )
        )

    results.sort(key=lambda item: (-item.similarity_score, item.name, item.neighborhood_id))
    return results[:limit]
