from datetime import UTC, datetime

from app.models.match import (
    ConfidenceScore,
    DataFreshnessStatus,
    NeighborhoodMatchScore,
    PreferenceVector,
    RecommendationEvidence,
    RecommendationExplanation,
    ScoreDriver,
)
from app.services.match.reports import assemble_report_input


def _preference(locale: str = "en") -> PreferenceVector:
    return PreferenceVector(
        preference_vector_id="pv_report",
        journey_intent="both",
        budget_max_cents=62500000,
        monthly_rent_max_cents=220000,
        property_types=["apartment", "house"],
        hard_filters=["green_access"],
        lifestyle_weights={"green_access": 1.0, "mobility": 0.8, "affordability": 0.7},
        locale=locale,  # type: ignore[arg-type]
        method_version="preference-v1",
    )


def _recommendation() -> NeighborhoodMatchScore:
    return NeighborhoodMatchScore(
        recommendation_id="rec_ijburg",
        neighborhood_id="nh_amsterdam_ijburg",
        name="IJburg",
        municipality="Amsterdam",
        rank=1,
        category="top",
        fit_score=84,
        eligibility_status="eligible",
        component_scores={"green_access": 88, "mobility": 78},
        why_it_fits=[
            RecommendationExplanation(
                code="green_access_match",
                evidence_refs=["ev_green_access"],
            )
        ],
        tradeoffs=[
            RecommendationExplanation(
                code="budget_stretch",
                evidence_refs=["ev_affordability"],
            )
        ],
        score_drivers=[
            ScoreDriver(
                feature="green_access",
                impact=0.24,
                score=88,
                source_refs=["src_green"],
            )
        ],
        confidence=ConfidenceScore(score=82, reasons=["Seed source coverage is complete."]),
        freshness_status=DataFreshnessStatus.mock,
        data_freshness_indicator="mock",
        source_refs=["src_green", "src_affordability"],
        evidence_refs=["ev_green_access", "ev_affordability"],
    )


def _evidence(evidence_id: str, claim_code: str, metric_key: str) -> RecommendationEvidence:
    source_ref = {
        "green_access": "src_green",
        "affordability_buy": "src_affordability",
    }.get(metric_key, f"src_{metric_key}")
    return RecommendationEvidence(
        evidence_id=evidence_id,
        claim_code=claim_code,
        metric_keys=[metric_key],
        source_refs=[source_ref],
        confidence=ConfidenceScore(score=76, reasons=["Seeded metric with source metadata."]),
        freshness_status=DataFreshnessStatus.mock,
        limitations=["MOCK DATA: representative seed value, not live official data."],
    )


def test_report_input_assembles_all_required_context_from_scored_outputs_only():
    report_input = assemble_report_input(
        locale="en",
        profile_summary={"household_type": "family", "journey_intent": "both"},
        preference_vector=_preference(),
        recommendations=[_recommendation()],
        similar_neighborhoods=[
            {
                "neighborhood_id": "nh_utrecht_leidsche_rijn",
                "similarity_score": 81,
                "shared_drivers": ["green_access"],
                "source_refs": ["src_green"],
            }
        ],
        listing_context={
            "provider_mode": "mock",
            "listing_count": 0,
            "freshness_status": "mock",
            "limitations": ["Live listings are not connected yet."],
        },
        evidence_items=[
            _evidence("ev_green_access", "green_access_match", "green_access"),
            _evidence("ev_affordability", "budget_stretch", "affordability_buy"),
        ],
    )

    assert report_input.locale == "en"
    assert report_input.profile_summary["household_type"] == "family"
    assert report_input.preference_vector.preference_vector_id == "pv_report"
    assert report_input.recommendations[0]["recommendation_id"] == "rec_ijburg"
    assert report_input.comparisons == []
    assert report_input.similar_neighborhoods[0]["neighborhood_id"] == "nh_utrecht_leidsche_rijn"
    assert report_input.listing_context["provider_mode"] == "mock"
    assert report_input.source_refs == ["src_affordability", "src_green"]
    assert report_input.generated_at <= datetime.now(UTC)
    assert report_input.approved_limitations


def test_report_input_rejects_recommendations_without_evidence_coverage():
    recommendation = _recommendation().model_copy(update={"evidence_refs": []})

    try:
        assemble_report_input(
            locale="en",
            profile_summary={"household_type": "family"},
            preference_vector=_preference(),
            recommendations=[recommendation],
            evidence_items=[_evidence("ev_green_access", "green_access_match", "green_access")],
        )
    except ValueError as exc:
        assert "requires evidence coverage" in str(exc)
    else:
        raise AssertionError("recommendations without evidence coverage must be rejected")
