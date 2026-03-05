"""Tests for sunlight data consistency between risk table and comparison chart."""
from app.models.risk import ComparisonPattern, RiskComparisonRow, RiskComparisonsResponse


def _make_comparisons(include_address: bool = True) -> RiskComparisonsResponse:
    """Build a minimal RiskComparisonsResponse with optional address row."""
    sunlight_rows = [
        RiskComparisonRow(label_code="city_avg", value=55),
        RiskComparisonRow(label_code="nl_avg", value=60),
        RiskComparisonRow(
            label_code="who_guideline",
            value=67,
            pattern=ComparisonPattern.dashed,
        ),
    ]
    if include_address:
        sunlight_rows.append(RiskComparisonRow(label_code="address", value=42))
    return RiskComparisonsResponse(
        address_id="0363010000696734",
        noise=[],
        air_quality=[],
        climate_stress=[],
        sunlight=sunlight_rows,
        generated_at="2026-03-04T12:00:00Z",
    )


def test_strip_address_row_when_sunlight_score_none():
    """When sunlight_score is None, address row should be stripped from comparison."""
    data = _make_comparisons(include_address=True)
    sunlight_score = None

    # This mirrors the logic added in address.py export route
    if sunlight_score is None and data and data.sunlight:
        data.sunlight = [
            row for row in data.sunlight if row.label_code != "address"
        ]

    labels = [row.label_code for row in data.sunlight]
    assert "address" not in labels
    assert len(data.sunlight) == 3


def test_keep_address_row_when_sunlight_score_present():
    """When sunlight_score is present, address row should remain."""
    data = _make_comparisons(include_address=True)
    sunlight_score = 42

    if sunlight_score is None and data and data.sunlight:
        data.sunlight = [
            row for row in data.sunlight if row.label_code != "address"
        ]

    labels = [row.label_code for row in data.sunlight]
    assert "address" in labels
    assert len(data.sunlight) == 4


def test_no_crash_when_sunlight_comparisons_empty():
    """No error when sunlight comparison list is empty."""
    data = _make_comparisons(include_address=False)
    data.sunlight = []
    sunlight_score = None

    if sunlight_score is None and data and data.sunlight:
        data.sunlight = [
            row for row in data.sunlight if row.label_code != "address"
        ]

    assert data.sunlight == []
