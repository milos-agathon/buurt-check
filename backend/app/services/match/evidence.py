from __future__ import annotations

from app.models.match import ConfidenceScore, DataFreshnessStatus, MetricSource


def require_metric_source(metric_key: str, source: MetricSource | None) -> MetricSource:
    if source is None:
        raise ValueError(f"Metric {metric_key} requires source metadata")
    if not source.source_id or not source.source_name or not source.limitations:
        raise ValueError(f"Metric {metric_key} has incomplete source metadata")
    return source


def evidence_id_for_metric(metric_key: str, source: MetricSource) -> str:
    return f"ev_{metric_key}_{source.source_id}"


def calculate_confidence(
    sources: list[MetricSource],
    *,
    completeness_score: int,
    base_score: int | None = None,
) -> ConfidenceScore:
    if not sources:
        return ConfidenceScore(
            score=0,
            reasons=["match.results.confidence.no_source_metadata"],
        )

    score = base_score if base_score is not None else min(
        completeness_score,
        round(sum(source.confidence for source in sources) / len(sources)),
    )
    reasons: list[str] = []
    source_types = {source.source_type for source in sources}
    freshness_statuses = {source.freshness_status for source in sources}

    if "mock" in source_types:
        score -= 10
        reasons.append("match.results.confidence.mock_source_data")
    if "missing" in source_types or DataFreshnessStatus.unavailable in freshness_statuses:
        score -= 25
        reasons.append("match.results.confidence.missing_or_unavailable_source_data")
    if DataFreshnessStatus.stale in freshness_statuses:
        score -= 15
        reasons.append("match.results.confidence.stale_source_data")
    if DataFreshnessStatus.conflict in freshness_statuses:
        score -= 20
        reasons.append("match.results.confidence.conflicting_source_data")
    if completeness_score < 80:
        score -= 10
        reasons.append("match.results.confidence.incomplete_feature_coverage")

    if not reasons:
        reasons.append("match.results.confidence.current_complete_source_coverage")

    return ConfidenceScore(score=max(0, min(100, score)), reasons=reasons)
