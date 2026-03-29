import asyncio

import aiosqlite
import pytest

from app.db import get_db, init_db

LEGACY_REPORTS_SCHEMA = """\
CREATE TABLE reports (
    report_id TEXT NOT NULL PRIMARY KEY,
    report_type TEXT NOT NULL CHECK(report_type IN ('short', 'long')),
    address_key TEXT NOT NULL,
    vbo_id TEXT NOT NULL,
    generation_version TEXT NOT NULL DEFAULT '1',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid'
      CHECK(payment_status IN ('unpaid', 'paid', 'failed', 'refunded')),
    entitlement_status TEXT NOT NULL DEFAULT 'inactive'
      CHECK(entitlement_status IN ('active', 'inactive', 'revoked')),
    provider TEXT,
    provider_payment_id TEXT,
    provider_session_id TEXT,
    purchased_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_vbo_id ON reports(vbo_id);
CREATE INDEX IF NOT EXISTS idx_reports_provider_session ON reports(provider_session_id);
CREATE INDEX IF NOT EXISTS idx_reports_provider_payment ON reports(provider_payment_id);
"""


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
async def test_init_db_migrates_legacy_reports_schema(tmp_path):
    db_path = str(tmp_path / "legacy.db")
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(LEGACY_REPORTS_SCHEMA)
        await db.execute(
            "INSERT INTO reports (report_id, report_type, address_key, vbo_id) "
            "VALUES ('legacy-report', 'short', 'legacy-address', '0363010012345678')"
        )
        await db.commit()

    await init_db(db_path)

    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT buyer_key FROM reports WHERE report_id = ?",
            ("legacy-report",),
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row[0] == "legacy-report"

        cursor = await db.execute("PRAGMA index_list(reports)")
        indexes = {index["name"] for index in await cursor.fetchall()}
        assert "idx_reports_buyer_vbo" in indexes


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
