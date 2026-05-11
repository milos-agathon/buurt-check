from app.models.match import GuardrailEvent
from app.services.match.admin import summarize_guardrail_events


def test_guardrail_events_summarize_for_admin_visibility():
    events = [
        GuardrailEvent(
            event_type="unsupported_claim",
            action_taken="blocked",
            details={"claim": "invented"},
        ),
        GuardrailEvent(
            event_type="missing_citation",
            action_taken="fallback_used",
            details={"section": "profile_summary"},
        ),
    ]

    summary = summarize_guardrail_events(events)

    assert summary["total"] == 2
    assert summary["by_event_type"]["unsupported_claim"] == 1
    assert summary["by_action_taken"]["fallback_used"] == 1
