from app.models.match import (
    ConfidenceScore,
    DataFreshnessStatus,
    PreferenceVector,
    RecommendationEvidence,
    ReportInput,
)
from app.services.match.ai_report import build_deterministic_fallback_report


def _input(locale: str) -> ReportInput:
    return ReportInput(
        locale=locale,  # type: ignore[arg-type]
        profile_summary={"household_type": "family"},
        preference_vector=PreferenceVector(
            preference_vector_id="pv_locale",
            journey_intent="both",
            locale=locale,  # type: ignore[arg-type]
            method_version="preference-v1",
        ),
        recommendations=[
            {
                "recommendation_id": "rec_locale",
                "neighborhood_id": "nh_locale",
                "name": "Delft Voorhof",
                "category": "top",
                "fit_score": 79,
                "score_drivers": [{"feature": "mobility", "score": 83}],
                "evidence_refs": ["ev_mobility"],
            }
        ],
        comparisons=[],
        similar_neighborhoods=[],
        listing_context={"provider_mode": "mock", "listing_count": 0},
        evidence_items=[
            RecommendationEvidence(
                evidence_id="ev_mobility",
                claim_code="mobility_match",
                metric_keys=["mobility"],
                source_refs=["src_mobility"],
                confidence=ConfidenceScore(score=76, reasons=["Seed coverage."]),
                freshness_status=DataFreshnessStatus.mock,
                limitations=["MOCK DATA: representative seed value."],
            )
        ],
        approved_limitations=["Source-limited report."],
        source_refs=["src_mobility"],
    )


def test_locale_regeneration_changes_narrative_only_not_structured_scores():
    english = build_deterministic_fallback_report(_input("en"))
    dutch = build_deterministic_fallback_report(_input("nl"))

    assert english.locale == "en"
    assert dutch.locale == "nl"
    assert english.sections[1].claims[0].text != dutch.sections[1].claims[0].text
    assert english.sections[1].claims[0].evidence_refs == dutch.sections[1].claims[0].evidence_refs
    assert "79" in english.sections[1].claims[0].text
    assert "79" in dutch.sections[1].claims[0].text
