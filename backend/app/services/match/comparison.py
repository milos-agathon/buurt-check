from __future__ import annotations

from app.models.match import (
    ComparisonCell,
    ComparisonIndicatorRow,
    ComparisonNeighborhoodSummary,
    ConfidenceScore,
    DataFreshnessStatus,
    MatchCompareResponse,
    MetricSource,
    Neighborhood,
    NeighborhoodFeatureVector,
    NeighborhoodMetric,
    RecommendationExplanation,
)

CURATED_INDICATORS = (
    "green_access",
    "calmness",
    "mobility",
    "amenities",
    "family_fit",
    "affordability_buy",
    "affordability_rent",
    "housing_stock",
)


def _name(neighborhood: Neighborhood) -> str:
    return neighborhood.name_en or neighborhood.name_nl


def _source_refs(vector: NeighborhoodFeatureVector) -> list[str]:
    return sorted(
        {
            source_ref
            for source_refs in vector.feature_sources.values()
            for source_ref in source_refs
        }
    )


def _summary_freshness(vector: NeighborhoodFeatureVector) -> DataFreshnessStatus:
    if vector.missing_features:
        return DataFreshnessStatus.unavailable
    if vector.stale_features:
        return DataFreshnessStatus.stale
    return DataFreshnessStatus.mock


def _score(vector: NeighborhoodFeatureVector) -> int:
    values = [value for value in vector.features.values() if value is not None]
    return round(sum(values) / len(values)) if values else 0


def _evidence(vector: NeighborhoodFeatureVector) -> list[RecommendationExplanation]:
    best = sorted(
        (
            (key, value)
            for key, value in vector.features.items()
            if value is not None and value >= 60
        ),
        key=lambda item: (-float(item[1]), item[0]),
    )
    return [
        RecommendationExplanation(
            code=f"{feature}_evidence",
            evidence_refs=[
                f"ev_{feature}_{ref}" for ref in vector.feature_sources.get(feature, [])
            ],
        )
        for feature, _value in best[:3]
    ]


def _tradeoffs(vector: NeighborhoodFeatureVector) -> list[RecommendationExplanation]:
    tradeoffs = [
        RecommendationExplanation(code=f"missing_{feature}")
        for feature in sorted(vector.missing_features)
    ]
    tradeoffs.extend(
        RecommendationExplanation(code=f"stale_{feature}")
        for feature in sorted(vector.stale_features)
    )
    for feature, value in sorted(vector.features.items()):
        if value is not None and value < 50:
            tradeoffs.append(RecommendationExplanation(code=f"{feature}_tradeoff"))
    if not tradeoffs:
        tradeoffs.append(RecommendationExplanation(code="review_source_limitations"))
    return tradeoffs[:5]


def _cell(
    indicator: str,
    vector: NeighborhoodFeatureVector,
    metrics_by_neighborhood_feature: dict[tuple[str, str], NeighborhoodMetric],
) -> ComparisonCell:
    metric = metrics_by_neighborhood_feature.get((vector.neighborhood_id, indicator))
    value = vector.features.get(indicator)
    source_refs = vector.feature_sources.get(indicator, [])
    sources: list[MetricSource] = [metric.source] if metric is not None else []
    limitations = metric.limitations if metric is not None else ["Metric unavailable in seed data."]

    if value is None:
        return ComparisonCell(
            value=None,
            display_value="unavailable",
            state="missing",
            confidence=metric.confidence if metric is not None else 0,
            freshness_status=DataFreshnessStatus.unavailable,
            source_refs=source_refs,
            sources=sources,
            limitations=limitations,
        )
    if metric is not None and metric.freshness_status == DataFreshnessStatus.stale:
        state = "stale"
    elif metric is not None and metric.freshness_status == DataFreshnessStatus.mock:
        state = "mock"
    else:
        state = "available"
    return ComparisonCell(
        value=value,
        display_value=f"{round(value)} / 100",
        state=state,
        confidence=metric.confidence if metric is not None else vector.confidence.score,
        freshness_status=(
            metric.freshness_status if metric is not None else DataFreshnessStatus.mock
        ),
        source_refs=source_refs,
        sources=sources,
        limitations=limitations,
    )


def build_neighborhood_comparison(
    neighborhood_ids: list[str],
    *,
    neighborhoods: list[Neighborhood],
    feature_vectors: list[NeighborhoodFeatureVector],
    metrics: list[NeighborhoodMetric],
    locale: str,
    preference_vector_id: str | None = None,
) -> MatchCompareResponse:
    if len(neighborhood_ids) < 3:
        raise ValueError("match.warning.at_least_three_neighborhoods")

    neighborhoods_by_id = {item.neighborhood_id: item for item in neighborhoods}
    vectors_by_id = {item.neighborhood_id: item for item in feature_vectors}
    missing_neighborhoods = [
        neighborhood_id
        for neighborhood_id in neighborhood_ids
        if neighborhood_id not in neighborhoods_by_id or neighborhood_id not in vectors_by_id
    ]
    if missing_neighborhoods:
        raise ValueError("match.warning.unsupported_neighborhood")

    selected_vectors = [vectors_by_id[neighborhood_id] for neighborhood_id in neighborhood_ids]
    metrics_by_key = {
        (metric.neighborhood_id, metric.metric_key): metric
        for metric in metrics
    }

    summaries: list[ComparisonNeighborhoodSummary] = []
    for vector in selected_vectors:
        neighborhood = neighborhoods_by_id[vector.neighborhood_id]
        dimension_scores = {
            indicator: (
                round(value) if (value := vector.features.get(indicator)) is not None else None
            )
            for indicator in CURATED_INDICATORS
        }
        summaries.append(
            ComparisonNeighborhoodSummary(
                neighborhood_id=vector.neighborhood_id,
                name=_name(neighborhood),
                municipality=neighborhood.municipality,
                score=_score(vector),
                dimension_scores=dimension_scores,
                evidence=_evidence(vector),
                tradeoffs=_tradeoffs(vector),
                confidence=ConfidenceScore(
                    score=vector.confidence.score,
                    label=vector.confidence.label,
                    reasons=vector.confidence.reasons,
                ),
                freshness_status=_summary_freshness(vector),
                missing_data=sorted(vector.missing_features),
                source_refs=_source_refs(vector),
            )
        )

    rows = [
        ComparisonIndicatorRow(
            indicator_key=indicator,
            label_code=f"match.comparison.indicator.{indicator}",
            cells={
                vector.neighborhood_id: _cell(indicator, vector, metrics_by_key)
                for vector in selected_vectors
            },
        )
        for indicator in CURATED_INDICATORS
    ]
    source_coverage = sorted({source for summary in summaries for source in summary.source_refs})
    missing_states = sorted(
        {
            f"{row.indicator_key}:{neighborhood_id}"
            for row in rows
            for neighborhood_id, cell in row.cells.items()
            if cell.state == "missing"
        }
    )

    return MatchCompareResponse(
        preference_vector_id=preference_vector_id,
        locale=locale,  # type: ignore[arg-type]
        neighborhoods=summaries,
        indicators=rows,
        source_coverage=source_coverage,
        missing_data_states=missing_states,
    )
