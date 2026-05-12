import pytest
from pydantic import ValidationError

from app.models.match import MatchFeedbackRequest
from app.services.match.feedback import (
    build_feedback_adjusted_ranking,
    list_feedback_events,
    record_feedback,
)


@pytest.mark.asyncio
async def test_feedback_event_persists_and_returns_explainable_reranking_hint():
    payload = MatchFeedbackRequest(
        session_id="anon_feedback",
        report_id="report_feedback",
        recommendation_id="rec_ijburg",
        neighborhood_id="nh_amsterdam_ijburg",
        feedback_type="love",
        reason_code="green_and_connected",
        payload={"source": "recommendation_card"},
    )

    response = await record_feedback(payload)

    assert response.feedback_event.feedback_type == "love"
    assert response.analytics_event == "match_feedback_submitted"
    assert response.reranking_available is True
    assert response.explanation_code == "match.feedback.explanation.updatedRanking"
    assert response.reranking_hint.boost_neighborhood_ids == ["nh_amsterdam_ijburg"]
    assert response.reranking_hint.suppress_neighborhood_ids == []
    assert response.reranking_hint.adjusted_weight_inputs["green_access"] > 0

    events = list_feedback_events(session_id="anon_feedback")
    assert [event.feedback_event_id for event in events] == [
        response.feedback_event.feedback_event_id
    ]


def test_feedback_builds_adjusted_ranking_without_mutating_historical_scores():
    loved = MatchFeedbackRequest(
        neighborhood_id="nh_loved",
        feedback_type="love",
        reason_code="green_and_connected",
    )
    rejected = MatchFeedbackRequest(
        neighborhood_id="nh_rejected",
        feedback_type="not_for_me",
        reason_code="too_far",
    )

    adjusted = build_feedback_adjusted_ranking([loved, rejected])

    assert adjusted.boost_neighborhood_ids == ["nh_loved"]
    assert adjusted.suppress_neighborhood_ids == ["nh_rejected"]
    assert adjusted.adjusted_weight_inputs["green_access"] > 0
    assert adjusted.adjusted_weight_inputs["mobility"] > 0
    assert adjusted.historical_recommendations_mutated is False


def test_feedback_payload_rejects_protected_trait_inference():
    with pytest.raises(ValidationError, match="protected traits"):
        MatchFeedbackRequest(
            neighborhood_id="nh_any",
            feedback_type="maybe",
            payload={"nationality": "Dutch"},
        )


@pytest.mark.asyncio
async def test_feedback_api_records_event_and_rejects_sensitive_payload(client):
    accepted = await client.post(
        "/api/match/feedback",
        json={
            "session_id": "anon_feedback_api",
            "report_id": "report_api",
            "recommendation_id": "rec_api",
            "neighborhood_id": "nh_rotterdam_katendrecht",
            "feedback_type": "not_for_me",
            "reason_code": "too_busy",
            "payload": {"source": "recommendation_card"},
        },
    )
    rejected = await client.post(
        "/api/match/feedback",
        json={
            "neighborhood_id": "nh_any",
            "feedback_type": "maybe",
            "payload": {"religion": "raw sensitive signal"},
        },
    )

    assert accepted.status_code == 200
    body = accepted.json()
    assert body["analytics_event"] == "match_feedback_submitted"
    assert body["reranking_hint"]["suppress_neighborhood_ids"] == [
        "nh_rotterdam_katendrecht"
    ]
    assert body["explanation_code"] == "match.feedback.explanation.updatedRanking"
    assert rejected.status_code == 422
