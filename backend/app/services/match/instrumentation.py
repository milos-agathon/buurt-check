from __future__ import annotations

import json
import logging
from collections import Counter

from app.db import get_db
from app.models.match import AnalyticsEvent, AnalyticsEventName, SuccessMetricSummary

logger = logging.getLogger("app.services.match")

REQUIRED_PRODUCT_EVENT_NAMES = {
    "match_final_run_cta_clicked",
    "match_job_queued",
    "match_job_running",
    "match_job_completed",
    "match_job_failed",
    "match_job_completed_with_fallback",
    "match_job_completed_no_strong_matches",
    "match_job_slow",
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
        normalized = str(key).lower()
        if normalized == "email":
            sanitized[str(key)] = "[redacted]"
            continue
        if _is_private_context_key(key):
            continue
        sanitized_value = _sanitize_value(value)
        if sanitized_value is not None:
            sanitized[str(key)] = sanitized_value
    return sanitized


class InMemoryInstrumentationSink:
    def __init__(self) -> None:
        self.events: list[AnalyticsEvent] = []

    def record(self, event: AnalyticsEvent) -> AnalyticsEvent:
        sanitized = event.model_copy(update={"context": _sanitize_context(event.context)})
        self.events.append(sanitized)
        return sanitized


MATCH_INSTRUMENTATION_SINK = InMemoryInstrumentationSink()

PRIVATE_CONTEXT_KEYS = frozenset(
    {
        "address",
        "anchor",
        "anchor_location",
        "anchor_locations",
        "answers",
        "display_label",
        "email",
        "exact_anchor",
        "free_text",
        "immigration_status",
        "label",
        "name",
        "nationality",
        "phone",
        "postcode",
        "query",
        "race",
        "raw_answer_refs",
        "raw_answers",
        "religion",
        "text",
    }
)


def _is_private_context_key(key: object) -> bool:
    normalized = str(key).lower()
    return normalized in PRIVATE_CONTEXT_KEYS or normalized.endswith("_label")


def _sanitize_value(value: object) -> object:
    if isinstance(value, dict):
        return _sanitize_context(value)  # type: ignore[arg-type]
    if isinstance(value, list):
        return [
            sanitized
            for item in value
            if (sanitized := _sanitize_value(item)) is not None
        ]
    if isinstance(value, str) and "@" in value:
        return "[redacted]"
    return value


async def record_match_event(
    event_name: AnalyticsEventName,
    *,
    session_id: str | None = None,
    locale: str = "en",
    context: dict[str, object] | None = None,
) -> AnalyticsEvent:
    sanitized_context = _sanitize_context(context or {})
    event = AnalyticsEvent(
        event_name=event_name,
        session_id=session_id,
        locale=locale,  # type: ignore[arg-type]
        context=sanitized_context,
    )
    recorded = MATCH_INSTRUMENTATION_SINK.record(event)
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO match_analytics_events (
                analytics_event_id,
                event_name,
                session_id,
                locale,
                journey_intent,
                context_json,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                recorded.analytics_event_id,
                recorded.event_name,
                recorded.session_id,
                recorded.locale,
                recorded.journey_intent,
                json.dumps(recorded.context, sort_keys=True, separators=(",", ":")),
                recorded.created_at.isoformat().replace("+00:00", "Z"),
            ),
        )
        await db.commit()
    return recorded


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
