"""Database setup for the entitlement model.

Uses Turso/libsql when configured and falls back to local SQLite for
development and tests.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterator, Mapping
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import aiosqlite

from app.config import settings

try:
    import libsql
except ImportError as exc:  # pragma: no cover - exercised only without dependency installed
    _LIBSQL_IMPORT_ERROR: ImportError | None = exc
    libsql = None

    class LibsqlError(Exception):
        """Fallback exception type when libsql is unavailable."""

else:
    _LIBSQL_IMPORT_ERROR = None
    LibsqlError = libsql.Error

logger = logging.getLogger(__name__)
if libsql is None:
    DatabaseError = (aiosqlite.Error,)
else:
    # libsql currently raises ValueError for SQL and transport failures.
    DatabaseError = (aiosqlite.Error, LibsqlError, ValueError)

_REPORTS_TABLE_SCHEMA = """\
CREATE TABLE IF NOT EXISTS reports (
    report_id TEXT NOT NULL PRIMARY KEY,
    report_type TEXT NOT NULL CHECK(report_type IN ('short', 'long')),
    address_key TEXT NOT NULL,
    vbo_id TEXT NOT NULL,
    buyer_key TEXT NOT NULL,
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
"""
_BOOTSTRAP_SCHEMA_STATEMENTS = (
    _REPORTS_TABLE_SCHEMA.strip(),
    "CREATE INDEX IF NOT EXISTS idx_reports_vbo_id ON reports(vbo_id)",
    "CREATE INDEX IF NOT EXISTS idx_reports_provider_session ON reports(provider_session_id)",
    "CREATE INDEX IF NOT EXISTS idx_reports_provider_payment ON reports(provider_payment_id)",
)


class DatabaseRow(Mapping[str, Any]):
    """Row wrapper matching sqlite-style access patterns."""

    def __init__(self, columns: tuple[str, ...], values: tuple[Any, ...]) -> None:
        self._columns = columns
        self._values = values
        self._column_indexes = {column: idx for idx, column in enumerate(columns)}

    def __getitem__(self, key: int | str | slice) -> Any:
        if isinstance(key, str):
            return self._values[self._column_indexes[key]]
        return self._values[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self._columns)

    def __len__(self) -> int:
        return len(self._values)

    def keys(self) -> tuple[str, ...]:
        return self._columns


class TursoCursor:
    """Minimal cursor adapter exposing fetch and rowcount APIs."""

    def __init__(self, rows: list[DatabaseRow], rowcount: int) -> None:
        self._rows = rows
        self._index = 0
        self.rowcount = rowcount

    async def fetchone(self) -> DatabaseRow | None:
        if self._index >= len(self._rows):
            return None
        row = self._rows[self._index]
        self._index += 1
        return row

    async def fetchall(self) -> list[DatabaseRow]:
        rows = self._rows[self._index:]
        self._index = len(self._rows)
        return rows


class TursoConnection:
    """Adapter that mimics the aiosqlite connection contract used by the app."""

    def __init__(self, connection: Any) -> None:
        self._connection = connection

    @staticmethod
    def _execute_sync(
        connection: Any,
        sql: str,
        params: tuple[Any, ...] | list[Any] | dict[str, Any] | None,
    ) -> TursoCursor:
        if params is None:
            cursor = connection.execute(sql)
        else:
            cursor = connection.execute(sql, params)

        try:
            columns = tuple(description[0] for description in (cursor.description or ()))
            rows = [
                DatabaseRow(columns, tuple(row))
                for row in (cursor.fetchall() or [])
            ]
            return TursoCursor(rows, cursor.rowcount)
        finally:
            cursor.close()

    async def execute(
        self,
        sql: str,
        params: tuple[Any, ...] | list[Any] | dict[str, Any] | None = None,
    ) -> TursoCursor:
        return await asyncio.to_thread(
            self._execute_sync,
            self._connection,
            sql,
            params,
        )

    async def commit(self) -> None:
        await asyncio.to_thread(self._connection.commit)

    async def close(self) -> None:
        await asyncio.to_thread(self._connection.close)


DatabaseConnection = aiosqlite.Connection | TursoConnection


def using_turso() -> bool:
    """Return True when Turso credentials are configured."""
    return bool(
        settings.turso_database_url.strip() and settings.turso_auth_token.strip()
    )


def database_backend_label() -> str:
    """Human-readable backend label for logging."""
    if using_turso():
        return "Turso (libsql)"
    return f"local SQLite ({settings.database_path})"


def _create_turso_connection() -> TursoConnection:
    if libsql is None:
        raise RuntimeError(
            "Turso is configured but libsql is not installed."
        ) from _LIBSQL_IMPORT_ERROR
    connection = libsql.connect(
        settings.turso_database_url,
        auth_token=settings.turso_auth_token,
        _check_same_thread=False,
    )
    return TursoConnection(connection)


async def _reports_column_names(db: DatabaseConnection) -> set[str]:
    cursor = await db.execute("PRAGMA table_info(reports)")
    rows = await cursor.fetchall()
    columns: set[str] = set()
    for row in rows:
        if isinstance(row, Mapping):
            columns.add(str(row["name"]))
        else:
            columns.add(str(row[1]))
    return columns


async def _migrate_reports_schema(db: DatabaseConnection) -> None:
    columns = await _reports_column_names(db)

    if "buyer_key" not in columns:
        await db.execute("ALTER TABLE reports ADD COLUMN buyer_key TEXT")
        await db.execute(
            "UPDATE reports SET buyer_key = report_id "
            "WHERE buyer_key IS NULL OR buyer_key = ''"
        )

    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_reports_buyer_vbo "
        "ON reports(buyer_key, vbo_id, created_at DESC)"
    )
    await db.commit()


async def init_db(db_path: str | None = None) -> None:
    """Create tables if they don't exist and enable WAL mode.

    Args:
        db_path: Path to the SQLite database file. Ignored when using Turso.
    """
    if using_turso():
        db = _create_turso_connection()
        try:
            for statement in _BOOTSTRAP_SCHEMA_STATEMENTS:
                await db.execute(statement)
            await _migrate_reports_schema(db)
            await db.commit()
        finally:
            await db.close()
        logger.info("Database initialized using %s", database_backend_label())
        return

    path = db_path if db_path is not None else settings.database_path
    async with aiosqlite.connect(path) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        for statement in _BOOTSTRAP_SCHEMA_STATEMENTS:
            await db.execute(statement)
        await _migrate_reports_schema(db)
        await db.commit()
    logger.info("Database initialized using local SQLite at %s", path)


@asynccontextmanager
async def get_db(db_path: str | None = None) -> AsyncIterator[DatabaseConnection]:
    """Async context manager returning a database connection.

    Callers MUST call ``await db.commit()`` after writes — this context manager
    does NOT commit on exit.

    Args:
        db_path: Path to the SQLite database file. Ignored when using Turso.
    """
    if using_turso():
        db = _create_turso_connection()
        try:
            yield db
        finally:
            await db.close()
        return

    path = db_path if db_path is not None else settings.database_path
    db = await aiosqlite.connect(path)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
