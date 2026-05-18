import json
import re
from pathlib import Path
from unittest.mock import patch

import pytest

from app.config import settings
from app.db import get_db, init_db
from app.services.match import instrumentation
from app.services.match.instrumentation import (
    MATCH_INSTRUMENTATION_SINK,
    REQUIRED_PRODUCT_EVENT_NAMES,
)

CONDITIONAL_SPEC_EVENTS = {"match_quality_feedback_submitted"}
OPTIONAL_MATCH_FIRST_EVENTS = {
    "match_back_to_map_return_failed",
    "match_first_search_link_clicked",
    "match_first_survey_back_clicked",
    "match_first_survey_review_shown",
    "match_job_retry_clicked",
}


@pytest.fixture
async def match_analytics_api_db(tmp_path):
    db_path = str(tmp_path / "match_analytics_api.db")
    await init_db(db_path)
    with patch.object(settings, "database_path", db_path):
        yield


@pytest.mark.asyncio
async def test_match_first_analytics_endpoint_accepts_required_phase8_events(
    client,
    match_analytics_api_db,
):
    MATCH_INSTRUMENTATION_SINK.events.clear()
    required_events = [
        "match_landing_cta_clicked",
        "match_first_search_link_clicked",
        "match_survey_intro_shown",
        "match_survey_started",
        "match_survey_question_shown",
        "match_survey_answer_saved",
        "match_survey_answer_save_failed",
        "match_first_survey_back_clicked",
        "match_survey_completed",
        "match_survey_question_abandoned",
        "match_final_run_cta_clicked",
        "match_job_completed_with_fallback",
        "match_job_failed",
        "match_results_map_opened",
        "match_map_feature_selected",
        "match_amenity_interacted",
        "match_house_selected",
        "match_dossier_opened",
        "match_back_to_map_clicked",
    ]

    for index, event_name in enumerate(required_events):
        response = await client.post(
            "/api/match/analytics",
            json={
                "event_id": f"evt_phase8_{index}",
                "event_name": event_name,
                "session_id": "match_phase8",
                "locale": "en",
                "phase": "final_qa",
                "context": {
                    "question_id": "budget",
                    "step": 2,
                    "total_steps": 11,
                    "neighborhood_id": "nh_phase8",
                    "amenity_key": "parks",
                },
            },
        )

        assert response.status_code == 202, response.text
        assert response.json() == {"accepted": True, "duplicate": False}

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT event_name, context_json
            FROM match_analytics_events
            WHERE session_id = ?
            ORDER BY event_name
            """,
            ("match_phase8",),
        )
        rows = await cursor.fetchall()

    assert {row["event_name"] for row in rows} == set(required_events)
    assert all("budget" in row["context_json"] for row in rows)


def test_backend_analytics_catalog_matches_active_spec_contract():
    spec = Path("../specs/002-match-first-revamp/spec.md").read_text(encoding="utf-8")
    contract = spec.split("#### Analytics Event Contract")[1].split(
        "#### Core State Transitions"
    )[0]
    required_events = {
        match.group(1)
        for match in re.finditer(r"`(match_[^`]+)`", contract)
        if match.group(1) not in CONDITIONAL_SPEC_EVENTS
    }

    assert hasattr(instrumentation, "MATCH_FIRST_ANALYTICS_EVENT_NAMES")
    assert required_events <= instrumentation.MATCH_FIRST_ANALYTICS_EVENT_NAMES
    assert (
        instrumentation.MATCH_FIRST_ANALYTICS_EVENT_NAMES - required_events
        <= OPTIONAL_MATCH_FIRST_EVENTS
    )
    assert instrumentation.MATCH_FIRST_ANALYTICS_EVENT_NAMES <= REQUIRED_PRODUCT_EVENT_NAMES


@pytest.mark.asyncio
async def test_match_first_analytics_endpoint_deduplicates_client_event_ids(
    client,
    match_analytics_api_db,
):
    MATCH_INSTRUMENTATION_SINK.events.clear()
    payload = {
        "event_id": "evt_same",
        "event_name": "match_results_map_opened",
        "session_id": "match_dedupe",
        "locale": "nl",
        "phase": "results",
        "context": {"result_set_id": "mrs_1"},
    }

    first = await client.post("/api/match/analytics", json=payload)
    second = await client.post("/api/match/analytics", json=payload)

    assert first.status_code == 202
    assert first.json() == {"accepted": True, "duplicate": False}
    assert second.status_code == 202
    assert second.json() == {"accepted": True, "duplicate": True}

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_analytics_events WHERE analytics_event_id = ?",
            ("evt_same",),
        )
        row = await cursor.fetchone()

    assert row["count"] == 1


@pytest.mark.asyncio
async def test_match_first_analytics_endpoint_redacts_or_drops_private_payload(
    client,
    match_analytics_api_db,
):
    response = await client.post(
        "/api/match/analytics",
        json={
            "event_id": "evt_private",
            "event_name": "match_survey_answer_saved",
            "session_id": "match_private",
            "locale": "en",
            "phase": "survey_question",
            "context": {
                "question_id": "anchor_location",
                "step": 4,
                "email": "person@example.test",
                "answer_label": "Translated label",
                "anchor_label": "Utrecht Centraal",
                "exact_anchor": "Private street 1",
                "free_text": "I want to live by my office",
                "address_id": "0363010000123456",
                "vbo_id": "0363010000123456",
                "lookup_id": "adr-private",
                "route": "#/address/0363010000123456",
                "candidate_id": "cand_private",
                "selected_candidate_id": "cand_private",
                "selected_house_id": "bldg_private",
                "building_id": "bldg_private",
                "nested": {
                    "building_id": "bldg_nested",
                    "fallback_reason_code": "match.neighborhood.no_reliable_address",
                },
            },
        },
    )

    assert response.status_code == 202, response.text

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT context_json
            FROM match_analytics_events
            WHERE analytics_event_id = ?
            """,
            ("evt_private",),
        )
        row = await cursor.fetchone()

    context = json.loads(row["context_json"])
    assert context == {
        "email": "[redacted]",
        "phase": "survey_question",
        "question_id": "anchor_location",
        "step": 4,
    }
    raw = row["context_json"]
    assert "Translated label" not in raw
    assert "Utrecht Centraal" not in raw
    assert "Private street" not in raw
    assert "I want to live" not in raw
    assert "0363010000123456" not in raw
    assert "adr-private" not in raw
    assert "cand_private" not in raw
    assert "bldg_private" not in raw
    assert "bldg_nested" not in raw
    assert "match.neighborhood.no_reliable_address" not in raw


@pytest.mark.asyncio
async def test_match_first_analytics_endpoint_drops_unknown_free_text_context(
    client,
    match_analytics_api_db,
):
    response = await client.post(
        "/api/match/analytics",
        json={
            "event_id": "evt_unknown_context",
            "event_name": "match_results_map_opened",
            "session_id": "match_unknown_context",
            "locale": "en",
            "phase": "results",
            "context": {
                "result_set_id": "mrs_public",
                "unknown_note": "I want to live near my office",
                "translated_label": "Mijn buurt",
                "custom_anchor": "Private street 1",
            },
        },
    )

    assert response.status_code == 202, response.text

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT context_json
            FROM match_analytics_events
            WHERE analytics_event_id = ?
            """,
            ("evt_unknown_context",),
        )
        row = await cursor.fetchone()

    context = json.loads(row["context_json"])
    assert context == {"phase": "results", "result_set_id": "mrs_public"}
    raw = row["context_json"]
    assert "I want to live" not in raw
    assert "Mijn buurt" not in raw
    assert "Private street" not in raw


@pytest.mark.asyncio
async def test_match_first_analytics_endpoint_drops_unsafe_allowed_key_values(
    client,
    match_analytics_api_db,
):
    response = await client.post(
        "/api/match/analytics",
        json={
            "event_id": "evt_allowed_key_privacy",
            "event_name": "match_results_map_opened",
            "session_id": "match_allowed_context",
            "locale": "en",
            "phase": "results",
            "context": {
                "reason": "I want to live near my office",
                "source": "landing hero copy",
                "session_id": "match_lookup=adr-private",
                "status": "completed",
                "result_set_id": "mrs_public",
                "fallback_reason_code": "match.warning.advanced_ranking_skipped",
            },
        },
    )

    assert response.status_code == 202, response.text

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT context_json
            FROM match_analytics_events
            WHERE analytics_event_id = ?
            """,
            ("evt_allowed_key_privacy",),
        )
        row = await cursor.fetchone()

    context = json.loads(row["context_json"])
    assert context == {
        "fallback_reason_code": "match.warning.advanced_ranking_skipped",
        "phase": "results",
        "result_set_id": "mrs_public",
        "status": "completed",
    }
    raw = row["context_json"]
    assert "I want to live" not in raw
    assert "landing hero copy" not in raw
    assert "match_lookup" not in raw
    assert "adr-private" not in raw


@pytest.mark.asyncio
async def test_match_first_analytics_endpoint_rejects_private_event_id_or_phase(
    client,
    match_analytics_api_db,
):
    private_event_id = await client.post(
        "/api/match/analytics",
        json={
            "event_id": "evt_#/address/0363010000123456",
            "event_name": "match_results_map_opened",
            "session_id": "match_private_id",
            "locale": "en",
            "context": {"result_set_id": "mrs_public"},
        },
    )
    private_phase = await client.post(
        "/api/match/analytics",
        json={
            "event_id": "evt_private_phase",
            "event_name": "match_results_map_opened",
            "session_id": "match_private_id",
            "locale": "en",
            "phase": "#/address/0363010000123456?lookup=adr-private",
            "context": {"result_set_id": "mrs_public"},
        },
    )

    assert private_event_id.status_code == 422
    assert private_phase.status_code == 422

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT COUNT(*) AS count
            FROM match_analytics_events
            WHERE session_id = ?
            """,
            ("match_private_id",),
        )
        row = await cursor.fetchone()

    assert row["count"] == 0


@pytest.mark.asyncio
async def test_match_first_analytics_endpoint_rejects_private_session_id(
    client,
    match_analytics_api_db,
):
    for index, session_id in enumerate(
        (
            "0363010000123456",
            "match_#/address/0363010000123456",
            "match_lookup=adr-private",
            "person@example.test",
            "I want to live near my office",
        )
    ):
        response = await client.post(
            "/api/match/analytics",
            json={
                "event_id": f"evt_private_session_{index}",
                "event_name": "match_results_map_opened",
                "session_id": session_id,
                "locale": "en",
                "context": {"result_set_id": "mrs_public"},
            },
        )

        assert response.status_code == 422

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT COUNT(*) AS count
            FROM match_analytics_events
            WHERE analytics_event_id LIKE ?
            """,
            ("evt_private_session_%",),
        )
        row = await cursor.fetchone()

    assert row["count"] == 0


@pytest.mark.asyncio
async def test_match_first_analytics_endpoint_rejects_legacy_instrumentation_events(
    client,
    match_analytics_api_db,
):
    for event_name in ("match_listing_clicked", "match_alert_created", "match_report_viewed"):
        response = await client.post(
            "/api/match/analytics",
            json={
                "event_id": f"evt_{event_name}",
                "event_name": event_name,
                "session_id": "match_legacy_reject",
                "locale": "en",
                "context": {},
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "match.analytics.invalid_event"


@pytest.mark.asyncio
async def test_match_first_analytics_endpoint_rejects_unknown_or_protected_payloads(
    client,
    match_analytics_api_db,
):
    unknown = await client.post(
        "/api/match/analytics",
        json={
            "event_id": "evt_unknown",
            "event_name": "match_unrelated_account_created",
            "session_id": "match_reject",
            "locale": "en",
            "context": {},
        },
    )
    protected = await client.post(
        "/api/match/analytics",
        json={
            "event_id": "evt_protected",
            "event_name": "match_survey_answer_saved",
            "session_id": "match_reject",
            "locale": "en",
            "context": {"nationality": "not_allowed"},
        },
    )

    assert unknown.status_code == 422
    assert unknown.json()["detail"] == "match.analytics.invalid_event"
    assert protected.status_code == 422
    assert protected.json()["detail"] == "match.analytics.rejected_payload"
