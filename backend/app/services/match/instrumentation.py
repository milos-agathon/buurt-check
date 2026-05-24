from __future__ import annotations

import json
import logging
import re
from collections import Counter

from app.db import DatabaseConnection, get_db
from app.models.match import AnalyticsEvent, AnalyticsEventName, SuccessMetricSummary

logger = logging.getLogger("app.services.match")

MATCH_FIRST_ANALYTICS_EVENT_NAMES = {
    "match_landing_cta_shown",
    "match_landing_cta_clicked",
    "match_first_search_link_clicked",
    "match_survey_intro_shown",
    "match_survey_started",
    "match_survey_question_shown",
    "match_survey_answer_saved",
    "match_survey_answer_save_failed",
    "match_first_survey_back_clicked",
    "match_survey_question_abandoned",
    "match_survey_completed",
    "match_additional_preferences_prompt_shown",
    "match_additional_preferences_skipped",
    "match_additional_preferences_submitted",
    "match_custom_preferences_extracted",
    "match_custom_preferences_reviewed",
    "match_custom_preference_rejected",
    "match_first_survey_review_shown",
    "match_final_run_cta_clicked",
    "match_job_queued",
    "match_job_running",
    "match_job_completed",
    "match_job_failed",
    "match_job_completed_with_fallback",
    "match_job_completed_no_strong_matches",
    "match_job_slow",
    "match_job_retry_clicked",
    "match_results_unavailable",
    "match_success_checkmark_shown",
    "match_results_map_opened",
    "match_results_confidence_sufficient",
    "match_recommendation_selected",
    "match_map_feature_selected",
    "match_map_layer_failed",
    "match_neighborhood_detail_opened",
    "match_building_layer_failed",
    "match_building_layer_partial",
    "match_building_layer_complete",
    "match_amenity_layer_failed",
    "match_amenity_interacted",
    "match_missing_footprint_fallback_shown",
    "match_house_selected",
    "match_dossier_opened",
    "match_no_reliable_address_shown",
    "match_back_to_map_clicked",
    "match_back_to_map_return_success",
    "match_back_to_map_return_failed",
}

LEGACY_PRODUCT_EVENT_NAMES = {
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

REQUIRED_PRODUCT_EVENT_NAMES = MATCH_FIRST_ANALYTICS_EVENT_NAMES | LEGACY_PRODUCT_EVENT_NAMES

MATCH_FIRST_ANALYTICS_CONTEXT_KEYS = frozenset(
    {
        "locale",
        "source",
        "route",
        "session_id",
        "question_id",
        "step",
        "total_steps",
        "answer_type",
        "answer_count",
        "custom_preference_count",
        "custom_preference_key",
        "custom_preference_status",
        "custom_preference_action",
        "from_step",
        "to_step",
        "reason",
        "stale_results",
        "job_id",
        "status",
        "stage",
        "progress",
        "runtime_ms",
        "poll_after_ms",
        "result_set_id",
        "preference_vector_version",
        "recommendation_id",
        "neighborhood_id",
        "amenity_key",
        "result_rank",
        "selected_result_id",
        "map_zoom",
        "mobile_mode",
        "confidence_level",
        "confidence_score",
        "fallback_reason_code",
        "error_code",
        "phase",
    }
)


def _sanitize_context(
    context: dict[str, object],
    *,
    allowed_keys: frozenset[str] | None = None,
    require_stable_strings: bool = False,
) -> dict[str, object]:
    sanitized: dict[str, object] = {}
    for key, value in context.items():
        normalized = str(key).lower()
        if normalized == "email":
            sanitized[str(key)] = "[redacted]"
            continue
        if _is_private_context_key(key):
            continue
        if allowed_keys is not None and normalized not in allowed_keys:
            continue
        sanitized_value = _sanitize_value(
            value,
            require_stable_strings=require_stable_strings,
        )
        if sanitized_value is not None:
            sanitized[str(key)] = sanitized_value
    return sanitized


def sanitize_match_first_analytics_context(context: dict[str, object]) -> dict[str, object]:
    return _sanitize_context(
        context,
        allowed_keys=MATCH_FIRST_ANALYTICS_CONTEXT_KEYS,
        require_stable_strings=True,
    )


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
        "address_id",
        "anchor",
        "anchor_location",
        "anchor_locations",
        "answers",
        "bag_id",
        "building_id",
        "candidate_id",
        "display_label",
        "email",
        "exact_anchor",
        "free_text",
        "immigration_status",
        "label",
        "lookup_id",
        "name",
        "nationality",
        "pand_id",
        "phone",
        "postcode",
        "query",
        "race",
        "raw_answer_refs",
        "raw_answers",
        "religion",
        "selected_candidate_id",
        "selected_house_id",
        "text",
        "vbo_id",
    }
)

REJECTED_CONTEXT_KEYS = frozenset(
    {
        "ethnicity",
        "immigration_status",
        "nationality",
        "race",
        "religion",
    }
)

PRIVATE_CONTEXT_VALUE_PATTERNS = (
    re.compile(r"(?:^|[^\d])\d{16}(?:$|[^\d])"),
    re.compile(r"(?:#)?/address/", re.IGNORECASE),
    re.compile(r"lookup=", re.IGNORECASE),
)
SAFE_ANALYTICS_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_:#/.-]{1,96}$")


def _is_private_context_key(key: object) -> bool:
    normalized = str(key).lower()
    return normalized in PRIVATE_CONTEXT_KEYS or normalized.endswith("_label")


def _is_private_context_value(value: str) -> bool:
    return any(pattern.search(value) for pattern in PRIVATE_CONTEXT_VALUE_PATTERNS)


def _is_stable_analytics_token(value: str) -> bool:
    return bool(SAFE_ANALYTICS_TOKEN_PATTERN.fullmatch(value))


def analytics_payload_contains_rejected_key(payload: object) -> bool:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if str(key).lower() in REJECTED_CONTEXT_KEYS:
                return True
            if analytics_payload_contains_rejected_key(value):
                return True
    if isinstance(payload, list):
        return any(analytics_payload_contains_rejected_key(item) for item in payload)
    return False


def _sanitize_value(value: object, *, require_stable_strings: bool = False) -> object:
    if isinstance(value, dict):
        return _sanitize_context(value, require_stable_strings=require_stable_strings)  # type: ignore[arg-type]
    if isinstance(value, list):
        return [
            sanitized
            for item in value
            if (
                sanitized := _sanitize_value(
                    item,
                    require_stable_strings=require_stable_strings,
                )
            )
            is not None
        ]
    if isinstance(value, str) and "@" in value:
        return "[redacted]"
    if isinstance(value, str) and _is_private_context_value(value):
        return None
    if isinstance(value, str) and require_stable_strings and not _is_stable_analytics_token(value):
        return None
    return value


async def record_match_event(
    event_name: AnalyticsEventName,
    *,
    analytics_event_id: str | None = None,
    session_id: str | None = None,
    locale: str = "en",
    context: dict[str, object] | None = None,
    db: DatabaseConnection | None = None,
) -> AnalyticsEvent:
    sanitized_context = _sanitize_context(context or {})
    event_kwargs: dict[str, object] = {
        "event_name": event_name,
        "session_id": session_id,
        "locale": locale,
        "context": sanitized_context,
    }
    if analytics_event_id is not None:
        event_kwargs["analytics_event_id"] = analytics_event_id
    event = AnalyticsEvent(**event_kwargs)
    recorded = MATCH_INSTRUMENTATION_SINK.record(event)
    params = (
        recorded.analytics_event_id,
        recorded.event_name,
        recorded.session_id,
        recorded.locale,
        recorded.journey_intent,
        json.dumps(recorded.context, sort_keys=True, separators=(",", ":")),
        recorded.created_at.isoformat().replace("+00:00", "Z"),
    )
    if db is not None:
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
            params,
        )
    else:
        async with get_db() as owned_db:
            await owned_db.execute(
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
                params,
            )
            await owned_db.commit()
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
