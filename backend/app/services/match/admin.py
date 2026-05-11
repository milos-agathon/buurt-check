from __future__ import annotations

from collections import Counter

from app.models.match import GuardrailEvent


def summarize_guardrail_events(events: list[GuardrailEvent]) -> dict[str, object]:
    return {
        "total": len(events),
        "by_event_type": dict(Counter(event.event_type for event in events)),
        "by_action_taken": dict(Counter(event.action_taken for event in events)),
    }
