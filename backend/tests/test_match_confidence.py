from datetime import UTC, datetime

import pytest

from app.models.match import DataFreshnessStatus, MetricSource
from app.services.match.evidence import (
    calculate_confidence,
    evidence_id_for_metric,
    require_metric_source,
)


def _source(
    *,
    source_type: str = "mock",
    freshness_status: DataFreshnessStatus = DataFreshnessStatus.current,
    confidence: int = 80,
) -> MetricSource:
    return MetricSource(
        source_id=f"src_{source_type}_{freshness_status}",
        source_name="Seed source",
        source_type=source_type,
        metric_name="green_access",
        license_status="mock" if source_type == "mock" else "open",
        measurement_date="2024-01-01",
        retrieved_at=datetime(2026, 5, 11, tzinfo=UTC),
        geography_level="neighborhood",
        method_version="seed-v1",
        limitations=["MOCK DATA: representative seed value."],
        confidence=confidence,
        freshness_status=freshness_status,
    )


def test_confidence_downgrades_for_stale_mock_and_missing_sources():
    confidence = calculate_confidence(
        [
            _source(
                source_type="official",
                freshness_status=DataFreshnessStatus.current,
                confidence=88,
            ),
            _source(source_type="mock", freshness_status=DataFreshnessStatus.mock, confidence=72),
            _source(
                source_type="missing",
                freshness_status=DataFreshnessStatus.unavailable,
                confidence=0,
            ),
            _source(
                source_type="official",
                freshness_status=DataFreshnessStatus.stale,
                confidence=52,
            ),
        ],
        completeness_score=75,
    )

    assert confidence.score < 75
    assert confidence.label == "low"
    assert "match.results.confidence.mock_source_data" in confidence.reasons
    assert "match.results.confidence.missing_or_unavailable_source_data" in confidence.reasons
    assert "match.results.confidence.stale_source_data" in confidence.reasons


def test_confidence_returns_high_for_current_complete_official_sources():
    confidence = calculate_confidence(
        [
            _source(
                source_type="official",
                freshness_status=DataFreshnessStatus.current,
                confidence=90,
            ),
            _source(
                source_type="derived",
                freshness_status=DataFreshnessStatus.current,
                confidence=84,
            ),
        ],
        completeness_score=95,
    )

    assert confidence.score >= 80
    assert confidence.label == "high"


def test_require_metric_source_rejects_missing_source_metadata():
    with pytest.raises(ValueError, match="source metadata"):
        require_metric_source(metric_key="green_access", source=None)


def test_evidence_ids_are_stable_for_metric_and_source():
    source = _source(source_type="official")

    assert evidence_id_for_metric("green_access", source) == "ev_green_access_src_official_current"
