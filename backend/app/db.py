"""SQLite database setup for the entitlement model.

Provides async access via aiosqlite with WAL mode for concurrent reads/writes.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite

from app.config import settings

logger = logging.getLogger(__name__)

_SCHEMA = """\
CREATE TABLE IF NOT EXISTS reports (
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


async def init_db(db_path: str | None = None) -> None:
    """Create tables if they don't exist and enable WAL mode.

    Args:
        db_path: Path to the SQLite database file. Uses settings.database_path if None.
    """
    path = db_path if db_path is not None else settings.database_path
    async with aiosqlite.connect(path) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.executescript(_SCHEMA)
        await db.commit()
    logger.info("Database initialized at %s", path)


@asynccontextmanager
async def get_db(db_path: str | None = None) -> AsyncIterator[aiosqlite.Connection]:
    """Async context manager returning an aiosqlite connection with Row factory.

    Callers MUST call ``await db.commit()`` after writes — this context manager
    does NOT commit on exit.

    Args:
        db_path: Path to the SQLite database file. Uses settings.database_path if None.
    """
    path = db_path if db_path is not None else settings.database_path
    db = await aiosqlite.connect(path)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
