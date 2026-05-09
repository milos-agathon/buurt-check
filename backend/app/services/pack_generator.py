from __future__ import annotations

from collections import defaultdict

from app.models.prebid import PrebidBriefingResponse, PrebidPackResponse, PrebidPackSection
from app.services.llm_actions import validate_action_specificity


def generate_pack_from_briefing(briefing: PrebidBriefingResponse) -> PrebidPackResponse:
    questions_en: dict[str, list[str]] = defaultdict(list)
    questions_nl: dict[str, list[str]] = defaultdict(list)
    requests_en: list[str] = []
    requests_nl: list[str] = []
    evidence_narrative: list[str] = []
    for action in briefing.top_actions:
        validate_action_specificity(action)
        for recipient in action.who_to_ask:
            key = recipient.value if hasattr(recipient, "value") else str(recipient)
            questions_en[key].append(action.ask_this_en)
            questions_nl[key].append(action.ask_this_nl)
        requests_en.append(action.request_this_en)
        requests_nl.append(action.request_this_nl)
        evidence_narrative.append(
            " ".join(
                [
                    action.finding,
                    action.why_it_matters,
                    f"Confidence: {action.confidence}.",
                    f"Limitation: {action.limitation}",
                ]
            )
        )

    has_pending = any(action.review_state == "pending" for action in briefing.top_actions)
    coverage_detail = []
    for row in briefing.coverage:
        pieces = [
            f"{row.label}: {row.status}",
            f"basis {row.basis}",
        ]
        if row.method_version:
            pieces.append(f"method {row.method_version}")
        if row.duration_ms is not None:
            pieces.append(f"duration {row.duration_ms}ms")
        if row.error_code:
            pieces.append(f"error {row.error_code}")
        pieces.append(row.limitation)
        coverage_detail.append("; ".join(pieces))
    return PrebidPackResponse(
        pack_id=f"pack-{briefing.briefing_id}",
        briefing_id=briefing.briefing_id,
        report_id=briefing.report_id or "",
        vbo_id=briefing.vbo_id,
        confirmed_address=briefing.confirmed_address,
        checked_at=briefing.checked_at,
        status="queued_for_review" if has_pending else "ready",
        address_summary=PrebidPackSection(
            title="Address and source-run summary",
            body=[
                briefing.confirmed_address,
                f"Checked at {briefing.checked_at}",
                f"Result state: {briefing.result_state}",
            ],
        ),
        top_items=briefing.top_actions,
        questions_en=dict(questions_en),
        questions_nl=dict(questions_nl),
        document_requests_en=requests_en,
        document_requests_nl=requests_nl,
        evidence_narrative=evidence_narrative,
        coverage_detail=coverage_detail,
        source_appendix=briefing.coverage,
        not_covered=[
            "This pack does not replace legal, technical, tax, mortgage, or purchase advice.",
            "Source checks can miss records when public-source metadata or geometry differs.",
        ],
        disclaimer=briefing.disclaimer,
    )
