from app.models.match import AnalyticsEvent
from app.services.match.instrumentation import (
    REQUIRED_PRODUCT_EVENT_NAMES,
    InMemoryInstrumentationSink,
    summarize_success_metrics,
)


def test_required_prd_success_metric_events_validate():
    assert {
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
