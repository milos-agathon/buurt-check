from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.models.match import (
    ConfidenceScore,
    DataFreshnessStatus,
    Listing,
    MetricSource,
    Neighborhood,
    NeighborhoodFeatureVector,
    NeighborhoodMetric,
    PreferenceVector,
    RecommendationEvidence,
    ReportInput,
    ReportOutput,
    SourceRun,
    UserPreferenceProfile,
)


def _source(
    *,
    source_id: str = "src_cbs_green_2024",
    metric_name: str = "green_access",
    freshness_status: DataFreshnessStatus = DataFreshnessStatus.current,
) -> MetricSource:
    return MetricSource(
        source_id=source_id,
        source_name="CBS open data mock seed",
        source_type="mock",
        metric_name=metric_name,
        license_status="mock",
        measurement_date="2024-01-01",
        retrieved_at=datetime(2026, 5, 11, tzinfo=UTC),
        geography_level="neighborhood",
        method_version="seed-v1",
        limitations=["MOCK DATA: representative seed value, not live official data."],
        confidence=72,
        freshness_status=freshness_status,
    )


def test_match_domain_models_validate_representative_payloads():
    source = _source()
    neighborhood = Neighborhood(
        neighborhood_id="nh_amsterdam_ijburg",
        official_code="BU036307",
        name_nl="IJburg",
        municipality="Amsterdam",
        province="Noord-Holland",
        geography_level="neighborhood",
        centroid_rd_x=126_250,
        centroid_rd_y=486_800,
        centroid_lat=52.355,
        centroid_lng=5.000,
        supported_region=True,
        mock_status="seeded_mock",
    )
    metric = NeighborhoodMetric(
        metric_id="metric_ijburg_green",
        neighborhood_id=neighborhood.neighborhood_id,
        metric_key="green_access",
        raw_value={"value": 84, "unit": "score_0_100"},
        normalized_value=84,
        source=source,
        freshness_status=DataFreshnessStatus.current,
        confidence=72,
        geography_level="neighborhood",
        limitations=["MOCK DATA: representative seed value."],
    )
    vector = NeighborhoodFeatureVector(
        feature_vector_id="fv_ijburg_v1",
        neighborhood_id=neighborhood.neighborhood_id,
        method_version="match-feature-v1",
        features={"green_access": 84, "calmness": 63, "affordability_buy": 45},
        feature_sources={
            "green_access": [source.source_id],
            "calmness": ["src_mock_calmness"],
            "affordability_buy": ["src_mock_affordability_buy"],
        },
        completeness_score=80,
        confidence=ConfidenceScore(score=72, reasons=["Most seed metrics are present."]),
        missing_features=[],
        stale_features=[],
    )
    profile = UserPreferenceProfile(
        profile_id="profile_seed_user",
        locale="en",
        household_type="family",
        newcomer_status="yes",
    )
    preference = PreferenceVector(
        preference_vector_id="pv_seed_user",
        profile_id=profile.profile_id,
        journey_intent="both",
        budget_min_cents=45000000,
        budget_max_cents=65000000,
        monthly_rent_max_cents=240000,
        property_types=["apartment", "house"],
        hard_filters=["green_access"],
        nice_to_haves=["train_nearby"],
        avoid_signals=["high_traffic"],
        lifestyle_weights={"green_access": 1.0, "calmness": 0.8, "mobility": 0.6},
        locale="en",
        method_version="preference-v1",
    )
    listing = Listing(
        listing_id="listing_mock_ijburg_buy_1",
        provider_name="MockListingProvider",
        provider_mode="mock",
        license_status="mock",
        neighborhood_id=neighborhood.neighborhood_id,
        journey_intent="buy",
        property_type="apartment",
        price_cents=57500000,
        currency="EUR",
        availability_status="available",
        source_url=None,
        freshness_status=DataFreshnessStatus.mock,
        confidence=55,
        limitations=["MOCK DATA: example listing, not live supply."],
    )
    evidence = RecommendationEvidence(
        evidence_id="ev_green_access",
        claim_code="green_access_match",
        metric_keys=["green_access"],
        source_refs=[source.source_id],
        confidence=ConfidenceScore(score=72, reasons=["Seed source is labelled mock."]),
        freshness_status=DataFreshnessStatus.current,
        limitations=["MOCK DATA: representative seed value."],
    )
    run = SourceRun(
        source_run_id="run_seed_20260511",
        provider_name="SeedMockImporter",
        provider_type="mock",
        region_config_id="mvp-randstad-eindhoven-seed",
        status="succeeded",
        records_imported=1,
        records_failed=0,
    )

    assert metric.source.source_id == source.source_id
    assert vector.feature_sources["green_access"] == [source.source_id]
    assert preference.journey_intent == "both"
    assert listing.provider_mode == "mock"
    assert evidence.source_refs == [source.source_id]
    assert run.provider_type == "mock"


def test_source_metadata_is_required_for_consumed_metrics():
    with pytest.raises(ValidationError, match="source"):
        NeighborhoodMetric(
            metric_id="metric_missing_source",
            neighborhood_id="nh_amsterdam_ijburg",
            metric_key="green_access",
            raw_value={"value": 84},
            normalized_value=84,
            freshness_status=DataFreshnessStatus.current,
            confidence=72,
            geography_level="neighborhood",
            limitations=["Missing source must be rejected."],
        )


def test_unsupported_metric_without_source_metadata_is_rejected():
    with pytest.raises(ValidationError, match="unsupported_metric"):
        NeighborhoodFeatureVector(
            feature_vector_id="fv_bad",
            neighborhood_id="nh_amsterdam_ijburg",
            method_version="match-feature-v1",
            features={"unsupported_metric": 55},
            feature_sources={},
            completeness_score=50,
            confidence=ConfidenceScore(score=50, reasons=[]),
        )


def test_confidence_score_label_is_derived_from_score():
    assert ConfidenceScore(score=92, reasons=[]).label == "high"
    assert ConfidenceScore(score=65, reasons=[]).label == "medium"
    assert ConfidenceScore(score=38, reasons=[]).label == "low"


def test_ai_report_data_contract_requires_grounded_evidence_and_limitations():
    source = _source()
    preference = PreferenceVector(
        preference_vector_id="pv_seed_user",
        journey_intent="buy",
        budget_max_cents=65000000,
        property_types=["apartment"],
        lifestyle_weights={"green_access": 1.0},
        locale="en",
        method_version="preference-v1",
    )
    evidence = RecommendationEvidence(
        evidence_id="ev_green_access",
        claim_code="green_access_match",
        metric_keys=["green_access"],
        source_refs=[source.source_id],
        confidence=ConfidenceScore(score=72, reasons=["Seed source is labelled mock."]),
        freshness_status=DataFreshnessStatus.current,
        limitations=["MOCK DATA: representative seed value."],
    )

    report_input = ReportInput(
        locale="en",
        profile_summary={"household_type": "family"},
        preference_vector=preference,
        recommendations=[
            {
                "neighborhood_id": "nh_amsterdam_ijburg",
                "fit_score": 82,
                "evidence_refs": [evidence.evidence_id],
            }
        ],
        evidence_items=[evidence],
        approved_limitations=["This report uses clearly labelled mock seed data."],
    )
    report_output = ReportOutput(
        locale="en",
        validation_status="fallback_used",
        profile_narrative="Seed narrative grounded in evidence refs.",
        recommendation_sections=[
            {"neighborhood_id": "nh_amsterdam_ijburg", "evidence_refs": [evidence.evidence_id]}
        ],
        limitations=["This report uses clearly labelled mock seed data."],
    )

    assert report_input.evidence_items[0].source_refs == [source.source_id]
    assert report_output.validation_status == "fallback_used"


def test_ai_report_contract_rejects_ungrounded_empty_evidence():
    preference = PreferenceVector(
        preference_vector_id="pv_seed_user",
        journey_intent="buy",
        locale="en",
        method_version="preference-v1",
    )

    with pytest.raises(ValidationError, match="evidence_items"):
        ReportInput(
            locale="en",
            profile_summary={},
            preference_vector=preference,
            recommendations=[],
            evidence_items=[],
            approved_limitations=["Reports must state limitations."],
        )
