import json
from unittest.mock import patch

import pytest

from app.config import settings
from app.db import get_db, init_db
from app.services.match.custom_preferences import extract_custom_preferences
from app.services.match.instrumentation import sanitize_match_first_analytics_context
from tests.test_match_sessions import COMPLETE_ANSWERS


@pytest.fixture
async def match_custom_preferences_db(tmp_path):
    db_path = str(tmp_path / "match_custom_preferences.db")
    await init_db(db_path)
    with patch.object(settings, "database_path", db_path):
        yield


def test_custom_preference_registry_classifies_supported_context_without_raw_text():
    extraction = extract_custom_preferences(
        "I want to be close to the beach and near a mosque.",
        locale="en",
    )

    by_key = {item.normalized_key: item for item in extraction.items}
    assert by_key["coast_or_beach_proximity"].use_status == "saved_unsupported"
    assert by_key["coast_or_beach_proximity"].privacy_class == "standard"
    assert by_key["coast_or_beach_proximity"].feature_key is None
    assert by_key["place_of_worship_proximity"].use_status == "map_context_only"
    assert by_key["place_of_worship_proximity"].privacy_class == "sensitive_context"
    assert by_key["place_of_worship_proximity"].weight == 0
    assert "mosque" not in extraction.model_dump_json().lower()


def test_custom_preference_registry_blocks_demographic_and_safety_claims():
    extraction = extract_custom_preferences(
        "Find a very safe area where people like me live.",
        locale="en",
    )

    statuses = {item.use_status for item in extraction.items}
    keys = {item.normalized_key for item in extraction.items}
    assert "disallowed" in statuses
    assert "needs_clarification" in statuses
    assert "protected_trait_preference" in keys
    assert "safety_claim_requested" in keys
    assert all(item.weight == 0 for item in extraction.items)


@pytest.mark.asyncio
async def test_custom_preference_extract_endpoint_uses_registry_and_no_store(
    client,
    match_custom_preferences_db,
):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]

    response = await client.post(
        f"/api/match/sessions/{session_id}/custom-preferences/extract",
        json={
            "locale": "en",
            "text": "Close to the beach, near a temple, but not where people like me live.",
        },
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["session_id"] == session_id
    assert body["locale"] == "en"
    assert {item["use_status"] for item in body["items"]} >= {
        "saved_unsupported",
        "map_context_only",
        "disallowed",
    }
    assert "Close to the beach" not in json.dumps(body)
    assert all("explanation_key" in item for item in body["items"])


@pytest.mark.asyncio
async def test_reviewed_custom_preferences_are_persisted_and_included_in_vector(
    client,
    match_custom_preferences_db,
):
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
    initial_session = (await client.get(f"/api/match/sessions/{session_id}")).json()
    initial_vector_version = initial_session["preference_vector_version"]

    extraction_response = await client.post(
        f"/api/match/sessions/{session_id}/custom-preferences/extract",
        json={"locale": "en", "text": "Close to the beach and near a church."},
    )
    items = extraction_response.json()["items"]
    review_response = await client.patch(
        f"/api/match/sessions/{session_id}/custom-preferences/review",
        json={"locale": "en", "skipped": False, "items": items},
    )

    assert review_response.status_code == 200
    assert review_response.headers["cache-control"] == "no-store"
    review_body = review_response.json()
    assert review_body["reviewed"] is True
    assert review_body["skipped"] is False
    assert review_body["custom_preference_version"] == 1

    read_response = await client.get(f"/api/match/sessions/{session_id}")
    body = read_response.json()
    vector = body["preference_vector"]
    assert body["custom_preferences_reviewed"] is True
    assert body["custom_preferences_skipped"] is False
    assert body["preference_vector_version"] != initial_vector_version
    assert vector["custom_preferences"] == body["custom_preferences"]
    assert {
        item["normalized_key"] for item in vector["custom_preferences"]
    } == {"coast_or_beach_proximity", "place_of_worship_proximity"}
    assert all(item["weight"] == 0 for item in vector["custom_preferences"])
    assert "custom_preferences" not in vector["raw_answer_refs"]

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT custom_preferences_json
            FROM match_preference_vectors
            WHERE preference_vector_id = ?
            """,
            (vector["preference_vector_id"],),
        )
        row = await cursor.fetchone()

    assert row is not None
    assert json.loads(row["custom_preferences_json"]) == vector["custom_preferences"]


@pytest.mark.asyncio
async def test_custom_preferences_can_be_skipped_without_storing_items(
    client,
    match_custom_preferences_db,
):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "nl", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]
    await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={
            "locale": "nl",
            "current_step": 11,
            "answers": {**COMPLETE_ANSWERS, "language": "nl"},
        },
    )

    response = await client.patch(
        f"/api/match/sessions/{session_id}/custom-preferences/review",
        json={"locale": "nl", "skipped": True, "items": []},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["skipped"] is True
    assert body["items"] == []

    read_response = await client.get(f"/api/match/sessions/{session_id}")
    session = read_response.json()
    assert session["custom_preferences_reviewed"] is True
    assert session["custom_preferences_skipped"] is True
    assert session["custom_preferences"] == []
    assert session["preference_vector"]["custom_preferences"] == []


def test_custom_preference_analytics_keeps_status_keys_but_drops_free_text():
    context = sanitize_match_first_analytics_context(
        {
            "custom_preference_count": 2,
            "custom_preference_status": "map_context_only",
            "custom_preference_key": "place_of_worship_proximity",
            "free_text": "near a mosque",
            "text": "close to the beach",
            "raw_answers": {"additional": "private"},
        }
    )

    assert context == {
        "custom_preference_count": 2,
        "custom_preference_status": "map_context_only",
        "custom_preference_key": "place_of_worship_proximity",
    }
