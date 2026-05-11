from app.models.prebid import (
    ActionItem,
    ConfidenceLabel,
    PrebidBriefingResponse,
    ResultState,
    SourceCoverageItem,
    SourcePriority,
    SourceReference,
    SourceStatus,
)
from app.services.pack_generator import generate_pack_from_briefing
from app.services.prebid_pdf_export import generate_prebid_pack_pdf


def test_prebid_pack_pdf_contains_questions_and_source_appendix():
    ref = SourceReference(
        source_id="official_publications",
        authority="KOOP",
        name="Official public notices",
        retrieved_at="2026-05-05T10:00:00Z",
    )
    action = ActionItem(
        action_id="a1",
        signal_id="s1",
        rank=1,
        rank_score=80,
        finding="A public notice record was found.",
        why_it_matters="This may affect timing.",
        ask_this_en="Can you confirm the public notice status?",
        ask_this_nl="Kunt u de status van de bekendmaking bevestigen?",
        request_this_en="Request the public notice source page.",
        request_this_nl="Vraag de bekendmakingspagina op.",
        who_to_ask=["municipality"],
        confidence=ConfidenceLabel.medium,
        limitation="Limited source.",
        source_refs=[ref],
    )
    briefing = PrebidBriefingResponse(
        briefing_id="brief-1",
        report_id="report-1",
        vbo_id="0363010000696734",
        confirmed_address="Keizersgracht 100, Amsterdam",
        checked_at="2026-05-05T10:00:00Z",
        result_state=ResultState.signals_found,
        top_actions=[action],
        coverage=[
            SourceCoverageItem(
                source_id="official_publications",
                authority="KOOP",
                label="Official public notices",
                priority=SourcePriority.p0,
                status=SourceStatus.failed,
                basis="address",
                limitation="Failed source limitation.",
            )
        ],
        disclaimer="Not purchase, bid, legal, or technical advice.",
    )

    pdf_bytes = generate_prebid_pack_pdf(generate_pack_from_briefing(briefing))

    assert b"Pre-Bid Evidence & Questions Pack" in pdf_bytes
    assert b"Can you confirm the public notice status" in pdf_bytes
    assert b"Kunt u de status van de bekendmaking bevestigen" in pdf_bytes
    assert b"Document requests" in pdf_bytes
    assert b"Request the public notice source page" in pdf_bytes
    assert b"Vraag de bekendmakingspagina op" in pdf_bytes
    assert b"Evidence narrative" in pdf_bytes
    assert b"This may affect timing" in pdf_bytes
    assert b"Source appendix" in pdf_bytes
    assert b"Status: failed" in pdf_bytes
    assert b"Basis: address" in pdf_bytes
    assert b"Failed source limitation" in pdf_bytes
