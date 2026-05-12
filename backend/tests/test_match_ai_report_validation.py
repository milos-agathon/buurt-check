import pytest

from app.models.match import (
    ConfidenceScore,
    DataFreshnessStatus,
    PreferenceVector,
    RecommendationEvidence,
    ReportClaim,
    ReportInput,
    ReportOutput,
    ReportSection,
)
from app.services.match.ai_report import (
    DeterministicReportGenerator,
    OpenAIResponsesReportGenerator,
    ReportGuardrailError,
    build_deterministic_fallback_report,
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


class UnsafeRenderedTextProvider:
    async def generate(self, report_input: ReportInput) -> ReportOutput:
        claim = ReportClaim(
            text="Leidsche Rijn has mobility evidence.",
            evidence_refs=["ev_mobility"],
            source_refs=["src_mobility"],
            freshness_status=DataFreshnessStatus.mock,
            confidence=ConfidenceScore(score=80, reasons=["Seed source metadata exists."]),
        )
        return ReportOutput(
            locale=report_input.locale,
            validation_status="passed",
            generated_by="ai",
            sections=[
                ReportSection(
                    section_type="profile_summary",
                    title="Guaranteed safe choice",
                    body="Mortgage advice: bid now because this area is perfectly safe.",
                    claims=[claim],
                )
            ],
            profile_narrative="This guarantees happiness for your household.",
            recommendation_sections=[
                {
                    "section_type": "next_steps",
                    "title": "Bid instruction",
                    "body": "You should bid over asking.",
                    "neighborhood_id": None,
                }
            ],
            limitations=report_input.approved_limitations,
        )


class SpoofedMetadataProvider:
    async def generate(self, report_input: ReportInput) -> ReportOutput:
        return ReportOutput(
            locale=report_input.locale,
            validation_status="passed",
            generated_by="ai",
            sections=[
                ReportSection(
                    section_type="profile_summary",
                    title="Profile",
                    body="Leidsche Rijn has mobility evidence.",
                    claims=[
                        ReportClaim(
                            text="Leidsche Rijn has mobility evidence.",
                            evidence_refs=["ev_mobility"],
                            source_refs=["fake_source_ref"],
                            freshness_status=DataFreshnessStatus.current,
                            confidence=ConfidenceScore(score=100, reasons=["AI supplied."]),
                        )
                    ],
                )
            ],
            limitations=report_input.approved_limitations,
        )


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


@pytest.mark.asyncio
async def test_generate_validated_report_blocks_unsafe_rendered_ai_text_fields():
    result = await generate_validated_report(_input(), generator=UnsafeRenderedTextProvider())

    assert result.output.validation_status == "fallback_used"
    event_types = {event.event_type for event in result.guardrail_events}
    assert "unsupported_safety_claim" in event_types
    assert "forbidden_advice_claim" in event_types
    assert "certainty_language" in event_types


@pytest.mark.asyncio
async def test_generate_validated_report_rejects_spoofed_source_freshness_confidence():
    result = await generate_validated_report(_input(), generator=SpoofedMetadataProvider())

    assert result.output.validation_status == "fallback_used"
    event_types = {event.event_type for event in result.guardrail_events}
    assert "source_ref_mismatch" in event_types
    assert "freshness_mismatch" in event_types
    assert "confidence_mismatch" in event_types


@pytest.mark.asyncio
async def test_openai_responses_report_generator_uses_structured_json_schema(httpx_mock):
    report_input = _input()
    ai_output = build_deterministic_fallback_report(report_input).model_copy(
        update={"generated_by": "ai", "validation_status": "passed"}
    )
    httpx_mock.add_response(
        method="POST",
        url="https://api.openai.test/v1/responses",
        json={
            "id": "resp_test",
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": ai_output.model_dump_json(),
                        }
                    ],
                }
            ],
        },
    )
    generator = OpenAIResponsesReportGenerator(
        api_key="sk-test",
        base_url="https://api.openai.test/v1",
        model="gpt-4o-mini",
    )

    result = await generate_validated_report(report_input, generator=generator)

    assert result.output.generated_by == "ai"
    assert result.output.validation_status == "passed"
    request = httpx_mock.get_request()
    assert request is not None
    assert request.headers["Authorization"] == "Bearer sk-test"
    body = request.read().decode("utf-8")
    assert '"type":"json_schema"' in body
    assert '"strict":true' in body


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
