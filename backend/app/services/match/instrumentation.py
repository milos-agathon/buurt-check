from __future__ import annotations

import logging
from collections import Counter

from app.models.match import AnalyticsEvent, SuccessMetricSummary

logger = logging.getLogger("app.services.match")

REQUIRED_PRODUCT_EVENT_NAMES = {
    "match_quiz_started",
    "match_quiz_completed",
    "match_report_viewed",
    "match_time_to_first_saved_neighborhood",
    "match_neighborhood_saved",
    "match_listing_clicked",
    "match_alert_created",
    "match_report_helpfulness_submitted",
    "match_follow_up_question_submitted",
    "match_feedback_submitted",
    "match_source_clicked",
}


def _sanitize_context(context: dict[str, object]) -> dict[str, object]:
    sanitized: dict[str, object] = {}
    for key, value in context.items():
        if isinstance(value, str) and "@" in value:
            sanitized[key] = "[redacted]"
        elif isinstance(value, dict):
            sanitized[key] = _sanitize_context(value)  # type: ignore[arg-type]
        else:
            sanitized[key] = value
    return sanitized


class InMemoryInstrumentationSink:
    def __init__(self) -> None:
        self.events: list[AnalyticsEvent] = []

    def record(self, event: AnalyticsEvent) -> AnalyticsEvent:
        sanitized = event.model_copy(update={"context": _sanitize_context(event.context)})
        self.events.append(sanitized)
        return sanitized


def log_match_observation(
    event: str,
    *,
    provider_name: str,
    region_config_id: str | None = None,
    status: str,
    context: dict[str, object] | None = None,
) -> None:
    payload = {
        "event": event,
        "provider_name": provider_name,
        "region_config_id": region_config_id,
        "status": status,
        "context": _sanitize_context(context or {}),
    }
    logger.info("match_observation", extra={"match": payload})


def summarize_success_metrics(events: list[AnalyticsEvent]) -> dict[str, SuccessMetricSummary]:
    counts = Counter(event.event_name for event in events)
    latest_values: dict[str, int | float] = {}
    for event in events:
        value = event.context.get("duration_ms") or event.context.get("score")
        if isinstance(value, int | float):
            latest_values[event.event_name] = value

    return {
        event_name: SuccessMetricSummary(
            event_name=event_name,  # type: ignore[arg-type]
            count=counts.get(event_name, 0),
            latest_value=latest_values.get(event_name),
        )
        for event_name in sorted(REQUIRED_PRODUCT_EVENT_NAMES)
    }
