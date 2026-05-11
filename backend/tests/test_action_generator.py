import pytest

from app.models.prebid import ConfidenceLabel, Signal, SourceReference
from app.services.action_generator import actions_from_signals
from app.services.llm_actions import validate_generated_action_text


def _ref(source_id: str = "official_publications") -> SourceReference:
    return SourceReference(
        source_id=source_id,
        authority="KOOP / officielebekendmakingen.nl",
        name="Official public notices",
        retrieved_at="2026-05-05T10:00:00Z",
        status_label="checked",
    )


def test_generator_creates_source_bound_bilingual_action():
    signal = Signal(
        signal_id="signal-1",
        signal_type="public_notice",
        title="Nearby official public notice found",
        finding="A nearby official public notice was found.",
        confidence=ConfidenceLabel.medium,
        limitation="This does not prove work will happen.",
        recommended_action="Ask for current status.",
        materiality=75,
        source_refs=[_ref()],
    )

    [action] = actions_from_signals([signal])

    assert "public notice" in action.finding.casefold()
    assert "permit" in action.ask_this_en.casefold() or "notice" in action.ask_this_en.casefold()
    assert action.ask_this_nl
    assert action.who_to_ask
    assert action.source_refs[0].source_id == "official_publications"


def test_forbidden_generated_language_is_rejected():
    for phrase in ("proof", "safe to buy", "you should bid", "bewijs", "juridisch advies"):
        with pytest.raises(ValueError):
            validate_generated_action_text(phrase, allowed_source_terms={"permit"})


def test_source_incomplete_action_names_source_and_missing_check():
    signal = Signal(
        signal_id="signal-incomplete-wkpb",
        signal_type="source_incomplete",
        title="PDOK WKPB public-law restrictions could not be checked",
        finding="PDOK WKPB public-law restrictions could not be checked for this address.",
        status="failed",
        confidence=ConfidenceLabel.needs_review,
        limitation="The source could not be checked.",
        recommended_action="Verify separately.",
        materiality=85,
        source_refs=[_ref("wkpb")],
    )
    [action] = actions_from_signals([signal])
    combined = f"{action.finding} {action.ask_this_en} {action.request_this_en}".casefold()
    assert "could not be checked" in combined
    assert action.source_refs[0].source_id == "wkpb"
