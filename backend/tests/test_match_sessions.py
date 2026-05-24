import json
from unittest.mock import patch

import pytest

from app.config import settings
from app.db import get_db, init_db

COMPLETE_ANSWERS = {
    "intent": "buy",
    "budget": {"buy_min": 45000000, "buy_max": 65000000},
    "household_type": "family_young_child",
    "anchor_location": {"type": "city", "label": "Utrecht Centraal"},
    "commute": {"max_minutes": 45},
    "lifestyle_priorities": ["green_access", "calmness", "public_transport"],
    "must_haves": ["parks_nearby", "good_transit"],
    "dealbreakers": ["busy_nightlife"],
    "housing_types": ["row_house", "family_house"],
    "area_character": "quiet_city",
    "language": "en",
}


@pytest.fixture
async def match_db(tmp_path):
    db_path = str(tmp_path / "match_sessions.db")
    await init_db(db_path)
    with patch.object(settings, "database_path", db_path):
        yield


@pytest.mark.asyncio
async def test_match_session_create_read_and_patch_persists_answers(client, match_db):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["session_id"].startswith("match_")
    assert created["phase"] == "survey_intro"
    assert created["answer_version"] == 0

    patch_response = await client.patch(
        f"/api/match/sessions/{created['session_id']}/answers",
        json={"locale": "nl", "current_step": 1, "answers": {"intent": "buy"}},
    )

    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["answer_version"] == 1
    assert patched["is_complete"] is False
    assert patched["validation"]["intent"] == {
        "valid": True,
        "required": True,
        "error_code": None,
    }
    assert patched["stale_results"] is True

    read_response = await client.get(f"/api/match/sessions/{created['session_id']}")
    assert read_response.status_code == 200
    body = read_response.json()
    assert body["locale"] == "nl"
    assert body["current_step"] == 1
    assert body["answers"] == {"intent": "buy"}


@pytest.mark.asyncio
async def test_match_session_complete_answers_return_vector_preview(client, match_db):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]

    response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={"locale": "en", "current_step": 11, "answers": COMPLETE_ANSWERS},
    )

    assert response.status_code == 200
    assert response.json()["is_complete"] is True

    read_response = await client.get(f"/api/match/sessions/{session_id}")
    body = read_response.json()
    vector = body["preference_vector"]
    assert vector["session_id"] == session_id
    assert vector["journey_intent"] == "buy"
    assert "intent:buy" in vector["hard_filters"]
    assert "busy_nightlife" in vector["avoid_signals"]
    assert vector["raw_answer_refs"]["intent"] == "buy"
    assert vector["source_answer_version"] == body["answer_version"]

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM match_preference_vectors WHERE preference_vector_id = ?",
            (vector["preference_vector_id"],),
        )
        row = await cursor.fetchone()

    assert row is not None
    assert row["session_id"] == session_id
    assert row["journey_intent"] == "buy"
    assert row["budget_min_cents"] == 45000000
    assert row["budget_max_cents"] == 65000000
    assert row["monthly_rent_max_cents"] is None
    assert row["source_answer_version"] == body["answer_version"]
    assert row["vector_version"] == vector["vector_version"]
    assert json.loads(row["raw_answer_refs_json"])["intent"] == "buy"


@pytest.mark.asyncio
async def test_match_session_answer_sync_survives_onboarding_answer_save_burst(client, match_db):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["session_id"]

    for _index in range(22):
        await client.patch(
            f"/api/match/sessions/{session_id}/answers",
            json={"locale": "en", "current_step": 1, "answers": {"intent": "buy"}},
        )

    response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={"locale": "en", "current_step": 11, "answers": COMPLETE_ANSWERS},
    )

    assert response.status_code == 200
    assert response.json()["is_complete"] is True


@pytest.mark.asyncio
async def test_match_session_prunes_stale_budget_when_intent_changes(client, match_db):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]

    response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={"locale": "en", "current_step": 11, "answers": COMPLETE_ANSWERS},
    )
    assert response.status_code == 200
    assert response.json()["is_complete"] is True

    response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={"locale": "en", "current_step": 1, "answers": {"intent": "rent"}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["is_complete"] is False
    assert body["validation"]["budget"] == {
        "valid": False,
        "required": True,
        "error_code": "match.warning.required_answer",
    }

    read_response = await client.get(f"/api/match/sessions/{session_id}")
    assert read_response.status_code == 200
    read_body = read_response.json()
    assert read_body["answers"]["intent"] == "rent"
    assert "budget" not in read_body["answers"]
    assert read_body["is_complete"] is False
    assert read_body["preference_vector"] is None


@pytest.mark.asyncio
async def test_match_session_rejects_too_many_lifestyle_priorities(client, match_db):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]

    response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={
            "locale": "en",
            "current_step": 6,
            "answers": {
                "lifestyle_priorities": [
                    "green_access",
                    "calmness",
                    "public_transport",
                    "amenities",
                ]
            },
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "match.warning.too_many_answers"

    read_response = await client.get(f"/api/match/sessions/{session_id}")
    assert read_response.status_code == 200
    assert "lifestyle_priorities" not in read_response.json()["answers"]


@pytest.mark.asyncio
async def test_match_session_validation_uses_stable_error_codes(client, match_db):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]

    response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={"locale": "en", "current_step": 1, "answers": {"intent": None}},
    )

    assert response.status_code == 200
    validation = response.json()["validation"]["intent"]
    assert validation["valid"] is False
    assert validation["required"] is True
    assert validation["error_code"] == "match.warning.required_answer"


@pytest.mark.asyncio
async def test_match_session_rejects_translated_answer_labels(client, match_db):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]

    response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={"locale": "en", "current_step": 1, "answers": {"intent": "Buy"}},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "match.warning.invalid_answer_value"


@pytest.mark.asyncio
async def test_match_session_rejects_protected_trait_answer_keys(client, match_db):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]

    response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={
            "locale": "en",
            "current_step": 1,
            "answers": {"intent": "buy", "nationality": "Dutch"},
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "match.warning.protected_answer_not_allowed"

    read_response = await client.get(f"/api/match/sessions/{session_id}")
    assert read_response.status_code == 200
    assert "nationality" not in read_response.json()["answers"]


@pytest.mark.asyncio
async def test_match_session_delete_removes_anonymous_match_data(client, match_db):
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

    completed_session_response = await client.get(f"/api/match/sessions/{session_id}")
    assert completed_session_response.status_code == 200
    vector_version = completed_session_response.json()["preference_vector_version"]

    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json={
            "source": "review_final_cta",
            "preference_vector_version": vector_version,
        },
    )
    assert run_response.status_code == 202
    status_response = await client.get(f"/api/match/sessions/{session_id}/status")
    assert status_response.status_code == 200
    status_body = status_response.json()
    assert status_body["job_id"] == run_response.json()["job_id"]
    assert status_body["result_set_id"].startswith("mrs_")

    analytics_response = await client.post(
        "/api/match/analytics",
        json={
            "event_id": "evt_delete_session",
            "event_name": "match_survey_completed",
            "session_id": session_id,
            "locale": "en",
            "phase": "review",
            "context": {"session_id": session_id, "total_steps": 11},
        },
    )
    assert analytics_response.status_code == 202

    async with get_db() as db:
        pre_delete_job_cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_jobs WHERE session_id = ?",
            (session_id,),
        )
        pre_delete_job_row = await pre_delete_job_cursor.fetchone()
        pre_delete_result_cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_result_sets WHERE session_id = ?",
            (session_id,),
        )
        pre_delete_result_row = await pre_delete_result_cursor.fetchone()

    assert pre_delete_job_row["count"] > 0
    assert pre_delete_result_row["count"] > 0

    delete_response = await client.delete(f"/api/match/sessions/{session_id}")

    assert delete_response.status_code == 202
    body = delete_response.json()
    assert body["session_id"] == session_id
    assert body["delete_requested"] is True
    assert body["deleted_at"].endswith("Z")

    read_response = await client.get(f"/api/match/sessions/{session_id}")
    assert read_response.status_code == 404
    assert read_response.json()["detail"] == "match.session.not_found"

    async with get_db() as db:
        session_cursor = await db.execute(
            "SELECT deleted_at FROM match_sessions WHERE session_id = ?",
            (session_id,),
        )
        session_row = await session_cursor.fetchone()
        answer_cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_survey_answers WHERE session_id = ?",
            (session_id,),
        )
        answer_row = await answer_cursor.fetchone()
        vector_cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_preference_vectors WHERE session_id = ?",
            (session_id,),
        )
        vector_row = await vector_cursor.fetchone()
        job_cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_jobs WHERE session_id = ?",
            (session_id,),
        )
        job_row = await job_cursor.fetchone()
        result_cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_result_sets WHERE session_id = ?",
            (session_id,),
        )
        result_row = await result_cursor.fetchone()
        analytics_cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_analytics_events WHERE session_id = ?",
            (session_id,),
        )
        analytics_row = await analytics_cursor.fetchone()

    assert session_row["deleted_at"].endswith("Z")
    assert answer_row["count"] == 0
    assert vector_row["count"] == 0
    assert job_row["count"] == 0
    assert result_row["count"] == 0
    assert analytics_row["count"] == 0
