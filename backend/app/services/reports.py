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


async def _rowcount_matches_report(db, rowcount: object, report_id: str) -> bool:
    """Fallback when DB drivers do not expose an integer rowcount for UPDATEs."""
    if isinstance(rowcount, int) and rowcount >= 0:
        return rowcount > 0

    cursor = await db.execute(
        "SELECT 1 FROM reports WHERE report_id = ? LIMIT 1",
        (report_id,),
    )
    return await cursor.fetchone() is not None


async def _sync_google_play_entitlement(
    report: Report,
    db_path: str | None = None,
) -> bool:
    """Refresh Google Play-backed entitlement state before returning it."""
    if report.provider != "google_play" or not report.provider_payment_id:
        return report.entitlement_status == "active"

    from app.services.google_play import (
        GooglePlayAPIError,
        GooglePlayConfigError,
        GooglePlayPurchaseNotFound,
        get_product_purchase,
    )

    try:
        purchase = await get_product_purchase(report.provider_payment_id)
    except GooglePlayConfigError:
        logger.warning(
            "Google Play verification is unavailable; trusting stored entitlement for report %s",
            report.report_id,
        )
        return report.entitlement_status == "active"
    except GooglePlayPurchaseNotFound:
        await refund_report(report.report_id, db_path=db_path)
        return False
    except GooglePlayAPIError:
        logger.exception(
            "Google Play verification failed for report %s; leaving stored entitlement unchanged",
            report.report_id,
        )
        return report.entitlement_status == "active"

    if purchase.purchase_state != 0:
        await refund_report(report.report_id, db_path=db_path)
        return False

    return True


async def _sync_apple_entitlement(
    report: Report,
    db_path: str | None = None,
) -> bool:
    """Refresh Apple-backed entitlement state before returning it."""
    if report.provider != "apple_app_store" or not report.provider_payment_id:
        return report.entitlement_status == "active"

    from app.services.apple_app_store import (
        AppleAppStoreAPIError,
        AppleAppStoreConfigError,
        AppleAppStoreTransactionNotFound,
        AppleAppStoreVerificationError,
        get_transaction_status,
    )

    try:
        transaction = await get_transaction_status(report.provider_payment_id)
    except AppleAppStoreConfigError:
        logger.warning(
            "Apple verification is unavailable; trusting stored entitlement for report %s",
            report.report_id,
        )
        return report.entitlement_status == "active"
    except (AppleAppStoreTransactionNotFound, AppleAppStoreVerificationError):
        await refund_report(report.report_id, db_path=db_path)
        return False
    except AppleAppStoreAPIError:
        logger.exception(
            "Apple verification failed for report %s; leaving stored entitlement unchanged",
            report.report_id,
        )
        return report.entitlement_status == "active"

    if transaction.revoked:
        await refund_report(report.report_id, db_path=db_path)
        return False

    return True


async def create_report(
    vbo_id: str,
    address_key: str,
    report_type: ReportType,
    buyer_key: str | None = None,
    db_path: str | None = None,
) -> str:
    """Generate a UUID, insert a new report row, and return the report_id."""
    report_id = str(uuid.uuid4())
    resolved_buyer_key = buyer_key or report_id
    async with get_db(db_path) as db:
        await db.execute(
            "INSERT INTO reports (report_id, report_type, address_key, vbo_id, buyer_key) "
            "VALUES (?, ?, ?, ?, ?)",
            (report_id, report_type, address_key, vbo_id, resolved_buyer_key),
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


async def get_report_for_buyer(
    report_id: str,
    buyer_key: str,
    db_path: str | None = None,
) -> Report | None:
    """Return a buyer-owned Report model by ID, or None if not found."""
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM reports WHERE report_id = ? AND buyer_key = ?",
            (report_id, buyer_key),
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
        return await _rowcount_matches_report(db, cursor.rowcount, report_id)


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
        return await _rowcount_matches_report(db, cursor.rowcount, report_id)


async def check_entitlement(
    report_id: str,
    buyer_key: str | None = None,
    vbo_id: str | None = None,
    db_path: str | None = None,
) -> bool:
    """Return True if entitlement is active and optionally bound to the address."""
    if buyer_key is not None:
        report = await get_report_for_buyer(report_id, buyer_key, db_path=db_path)
    else:
        report = await get_report(report_id, db_path=db_path)
    if report is None:
        return False
    if vbo_id is not None and report.vbo_id != vbo_id:
        return False
    if report.entitlement_status != "active":
        return False
    if report.provider == "google_play":
        return await _sync_google_play_entitlement(report, db_path=db_path)
    if report.provider == "apple_app_store":
        return await _sync_apple_entitlement(report, db_path=db_path)
    return report.entitlement_status == "active"


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
        return await _rowcount_matches_report(db, cursor.rowcount, report_id)


async def unlock_report(
    report_id: str,
    provider: str,
    provider_payment_id: str | None,
    purchased_at: str,
    db_path: str | None = None,
) -> bool:
    """Atomically set paid + active in a single UPDATE.

    Prevents partial-write risk where a crash between separate
    update_payment_status and activate_entitlement calls leaves the
    report paid but inactive — and the idempotency guard blocks retries.
    """
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "UPDATE reports SET payment_status = 'paid', provider = ?, "
            "provider_payment_id = ?, purchased_at = ?, "
            "entitlement_status = 'active' WHERE report_id = ?",
            (provider, provider_payment_id, purchased_at, report_id),
        )
        await db.commit()
        return await _rowcount_matches_report(db, cursor.rowcount, report_id)


async def refund_report(
    report_id: str,
    db_path: str | None = None,
) -> bool:
    """Atomically set refunded + revoked in a single UPDATE.

    Same atomicity rationale as unlock_report.
    """
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "UPDATE reports SET payment_status = 'refunded', "
            "entitlement_status = 'revoked' WHERE report_id = ?",
            (report_id,),
        )
        await db.commit()
        return await _rowcount_matches_report(db, cursor.rowcount, report_id)


async def find_existing_paid_report(
    vbo_id: str,
    buyer_key: str,
    db_path: str | None = None,
) -> Report | None:
    """Return the most recent paid + active report for an address, or None."""
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM reports "
            "WHERE buyer_key = ? AND vbo_id = ? AND payment_status = 'paid' "
            "AND entitlement_status = 'active' "
            "ORDER BY created_at DESC LIMIT 5",
            (buyer_key, vbo_id),
        )
        rows = await cursor.fetchall()
    for row in rows:
        report = Report(**dict(row))
        if report.provider == "google_play":
            is_active = await _sync_google_play_entitlement(report, db_path=db_path)
        elif report.provider == "apple_app_store":
            is_active = await _sync_apple_entitlement(report, db_path=db_path)
        else:
            is_active = report.entitlement_status == "active"
        if is_active:
            return report
    return None


async def get_report_by_provider_payment_id(
    provider_payment_id: str,
    db_path: str | None = None,
) -> Report | None:
    """Lookup a report by provider payment identifier (payment intent or purchase token)."""
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM reports WHERE provider_payment_id = ?",
            (provider_payment_id,),
        )
        row = await cursor.fetchone()
    if row is None:
        return None
    return Report(**dict(row))


async def get_report_by_payment_intent(
    provider_payment_id: str,
    db_path: str | None = None,
) -> Report | None:
    """Backward-compatible alias for Stripe-oriented call sites/tests."""
    return await get_report_by_provider_payment_id(
        provider_payment_id,
        db_path=db_path,
    )


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
        return await _rowcount_matches_report(db, cursor.rowcount, report_id)
