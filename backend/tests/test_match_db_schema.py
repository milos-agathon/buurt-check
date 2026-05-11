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
        "match_recommendation_evidence",
        "match_data_import_runs",
        "match_source_health_snapshots",
    } <= table_names


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
