import pytest

from app.models.match import (
    ConfidenceScore,
    DataFreshnessStatus,
    PreferenceVector,
    RecommendationEvidence,
    ReportClaim,
    ReportOutput,
    ReportSection,
)
from app.services.match.ai_report import (
    ReportGuardrailError,
    build_deterministic_fallback_report,
    validate_report_output,
)


def _preference(locale: str = "en") -> PreferenceVector:
    return PreferenceVector(
        preference_vector_id="pv_guardrail",
        journey_intent="buy",
        budget_max_cents=62500000,
        property_types=["apartment"],
        lifestyle_weights={"green_access": 1.0, "mobility": 0.8},
        locale=locale,  # type: ignore[arg-type]
        method_version="preference-v1",
    )


def _report_input(locale: str = "en"):
    from app.models.match import ReportInput

    evidence = RecommendationEvidence(
        evidence_id="ev_green_access",
        claim_code="green_access_match",
        metric_keys=["green_access"],
        source_refs=["src_green"],
        confidence=ConfidenceScore(score=82, reasons=["Current seed coverage."]),
        freshness_status=DataFreshnessStatus.mock,
        limitations=["MOCK DATA: representative seed value, not live official data."],
    )
    return ReportInput(
        locale=locale,  # type: ignore[arg-type]
        profile_summary={"household_type": "family"},
        preference_vector=_preference(locale),
        recommendations=[
            {
                "recommendation_id": "rec_ijburg",
                "neighborhood_id": "nh_amsterdam_ijburg",
                "name": "IJburg",
                "category": "top",
                "fit_score": 84,
                "score_drivers": [{"feature": "green_access", "score": 88}],
                "evidence_refs": ["ev_green_access"],
            }
        ],
        comparisons=[],
        similar_neighborhoods=[],
        listing_context={"provider_mode": "mock", "listing_count": 0},
        evidence_items=[evidence],
        approved_limitations=["This report uses labelled seed data."],
        source_refs=["src_green"],
    )


def _output_with_claim(text: str, *, evidence_refs=None, score_driver_refs=None) -> ReportOutput:
    claim = ReportClaim(
        text=text,
        evidence_refs=evidence_refs if evidence_refs is not None else ["ev_green_access"],
        source_refs=["src_green"],
        freshness_status=DataFreshnessStatus.mock,
        confidence=ConfidenceScore(score=82, reasons=["Evidence-backed claim."]),
        score_driver_refs=score_driver_refs if score_driver_refs is not None else ["green_access"],
    )
    return ReportOutput(
        locale="en",
        validation_status="passed",
        generated_by="ai",
        sections=[
            ReportSection(
                section_type="why_these_neighborhoods_fit",
                title="Why these neighborhoods fit",
                body=text,
                neighborhood_id="nh_amsterdam_ijburg",
                claims=[claim],
            )
        ],
        limitations=["This report uses labelled seed data."],
    )


@pytest.mark.parametrize(
    ("text", "expected_event"),
    [
        ("IJburg has a 123 score for parks.", "unsupported_claim"),
        ("IJburg is a crime-free and safe area.", "unsupported_safety_claim"),
        ("IJburg fits because it has the right nationality mix.", "protected_trait_claim"),
    ],
)
def test_report_guardrails_block_invented_safety_and_protected_claims(text, expected_event):
    with pytest.raises(ReportGuardrailError) as exc:
        validate_report_output(_output_with_claim(text), _report_input())

    assert exc.value.events[0].event_type == expected_event
    assert exc.value.events[0].action_taken == "blocked"


def test_report_guardrails_require_evidence_for_metric_claims():
    with pytest.raises(ReportGuardrailError) as exc:
        validate_report_output(
            _output_with_claim("Green access is a top reason.", evidence_refs=[]),
            _report_input(),
        )

    assert exc.value.events[0].event_type == "missing_citation"


def test_report_guardrails_preserve_score_driver_consistency():
    with pytest.raises(ReportGuardrailError) as exc:
        validate_report_output(
            _output_with_claim(
                "Mobility is the decisive reason for this match.",
                score_driver_refs=["mobility"],
            ),
            _report_input(),
        )

    assert exc.value.events[0].event_type == "score_driver_mismatch"


def test_deterministic_fallback_has_eight_bilingual_sections_and_stable_scores():
    english = build_deterministic_fallback_report(_report_input("en"))
    dutch = build_deterministic_fallback_report(_report_input("nl"))

    assert [section.section_type for section in english.sections] == [
        "profile_summary",
        "top_neighborhood_matches",
        "why_these_neighborhoods_fit",
        "tradeoffs_and_watchouts",
        "similar_neighborhoods",
        "live_homes_available_now",
        "suggested_alerts",
        "next_steps",
    ]
    assert [section.section_type for section in dutch.sections] == [
        section.section_type for section in english.sections
    ]
    assert english.sections[1].claims[0].text != dutch.sections[1].claims[0].text
    assert english.sections[1].claims[0].evidence_refs == ["ev_green_access"]
