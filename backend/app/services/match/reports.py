from __future__ import annotations

import json
from uuid import uuid4

from app.db import DatabaseError, get_db
from app.models.match import (
    GuardrailEvent,
    MatchReportCreateRequest,
    MatchReportResponse,
    NeighborhoodMatchScore,
    PreferenceVector,
    RecommendationEvidence,
    ReportInput,
)
from app.services.match.ai_report import (
    DeterministicReportGenerator,
    build_deterministic_fallback_report,
    generate_validated_report,
)

_REPORT_SNAPSHOTS: dict[str, MatchReportResponse] = {}


DEFAULT_REPORT_LIMITATIONS = [
    "This report is informational and source-limited; verify important decisions "
    "with primary sources and qualified advisors.",
    "Mock or placeholder listing states are not live housing supply.",
]


def _report_id() -> str:
    return f"match_report_{uuid4().hex}"


def _recommendation_to_dict(
    recommendation: NeighborhoodMatchScore | dict[str, object],
) -> dict[str, object]:
    if isinstance(recommendation, NeighborhoodMatchScore):
        return recommendation.model_dump(mode="json")
    return recommendation


def _source_refs_from_evidence(evidence_items: list[RecommendationEvidence]) -> list[str]:
    return sorted({source_ref for item in evidence_items for source_ref in item.source_refs})


def assemble_report_input(
    *,
    locale: str,
    profile_summary: dict[str, object],
    preference_vector: PreferenceVector,
    recommendations: list[NeighborhoodMatchScore | dict[str, object]],
    evidence_items: list[RecommendationEvidence],
    comparisons: list[dict[str, object]] | None = None,
    similar_neighborhoods: list[dict[str, object]] | None = None,
    listing_context: dict[str, object] | None = None,
    approved_limitations: list[str] | None = None,
) -> ReportInput:
    source_refs = _source_refs_from_evidence(evidence_items)
    return ReportInput(
        locale=locale,  # type: ignore[arg-type]
        profile_summary=profile_summary,
        preference_vector=preference_vector,
        recommendations=[_recommendation_to_dict(item) for item in recommendations],
        comparisons=comparisons or [],
        similar_neighborhoods=similar_neighborhoods or [],
        listing_context=listing_context or {"provider_mode": "unavailable", "listing_count": 0},
        evidence_items=evidence_items,
        approved_limitations=approved_limitations or DEFAULT_REPORT_LIMITATIONS,
        source_refs=source_refs,
    )


def _response_status(generated_by: str) -> str:
    return "generated" if generated_by == "ai" else "fallback"


def _with_report_id(events: list[GuardrailEvent], report_id: str) -> list[GuardrailEvent]:
    return [event.model_copy(update={"report_id": report_id}) for event in events]


async def _persist_report_snapshot(response: MatchReportResponse) -> None:
    try:
        async with get_db() as db:
            await db.execute(
                """INSERT OR REPLACE INTO match_reports (
                    report_id,
                    session_id,
                    preference_vector_id,
                    locale,
                    report_status,
                    title,
                    profile_summary_json,
                    recommendation_ids_json,
                    report_input_json,
                    report_output_json,
                    validation_status,
                    limitations_json,
                    source_refs_json,
                    generated_by,
                    created_at,
                    expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    response.report_id,
                    response.report_input.preference_vector.session_id,
                    response.report_input.preference_vector.preference_vector_id,
                    response.locale,
                    response.status,
                    response.sections[0].title if response.sections else "Neighborhood report",
                    json.dumps(response.report_input.profile_summary),
                    json.dumps(
                        [
                            item.get("recommendation_id")
                            for item in response.report_input.recommendations
                            if item.get("recommendation_id")
                        ]
                    ),
                    response.report_input.model_dump_json(),
                    json.dumps(
                        {
                            "sections": [
                                section.model_dump(mode="json")
                                for section in response.sections
                            ]
                        }
                    ),
                    response.validation_status,
                    json.dumps(response.limitations),
                    json.dumps(response.source_refs),
                    response.generated_by,
                    response.generated_at.isoformat(),
                    None,
                ),
            )
            for event in response.guardrail_events:
                await db.execute(
                    """INSERT OR REPLACE INTO match_guardrail_events (
                        guardrail_event_id,
                        report_id,
                        event_type,
                        action_taken,
                        details_json,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        event.guardrail_event_id,
                        response.report_id,
                        event.event_type,
                        event.action_taken,
                        json.dumps(event.details),
                        event.created_at.isoformat(),
                    ),
                )
            await db.commit()
    except DatabaseError:
        return


async def _load_report_snapshot(report_id: str) -> MatchReportResponse | None:
    try:
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT report_input_json FROM match_reports WHERE report_id = ?",
                (report_id,),
            )
            row = await cursor.fetchone()
    except DatabaseError:
        return None
    if row is None:
        return None

    report_input = ReportInput.model_validate_json(row["report_input_json"])
    output = build_deterministic_fallback_report(report_input)
    return MatchReportResponse(
        report_id=report_id,
        status="fallback",
        generated_by=output.generated_by,
        validation_status=output.validation_status,
        locale=output.locale,
        sections=output.sections,
        limitations=output.limitations,
        source_refs=report_input.source_refs,
        guardrail_events=[],
        report_input=report_input,
        generated_at=report_input.generated_at,
    )


async def create_report_snapshot(payload: MatchReportCreateRequest) -> MatchReportResponse:
    report_id = _report_id()
    if payload.generation_mode == "fallback_only":
        output = build_deterministic_fallback_report(payload.report_input)
        guardrail_events: list[GuardrailEvent] = []
    else:
        result = await generate_validated_report(
            payload.report_input,
            generator=DeterministicReportGenerator(),
        )
        output = result.output
        guardrail_events = result.guardrail_events

    response = MatchReportResponse(
        report_id=report_id,
        status=_response_status(output.generated_by),  # type: ignore[arg-type]
        generated_by=output.generated_by,
        validation_status=output.validation_status,
        locale=output.locale,
        sections=output.sections,
        limitations=output.limitations,
        source_refs=payload.report_input.source_refs,
        guardrail_events=_with_report_id(guardrail_events, report_id),
        report_input=payload.report_input,
        generated_at=payload.report_input.generated_at,
    )
    _REPORT_SNAPSHOTS[report_id] = response
    await _persist_report_snapshot(response)
    return response


async def get_report_snapshot(
    report_id: str,
    *,
    locale: str | None = None,
) -> MatchReportResponse | None:
    response = _REPORT_SNAPSHOTS.get(report_id)
    if response is None:
        response = await _load_report_snapshot(report_id)
    if response is None:
        return None
    if locale is None or locale == response.locale:
        return response

    report_input = response.report_input.model_copy(
        update={
            "locale": locale,
            "preference_vector": response.report_input.preference_vector.model_copy(
                update={"locale": locale}
            ),
        }
    )
    output = build_deterministic_fallback_report(report_input)
    return response.model_copy(
        update={
            "locale": locale,
            "status": "fallback",
            "generated_by": output.generated_by,
            "validation_status": output.validation_status,
            "sections": output.sections,
            "limitations": output.limitations,
            "report_input": report_input,
        }
    )
