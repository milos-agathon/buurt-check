import json
from unittest.mock import patch

import pytest

from app.config import settings
from app.db import get_db, init_db
from app.models.match import AnalyticsEvent
from app.services.match.instrumentation import (
    MATCH_INSTRUMENTATION_SINK,
    REQUIRED_PRODUCT_EVENT_NAMES,
    InMemoryInstrumentationSink,
    record_match_event,
    summarize_success_metrics,
)
from tests.test_match_sessions import COMPLETE_ANSWERS


def test_required_prd_success_metric_events_validate():
    assert {
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
    } <= REQUIRED_PRODUCT_EVENT_NAMES
    assert {
        "match_job_created",
        "match_job_stage_changed",
        "match_first_run_clicked",
        "match_first_job_queued",
        "match_first_job_stage_changed",
        "match_first_job_completed",
        "match_first_job_failed",
        "match_first_job_completed_with_fallback",
    }.isdisjoint(REQUIRED_PRODUCT_EVENT_NAMES)


def test_instrumentation_sink_records_privacy_safe_events_and_metrics():
    sink = InMemoryInstrumentationSink()
    events = [
        AnalyticsEvent(event_name="match_quiz_started", session_id="anon_metrics", locale="en"),
        AnalyticsEvent(event_name="match_quiz_completed", session_id="anon_metrics", locale="en"),
        AnalyticsEvent(
            event_name="match_report_viewed",
            session_id="anon_metrics",
            locale="en",
            context={"report_id": "report_metrics"},
        ),
        AnalyticsEvent(
            event_name="match_time_to_first_saved_neighborhood",
            session_id="anon_metrics",
            locale="en",
            context={"duration_ms": 42000},
        ),
        AnalyticsEvent(
            event_name="match_neighborhood_saved",
            session_id="anon_metrics",
            locale="en",
            context={"neighborhood_id": "nh_1"},
        ),
        AnalyticsEvent(
            event_name="match_listing_clicked",
            session_id="anon_metrics",
            locale="en",
            context={"provider_mode": "mock"},
        ),
        AnalyticsEvent(event_name="match_alert_created", session_id="anon_metrics", locale="en"),
        AnalyticsEvent(
            event_name="match_report_helpfulness_submitted",
            session_id="anon_metrics",
            locale="en",
            context={"score": 5},
        ),
        AnalyticsEvent(
            event_name="match_feedback_submitted",
            session_id="anon_metrics",
            locale="en",
            context={"feedback_type": "love"},
        ),
        AnalyticsEvent(
            event_name="match_source_clicked",
            session_id="anon_metrics",
            locale="en",
            context={"source_id": "src_green_access"},
        ),
    ]

    for event in events:
        sink.record(event)

    metrics = summarize_success_metrics(sink.events)

    assert metrics["match_quiz_started"].count == 1
    assert metrics["match_quiz_completed"].count == 1
    assert metrics["match_neighborhood_saved"].count == 1
    assert metrics["match_time_to_first_saved_neighborhood"].latest_value == 42000
    assert all("@" not in str(event.context) for event in sink.events)


@pytest.mark.asyncio
async def test_record_match_event_uses_stable_keys_and_persists_sanitized_context(
    match_instrumentation_db,
):
    MATCH_INSTRUMENTATION_SINK.events.clear()

    event = await record_match_event(
        "match_job_slow",
        session_id="anon_metrics",
        locale="en",
        context={
            "email": "person@example.test",
            "stage": "running_models",
            "raw_answers": {"intent": "buy"},
            "anchor_locations": [{"label": "Home", "query": "Exact address"}],
            "nationality": "not_allowed",
        },
    )

    assert event.event_name == "match_job_slow"
    assert event.context["email"] == "[redacted]"
    assert "raw_answers" not in event.context
    assert "anchor_locations" not in event.context
    assert "nationality" not in event.context
    assert MATCH_INSTRUMENTATION_SINK.events[-1].event_name == "match_job_slow"

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT event_name, session_id, locale, context_json
            FROM match_analytics_events
            WHERE analytics_event_id = ?
            """,
            (event.analytics_event_id,),
        )
        row = await cursor.fetchone()

    assert row["event_name"] == "match_job_slow"
    assert row["session_id"] == "anon_metrics"
    assert row["locale"] == "en"
    context = json.loads(row["context_json"])
    assert context == {"email": "[redacted]", "stage": "running_models"}


@pytest.fixture
async def match_instrumentation_db(tmp_path):
    db_path = str(tmp_path / "match_instrumentation.db")
    await init_db(db_path)
    with patch.object(settings, "database_path", db_path):
        yield


@pytest.mark.asyncio
async def test_match_job_lifecycle_records_public_events(client, match_instrumentation_db):
    MATCH_INSTRUMENTATION_SINK.events.clear()
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]
    patch_response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={"locale": "en", "current_step": 11, "answers": COMPLETE_ANSWERS},
    )
    assert patch_response.status_code == 200
    session_response = await client.get(f"/api/match/sessions/{session_id}")
    vector_version = session_response.json()["preference_vector_version"]

    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json={
            "source": "review_final_cta",
            "preference_vector_version": vector_version,
        },
    )

    assert run_response.status_code == 202
    event_names = [event.event_name for event in MATCH_INSTRUMENTATION_SINK.events]
    assert "match_final_run_cta_clicked" in event_names
    assert "match_job_queued" in event_names
    assert "match_job_running" in event_names
    assert "match_job_completed" in event_names
    assert all(
        "internal_error_class" not in event.context
        for event in MATCH_INSTRUMENTATION_SINK.events
    )

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT event_name, context_json
            FROM match_analytics_events
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (session_id,),
        )
        rows = await cursor.fetchall()

    persisted_event_names = [row["event_name"] for row in rows]
    assert "match_final_run_cta_clicked" in persisted_event_names
    assert "match_job_queued" in persisted_event_names
    assert "match_job_running" in persisted_event_names
    assert "match_job_completed" in persisted_event_names
    for row in rows:
        context = json.loads(row["context_json"])
        assert "internal_error_class" not in context
        assert "raw_answers" not in context
        assert "anchor_locations" not in context


@pytest.mark.asyncio
async def test_match_job_lifecycle_persists_session_locale_for_dutch_session(
    client,
    match_instrumentation_db,
):
    MATCH_INSTRUMENTATION_SINK.events.clear()
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "nl", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]
    patch_response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={"locale": "nl", "current_step": 11, "answers": COMPLETE_ANSWERS},
    )
    assert patch_response.status_code == 200
    session_response = await client.get(f"/api/match/sessions/{session_id}")
    vector_version = session_response.json()["preference_vector_version"]

    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json={
            "source": "review_final_cta",
            "preference_vector_version": vector_version,
        },
    )

    assert run_response.status_code == 202

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT event_name, locale
            FROM match_analytics_events
            WHERE session_id = ?
              AND event_name IN (
                'match_final_run_cta_clicked',
                'match_job_queued',
                'match_job_running',
                'match_job_completed',
                'match_job_failed',
                'match_job_completed_with_fallback',
                'match_job_completed_no_strong_matches',
                'match_job_slow'
              )
            ORDER BY created_at ASC
            """,
            (session_id,),
        )
        rows = await cursor.fetchall()

    event_names = {row["event_name"] for row in rows}
    assert {
        "match_final_run_cta_clicked",
        "match_job_queued",
        "match_job_running",
        "match_job_completed",
    } <= event_names
    assert {row["locale"] for row in rows} == {"nl"}
