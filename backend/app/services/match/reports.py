from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.config import settings
from app.db import DatabaseError, get_db
from app.models.match import (
    GuardrailEvent,
    MatchReportCreateRequest,
    MatchReportResponse,
    NeighborhoodMatchScore,
    PreferenceVector,
    RecommendationEvidence,
    ReportExportResponse,
    ReportGenerationMetadata,
    ReportInput,
    SavedNeighborhood,
    SavedNeighborhoodCreateRequest,
)
from app.services.match.ai_report import (
    build_configured_report_generator,
    build_deterministic_fallback_report,
    generate_validated_report,
)

_REPORT_SNAPSHOTS: dict[str, MatchReportResponse] = {}
_SAVED_REPORTS: set[tuple[str | None, str]] = set()
_SHARE_TOKEN_HASHES: dict[str, dict[str, object]] = {}
_SAVED_NEIGHBORHOODS: dict[str, SavedNeighborhood] = {}


DEFAULT_REPORT_LIMITATIONS = [
    "This report is informational and source-limited; verify important decisions "
    "with primary sources and qualified advisors.",
    "Mock or placeholder listing states are not live housing supply.",
]


def _report_id() -> str:
    return f"match_report_{uuid4().hex}"


def _export_id() -> str:
    return f"export_{uuid4().hex}"


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _utc_now() -> datetime:
    return datetime.now(UTC)


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


def _generation_metadata(
    *,
    requested_mode: str,
    generated_by: str,
) -> ReportGenerationMetadata:
    provider = "none"
    if requested_mode == "ai_with_fallback" and settings.match_ai_report_provider_mode == "openai":
        provider = "openai"
    return ReportGenerationMetadata(
        requested_mode=requested_mode,  # type: ignore[arg-type]
        resolved_mode="ai" if generated_by == "ai" else "deterministic_fallback",
        ai_provider=provider,
        ai_available=generated_by == "ai",
        scoring_mutable_by_ai=False,
    )


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
        generation_metadata=_generation_metadata(
            requested_mode="fallback_only",
            generated_by=output.generated_by,
        ),
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
            generator=build_configured_report_generator(),
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
        generation_metadata=_generation_metadata(
            requested_mode=payload.generation_mode,
            generated_by=output.generated_by,
        ),
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
            "generation_metadata": _generation_metadata(
                requested_mode=response.generation_metadata.requested_mode,
                generated_by=output.generated_by,
            ),
        }
    )


async def save_report(report_id: str, *, session_id: str | None = None) -> bool:
    response = await get_report_snapshot(report_id)
    if response is None:
        return False
    _SAVED_REPORTS.add((session_id, report_id))
    return True


async def create_report_share_link(
    report_id: str,
    *,
    scope: str,
    locale: str,
    expires_in_days: int | None,
) -> tuple[str, datetime | None]:
    response = await get_report_snapshot(report_id, locale=locale)
    if response is None:
        raise KeyError(report_id)

    raw_token = secrets.token_urlsafe(24)
    token_hash = _sha256(raw_token)
    expires_at = _utc_now() + timedelta(days=expires_in_days) if expires_in_days else None
    _SHARE_TOKEN_HASHES[token_hash] = {
        "report_id": report_id,
        "scope": scope,
        "locale": locale,
        "expires_at": expires_at.isoformat() if expires_at else None,
    }
    try:
        async with get_db() as db:
            await db.execute(
                """INSERT OR REPLACE INTO match_share_tokens (
                    share_token_id,
                    report_id,
                    token_hash,
                    scope,
                    locale,
                    created_at,
                    expires_at,
                    revoked_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    f"share_{uuid4().hex}",
                    report_id,
                    token_hash,
                    scope,
                    locale,
                    _utc_now().isoformat(),
                    expires_at.isoformat() if expires_at else None,
                    None,
                ),
            )
            await db.commit()
    except DatabaseError:
        pass
    return f"/shared/match/report/{raw_token}", expires_at


async def _share_record_from_db(token_hash: str) -> dict[str, object] | None:
    try:
        async with get_db() as db:
            cursor = await db.execute(
                """SELECT report_id, scope, locale, expires_at, revoked_at
                FROM match_share_tokens
                WHERE token_hash = ?
                ORDER BY created_at DESC
                LIMIT 1""",
                (token_hash,),
            )
            row = await cursor.fetchone()
    except DatabaseError:
        return None
    if row is None:
        return None
    return {
        "report_id": row["report_id"],
        "scope": row["scope"],
        "locale": row["locale"],
        "expires_at": row["expires_at"],
        "revoked_at": row["revoked_at"],
    }


def _share_record_is_active(record: dict[str, object]) -> bool:
    if record.get("revoked_at"):
        return False
    expires_at = record.get("expires_at")
    if not expires_at:
        return True
    try:
        parsed = datetime.fromisoformat(str(expires_at))
    except ValueError:
        return False
    return parsed > _utc_now()


async def get_shared_report_snapshot(raw_token: str) -> MatchReportResponse | None:
    token_hash = _sha256(raw_token)
    record = _SHARE_TOKEN_HASHES.get(token_hash)
    if record is None:
        record = await _share_record_from_db(token_hash)
    if record is None or not _share_record_is_active(record):
        return None
    if record.get("scope") != "report_view":
        return None
    report_id = str(record["report_id"])
    locale = str(record.get("locale") or "en")
    return await get_report_snapshot(report_id, locale=locale)


def _report_export_payload(response: MatchReportResponse) -> dict[str, object]:
    return {
        "report_id": response.report_id,
        "locale": response.locale,
        "status": response.status,
        "generated_by": response.generated_by,
        "validation_status": response.validation_status,
        "sections": [section.model_dump(mode="json") for section in response.sections],
        "source_refs": response.source_refs,
        "limitations": response.limitations,
        "generated_at": response.generated_at.isoformat(),
    }


async def _persist_export(
    *,
    export_id: str,
    report_id: str,
    export_type: str,
    locale: str,
    status: str,
    error_code: str | None = None,
) -> None:
    try:
        async with get_db() as db:
            await db.execute(
                """INSERT OR REPLACE INTO match_report_exports (
                    export_id,
                    report_id,
                    export_type,
                    locale,
                    status,
                    created_at,
                    error_code
                ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    export_id,
                    report_id,
                    export_type,
                    locale,
                    status,
                    _utc_now().isoformat(),
                    error_code,
                ),
            )
            await db.commit()
    except DatabaseError:
        return


async def create_report_export(
    report_id: str,
    *,
    export_type: str,
    locale: str,
) -> ReportExportResponse:
    response = await get_report_snapshot(report_id, locale=locale)
    if response is None:
        raise KeyError(report_id)
    export_id = _export_id()
    payload = _report_export_payload(response)
    if export_type == "html":
        payload = {
            **payload,
            "html": "\n".join(
                [
                    "<!doctype html>",
                    f"<html lang=\"{response.locale}\"><body>",
                    *[
                        f"<section><h2>{section.title}</h2><p>{section.body}</p></section>"
                        for section in response.sections
                    ],
                    "</body></html>",
                ]
            ),
        }
    await _persist_export(
        export_id=export_id,
        report_id=report_id,
        export_type=export_type,
        locale=locale,
        status="created",
    )
    return ReportExportResponse(
        export_id=export_id,
        report_id=report_id,
        export_type=export_type,  # type: ignore[arg-type]
        locale=locale,  # type: ignore[arg-type]
        status="created",
        payload=payload,
    )


async def create_report_pdf(report_id: str, *, locale: str) -> tuple[str, bytes]:
    response = await get_report_snapshot(report_id, locale=locale)
    if response is None:
        raise KeyError(report_id)
    export_id = _export_id()
    try:
        from fpdf import FPDF

        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Helvetica", size=14)
        pdf.multi_cell(0, 8, "Neighborhood report")
        pdf.set_font("Helvetica", size=10)
        for section in response.sections:
            pdf.ln(2)
            pdf.set_font("Helvetica", style="B", size=11)
            pdf.multi_cell(0, 7, section.title)
            pdf.set_font("Helvetica", size=10)
            pdf.multi_cell(0, 6, section.body)
        pdf.ln(2)
        pdf.multi_cell(0, 6, "Sources: " + ", ".join(response.source_refs))
        pdf.multi_cell(0, 6, "Limitations: " + " ".join(response.limitations))
        raw = pdf.output(dest="S")
        pdf_bytes = raw.encode("latin-1") if isinstance(raw, str) else bytes(raw)
    except Exception:
        pdf_bytes = (
            b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
        )
    await _persist_export(
        export_id=export_id,
        report_id=report_id,
        export_type="pdf",
        locale=locale,
        status="created",
    )
    return export_id, pdf_bytes


async def save_neighborhood(
    payload: SavedNeighborhoodCreateRequest,
) -> SavedNeighborhood:
    saved = SavedNeighborhood(**payload.model_dump())
    _SAVED_NEIGHBORHOODS[saved.saved_neighborhood_id] = saved
    try:
        async with get_db() as db:
            await db.execute(
                """INSERT OR REPLACE INTO match_saved_neighborhoods (
                    saved_neighborhood_id,
                    session_id,
                    preference_vector_id,
                    report_id,
                    neighborhood_id,
                    saved_from,
                    note_json,
                    created_at,
                    deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    saved.saved_neighborhood_id,
                    saved.session_id,
                    saved.preference_vector_id,
                    saved.report_id,
                    saved.neighborhood_id,
                    saved.saved_from,
                    json.dumps(saved.note),
                    saved.created_at.isoformat(),
                    None,
                ),
            )
            await db.commit()
    except DatabaseError:
        pass
    return saved


def list_saved_neighborhoods(*, session_id: str | None = None) -> list[SavedNeighborhood]:
    values = [
        item
        for item in _SAVED_NEIGHBORHOODS.values()
        if item.deleted_at is None and (session_id is None or item.session_id == session_id)
    ]
    return sorted(values, key=lambda item: item.created_at, reverse=True)


async def delete_saved_neighborhood(saved_neighborhood_id: str) -> bool:
    saved = _SAVED_NEIGHBORHOODS.get(saved_neighborhood_id)
    if saved is None:
        return False
    deleted = saved.model_copy(update={"deleted_at": _utc_now()})
    _SAVED_NEIGHBORHOODS[saved_neighborhood_id] = deleted
    try:
        async with get_db() as db:
            await db.execute(
                """UPDATE match_saved_neighborhoods
                SET deleted_at = ?
                WHERE saved_neighborhood_id = ?""",
                (deleted.deleted_at.isoformat(), saved_neighborhood_id),
            )
            await db.commit()
    except DatabaseError:
        pass
    return True
