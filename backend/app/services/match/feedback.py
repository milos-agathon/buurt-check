from __future__ import annotations

import json

from app.db import DatabaseError, get_db
from app.models.match import (
    FeedbackEvent,
    FeedbackRerankingHint,
    MatchFeedbackRequest,
    MatchFeedbackResponse,
)

_FEEDBACK_EVENTS: dict[str, FeedbackEvent] = {}

_REASON_WEIGHT_HINTS: dict[str, dict[str, float]] = {
    "green_and_connected": {"green_access": 0.12, "mobility": 0.08},
    "quiet": {"calmness": 0.1},
    "too_far": {"mobility": 0.1},
    "too_busy": {"calmness": 0.1},
    "too_expensive": {"affordability": 0.12},
}


def _event_from_request(payload: MatchFeedbackRequest) -> FeedbackEvent:
    return FeedbackEvent(**payload.model_dump())


def build_feedback_adjusted_ranking(
    feedback_items: list[MatchFeedbackRequest | FeedbackEvent],
) -> FeedbackRerankingHint:
    boost: list[str] = []
    soften: list[str] = []
    suppress: list[str] = []
    weights: dict[str, float] = {}

    for item in feedback_items:
        if item.feedback_type == "love":
            boost.append(item.neighborhood_id)
        elif item.feedback_type == "maybe":
            soften.append(item.neighborhood_id)
        elif item.feedback_type == "not_for_me":
            suppress.append(item.neighborhood_id)

        for key, value in _REASON_WEIGHT_HINTS.get(item.reason_code or "", {}).items():
            weights[key] = round(weights.get(key, 0.0) + value, 3)

    return FeedbackRerankingHint(
        boost_neighborhood_ids=sorted(set(boost)),
        soften_neighborhood_ids=sorted(set(soften)),
        suppress_neighborhood_ids=sorted(set(suppress)),
        adjusted_weight_inputs=weights,
        historical_recommendations_mutated=False,
    )


async def _persist_feedback_event(event: FeedbackEvent) -> None:
    try:
        async with get_db() as db:
            await db.execute(
                """INSERT OR REPLACE INTO match_feedback_events (
                    feedback_event_id,
                    session_id,
                    report_id,
                    recommendation_id,
                    neighborhood_id,
                    feedback_type,
                    reason_code,
                    payload_json,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    event.feedback_event_id,
                    event.session_id,
                    event.report_id,
                    event.recommendation_id,
                    event.neighborhood_id,
                    event.feedback_type,
                    event.reason_code,
                    json.dumps(event.payload),
                    event.created_at.isoformat(),
                ),
            )
            await db.commit()
    except DatabaseError:
        return


async def record_feedback(payload: MatchFeedbackRequest) -> MatchFeedbackResponse:
    event = _event_from_request(payload)
    _FEEDBACK_EVENTS[event.feedback_event_id] = event
    await _persist_feedback_event(event)
    relevant_events = [
        item
        for item in _FEEDBACK_EVENTS.values()
        if item.session_id == event.session_id
        and item.report_id == event.report_id
        and item.feedback_type != "undo"
    ]
    hint = build_feedback_adjusted_ranking(relevant_events or [event])
    return MatchFeedbackResponse(
        feedback_event_id=event.feedback_event_id,
        feedback_event=event,
        reranking_available=bool(
            hint.boost_neighborhood_ids
            or hint.soften_neighborhood_ids
            or hint.suppress_neighborhood_ids
        ),
        reranking_hint=hint,
        explanation_code=hint.explanation_code,
    )


def list_feedback_events(*, session_id: str | None = None) -> list[FeedbackEvent]:
    return sorted(
        [
            event
            for event in _FEEDBACK_EVENTS.values()
            if session_id is None or event.session_id == session_id
        ],
        key=lambda event: event.created_at,
    )
