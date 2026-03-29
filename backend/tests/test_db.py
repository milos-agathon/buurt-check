import asyncio

import pytest

from app.db import get_db, init_db


@pytest.mark.asyncio
async def test_init_db_creates_reports_table(tmp_path):
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='reports'"
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row[0] == "reports"


@pytest.mark.asyncio
async def test_init_db_idempotent(tmp_path):
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    await init_db(db_path)  # Should not raise


@pytest.mark.asyncio
async def test_init_db_enables_wal_mode(tmp_path):
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    async with get_db(db_path) as db:
        cursor = await db.execute("PRAGMA journal_mode")
        row = await cursor.fetchone()
        assert row[0] == "wal"


@pytest.mark.asyncio
async def test_concurrent_reads_and_writes(tmp_path):
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)

    async def write_row(i: int) -> None:
        async with get_db(db_path) as db:
            await db.execute(
                "INSERT INTO reports (report_id, report_type, address_key, vbo_id, buyer_key) "
                "VALUES (?, 'short', 'test', '0363010012345678', ?)",
                (f"report-{i}", f"buyer-{i}"),
            )
            await db.commit()

    async def read_rows() -> int:
        async with get_db(db_path) as db:
            cursor = await db.execute("SELECT COUNT(*) FROM reports")
            row = await cursor.fetchone()
            return row[0]

    tasks = [write_row(i) for i in range(10)] + [read_rows() for _ in range(5)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    errors = [r for r in results if isinstance(r, Exception)]
    assert errors == [], f"Concurrent DB access errors: {errors}"
