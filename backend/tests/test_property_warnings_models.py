"""Tests for property warning Pydantic models."""
from app.models.property_warnings import (
    AsbestosWarning,
    AttentionFlag,
    AttentionSummary,
    ErfpachtWarning,
    FoundationRisk,
    PropertyWarningsResponse,
    VvEInfo,
)


def test_foundation_risk_defaults():
    risk = FoundationRisk(level="high", construction_year=1952, soil_type="klei")
    assert risk.level == "high"
    assert risk.subsidence_rate_mm_per_year is None
    assert risk.messages == []


def test_foundation_risk_unavailable():
    risk = FoundationRisk(level="unavailable")
    assert risk.construction_year is None
    assert risk.soil_type is None


def test_erfpacht_warning():
    w = ErfpachtWarning(detected=True, confidence="municipality_based", municipality="Amsterdam")
    assert w.detected is True
    assert w.messages == []


def test_erfpacht_not_detected():
    w = ErfpachtWarning(detected=False)
    assert w.confidence is None
    assert w.municipality is None


def test_vve_info():
    v = VvEInfo(is_apartment=True, num_units=12)
    assert v.is_apartment is True


def test_asbestos_warning():
    a = AsbestosWarning(flagged=True, construction_year=1965)
    assert a.flagged is True


def test_attention_summary_no_flags():
    s = AttentionSummary(
        flag_count=0,
        flags=[],
        risk_categories_assessed=4,
        risk_categories_total=4,
    )
    assert s.flag_count == 0


def test_attention_summary_with_flags():
    s = AttentionSummary(
        flag_count=2,
        flags=[
            AttentionFlag(
                category="foundation", severity="high", label="High foundation risk"
            ),
            AttentionFlag(
                category="erfpacht", severity="info", label="Erfpacht detected"
            ),
        ],
        risk_categories_assessed=3,
        risk_categories_total=4,
    )
    assert s.flag_count == 2
    assert len(s.flags) == 2


def test_property_warnings_response_serialization():
    resp = PropertyWarningsResponse(
        address_id="0363200000000001",
        attention_summary=AttentionSummary(
            flag_count=0,
            flags=[],
            risk_categories_assessed=4,
            risk_categories_total=4,
        ),
        foundation_risk=FoundationRisk(level="low", construction_year=2005, soil_type="zand"),
        erfpacht=ErfpachtWarning(detected=False),
        vve=VvEInfo(is_apartment=False),
        asbestos=AsbestosWarning(flagged=False),
    )
    data = resp.model_dump()
    assert data["address_id"] == "0363200000000001"
    assert data["foundation_risk"]["level"] == "low"
    assert data["erfpacht"]["detected"] is False
    # Round-trip
    resp2 = PropertyWarningsResponse(**data)
    assert resp2.attention_summary.flag_count == 0
