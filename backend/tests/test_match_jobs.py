import asyncio
from unittest.mock import patch

import pytest

from app.config import settings
from app.db import get_db, init_db
from app.models.match import RecommendationSet
from app.services.match.jobs import (
    STAGE_SEQUENCE,
    expire_jobs,
    recover_stale_jobs,
    run_match_job,
)
from app.services.match.model_selection import ModelSelectionDecision
from tests.test_match_sessions import COMPLETE_ANSWERS


@pytest.fixture
async def match_job_db(tmp_path):
    db_path = str(tmp_path / "match_jobs.db")
    await init_db(db_path)
    with patch.object(settings, "database_path", db_path):
        yield


async def _complete_session(client):
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
    assert patch_response.json()["is_complete"] is True
    session_response = await client.get(f"/api/match/sessions/{session_id}")
    assert session_response.status_code == 200
    return session_id, session_response.json()["preference_vector_version"]


async def _analytics_event_count(event_name: str, session_id: str) -> int:
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT COUNT(*) AS count
            FROM match_analytics_events
            WHERE event_name = ? AND session_id = ?
            """,
            (event_name, session_id),
        )
        row = await cursor.fetchone()
    return int(row["count"])


def _review_run_payload(vector_version: str) -> dict[str, str]:
    return {
        "source": "review_final_cta",
        "preference_vector_version": vector_version,
    }


def test_job_stage_sequence_contains_spec_states():
    assert {
        "created",
        "queued",
        "reading_preferences",
        "building_profile",
        "loading_neighborhood_data",
        "applying_filters",
        "running_models",
        "scoring_tradeoffs",
        "preparing_map",
        "completed",
        "failed",
        "completed_with_fallback",
        "completed_no_strong_matches",
        "expired",
    } <= set(STAGE_SEQUENCE)


@pytest.mark.asyncio
async def test_run_requires_complete_answers_and_returns_stable_409(client, match_job_db):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]

    response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload("pv_v1_missing"),
    )

    assert response.status_code == 409
    body = response.json()
    assert body["detail"] == "match.warning.answers_incomplete"
    assert "budget" in body["invalid_questions"]


@pytest.mark.asyncio
async def test_run_requires_final_review_confirmation_before_creating_job(
    client,
    match_job_db,
):
    session_id, vector_version = await _complete_session(client)

    response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json={
            "source": "survey_answer_saved",
            "preference_vector_version": vector_version,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "match.warning.review_confirmation_required"

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_jobs WHERE session_id = ?",
            (session_id,),
        )
        row = await cursor.fetchone()

    assert row["count"] == 0


@pytest.mark.asyncio
async def test_run_rejects_stale_preference_vector_version(client, match_job_db):
    session_id, _vector_version = await _complete_session(client)

    response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload("pv_v1_stale"),
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "match.warning.preference_vector_stale"


@pytest.mark.asyncio
async def test_run_creates_pollable_job_after_review_confirmation(client, match_job_db):
    session_id, vector_version = await _complete_session(client)

    response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload(vector_version),
    )

    assert response.status_code == 202
    body = response.json()
    assert body["session_id"] == session_id
    assert body["job_id"].startswith("match_job_")
    assert body["status"] == "queued"
    assert body["stage"] == "queued"
    assert body["message_key"] == "matchFirst.progress.queued"
    assert body["preference_vector_id"].startswith("pv_")

    status_response = await client.get(f"/api/match/sessions/{session_id}/status")
    assert status_response.status_code == 200
    status = status_response.json()
    assert status["session_id"] == session_id
    assert status["job_id"] == body["job_id"]
    assert status["stage"] in STAGE_SEQUENCE
    assert status["model_mode"] == "weighted_scoring"
    assert status["evaluation_status"] == "not_validated_no_labels"

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT active_job_id, phase FROM match_sessions WHERE session_id = ?",
            (session_id,),
        )
        session_row = await cursor.fetchone()
        cursor = await db.execute(
            "SELECT status, stage, started_at FROM match_jobs WHERE job_id = ?",
            (body["job_id"],),
        )
        job_row = await cursor.fetchone()

    assert session_row["active_job_id"] == body["job_id"]
    assert session_row["phase"] in {"matching", "success"}
    assert job_row["stage"] in STAGE_SEQUENCE
    assert job_row["started_at"] is not None


@pytest.mark.asyncio
async def test_in_progress_job_reports_lifecycle_status_and_progress_stage(
    client,
    match_job_db,
):
    session_id, vector_version = await _complete_session(client)
    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload(vector_version),
    )
    job_id = run_response.json()["job_id"]

    async with get_db() as db:
        await db.execute(
            """
            UPDATE match_jobs
            SET status = 'running',
                stage = 'scoring_tradeoffs',
                progress = 78,
                message_key = 'matchFirst.progress.scoring_tradeoffs',
                result_set_id = NULL
            WHERE job_id = ?
            """,
            (job_id,),
        )
        await db.commit()

    status_response = await client.get(f"/api/match/sessions/{session_id}/status")

    assert status_response.status_code == 200
    status = status_response.json()
    assert status["status"] == "running"
    assert status["stage"] == "scoring_tradeoffs"
    assert status["message_key"] == "matchFirst.progress.scoring_tradeoffs"


@pytest.mark.asyncio
async def test_job_completes_with_results_and_retryable_status(client, match_job_db):
    session_id, vector_version = await _complete_session(client)

    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload(vector_version),
    )
    assert run_response.status_code == 202

    status_response = await client.get(f"/api/match/sessions/{session_id}/status")
    assert status_response.status_code == 200
    status = status_response.json()
    assert status["status"] in {"completed", "completed_with_fallback"}
    assert status["progress"] == 100
    assert status["result_set_id"].startswith("mrs_")
    assert "internal_error_class" not in status


@pytest.mark.asyncio
async def test_running_job_can_enter_matching_slow_without_new_job(client, match_job_db):
    session_id, vector_version = await _complete_session(client)
    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload(vector_version),
    )
    job_id = run_response.json()["job_id"]

    async with get_db() as db:
        await db.execute(
            """
            UPDATE match_jobs
            SET status = 'running',
                stage = 'running_models',
                progress = 65,
                message_key = 'matchFirst.progress.running_models',
                updated_at = '2026-05-12T00:00:00Z',
                started_at = '2026-05-12T00:00:00Z',
                result_set_id = NULL
            WHERE job_id = ?
            """,
            (job_id,),
        )
        await db.commit()

    status_response = await client.get(f"/api/match/sessions/{session_id}/status")
    second_status_response = await client.get(f"/api/match/sessions/{session_id}/status")

    status = status_response.json()
    assert status["job_id"] == job_id
    assert status["status"] == "matching_slow"
    assert status["stage"] == "running_models"
    assert status["message_key"] == "matchFirst.progress.matching_slow"
    assert "internal_error_class" not in status
    assert second_status_response.json()["job_id"] == job_id

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_jobs WHERE session_id = ?",
            (session_id,),
        )
        row = await cursor.fetchone()

    assert row["count"] == 1
    assert await _analytics_event_count("match_job_slow", session_id) == 1


@pytest.mark.asyncio
async def test_expired_job_state_is_public_and_allows_new_review_run(client, match_job_db):
    session_id, vector_version = await _complete_session(client)
    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload(vector_version),
    )
    job_id = run_response.json()["job_id"]

    async with get_db() as db:
        await db.execute(
            """
            UPDATE match_jobs
            SET status = 'running',
                stage = 'running_models',
                progress = 65,
                message_key = 'matchFirst.progress.running_models',
                updated_at = '2026-05-12T00:00:00Z',
                started_at = '2026-05-12T00:00:00Z',
                result_set_id = NULL
            WHERE job_id = ?
            """,
            (job_id,),
        )
        await db.commit()

    expired = await expire_jobs(max_age_seconds=1)
    status_response = await client.get(f"/api/match/sessions/{session_id}/status")

    assert expired == 1
    status = status_response.json()
    assert status["job_id"] == job_id
    assert status["status"] == "expired"
    assert status["stage"] == "expired"
    assert status["message_key"] == "matchFirst.progress.expired"
    assert status["error_code"] == "match.job.expired"
    assert "internal_error_class" not in status

    retry_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload(vector_version),
    )

    assert retry_response.status_code == 202
    assert retry_response.json()["job_id"] != job_id

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_jobs WHERE session_id = ?",
            (session_id,),
        )
        row = await cursor.fetchone()

    assert row["count"] == 2

    retry_status_response = await client.get(f"/api/match/sessions/{session_id}/status")
    results_response = await client.get(f"/api/match/sessions/{session_id}/results")
    assert results_response.status_code == 200
    assert results_response.json()["result_set_id"] == retry_status_response.json()["result_set_id"]


@pytest.mark.asyncio
async def test_retrying_same_current_vector_reuses_active_job(client, match_job_db):
    session_id, vector_version = await _complete_session(client)

    first_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload(vector_version),
    )
    second_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload(vector_version),
    )

    assert first_response.status_code == 202
    assert second_response.status_code == 202
    assert second_response.json()["job_id"] == first_response.json()["job_id"]

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_jobs WHERE session_id = ?",
            (session_id,),
        )
        row = await cursor.fetchone()
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_result_sets WHERE session_id = ?",
            (session_id,),
        )
        result_row = await cursor.fetchone()

    assert row["count"] == 1
    assert result_row["count"] == 1


@pytest.mark.asyncio
async def test_duplicate_run_requests_reuse_queued_job_without_duplicate_worker_or_results(
    client,
    match_job_db,
):
    session_id, vector_version = await _complete_session(client)
    scheduled_job_ids: list[str] = []

    async def fake_run_match_job(job_id: str) -> None:
        scheduled_job_ids.append(job_id)

    with patch("app.api.match.run_match_job", side_effect=fake_run_match_job):
        first_response = await client.post(
            f"/api/match/sessions/{session_id}/run",
            json=_review_run_payload(vector_version),
        )
        second_response = await client.post(
            f"/api/match/sessions/{session_id}/run",
            json=_review_run_payload(vector_version),
        )

    assert first_response.status_code == 202
    assert second_response.status_code == 202
    job_id = first_response.json()["job_id"]
    assert second_response.json()["job_id"] == job_id
    assert scheduled_job_ids == [job_id]

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_jobs WHERE session_id = ?",
            (session_id,),
        )
        job_row = await cursor.fetchone()
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_result_sets WHERE session_id = ?",
            (session_id,),
        )
        result_row_before = await cursor.fetchone()

    assert job_row["count"] == 1
    assert result_row_before["count"] == 0
    assert await _analytics_event_count("match_job_queued", session_id) == 1

    await run_match_job(job_id)

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_jobs WHERE session_id = ?",
            (session_id,),
        )
        job_row = await cursor.fetchone()
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_result_sets WHERE session_id = ?",
            (session_id,),
        )
        result_row_after = await cursor.fetchone()

    assert job_row["count"] == 1
    assert result_row_after["count"] == 1
    assert await _analytics_event_count("match_job_completed", session_id) == 1


@pytest.mark.asyncio
async def test_concurrent_review_run_requests_create_one_job_and_schedule_once(
    client,
    match_job_db,
):
    session_id, vector_version = await _complete_session(client)
    scheduled_job_ids: list[str] = []
    read_count = 0
    both_requests_checked_active_job = asyncio.Event()

    from app.services.match import jobs as jobs_module

    original_read_active_job = jobs_module._read_active_job_row

    async def synchronized_read_active_job(request_session_id: str):
        nonlocal read_count
        row = await original_read_active_job(request_session_id)
        if request_session_id == session_id:
            read_count += 1
            if read_count >= 2:
                both_requests_checked_active_job.set()
            await asyncio.wait_for(both_requests_checked_active_job.wait(), timeout=2)
        return row

    async def fake_run_match_job(job_id: str) -> None:
        scheduled_job_ids.append(job_id)

    with patch(
        "app.services.match.jobs._read_active_job_row",
        side_effect=synchronized_read_active_job,
    ), patch("app.api.match.run_match_job", side_effect=fake_run_match_job):
        first_response, second_response = await asyncio.gather(
            client.post(
                f"/api/match/sessions/{session_id}/run",
                json=_review_run_payload(vector_version),
            ),
            client.post(
                f"/api/match/sessions/{session_id}/run",
                json=_review_run_payload(vector_version),
            ),
        )

    assert first_response.status_code == 202
    assert second_response.status_code == 202
    job_id = first_response.json()["job_id"]
    assert second_response.json()["job_id"] == job_id
    assert scheduled_job_ids == [job_id]

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT active_job_id
            FROM match_sessions
            WHERE session_id = ?
            """,
            (session_id,),
        )
        session_row = await cursor.fetchone()
        cursor = await db.execute(
            """
            SELECT COUNT(*) AS count
            FROM match_jobs
            WHERE session_id = ?
            """,
            (session_id,),
        )
        job_row = await cursor.fetchone()
        cursor = await db.execute(
            """
            SELECT COUNT(*) AS count
            FROM match_result_sets
            WHERE session_id = ?
            """,
            (session_id,),
        )
        result_row_before = await cursor.fetchone()

    assert session_row["active_job_id"] == job_id
    assert job_row["count"] == 1
    assert result_row_before["count"] == 0
    assert await _analytics_event_count("match_job_queued", session_id) == 1

    await run_match_job(job_id)

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT COUNT(*) AS count
            FROM match_result_sets
            WHERE session_id = ?
            """,
            (session_id,),
        )
        result_row_after = await cursor.fetchone()

    assert result_row_after["count"] == 1


@pytest.mark.asyncio
async def test_feature_store_failure_after_run_creation_returns_pollable_failed_job(
    client,
    match_job_db,
):
    session_id, vector_version = await _complete_session(client)

    with patch(
        "app.services.match.jobs.NeighborhoodFeatureStore.load_matrix",
        side_effect=RuntimeError("feature source down"),
    ):
        run_response = await client.post(
            f"/api/match/sessions/{session_id}/run",
            json=_review_run_payload(vector_version),
        )

    assert run_response.status_code == 202
    job_id = run_response.json()["job_id"]
    assert run_response.json()["status"] == "queued"

    status_response = await client.get(f"/api/match/sessions/{session_id}/status")
    assert status_response.status_code == 200
    status = status_response.json()
    assert status["job_id"] == job_id
    assert status["status"] == "failed"
    assert status["stage"] == "failed"
    assert status["error_code"] == "match.warning.match_failed"
    assert "internal_error_class" not in status

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_jobs WHERE session_id = ?",
            (session_id,),
        )
        job_row = await cursor.fetchone()
        cursor = await db.execute(
            "SELECT COUNT(*) AS count FROM match_result_sets WHERE session_id = ?",
            (session_id,),
        )
        result_row = await cursor.fetchone()

    assert job_row["count"] == 1
    assert result_row["count"] == 0


@pytest.mark.asyncio
async def test_advanced_model_failure_returns_completed_with_fallback(client, match_job_db):
    session_id, vector_version = await _complete_session(client)

    with patch(
        "app.services.match.model_selection.ModelSelectionService.select_mode",
        return_value=ModelSelectionDecision(
            model_mode="predictive_candidate",
            evaluation_status="labels_available_not_trained",
            predictive_probability_available=True,
            public_model_version="match-score-v1",
        ),
    ), patch(
        "app.services.match.model_selection.ModelSelectionService.try_predictive_ranking",
        side_effect=RuntimeError("training service unavailable"),
    ):
        run_response = await client.post(
            f"/api/match/sessions/{session_id}/run",
            json=_review_run_payload(vector_version),
        )

    assert run_response.status_code == 202
    status_response = await client.get(f"/api/match/sessions/{session_id}/status")
    status = status_response.json()
    assert status["status"] == "completed_with_fallback"
    assert status["stage"] == "completed_with_fallback"
    assert status["fallback_used"] is True
    assert status["fallback_reason_code"] == "match.warning.advanced_model_unavailable"
    assert "RuntimeError" not in str(status)


@pytest.mark.asyncio
async def test_no_strong_matches_use_separate_terminal_status(client, match_job_db):
    session_id, vector_version = await _complete_session(client)

    with patch(
        "app.services.match.jobs.build_recommendation_set",
        return_value=RecommendationSet(empty_result_relaxations=["budget"]),
    ):
        run_response = await client.post(
            f"/api/match/sessions/{session_id}/run",
            json=_review_run_payload(vector_version),
        )

    assert run_response.status_code == 202
    status_response = await client.get(f"/api/match/sessions/{session_id}/status")
    status = status_response.json()
    assert status["status"] == "completed_no_strong_matches"
    assert status["stage"] == "completed_no_strong_matches"
    assert status["result_set_id"].startswith("mrs_")

    results_response = await client.get(f"/api/match/sessions/{session_id}/results")
    results = results_response.json()
    assert results["status"] == "completed_no_strong_matches"
    assert results["ranked_results"] == []
    assert results["empty_state_code"] == "match.recommendations.empty"


@pytest.mark.asyncio
async def test_results_waiting_for_incomplete_job_returns_409(client, match_job_db):
    session_id, vector_version = await _complete_session(client)
    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload(vector_version),
    )
    job_id = run_response.json()["job_id"]

    async with get_db() as db:
        await db.execute(
            """
            UPDATE match_jobs
            SET status = 'running', stage = 'running_models', progress = 50, result_set_id = NULL
            WHERE job_id = ?
            """,
            (job_id,),
        )
        await db.commit()

    response = await client.get(f"/api/match/sessions/{session_id}/results")

    assert response.status_code == 409
    assert response.json()["detail"] == "match.results.not_ready"
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_session_run_status_results_use_stable_error_codes_and_no_store(
    client,
    match_job_db,
):
    missing_session = await client.get("/api/match/sessions/match_missing")
    assert missing_session.status_code == 404
    assert missing_session.json()["detail"] == "match.session.not_found"
    assert missing_session.headers["cache-control"] == "no-store"

    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]
    assert create_response.status_code == 201
    assert create_response.headers["cache-control"] == "no-store"

    read_response = await client.get(f"/api/match/sessions/{session_id}")
    assert read_response.status_code == 200
    assert read_response.headers["cache-control"] == "no-store"

    patch_response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={"locale": "en", "current_step": 1, "answers": {"intent": "buy"}},
    )
    assert patch_response.status_code == 200
    assert patch_response.headers["cache-control"] == "no-store"

    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload("pv_v1_missing"),
    )
    assert run_response.status_code == 409
    assert run_response.json()["detail"] == "match.warning.answers_incomplete"
    assert run_response.headers["cache-control"] == "no-store"

    status_response = await client.get(f"/api/match/sessions/{session_id}/status")
    assert status_response.status_code == 404
    assert status_response.json()["detail"] == "match.job.not_found"
    assert status_response.headers["cache-control"] == "no-store"

    results_response = await client.get(f"/api/match/sessions/{session_id}/results")
    assert results_response.status_code == 404
    assert results_response.json()["detail"] == "match.results.not_found"
    assert results_response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_stale_running_job_recovery_marks_retryable_failure(client, match_job_db):
    session_id, vector_version = await _complete_session(client)
    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload(vector_version),
    )
    job_id = run_response.json()["job_id"]

    async with get_db() as db:
        await db.execute(
            """
            UPDATE match_jobs
            SET status = 'running',
                stage = 'running_models',
                progress = 65,
                updated_at = '2026-05-12T00:00:00Z',
                result_set_id = NULL
            WHERE job_id = ?
            """,
            (job_id,),
        )
        await db.commit()

    recovered = await recover_stale_jobs(max_age_seconds=1)
    status_response = await client.get(f"/api/match/sessions/{session_id}/status")

    assert recovered == 1
    status = status_response.json()
    assert status["status"] == "failed"
    assert status["stage"] == "failed"
    assert status["error_code"] == "match.warning.retryable_stale_job"
    assert "internal_error_class" not in status


@pytest.mark.asyncio
async def test_review_run_recovers_stale_active_job_and_starts_new_job(
    client,
    match_job_db,
):
    session_id, vector_version = await _complete_session(client)
    with patch("app.api.match.run_match_job", return_value=None):
        run_response = await client.post(
            f"/api/match/sessions/{session_id}/run",
            json=_review_run_payload(vector_version),
        )
    stale_job_id = run_response.json()["job_id"]

    async with get_db() as db:
        await db.execute(
            """
            UPDATE match_jobs
            SET status = 'running',
                stage = 'running_models',
                progress = 65,
                message_key = 'matchFirst.progress.running_models',
                updated_at = '2026-05-12T00:00:00Z',
                started_at = '2026-05-12T00:00:00Z',
                result_set_id = NULL
            WHERE job_id = ?
            """,
            (stale_job_id,),
        )
        await db.commit()

    retry_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json=_review_run_payload(vector_version),
    )

    assert retry_response.status_code == 202
    retry_job_id = retry_response.json()["job_id"]
    assert retry_job_id != stale_job_id

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT active_job_id
            FROM match_sessions
            WHERE session_id = ?
            """,
            (session_id,),
        )
        session_row = await cursor.fetchone()
        cursor = await db.execute(
            """
            SELECT status, stage, error_code
            FROM match_jobs
            WHERE job_id = ?
            """,
            (stale_job_id,),
        )
        stale_row = await cursor.fetchone()
        cursor = await db.execute(
            """
            SELECT COUNT(*) AS count
            FROM match_jobs
            WHERE session_id = ?
            """,
            (session_id,),
        )
        job_row = await cursor.fetchone()
        cursor = await db.execute(
            """
            SELECT COUNT(*) AS count
            FROM match_result_sets
            WHERE session_id = ?
            """,
            (session_id,),
        )
        result_row = await cursor.fetchone()

    assert session_row["active_job_id"] == retry_job_id
    assert stale_row["status"] == "failed"
    assert stale_row["stage"] == "failed"
    assert stale_row["error_code"] == "match.warning.retryable_stale_job"
    assert job_row["count"] == 2
    assert result_row["count"] == 1
