# ruff: noqa: E501
from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Iterable, Mapping
from typing import Any

from app.db import get_db
from app.models.prebid import (
    ActionItem,
    AdminSourceRunListItem,
    AdminSourceRunResponse,
    AdminSourceRunTombstoneResponse,
    PrebidBriefingResponse,
    PrebidPackResponse,
    ReviewTask,
    Signal,
    SourceCoverageItem,
    SourceRecord,
    SourceReference,
    utc_now_iso,
)


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def _dump_model(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return dict(value)


def _require_non_empty_json_array(value: Any, field_name: str) -> None:
    if hasattr(value, "model_dump"):
        value = value.model_dump(mode="json").get(field_name)
    elif isinstance(value, Mapping):
        value = value.get(field_name)
    if not isinstance(value, list) or not value:
        raise ValueError(f"{field_name} must be a non-empty JSON array")


def _is_missing_table_error(exc: Exception) -> bool:
    return isinstance(exc, sqlite3.OperationalError) and "no such table" in str(exc)


async def create_source_run(
    *,
    vbo_id: str,
    confirmed_address: str,
    result_state: str,
    report_id: str | None = None,
    buyer_key: str | None = None,
    postcode: str | None = None,
    rd_x: float | None = None,
    rd_y: float | None = None,
    lat: float | None = None,
    lng: float | None = None,
    municipality: str | None = None,
    property_type: str = "unknown",
    db_path: str | None = None,
) -> str:
    source_run_id = str(uuid.uuid4())
    async with get_db(db_path) as db:
        await db.execute(
            "INSERT INTO source_runs "
            "(source_run_id, report_id, vbo_id, buyer_key, confirmed_address, postcode, rd_x, rd_y, "
            "lat, lng, municipality, property_type, result_state) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                source_run_id,
                report_id,
                vbo_id,
                buyer_key,
                confirmed_address,
                postcode,
                rd_x,
                rd_y,
                lat,
                lng,
                municipality,
                property_type,
                result_state,
            ),
        )
        await db.commit()
    return source_run_id


async def get_source_run(source_run_id: str, *, db_path: str | None = None):
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM source_runs WHERE source_run_id = ?",
            (source_run_id,),
        )
        return await cursor.fetchone()


async def store_coverage_items(
    source_run_id: str,
    items: Iterable[SourceCoverageItem],
    *,
    db_path: str | None = None,
) -> None:
    async with get_db(db_path) as db:
        for item in items:
            data = item.model_dump(mode="json")
            await db.execute(
                "INSERT INTO source_run_coverage "
                "(coverage_id, source_run_id, source_id, authority, label, priority, status, checked_at, "
                "basis, radius_m, method_version, duration_ms, automated, human_reviewed, limitation, error_code) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    source_run_id,
                    data["source_id"],
                    data["authority"],
                    data["label"],
                    data["priority"],
                    data["status"],
                    data.get("checked_at"),
                    data["basis"],
                    data.get("radius_m"),
                    data.get("method_version"),
                    data.get("duration_ms"),
                    int(data.get("automated", True)),
                    int(data.get("human_reviewed", False)),
                    data["limitation"],
                    data.get("error_code"),
                ),
            )
        await db.commit()


async def store_source_records(
    source_run_id: str,
    records: Iterable[SourceRecord],
    *,
    db_path: str | None = None,
) -> None:
    async with get_db(db_path) as db:
        for record in records:
            data = record.model_dump(mode="json")
            await db.execute(
                "INSERT OR REPLACE INTO source_records "
                "(record_id, source_run_id, source_id, authority, title, source_url, source_date, "
                "status_label, distance_m, evidence_payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    data["record_id"],
                    source_run_id,
                    data["source_id"],
                    data["authority"],
                    data["title"],
                    data.get("source_url"),
                    data.get("source_date"),
                    data.get("status_label"),
                    data.get("distance_m"),
                    _json(data.get("evidence_payload") or {}),
                ),
            )
        await db.commit()


async def store_signals(
    source_run_id: str,
    signals: Iterable[Signal | Mapping[str, Any]],
    *,
    db_path: str | None = None,
) -> None:
    async with get_db(db_path) as db:
        for signal in signals:
            _require_non_empty_json_array(signal, "source_refs")
            data = _dump_model(signal)
            await db.execute(
                "INSERT OR REPLACE INTO signals "
                "(signal_id, source_run_id, signal_type, title, finding, status, proximity_m, "
                "buyer_impact_tags_json, confidence, limitation, recommended_action, materiality, "
                "source_refs_json, requires_review, review_reason) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    data["signal_id"],
                    source_run_id,
                    data["signal_type"],
                    data.get("title", ""),
                    data.get("finding", ""),
                    data.get("status"),
                    data.get("proximity_m"),
                    _json(data.get("buyer_impact_tags") or []),
                    data.get("confidence", "medium"),
                    data.get("limitation", ""),
                    data.get("recommended_action", ""),
                    data.get("materiality", 0),
                    _json(data["source_refs"]),
                    int(data.get("requires_review", False)),
                    data.get("review_reason"),
                ),
            )
        await db.commit()


async def store_action_items(
    source_run_id: str,
    actions: Iterable[ActionItem | Mapping[str, Any]],
    *,
    db_path: str | None = None,
) -> None:
    async with get_db(db_path) as db:
        for action in actions:
            _require_non_empty_json_array(action, "source_refs")
            _require_non_empty_json_array(action, "who_to_ask")
            data = _dump_model(action)
            await db.execute(
                "INSERT OR REPLACE INTO action_items "
                "(action_id, source_run_id, signal_id, rank, rank_score, finding, why_it_matters, "
                "ask_this_en, ask_this_nl, request_this_en, request_this_nl, who_to_ask_json, "
                "confidence, limitation, source_refs_json, review_state) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    data["action_id"],
                    source_run_id,
                    data["signal_id"],
                    data["rank"],
                    data["rank_score"],
                    data["finding"],
                    data["why_it_matters"],
                    data["ask_this_en"],
                    data["ask_this_nl"],
                    data["request_this_en"],
                    data["request_this_nl"],
                    _json(data["who_to_ask"]),
                    data["confidence"],
                    data["limitation"],
                    _json(data["source_refs"]),
                    data.get("review_state", "not_required"),
                ),
            )
        await db.commit()


async def create_briefing(
    source_run_id: str,
    report_id: str | None,
    buyer_key: str,
    vbo_id: str,
    *,
    db_path: str | None = None,
) -> str:
    briefing_id = str(uuid.uuid4())
    async with get_db(db_path) as db:
        await db.execute(
            "INSERT INTO briefings (briefing_id, source_run_id, report_id, buyer_key, vbo_id) "
            "VALUES (?, ?, ?, ?, ?)",
            (briefing_id, source_run_id, report_id, buyer_key, vbo_id),
        )
        await db.commit()
    return briefing_id


async def get_latest_briefing_for_buyer(
    vbo_id: str,
    buyer_key: str,
    *,
    db_path: str | None = None,
):
    try:
        async with get_db(db_path) as db:
            cursor = await db.execute(
                "SELECT * FROM briefings WHERE vbo_id = ? AND buyer_key = ? AND deleted_at IS NULL "
                "ORDER BY created_at DESC LIMIT 1",
                (vbo_id, buyer_key),
            )
            return await cursor.fetchone()
    except sqlite3.OperationalError as exc:
        if _is_missing_table_error(exc):
            return None
        raise


def _coverage_from_row(row: Mapping[str, Any]) -> SourceCoverageItem:
    return SourceCoverageItem(
        source_id=row["source_id"],
        authority=row["authority"],
        label=row["label"],
        priority=row["priority"],
        status=row["status"],
        checked_at=row["checked_at"],
        basis=row["basis"],
        radius_m=row["radius_m"],
        method_version=row["method_version"],
        duration_ms=row["duration_ms"],
        automated=bool(row["automated"]),
        human_reviewed=bool(row["human_reviewed"]),
        limitation=row["limitation"],
        error_code=row["error_code"],
    )


def _record_from_row(row: Mapping[str, Any]) -> SourceRecord:
    return SourceRecord(
        record_id=row["record_id"],
        source_id=row["source_id"],
        authority=row["authority"],
        title=row["title"],
        source_url=row["source_url"],
        source_date=row["source_date"],
        status_label=row["status_label"],
        distance_m=row["distance_m"],
        evidence_payload=json.loads(row["evidence_payload_json"] or "{}"),
    )


def _signal_from_row(row: Mapping[str, Any]) -> Signal:
    return Signal(
        signal_id=row["signal_id"],
        signal_type=row["signal_type"],
        title=row["title"],
        finding=row["finding"],
        status=row["status"],
        proximity_m=row["proximity_m"],
        buyer_impact_tags=json.loads(row["buyer_impact_tags_json"]),
        confidence=row["confidence"],
        limitation=row["limitation"],
        recommended_action=row["recommended_action"],
        materiality=row["materiality"],
        source_refs=[SourceReference(**ref) for ref in json.loads(row["source_refs_json"])],
        requires_review=bool(row["requires_review"]),
        review_reason=row["review_reason"],
    )


def _action_from_row(row: Mapping[str, Any]) -> ActionItem:
    return ActionItem(
        action_id=row["action_id"],
        signal_id=row["signal_id"],
        rank=row["rank"],
        rank_score=row["rank_score"],
        finding=row["finding"],
        why_it_matters=row["why_it_matters"],
        ask_this_en=row["ask_this_en"],
        ask_this_nl=row["ask_this_nl"],
        request_this_en=row["request_this_en"],
        request_this_nl=row["request_this_nl"],
        who_to_ask=json.loads(row["who_to_ask_json"]),
        confidence=row["confidence"],
        limitation=row["limitation"],
        source_refs=[SourceReference(**ref) for ref in json.loads(row["source_refs_json"])],
        review_state=row["review_state"],
    )


def _review_task_from_row(row: Mapping[str, Any]) -> ReviewTask:
    return ReviewTask(
        review_task_id=row["review_task_id"],
        source_run_id=row["source_run_id"],
        action_id=row["action_id"],
        status=row["status"],
        reason=row["reason"],
        created_at=row["created_at"],
        decided_at=row["decided_at"],
    )


async def get_briefing_bundle(
    briefing_id: str,
    *,
    buyer_key: str | None = None,
    db_path: str | None = None,
) -> dict[str, Any] | None:
    async with get_db(db_path) as db:
        params: list[Any] = [briefing_id]
        buyer_filter = ""
        if buyer_key is not None:
            buyer_filter = " AND b.buyer_key = ?"
            params.append(buyer_key)
        cursor = await db.execute(
            "SELECT b.*, sr.* FROM briefings b JOIN source_runs sr ON b.source_run_id = sr.source_run_id "
            "WHERE b.briefing_id = ? AND b.deleted_at IS NULL AND sr.deleted_at IS NULL"
            f"{buyer_filter}",
            tuple(params),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        source_run_id = row["source_run_id"]
        coverage_cursor = await db.execute(
            "SELECT * FROM source_run_coverage WHERE source_run_id = ?",
            (source_run_id,),
        )
        records_cursor = await db.execute(
            "SELECT * FROM source_records WHERE source_run_id = ?",
            (source_run_id,),
        )
        signals_cursor = await db.execute(
            "SELECT * FROM signals WHERE source_run_id = ?", (source_run_id,)
        )
        actions_cursor = await db.execute(
            "SELECT * FROM action_items WHERE source_run_id = ? ORDER BY rank",
            (source_run_id,),
        )
        return {
            "briefing": row,
            "coverage": await coverage_cursor.fetchall(),
            "records": await records_cursor.fetchall(),
            "signals": await signals_cursor.fetchall(),
            "actions": await actions_cursor.fetchall(),
        }


def briefing_response_from_bundle(bundle: dict[str, Any]) -> PrebidBriefingResponse:
    row = bundle["briefing"]
    coverage = [_coverage_from_row(item) for item in bundle["coverage"]]
    signals = [_signal_from_row(item) for item in bundle["signals"]]
    actions = [_action_from_row(item) for item in bundle["actions"]]
    return PrebidBriefingResponse(
        briefing_id=row["briefing_id"],
        report_id=row["report_id"],
        vbo_id=row["vbo_id"],
        confirmed_address=row["confirmed_address"],
        postcode=row["postcode"],
        municipality=row["municipality"],
        rd_x=row["rd_x"],
        rd_y=row["rd_y"],
        lat=row["lat"],
        lng=row["lng"],
        property_type=row["property_type"],
        checked_at=row["created_at"],
        result_state=row["result_state"],
        top_actions=actions[:3],
        lower_context=signals,
        coverage=coverage,
        disclaimer=STANDARD_DISCLAIMER,
    )


STANDARD_DISCLAIMER = (
    "Source-linked pre-bid briefing for viewing preparation. It is not purchase, bid, "
    "legal, or technical advice; verify decisions with your own adviser, inspector, "
    "notary, municipality, or buyer agent."
)


async def soft_delete_briefing(
    briefing_id: str,
    buyer_key: str,
    *,
    db_path: str | None = None,
) -> bool:
    now = utc_now_iso()
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT source_run_id FROM briefings WHERE briefing_id = ? AND buyer_key = ? AND deleted_at IS NULL",
            (briefing_id, buyer_key),
        )
        row = await cursor.fetchone()
        if row is None:
            return False
        await db.execute(
            "UPDATE briefings SET deleted_at = ? WHERE briefing_id = ?", (now, briefing_id)
        )
        await db.execute(
            "UPDATE prebid_share_links SET revoked_at = ? WHERE briefing_id = ? AND revoked_at IS NULL",
            (now, briefing_id),
        )
        await db.execute(
            "UPDATE prebid_packs SET deleted_at = ? WHERE briefing_id = ?", (now, briefing_id)
        )
        await db.execute(
            "UPDATE user_contacts SET deleted_at = ? WHERE briefing_id = ?", (now, briefing_id)
        )
        await db.execute(
            "UPDATE source_runs SET deleted_at = ? WHERE source_run_id = ?",
            (now, row["source_run_id"]),
        )
        await db.commit()
    return True


async def create_share_link(
    briefing_id: str,
    buyer_key: str,
    scope: str,
    token_hash: str,
    *,
    pack_id: str | None = None,
    expires_at: str | None = None,
    db_path: str | None = None,
) -> str:
    share_link_id = str(uuid.uuid4())
    async with get_db(db_path) as db:
        await db.execute(
            "INSERT INTO prebid_share_links "
            "(share_link_id, briefing_id, pack_id, buyer_key, scope, token_hash, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (share_link_id, briefing_id, pack_id, buyer_key, scope, token_hash, expires_at),
        )
        await db.commit()
    return share_link_id


async def store_contact_hash(
    briefing_id: str,
    buyer_key: str,
    email_hash: str | None,
    *,
    db_path: str | None = None,
) -> str | None:
    if not email_hash:
        return None
    contact_id = str(uuid.uuid4())
    async with get_db(db_path) as db:
        await db.execute(
            "INSERT INTO user_contacts (contact_id, briefing_id, buyer_key, email_hash) "
            "VALUES (?, ?, ?, ?)",
            (contact_id, briefing_id, buyer_key, email_hash),
        )
        await db.commit()
    return contact_id


async def get_share_link_bundle(
    token_hash: str,
    scope: str,
    *,
    db_path: str | None = None,
) -> dict[str, Any] | None:
    now = utc_now_iso()
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM prebid_share_links "
            "WHERE token_hash = ? AND scope = ? AND revoked_at IS NULL "
            "AND (expires_at IS NULL OR expires_at > ?)",
            (token_hash, scope, now),
        )
        link = await cursor.fetchone()
        if link is None:
            return None
    return await get_briefing_bundle(link["briefing_id"], db_path=db_path)


async def create_review_tasks_for_pending_actions(
    source_run_id: str,
    actions: Iterable[ActionItem],
    *,
    db_path: str | None = None,
) -> list[str]:
    review_task_ids: list[str] = []
    async with get_db(db_path) as db:
        for action in actions:
            review_state = (
                action.review_state.value
                if hasattr(action.review_state, "value")
                else str(action.review_state)
            )
            if review_state != "pending":
                continue
            review_task_id = str(uuid.uuid4())
            await db.execute(
                "INSERT INTO review_tasks (review_task_id, source_run_id, action_id, reason) "
                "VALUES (?, ?, ?, ?)",
                (
                    review_task_id,
                    source_run_id,
                    action.action_id,
                    "Action requires human review before final paid-pack fulfilment.",
                ),
            )
            review_task_ids.append(review_task_id)
        await db.commit()
    return review_task_ids


async def store_pack_snapshot(
    pack: PrebidPackResponse,
    *,
    source_run_id: str,
    buyer_key: str,
    db_path: str | None = None,
) -> str:
    data = pack.model_dump(mode="json")
    async with get_db(db_path) as db:
        await db.execute(
            "INSERT OR REPLACE INTO prebid_packs "
            "(pack_id, briefing_id, source_run_id, report_id, buyer_key, vbo_id, status, pack_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                data["pack_id"],
                data["briefing_id"],
                source_run_id,
                data["report_id"],
                buyer_key,
                data["vbo_id"],
                data["status"],
                _json(data),
            ),
        )
        await db.commit()
    return pack.pack_id


async def get_pack_snapshot(
    *,
    report_id: str,
    buyer_key: str,
    vbo_id: str,
    db_path: str | None = None,
) -> PrebidPackResponse | None:
    try:
        async with get_db(db_path) as db:
            cursor = await db.execute(
                "SELECT status, pack_json FROM prebid_packs "
                "WHERE report_id = ? AND buyer_key = ? AND vbo_id = ? AND deleted_at IS NULL "
                "ORDER BY created_at DESC LIMIT 1",
                (report_id, buyer_key, vbo_id),
            )
            row = await cursor.fetchone()
    except sqlite3.OperationalError as exc:
        if _is_missing_table_error(exc):
            return None
        raise
    if row is None:
        return None
    data = json.loads(row["pack_json"])
    data["status"] = row["status"]
    return PrebidPackResponse.model_validate(data)


async def decide_review_task(
    review_task_id: str,
    *,
    status: str,
    reviewer: str | None = None,
    note: str | None = None,
    db_path: str | None = None,
) -> ReviewTask | None:
    if status not in {"approved", "changes_requested"}:
        raise ValueError("status must be approved or changes_requested")
    now = utc_now_iso()
    decision = {"status": status, "reviewer": reviewer, "note": note, "decided_at": now}
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM review_tasks WHERE review_task_id = ?",
            (review_task_id,),
        )
        task = await cursor.fetchone()
        if task is None:
            return None
        await db.execute(
            "UPDATE review_tasks SET status = ?, decided_at = ?, decision_json = ? "
            "WHERE review_task_id = ?",
            (status, now, _json(decision), review_task_id),
        )
        if task["action_id"]:
            await db.execute(
                "UPDATE action_items SET review_state = ? WHERE action_id = ?",
                (status, task["action_id"]),
            )
        await db.execute(
            "INSERT INTO audit_log (audit_id, source_run_id, event_type, payload_json) "
            "VALUES (?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                task["source_run_id"],
                "prebid_review_decision",
                _json(decision | {"review_task_id": review_task_id}),
            ),
        )
        await _refresh_pack_snapshots_for_source_run(db, task["source_run_id"])
        await db.commit()

        cursor = await db.execute(
            "SELECT * FROM review_tasks WHERE review_task_id = ?",
            (review_task_id,),
        )
        updated = await cursor.fetchone()
    return _review_task_from_row(updated) if updated is not None else None


async def _refresh_pack_snapshots_for_source_run(db, source_run_id: str) -> None:
    cursor = await db.execute(
        "SELECT pack_id, pack_json FROM prebid_packs "
        "WHERE source_run_id = ? AND deleted_at IS NULL",
        (source_run_id,),
    )
    rows = await cursor.fetchall()
    if not rows:
        return

    actions_cursor = await db.execute(
        "SELECT action_id, review_state FROM action_items WHERE source_run_id = ?",
        (source_run_id,),
    )
    review_states = {
        row["action_id"]: row["review_state"] for row in await actions_cursor.fetchall()
    }
    for row in rows:
        data = json.loads(row["pack_json"] or "{}")
        pending = False
        for item in data.get("top_items", []):
            action_id = item.get("action_id")
            if action_id in review_states:
                item["review_state"] = review_states[action_id]
            pending = pending or item.get("review_state") == "pending"
        data["status"] = "queued_for_review" if pending else "ready"
        await db.execute(
            "UPDATE prebid_packs SET status = ?, pack_json = ? WHERE pack_id = ?",
            (data["status"], _json(data), row["pack_id"]),
        )


async def list_admin_source_runs(
    *,
    limit: int = 50,
    db_path: str | None = None,
) -> list[AdminSourceRunListItem]:
    safe_limit = max(1, min(limit, 100))
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM source_runs ORDER BY created_at DESC LIMIT ?",
            (safe_limit,),
        )
        rows = await cursor.fetchall()
        items: list[AdminSourceRunListItem] = []
        for row in rows:
            if row["deleted_at"] is not None:
                items.append(
                    AdminSourceRunListItem(
                        source_run_id=row["source_run_id"],
                        created_at=row["created_at"],
                        deleted_at=row["deleted_at"],
                        tombstone=True,
                    )
                )
                continue

            counts_cursor = await db.execute(
                "SELECT status, COUNT(*) AS count FROM source_run_coverage "
                "WHERE source_run_id = ? GROUP BY status",
                (row["source_run_id"],),
            )
            coverage_counts = {
                count_row["status"]: count_row["count"]
                for count_row in await counts_cursor.fetchall()
            }
            review_cursor = await db.execute(
                "SELECT status FROM review_tasks WHERE source_run_id = ?",
                (row["source_run_id"],),
            )
            review_rows = await review_cursor.fetchall()
            review_status = None
            if any(task["status"] == "pending" for task in review_rows):
                review_status = "pending"
            elif review_rows:
                review_status = "reviewed"

            items.append(
                AdminSourceRunListItem(
                    source_run_id=row["source_run_id"],
                    created_at=row["created_at"],
                    report_id=row["report_id"],
                    vbo_id=row["vbo_id"],
                    confirmed_address=row["confirmed_address"],
                    result_state=row["result_state"],
                    review_status=review_status,
                    coverage_counts=coverage_counts,
                )
            )
    return items


async def get_admin_source_run(
    source_run_id: str,
    *,
    db_path: str | None = None,
) -> AdminSourceRunResponse | AdminSourceRunTombstoneResponse | None:
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM source_runs WHERE source_run_id = ?",
            (source_run_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        if row["deleted_at"] is not None:
            return AdminSourceRunTombstoneResponse(
                source_run_id=row["source_run_id"],
                deleted_at=row["deleted_at"],
            )

        coverage_cursor = await db.execute(
            "SELECT * FROM source_run_coverage WHERE source_run_id = ?",
            (source_run_id,),
        )
        records_cursor = await db.execute(
            "SELECT * FROM source_records WHERE source_run_id = ?",
            (source_run_id,),
        )
        signals_cursor = await db.execute(
            "SELECT * FROM signals WHERE source_run_id = ?",
            (source_run_id,),
        )
        actions_cursor = await db.execute(
            "SELECT * FROM action_items WHERE source_run_id = ? ORDER BY rank",
            (source_run_id,),
        )
        review_cursor = await db.execute(
            "SELECT * FROM review_tasks WHERE source_run_id = ? ORDER BY created_at",
            (source_run_id,),
        )
        audit_cursor = await db.execute(
            "SELECT * FROM audit_log WHERE source_run_id = ? ORDER BY created_at",
            (source_run_id,),
        )
        audit_events = []
        for event in await audit_cursor.fetchall():
            audit_events.append(
                {
                    "audit_id": event["audit_id"],
                    "event_type": event["event_type"],
                    "created_at": event["created_at"],
                    "payload": json.loads(event["payload_json"] or "{}"),
                }
            )

        return AdminSourceRunResponse(
            source_run_id=row["source_run_id"],
            created_at=row["created_at"],
            report_id=row["report_id"],
            vbo_id=row["vbo_id"],
            confirmed_address=row["confirmed_address"],
            postcode=row["postcode"],
            rd_x=row["rd_x"],
            rd_y=row["rd_y"],
            lat=row["lat"],
            lng=row["lng"],
            result_state=row["result_state"],
            buyer_key_present=bool(row["buyer_key"]),
            coverage=[_coverage_from_row(item) for item in await coverage_cursor.fetchall()],
            records=[_record_from_row(item) for item in await records_cursor.fetchall()],
            signals=[_signal_from_row(item) for item in await signals_cursor.fetchall()],
            actions=[_action_from_row(item) for item in await actions_cursor.fetchall()],
            review_tasks=[_review_task_from_row(item) for item in await review_cursor.fetchall()],
            audit_events=audit_events,
        )


async def record_audit_event(
    event_type: str,
    payload: dict[str, Any],
    *,
    source_run_id: str | None = None,
    report_id: str | None = None,
    db_path: str | None = None,
) -> str:
    audit_id = str(uuid.uuid4())
    async with get_db(db_path) as db:
        await db.execute(
            "INSERT INTO audit_log (audit_id, source_run_id, report_id, event_type, payload_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (audit_id, source_run_id, report_id, event_type, _json(payload)),
        )
        await db.commit()
    return audit_id
