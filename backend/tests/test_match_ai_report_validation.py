import pytest

from app.models.match import (
    ConfidenceScore,
    DataFreshnessStatus,
    PreferenceVector,
    RecommendationEvidence,
    ReportInput,
    ReportOutput,
    ReportSection,
)
from app.services.match.ai_report import (
    DeterministicReportGenerator,
    ReportGuardrailError,
    generate_validated_report,
)


def _input(locale: str = "en") -> ReportInput:
    return ReportInput(
        locale=locale,  # type: ignore[arg-type]
        profile_summary={"household_type": "starter"},
        preference_vector=PreferenceVector(
            preference_vector_id="pv_ai",
            journey_intent="buy",
            locale=locale,  # type: ignore[arg-type]
            method_version="preference-v1",
        ),
        recommendations=[
            {
                "recommendation_id": "rec_1",
                "neighborhood_id": "nh_1",
                "name": "Leidsche Rijn",
                "category": "top",
                "fit_score": 81,
                "score_drivers": [{"feature": "mobility", "score": 86}],
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
                confidence=ConfidenceScore(score=80, reasons=["Seed source metadata exists."]),
                freshness_status=DataFreshnessStatus.mock,
                limitations=["MOCK DATA: representative seed value."],
            )
        ],
        approved_limitations=["This report is informational and source-limited."],
        source_refs=["src_mobility"],
    )


class BrokenProvider:
    async def generate(self, report_input: ReportInput) -> ReportOutput:
        return ReportOutput(
            locale=report_input.locale,
            validation_status="passed",
            generated_by="ai",
            sections=[
                ReportSection(
                    section_type="profile_summary",
                    title="Bad claim",
                    body="This neighborhood is guaranteed safe.",
                    claims=[],
                )
            ],
            limitations=report_input.approved_limitations,
        )


class UnavailableProvider:
    async def generate(self, report_input: ReportInput) -> ReportOutput:
        raise RuntimeError("provider unavailable")


@pytest.mark.asyncio
async def test_generate_validated_report_uses_ai_when_schema_and_guardrails_pass():
    result = await generate_validated_report(_input(), generator=DeterministicReportGenerator())

    assert result.output.validation_status == "fallback_used"
    assert result.output.generated_by == "deterministic_fallback"
    assert result.output.validation_status == "fallback_used"
    assert result.guardrail_events == []


@pytest.mark.asyncio
async def test_generate_validated_report_falls_back_when_ai_provider_unavailable():
    result = await generate_validated_report(_input(), generator=UnavailableProvider())

    assert result.output.validation_status == "fallback_used"
    assert result.output.generated_by == "deterministic_fallback"
    assert result.guardrail_events[0].event_type == "provider_unavailable"


@pytest.mark.asyncio
async def test_generate_validated_report_falls_back_when_ai_output_is_blocked():
    result = await generate_validated_report(_input(), generator=BrokenProvider())

    assert result.output.validation_status == "fallback_used"
    assert result.output.generated_by == "deterministic_fallback"
    assert {event.event_type for event in result.guardrail_events} >= {"missing_citation"}


def test_report_guardrail_error_keeps_events_for_admin_visibility():
    from app.services.match.ai_report import validate_report_output

    with pytest.raises(ReportGuardrailError) as exc:
        validate_report_output(
            ReportOutput(
                locale="en",
                validation_status="passed",
                generated_by="ai",
                sections=[
                    ReportSection(
                        section_type="profile_summary",
                        title="Unsupported",
                        body="Unsupported metric claim.",
                        claims=[],
                    )
                ],
                limitations=["Limited."],
            ),
            _input(),
        )

    assert exc.value.events
