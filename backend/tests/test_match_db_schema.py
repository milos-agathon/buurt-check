import pytest

from app.db import get_db, init_db


@pytest.mark.asyncio
async def test_init_db_creates_match_foundation_tables(tmp_path):
    db_path = str(tmp_path / "match.db")

    await init_db(db_path)

    async with get_db(db_path) as db:
        cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table'")
        table_names = {row["name"] for row in await cursor.fetchall()}

    assert {
        "match_neighborhoods",
        "match_metric_sources",
        "match_neighborhood_metrics",
        "match_feature_vectors",
        "match_listings",
        "match_preference_vectors",
        "match_sessions",
        "match_survey_answers",
        "match_jobs",
        "match_result_sets",
        "match_recommendation_evidence",
        "match_reports",
        "match_guardrail_events",
        "match_alerts",
        "match_notification_dispatch_records",
        "match_saved_neighborhoods",
        "match_share_tokens",
        "match_report_exports",
        "match_analytics_events",
        "match_data_import_runs",
        "match_source_health_snapshots",
    } <= table_names


@pytest.mark.asyncio
async def test_match_session_tables_store_answers_and_route_state(tmp_path):
    db_path = str(tmp_path / "match.db")

    await init_db(db_path)
    await init_db(db_path)

    async with get_db(db_path) as db:
        cursor = await db.execute("PRAGMA table_info(match_sessions)")
        session_columns = {row["name"] for row in await cursor.fetchall()}
        cursor = await db.execute("PRAGMA table_info(match_survey_answers)")
        answer_columns = {row["name"] for row in await cursor.fetchall()}
        cursor = await db.execute("PRAGMA table_info(match_preference_vectors)")
        preference_vector_columns = {row["name"] for row in await cursor.fetchall()}

    assert {
        "session_id",
        "locale",
        "phase",
        "current_step",
        "answer_version",
        "preference_vector_id",
        "preference_vector_version",
        "selected_neighborhood_id",
        "map_state_json",
        "dossier_return_context_json",
        "expires_at",
    } <= session_columns
    assert {
        "session_id",
        "answer_version",
        "answers_json",
        "validation_json",
        "completed_step_count",
        "is_complete",
        "updated_at",
    } <= answer_columns
    assert {
        "preference_vector_id",
        "session_id",
        "journey_intent",
        "budget_min_cents",
        "budget_max_cents",
        "monthly_rent_max_cents",
        "source_answer_version",
        "vector_version",
        "raw_answer_refs_json",
        "warnings_json",
        "created_at",
    } <= preference_vector_columns


@pytest.mark.asyncio
async def test_match_job_and_result_tables_store_pollable_state(tmp_path):
    db_path = str(tmp_path / "match.db")

    await init_db(db_path)
    await init_db(db_path)

    async with get_db(db_path) as db:
        cursor = await db.execute("PRAGMA table_info(match_jobs)")
        job_columns = {row["name"] for row in await cursor.fetchall()}
        cursor = await db.execute("PRAGMA index_list(match_jobs)")
        job_indexes = {row["name"]: row for row in await cursor.fetchall()}
        cursor = await db.execute("PRAGMA table_info(match_result_sets)")
        result_columns = {row["name"] for row in await cursor.fetchall()}

    assert {
        "job_id",
        "session_id",
        "preference_vector_id",
        "status",
        "stage",
        "progress",
        "message_key",
        "model_mode",
        "model_version",
        "data_version",
        "evaluation_status",
        "fallback_used",
        "fallback_reason_code",
        "result_set_id",
        "error_code",
        "internal_error_class",
        "started_at",
        "completed_at",
        "runtime_ms",
        "updated_at",
    } <= job_columns
    assert "idx_match_jobs_active_vector_unique" in job_indexes
    assert job_indexes["idx_match_jobs_active_vector_unique"]["unique"] == 1
    assert {
        "result_set_id",
        "session_id",
        "job_id",
        "preference_vector_id",
        "preference_vector_version",
        "status",
        "generated_at",
        "runtime_ms",
        "model_mode",
        "model_version",
        "data_version",
        "evaluation_status",
        "predictive_probability_available",
        "fallback_used",
        "fallback_reason_code",
        "recommendations_json",
        "near_misses_json",
        "stretch_matches_json",
        "geometry_refs_json",
        "map_json",
        "map_center_json",
        "bbox_json",
        "normal_recommendation_count",
        "candidate_count",
        "scored_candidate_count",
        "empty_state_code",
    } <= result_columns


@pytest.mark.asyncio
async def test_match_analytics_table_stores_privacy_safe_event_records(tmp_path):
    db_path = str(tmp_path / "match.db")

    await init_db(db_path)

    async with get_db(db_path) as db:
        cursor = await db.execute("PRAGMA table_info(match_analytics_events)")
        analytics_columns = {row["name"] for row in await cursor.fetchall()}

    assert {
        "analytics_event_id",
        "event_name",
        "session_id",
        "locale",
        "journey_intent",
        "context_json",
        "created_at",
    } <= analytics_columns


@pytest.mark.asyncio
async def test_match_report_tables_preserve_structured_snapshot_and_guardrail_metadata(tmp_path):
    db_path = str(tmp_path / "match.db")

    await init_db(db_path)

    async with get_db(db_path) as db:
        cursor = await db.execute("PRAGMA table_info(match_reports)")
        report_columns = {row["name"] for row in await cursor.fetchall()}
        cursor = await db.execute("PRAGMA table_info(match_guardrail_events)")
        guardrail_columns = {row["name"] for row in await cursor.fetchall()}

    assert {
        "report_id",
        "session_id",
        "preference_vector_id",
        "locale",
        "report_status",
        "report_input_json",
        "report_output_json",
        "validation_status",
        "source_refs_json",
        "generated_by",
        "created_at",
    } <= report_columns
    assert {
        "guardrail_event_id",
        "report_id",
        "event_type",
        "action_taken",
        "details_json",
        "created_at",
    } <= guardrail_columns


@pytest.mark.asyncio
async def test_match_metric_tables_include_source_freshness_confidence_columns(tmp_path):
    db_path = str(tmp_path / "match.db")

    await init_db(db_path)

    async with get_db(db_path) as db:
        cursor = await db.execute("PRAGMA table_info(match_neighborhood_metrics)")
        metric_columns = {row["name"] for row in await cursor.fetchall()}
        cursor = await db.execute("PRAGMA table_info(match_metric_sources)")
        source_columns = {row["name"] for row in await cursor.fetchall()}

    assert {"source_id", "freshness_status", "confidence", "limitations_json"} <= metric_columns
    assert {
        "source_name",
        "source_type",
        "retrieved_at",
        "geography_level",
        "confidence",
        "freshness_status",
        "limitation",
    } <= source_columns
