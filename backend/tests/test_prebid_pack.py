
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


def test_pack_groups_bilingual_questions_and_source_appendix():
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
                status=SourceStatus.checked,
                basis="address",
                limitation="Limited source.",
            )
        ],
        disclaimer="Not advice.",
    )
    pack = generate_pack_from_briefing(briefing)
    assert pack.status == "ready"
    assert pack.questions_en["municipality"] == ["Can you confirm the public notice status?"]
    assert pack.questions_nl["municipality"] == ["Kunt u de status van de bekendmaking bevestigen?"]
    assert pack.source_appendix[0].source_id == "official_publications"
