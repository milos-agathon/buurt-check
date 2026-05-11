from __future__ import annotations

from collections.abc import Iterable

from app.models.match import (
    SUPPORTED_FEATURE_KEYS,
    ConfidenceScore,
    DataFreshnessStatus,
    Neighborhood,
    NeighborhoodFeatureVector,
    NeighborhoodMetric,
)
from app.services.match.evidence import calculate_confidence

METHOD_VERSION = "match-feature-v1"


def assemble_feature_vector(
    neighborhood: Neighborhood,
    metrics: Iterable[NeighborhoodMetric],
    *,
    required_features: Iterable[str] | None = None,
) -> NeighborhoodFeatureVector:
    metric_list = [
        metric for metric in metrics if metric.neighborhood_id == neighborhood.neighborhood_id
    ]
    feature_keys = {metric.metric_key for metric in metric_list}
    if required_features is not None:
        feature_keys.update(required_features)

    unsupported = sorted(feature_keys - SUPPORTED_FEATURE_KEYS)
    if unsupported:
        raise ValueError(f"unsupported_metric: {', '.join(unsupported)}")

    metrics_by_key = {metric.metric_key: metric for metric in metric_list}
    features: dict[str, float | None] = {}
    feature_sources: dict[str, list[str]] = {}
    missing_features: list[str] = []
    stale_features: list[str] = []

    for feature_key in sorted(feature_keys):
        metric = metrics_by_key.get(feature_key)
        value = metric.normalized_value if metric is not None else None
        features[feature_key] = value
        if metric is None or value is None:
            missing_features.append(feature_key)
            continue
        feature_sources[feature_key] = [metric.source.source_id]
        if metric.freshness_status == DataFreshnessStatus.stale:
            stale_features.append(feature_key)

    total_features = len(features) or 1
    present_features = len([value for value in features.values() if value is not None])
    completeness_score = round(100 * present_features / total_features)
    confidence = calculate_confidence(
        [metric.source for metric in metric_list],
        completeness_score=completeness_score,
    )

    return NeighborhoodFeatureVector(
        feature_vector_id=f"fv_{neighborhood.neighborhood_id}_{METHOD_VERSION}",
        neighborhood_id=neighborhood.neighborhood_id,
        method_version=METHOD_VERSION,
        features=features,
        feature_sources=feature_sources,
        completeness_score=completeness_score,
        confidence=ConfidenceScore(score=confidence.score, reasons=confidence.reasons),
        missing_features=missing_features,
        stale_features=stale_features,
    )


def assemble_feature_vectors(
    neighborhoods: Iterable[Neighborhood],
    metrics: Iterable[NeighborhoodMetric],
    *,
    required_features: Iterable[str] | None = None,
) -> list[NeighborhoodFeatureVector]:
    metric_list = list(metrics)
    return [
        assemble_feature_vector(
            neighborhood,
            metric_list,
            required_features=required_features,
        )
        for neighborhood in neighborhoods
    ]
