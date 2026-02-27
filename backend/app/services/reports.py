"""Report repository — all report CRUD operations.

Route handlers and billing logic call these functions. Never use raw SQL elsewhere.
DB exceptions (aiosqlite.OperationalError, IntegrityError) propagate to callers —
route handlers must catch and convert to appropriate HTTP responses.
"""

from __future__ import annotations

import logging
import uuid

from app.db import get_db
from app.models.report import PaymentStatus, Report, ReportType

logger = logging.getLogger(__name__)


async def create_report(
    vbo_id: str,
    address_key: str,
    report_type: ReportType,
    db_path: str | None = None,
) -> str:
    """Generate a UUID, insert a new report row, and return the report_id."""
    report_id = str(uuid.uuid4())
    async with get_db(db_path) as db:
        await db.execute(
            "INSERT INTO reports (report_id, report_type, address_key, vbo_id) "
            "VALUES (?, ?, ?, ?)",
            (report_id, report_type, address_key, vbo_id),
        )
        await db.commit()
    logger.info("Created report %s for vbo_id=%s", report_id, vbo_id)
    return report_id


async def get_report(
    report_id: str,
    db_path: str | None = None,
) -> Report | None:
    """Return a Report model by ID, or None if not found."""
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM reports WHERE report_id = ?",
            (report_id,),
        )
        row = await cursor.fetchone()
    if row is None:
        return None
    return Report(**dict(row))


async def update_payment_status(
    report_id: str,
    status: PaymentStatus,
    provider: str | None = None,
    provider_payment_id: str | None = None,
    purchased_at: str | None = None,
    db_path: str | None = None,
) -> bool:
    """Transition payment_status. Only updates non-None optional params.

    Returns True if a row was affected, False if report not found.
    """
    set_clauses = ["payment_status = ?"]
    params: list[str | None] = [status]

    if provider is not None:
        set_clauses.append("provider = ?")
        params.append(provider)
    if provider_payment_id is not None:
        set_clauses.append("provider_payment_id = ?")
        params.append(provider_payment_id)
    if purchased_at is not None:
        set_clauses.append("purchased_at = ?")
        params.append(purchased_at)

    params.append(report_id)

    async with get_db(db_path) as db:
        cursor = await db.execute(
            f"UPDATE reports SET {', '.join(set_clauses)} WHERE report_id = ?",
            params,
        )
        await db.commit()
        return cursor.rowcount > 0


async def store_provider_session(
    report_id: str,
    provider_session_id: str,
    db_path: str | None = None,
) -> bool:
    """Store Stripe session ID without changing payment_status.

    Returns True if a row was affected, False if report not found.
    """
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "UPDATE reports SET provider_session_id = ? WHERE report_id = ?",
            (provider_session_id, report_id),
        )
        await db.commit()
        return cursor.rowcount > 0


async def check_entitlement(
    report_id: str,
    db_path: str | None = None,
) -> bool:
    """Return True if entitlement_status == 'active'."""
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT entitlement_status FROM reports WHERE report_id = ?",
            (report_id,),
        )
        row = await cursor.fetchone()
    if row is None:
        return False
    return row["entitlement_status"] == "active"


async def activate_entitlement(
    report_id: str,
    db_path: str | None = None,
) -> bool:
    """Set entitlement_status = 'active'.

    Returns True if a row was affected, False if report not found.
    """
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "UPDATE reports SET entitlement_status = 'active' WHERE report_id = ?",
            (report_id,),
        )
        await db.commit()
        return cursor.rowcount > 0


async def find_existing_paid_report(
    vbo_id: str,
    db_path: str | None = None,
) -> Report | None:
    """Return the most recent paid + active report for an address, or None."""
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM reports "
            "WHERE vbo_id = ? AND payment_status = 'paid' "
            "AND entitlement_status = 'active' "
            "ORDER BY created_at DESC LIMIT 1",
            (vbo_id,),
        )
        row = await cursor.fetchone()
    if row is None:
        return None
    return Report(**dict(row))


async def get_report_by_payment_intent(
    provider_payment_id: str,
    db_path: str | None = None,
) -> Report | None:
    """Lookup a report by Stripe payment intent ID."""
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM reports WHERE provider_payment_id = ?",
            (provider_payment_id,),
        )
        row = await cursor.fetchone()
    if row is None:
        return None
    return Report(**dict(row))


async def revoke_entitlement(
    report_id: str,
    db_path: str | None = None,
) -> bool:
    """Set entitlement_status = 'revoked'.

    Returns True if a row was affected, False if report not found.
    """
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "UPDATE reports SET entitlement_status = 'revoked' WHERE report_id = ?",
            (report_id,),
        )
        await db.commit()
        return cursor.rowcount > 0
