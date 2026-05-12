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
_PREBID_SCHEMA_STATEMENTS = (
    """CREATE TABLE IF NOT EXISTS source_runs (
        source_run_id TEXT NOT NULL PRIMARY KEY,
        report_id TEXT,
        vbo_id TEXT NOT NULL,
        buyer_key TEXT,
        confirmed_address TEXT NOT NULL,
        postcode TEXT,
        rd_x REAL,
        rd_y REAL,
        lat REAL,
        lng REAL,
        municipality TEXT,
        property_type TEXT NOT NULL DEFAULT 'unknown',
        result_state TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        deleted_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS source_run_coverage (
        coverage_id TEXT NOT NULL PRIMARY KEY,
        source_run_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        authority TEXT NOT NULL,
        label TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        checked_at TEXT,
        basis TEXT NOT NULL,
        radius_m INTEGER,
        method_version TEXT,
        duration_ms INTEGER,
        automated INTEGER NOT NULL DEFAULT 1,
        human_reviewed INTEGER NOT NULL DEFAULT 0,
        limitation TEXT NOT NULL,
        error_code TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS source_records (
        record_id TEXT NOT NULL PRIMARY KEY,
        source_run_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        authority TEXT NOT NULL,
        title TEXT NOT NULL,
        source_url TEXT,
        source_date TEXT,
        status_label TEXT,
        distance_m REAL,
        evidence_payload_json TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS signals (
        signal_id TEXT NOT NULL PRIMARY KEY,
        source_run_id TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        title TEXT NOT NULL,
        finding TEXT NOT NULL,
        status TEXT,
        proximity_m REAL,
        buyer_impact_tags_json TEXT NOT NULL,
        confidence TEXT NOT NULL,
        limitation TEXT NOT NULL,
        recommended_action TEXT NOT NULL,
        materiality INTEGER NOT NULL,
        source_refs_json TEXT NOT NULL,
        requires_review INTEGER NOT NULL DEFAULT 0,
        review_reason TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS action_items (
        action_id TEXT NOT NULL PRIMARY KEY,
        source_run_id TEXT NOT NULL,
        signal_id TEXT NOT NULL,
        rank INTEGER NOT NULL,
        rank_score INTEGER NOT NULL,
        finding TEXT NOT NULL,
        why_it_matters TEXT NOT NULL,
        ask_this_en TEXT NOT NULL,
        ask_this_nl TEXT NOT NULL,
        request_this_en TEXT NOT NULL,
        request_this_nl TEXT NOT NULL,
        who_to_ask_json TEXT NOT NULL,
        confidence TEXT NOT NULL,
        limitation TEXT NOT NULL,
        source_refs_json TEXT NOT NULL,
        review_state TEXT NOT NULL DEFAULT 'not_required'
    )""",
    """CREATE TABLE IF NOT EXISTS briefings (
        briefing_id TEXT NOT NULL PRIMARY KEY,
        source_run_id TEXT NOT NULL,
        report_id TEXT,
        buyer_key TEXT NOT NULL,
        vbo_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        deleted_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS prebid_packs (
        pack_id TEXT NOT NULL PRIMARY KEY,
        briefing_id TEXT NOT NULL,
        source_run_id TEXT NOT NULL,
        report_id TEXT NOT NULL,
        buyer_key TEXT NOT NULL,
        vbo_id TEXT NOT NULL,
        status TEXT NOT NULL,
        pack_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        deleted_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS prebid_share_links (
        share_link_id TEXT NOT NULL PRIMARY KEY,
        briefing_id TEXT NOT NULL,
        pack_id TEXT,
        buyer_key TEXT NOT NULL,
        scope TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        expires_at TEXT,
        revoked_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS review_tasks (
        review_task_id TEXT NOT NULL PRIMARY KEY,
        source_run_id TEXT NOT NULL,
        action_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        decided_at TEXT,
        decision_json TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS user_contacts (
        contact_id TEXT NOT NULL PRIMARY KEY,
        briefing_id TEXT NOT NULL,
        buyer_key TEXT NOT NULL,
        email_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        deleted_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS payment_events (
        payment_event_id TEXT NOT NULL PRIMARY KEY,
        report_id TEXT,
        buyer_key TEXT,
        product TEXT NOT NULL,
        event_type TEXT NOT NULL,
        provider TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )""",
    """CREATE TABLE IF NOT EXISTS audit_log (
        audit_id TEXT NOT NULL PRIMARY KEY,
        source_run_id TEXT,
        report_id TEXT,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )""",
    (
        "CREATE INDEX IF NOT EXISTS idx_source_runs_buyer_vbo "
        "ON source_runs(buyer_key, vbo_id, created_at DESC)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_briefings_buyer_vbo "
        "ON briefings(buyer_key, vbo_id, created_at DESC)"
    ),
    "CREATE INDEX IF NOT EXISTS idx_prebid_share_token ON prebid_share_links(token_hash, scope)",
)
_BOOTSTRAP_SCHEMA_STATEMENTS = (
    _REPORTS_TABLE_SCHEMA.strip(),
    "CREATE INDEX IF NOT EXISTS idx_reports_vbo_id ON reports(vbo_id)",
    "CREATE INDEX IF NOT EXISTS idx_reports_provider_session ON reports(provider_session_id)",
    "CREATE INDEX IF NOT EXISTS idx_reports_provider_payment ON reports(provider_payment_id)",
    *_PREBID_SCHEMA_STATEMENTS,
)

_MATCH_SCHEMA_STATEMENTS = (
    """CREATE TABLE IF NOT EXISTS match_neighborhoods (
        neighborhood_id TEXT NOT NULL PRIMARY KEY,
        official_code TEXT,
        name_nl TEXT NOT NULL,
        name_en TEXT,
        municipality TEXT NOT NULL,
        province TEXT,
        geography_level TEXT NOT NULL,
        centroid_rd_x REAL,
        centroid_rd_y REAL,
        centroid_lat REAL,
        centroid_lng REAL,
        geometry_ref TEXT,
        supported_region INTEGER NOT NULL,
        mock_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_metric_sources (
        metric_source_id TEXT NOT NULL PRIMARY KEY,
        source_name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        source_url TEXT,
        license_status TEXT NOT NULL,
        measurement_date TEXT,
        retrieved_at TEXT,
        geography_level TEXT NOT NULL,
        method_version TEXT NOT NULL,
        limitation TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        freshness_status TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_neighborhood_metrics (
        metric_id TEXT NOT NULL PRIMARY KEY,
        neighborhood_id TEXT NOT NULL,
        metric_key TEXT NOT NULL,
        raw_value_json TEXT NOT NULL,
        normalized_value REAL,
        source_id TEXT NOT NULL,
        freshness_status TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        geography_level TEXT NOT NULL,
        limitations_json TEXT NOT NULL,
        imported_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_feature_vectors (
        feature_vector_id TEXT NOT NULL PRIMARY KEY,
        neighborhood_id TEXT NOT NULL,
        method_version TEXT NOT NULL,
        features_json TEXT NOT NULL,
        feature_sources_json TEXT NOT NULL,
        completeness_score INTEGER NOT NULL,
        confidence INTEGER NOT NULL,
        confidence_reasons_json TEXT NOT NULL,
        missing_features_json TEXT NOT NULL,
        stale_features_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_user_preference_profiles (
        profile_id TEXT NOT NULL PRIMARY KEY,
        session_id TEXT,
        locale TEXT NOT NULL,
        household_type TEXT NOT NULL,
        newcomer_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_preference_vectors (
        preference_vector_id TEXT NOT NULL PRIMARY KEY,
        session_id TEXT,
        profile_id TEXT,
        journey_intent TEXT NOT NULL,
        budget_min_cents INTEGER,
        budget_max_cents INTEGER,
        monthly_rent_max_cents INTEGER,
        anchor_locations_json TEXT NOT NULL,
        commute_limits_json TEXT NOT NULL,
        property_types_json TEXT NOT NULL,
        hard_filters_json TEXT NOT NULL,
        nice_to_haves_json TEXT NOT NULL,
        avoid_signals_json TEXT NOT NULL,
        lifestyle_weights_json TEXT NOT NULL,
        persona_inputs_json TEXT NOT NULL,
        locale TEXT NOT NULL,
        method_version TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_recommendation_evidence (
        evidence_id TEXT NOT NULL PRIMARY KEY,
        claim_code TEXT NOT NULL,
        metric_keys_json TEXT NOT NULL,
        source_refs_json TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        confidence_reasons_json TEXT NOT NULL,
        freshness_status TEXT NOT NULL,
        limitations_json TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_reports (
        report_id TEXT NOT NULL PRIMARY KEY,
        session_id TEXT,
        preference_vector_id TEXT NOT NULL,
        locale TEXT NOT NULL,
        report_status TEXT NOT NULL,
        title TEXT NOT NULL,
        profile_summary_json TEXT NOT NULL,
        recommendation_ids_json TEXT NOT NULL,
        report_input_json TEXT NOT NULL,
        report_output_json TEXT NOT NULL,
        validation_status TEXT NOT NULL,
        limitations_json TEXT NOT NULL,
        source_refs_json TEXT NOT NULL,
        generated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS match_guardrail_events (
        guardrail_event_id TEXT NOT NULL PRIMARY KEY,
        report_id TEXT,
        event_type TEXT NOT NULL,
        action_taken TEXT NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_listings (
        listing_id TEXT NOT NULL PRIMARY KEY,
        provider_listing_id TEXT,
        provider_name TEXT NOT NULL,
        provider_mode TEXT NOT NULL,
        license_status TEXT NOT NULL,
        neighborhood_id TEXT NOT NULL,
        journey_intent TEXT NOT NULL,
        property_type TEXT,
        price_cents INTEGER,
        rent_cents INTEGER,
        currency TEXT NOT NULL,
        bedrooms INTEGER,
        floor_area_m2 REAL,
        availability_status TEXT NOT NULL,
        days_on_market INTEGER,
        source_url TEXT,
        freshness_status TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        limitations_json TEXT NOT NULL,
        retrieved_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_alerts (
        alert_id TEXT NOT NULL PRIMARY KEY,
        session_id TEXT,
        preference_vector_id TEXT,
        neighborhood_ids_json TEXT NOT NULL,
        journey_intent TEXT NOT NULL,
        budget_max_cents INTEGER,
        rent_max_cents INTEGER,
        property_types_json TEXT NOT NULL,
        notification_destination_hash TEXT,
        notification_type TEXT NOT NULL,
        status TEXT NOT NULL,
        source_context TEXT NOT NULL,
        last_evaluated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_notification_dispatch_records (
        dispatch_id TEXT NOT NULL PRIMARY KEY,
        alert_id TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        provider_mode TEXT NOT NULL,
        result_status TEXT NOT NULL,
        listing_ids_json TEXT NOT NULL,
        error_code TEXT,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_saved_neighborhoods (
        saved_neighborhood_id TEXT NOT NULL PRIMARY KEY,
        session_id TEXT,
        preference_vector_id TEXT,
        report_id TEXT,
        neighborhood_id TEXT NOT NULL,
        saved_from TEXT NOT NULL,
        note_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deleted_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS match_feedback_events (
        feedback_event_id TEXT NOT NULL PRIMARY KEY,
        session_id TEXT,
        report_id TEXT,
        recommendation_id TEXT,
        neighborhood_id TEXT NOT NULL,
        feedback_type TEXT NOT NULL,
        reason_code TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_share_tokens (
        share_token_id TEXT NOT NULL PRIMARY KEY,
        report_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        scope TEXT NOT NULL,
        locale TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        revoked_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS match_report_exports (
        export_id TEXT NOT NULL PRIMARY KEY,
        report_id TEXT NOT NULL,
        export_type TEXT NOT NULL,
        locale TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        error_code TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS match_analytics_events (
        analytics_event_id TEXT NOT NULL PRIMARY KEY,
        event_name TEXT NOT NULL,
        session_id TEXT,
        locale TEXT NOT NULL,
        journey_intent TEXT,
        context_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_data_import_runs (
        data_import_run_id TEXT NOT NULL PRIMARY KEY,
        provider_name TEXT NOT NULL,
        provider_type TEXT NOT NULL,
        region_config_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        records_imported INTEGER NOT NULL,
        records_failed INTEGER NOT NULL,
        error_summary_json TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_source_health_snapshots (
        source_health_id TEXT NOT NULL PRIMARY KEY,
        provider_name TEXT NOT NULL,
        region_config_id TEXT NOT NULL,
        health_status TEXT NOT NULL,
        last_success_at TEXT,
        stale_metric_count INTEGER NOT NULL,
        missing_metric_count INTEGER NOT NULL,
        mock_metric_count INTEGER NOT NULL,
        failed_run_count INTEGER NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS match_scoring_anomalies (
        scoring_anomaly_id TEXT NOT NULL PRIMARY KEY,
        preference_vector_id TEXT,
        neighborhood_id TEXT,
        anomaly_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT
    )""",
    (
        "CREATE INDEX IF NOT EXISTS idx_match_metrics_neighborhood "
        "ON match_neighborhood_metrics(neighborhood_id)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_match_metric_sources_metric "
        "ON match_metric_sources(metric_name)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_match_listings_neighborhood "
        "ON match_listings(neighborhood_id)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_match_reports_preference "
        "ON match_reports(preference_vector_id, created_at DESC)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_match_alerts_session "
        "ON match_alerts(session_id, status, created_at DESC)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_match_saved_neighborhoods_session "
        "ON match_saved_neighborhoods(session_id, created_at DESC)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_match_feedback_events_session "
        "ON match_feedback_events(session_id, created_at DESC)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_match_share_tokens_hash "
        "ON match_share_tokens(token_hash, scope)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_match_guardrail_events_report "
        "ON match_guardrail_events(report_id, created_at DESC)"
    ),
)

_BOOTSTRAP_SCHEMA_STATEMENTS = (*_BOOTSTRAP_SCHEMA_STATEMENTS, *_MATCH_SCHEMA_STATEMENTS)


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
        rows = self._rows[self._index :]
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
            rows = [DatabaseRow(columns, tuple(row)) for row in (cursor.fetchall() or [])]
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
    return bool(settings.turso_database_url.strip() and settings.turso_auth_token.strip())


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
            "UPDATE reports SET buyer_key = report_id WHERE buyer_key IS NULL OR buyer_key = ''"
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
