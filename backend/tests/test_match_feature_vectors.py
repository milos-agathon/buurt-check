from datetime import UTC, datetime

from app.models.match import DataFreshnessStatus, MetricSource, Neighborhood, NeighborhoodMetric
from app.services.match.feature_vectors import assemble_feature_vector


def _source(
    metric_name: str,
    *,
    source_type: str = "mock",
    freshness_status: DataFreshnessStatus = DataFreshnessStatus.mock,
    confidence: int = 72,
) -> MetricSource:
    return MetricSource(
        source_id=f"src_{metric_name}_{freshness_status}",
        source_name="MOCK DATA - test source",
        source_type=source_type,
        metric_name=metric_name,
        license_status="mock" if source_type == "mock" else "unavailable",
        measurement_date="2024-01-01",
        retrieved_at=datetime(2026, 5, 11, tzinfo=UTC),
        geography_level="neighborhood",
        method_version="test-v1",
        limitations=["MOCK DATA: test metric limitation."],
        confidence=confidence,
        freshness_status=freshness_status,
    )


def _metric(
    neighborhood_id: str,
    metric_key: str,
    value: float | None,
    *,
    freshness_status: DataFreshnessStatus = DataFreshnessStatus.mock,
    confidence: int = 72,
) -> NeighborhoodMetric:
    source_type = "missing" if value is None else "mock"
    return NeighborhoodMetric(
        metric_id=f"metric_{neighborhood_id}_{metric_key}",
        neighborhood_id=neighborhood_id,
        metric_key=metric_key,
        raw_value={"value": value, "unit": "score_0_100"},
        normalized_value=value,
        source=_source(
            metric_key,
            source_type=source_type,
            freshness_status=freshness_status,
            confidence=confidence,
        ),
        freshness_status=freshness_status,
        confidence=confidence,
        geography_level="neighborhood",
        limitations=["MOCK DATA: test metric limitation."],
        imported_at=datetime(2026, 5, 11, tzinfo=UTC),
    )


def _neighborhood(neighborhood_id: str = "nh_test") -> Neighborhood:
    return Neighborhood(
        neighborhood_id=neighborhood_id,
        name_nl="Testbuurt",
        municipality="Amsterdam",
        geography_level="neighborhood",
        supported_region=True,
        mock_status="seeded_mock",
    )


def test_feature_vector_preserves_normalized_values_and_source_refs():
    neighborhood = _neighborhood()
    metrics = [
        _metric(neighborhood.neighborhood_id, "green_access", 84),
        _metric(neighborhood.neighborhood_id, "mobility", 76),
        _metric(neighborhood.neighborhood_id, "affordability_buy", 62),
    ]

    vector = assemble_feature_vector(neighborhood, metrics)

    assert vector.neighborhood_id == neighborhood.neighborhood_id
    assert vector.features["green_access"] == 84
    assert vector.feature_sources["green_access"] == ["src_green_access_mock"]
    assert vector.completeness_score == 100
    assert vector.missing_features == []


def test_feature_vector_marks_missing_and_stale_metrics_without_imputation():
    neighborhood = _neighborhood()
    metrics = [
        _metric(neighborhood.neighborhood_id, "green_access", 84),
        _metric(
            neighborhood.neighborhood_id,
            "affordability_rent",
            None,
            freshness_status=DataFreshnessStatus.unavailable,
            confidence=0,
        ),
        _metric(
            neighborhood.neighborhood_id,
            "mobility",
            55,
            freshness_status=DataFreshnessStatus.stale,
            confidence=45,
        ),
    ]

    vector = assemble_feature_vector(neighborhood, metrics)

    assert vector.features["affordability_rent"] is None
    assert "affordability_rent" in vector.missing_features
    assert "mobility" in vector.stale_features
    assert vector.completeness_score == 67
    assert vector.confidence.score < 60
    assert any("missing" in reason.lower() for reason in vector.confidence.reasons)
