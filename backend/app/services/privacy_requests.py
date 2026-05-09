from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.db import get_db
from app.models.prebid import utc_now_iso


async def expire_prebid_records(
    *,
    db_path: str | None = None,
    retention_days: int = 90,
    now: datetime | None = None,
) -> int:
    cutoff = (now or datetime.now(UTC)) - timedelta(days=retention_days)
    cutoff_iso = cutoff.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    deleted_at = utc_now_iso()
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT briefing_id, source_run_id FROM briefings "
            "WHERE deleted_at IS NULL AND created_at <= ?",
            (cutoff_iso,),
        )
        rows = await cursor.fetchall()
        for row in rows:
            await db.execute(
                "UPDATE briefings SET deleted_at = ? WHERE briefing_id = ?",
                (deleted_at, row["briefing_id"]),
            )
            await db.execute(
                "UPDATE prebid_share_links SET revoked_at = ? "
                "WHERE briefing_id = ? AND revoked_at IS NULL",
                (deleted_at, row["briefing_id"]),
            )
            await db.execute(
                "UPDATE prebid_packs SET deleted_at = ? WHERE briefing_id = ?",
                (deleted_at, row["briefing_id"]),
            )
            await db.execute(
                "UPDATE user_contacts SET deleted_at = ? WHERE briefing_id = ?",
                (deleted_at, row["briefing_id"]),
            )
            await db.execute(
                "UPDATE source_runs SET deleted_at = ? WHERE source_run_id = ?",
                (deleted_at, row["source_run_id"]),
            )
        await db.commit()
    return len(rows)
