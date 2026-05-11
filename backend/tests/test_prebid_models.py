import pytest
from pydantic import ValidationError

from app.models.prebid import (
    ActionItem,
    ConfidenceLabel,
    PrebidBriefingResponse,
    ResultState,
    Signal,
    SourceReference,
)


def _source_ref() -> SourceReference:
    return SourceReference(
        source_id="official_publications",
        authority="KOOP / officielebekendmakingen.nl",
        name="Official public notices",
        retrieved_at="2026-05-05T10:00:00Z",
        source_date="2026-04-01",
        status_label="checked",
        record_id="gmb-2026-1",
        url="https://zoek.officielebekendmakingen.nl/gmb-2026-1.html",
    )


def _action(action_id: str, rank: int) -> ActionItem:
    return ActionItem(
        action_id=action_id,
        signal_id=f"signal-{rank}",
        rank=rank,
        rank_score=80,
        finding="A nearby permit/public notice was found.",
        why_it_matters="It may affect nuisance, access, or street context.",
        ask_this_en="Can you confirm the current status and expected timeline?",
        ask_this_nl="Kunt u de huidige status en verwachte planning bevestigen?",
        request_this_en="Permit or public notice source page.",
        request_this_nl="Vergunning- of bekendmakingspagina.",
        who_to_ask=["selling_agent", "municipality"],
        confidence=ConfidenceLabel.medium,
        limitation="This source does not prove that work will happen.",
        source_refs=[_source_ref()],
    )


def _signal() -> Signal:
    return Signal(
        signal_id="signal-1",
        signal_type="public_notice",
        title="Nearby official public notice found",
        finding="A nearby official public notice was found.",
        confidence=ConfidenceLabel.medium,
        limitation="This source does not prove that work will happen.",
        recommended_action="Ask for the current status and source page.",
        materiality=75,
        source_refs=[_source_ref()],
    )


def test_briefing_caps_top_actions_at_three():
    with pytest.raises(ValidationError):
        PrebidBriefingResponse(
            briefing_id="briefing-1",
            report_id="report-1",
            vbo_id="0363010000696734",
            confirmed_address="Keizersgracht 100, Amsterdam",
            checked_at="2026-05-05T10:00:00Z",
            result_state=ResultState.signals_found,
            top_actions=[
                _action("a1", 1),
                _action("a2", 2),
                _action("a3", 3),
                _action("a4", 4),
            ],
            disclaimer="Not advice.",
        )


def test_action_item_requires_source_reference_and_recipient():
    source_free = _action("a1", 1).model_dump()
    source_free["source_refs"] = []
    with pytest.raises(ValidationError):
        ActionItem(**source_free)

    no_source_field = _action("a1", 1).model_dump()
    del no_source_field["source_refs"]
    with pytest.raises(ValidationError):
        ActionItem(**no_source_field)

    recipient_free = _action("a1", 1).model_dump()
    recipient_free["who_to_ask"] = []
    with pytest.raises(ValidationError):
        ActionItem(**recipient_free)

    no_recipient_field = _action("a1", 1).model_dump()
    del no_recipient_field["who_to_ask"]
    with pytest.raises(ValidationError):
        ActionItem(**no_recipient_field)


def test_action_item_defaults_to_not_required_review_state():
    item = _action("a1", 1)
    assert item.review_state == "not_required"
    assert item.source_refs[0].source_id == "official_publications"


def test_signal_requires_source_reference():
    empty_refs = _signal().model_dump()
    empty_refs["source_refs"] = []
    with pytest.raises(ValidationError):
        Signal(**empty_refs)

    missing_refs = _signal().model_dump()
    del missing_refs["source_refs"]
    with pytest.raises(ValidationError):
        Signal(**missing_refs)


def test_deleted_admin_tombstone_omits_identifiers():
    from app.models.prebid import AdminSourceRunTombstoneResponse

    row = AdminSourceRunTombstoneResponse(source_run_id="run-1", deleted_at="2026-05-05T10:00:00Z")
    dumped = row.model_dump()
    assert dumped["tombstone"] is True
    for forbidden in (
        "vbo_id",
        "report_id",
        "confirmed_address",
        "postcode",
        "coverage",
        "records",
        "signals",
        "actions",
    ):
        assert forbidden not in dumped
