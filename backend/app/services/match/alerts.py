from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.db import DatabaseError, get_db
from app.models.match import (
    AlertCreateRequest,
    AlertCreateResponse,
    AlertRule,
    Listing,
    NotificationDispatchRecord,
)
from app.services.match.providers.notifications import (
    NotificationProvider,
    configured_notification_provider,
)


def _now() -> datetime:
    return datetime.now(UTC)


def hash_destination(destination: str | None) -> str | None:
    if not destination:
        return None
    return hashlib.sha256(destination.strip().lower().encode("utf-8")).hexdigest()


@dataclass
class AlertStore:
    alerts: dict[str, AlertRule] = field(default_factory=dict)
    dispatches: list[NotificationDispatchRecord] = field(default_factory=list)

    def duplicate_for(self, rule: AlertRule) -> AlertRule | None:
        signature = _alert_signature(rule)
        for existing in self.alerts.values():
            if existing.status != "deleted" and _alert_signature(existing) == signature:
                return existing
        return None


_ALERT_STORE = AlertStore()


def _alert_signature(rule: AlertRule) -> tuple[object, ...]:
    return (
        rule.session_id,
        tuple(sorted(rule.neighborhood_ids)),
        rule.journey_intent,
        rule.budget_max_cents,
        rule.rent_max_cents,
        tuple(sorted(rule.property_types)),
        rule.notification_destination_hash,
    )


def _intent_matches(alert: AlertRule, listing: Listing) -> bool:
    return alert.journey_intent == "both" or alert.journey_intent == listing.journey_intent


def find_matching_listings(alert: AlertRule, listings: list[Listing]) -> list[Listing]:
    matches: list[Listing] = []
    for listing in listings:
        if listing.neighborhood_id not in alert.neighborhood_ids:
            continue
        if not _intent_matches(alert, listing):
            continue
        if listing.property_type and listing.property_type not in alert.property_types:
            continue
        if (
            listing.journey_intent == "buy"
            and alert.budget_max_cents is not None
            and listing.price_cents is not None
            and listing.price_cents > alert.budget_max_cents
        ):
            continue
        if (
            listing.journey_intent == "rent"
            and alert.rent_max_cents is not None
            and listing.rent_cents is not None
            and listing.rent_cents > alert.rent_max_cents
        ):
            continue
        if listing.availability_status not in {"available", "reserved", "unknown"}:
            continue
        matches.append(listing)
    return matches


async def _persist_alert(rule: AlertRule) -> None:
    try:
        async with get_db() as db:
            await db.execute(
                """INSERT OR REPLACE INTO match_alerts (
                    alert_id,
                    session_id,
                    preference_vector_id,
                    neighborhood_ids_json,
                    journey_intent,
                    budget_max_cents,
                    rent_max_cents,
                    property_types_json,
                    notification_destination_hash,
                    notification_type,
                    status,
                    source_context,
                    last_evaluated_at,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    rule.alert_id,
                    rule.session_id,
                    rule.preference_vector_id,
                    json.dumps(rule.neighborhood_ids),
                    rule.journey_intent,
                    rule.budget_max_cents,
                    rule.rent_max_cents,
                    json.dumps(rule.property_types),
                    rule.notification_destination_hash,
                    rule.notification_type,
                    rule.status,
                    rule.source_context,
                    rule.last_evaluated_at.isoformat() if rule.last_evaluated_at else None,
                    rule.created_at.isoformat(),
                    rule.updated_at.isoformat(),
                ),
            )
            await db.commit()
    except DatabaseError:
        return


async def _persist_dispatch(record: NotificationDispatchRecord) -> None:
    try:
        async with get_db() as db:
            await db.execute(
                """INSERT OR REPLACE INTO match_notification_dispatch_records (
                    dispatch_id,
                    alert_id,
                    provider_name,
                    provider_mode,
                    result_status,
                    listing_ids_json,
                    error_code,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    record.dispatch_id,
                    record.alert_id,
                    record.provider_name,
                    record.provider_mode,
                    record.result_status,
                    json.dumps(record.listing_ids),
                    record.error_code,
                    record.created_at.isoformat(),
                ),
            )
            await db.commit()
    except DatabaseError:
        return


async def create_alert(
    payload: AlertCreateRequest,
    *,
    listings: list[Listing] | None = None,
    store: AlertStore | None = None,
    notification_provider: NotificationProvider | None = None,
) -> AlertCreateResponse:
    selected_store = store or _ALERT_STORE
    rule = payload.to_rule()
    if payload.notification_destination and not payload.notification_destination_hash:
        rule = rule.model_copy(
            update={
                "notification_destination_hash": hash_destination(
                    payload.notification_destination
                )
            }
        )

    duplicate = selected_store.duplicate_for(rule)
    if duplicate:
        dispatch = NotificationDispatchRecord(
            alert_id=duplicate.alert_id,
            provider_name="MockNotificationProvider",
            provider_mode="mock",
            result_status="skipped",
            listing_ids=[],
            error_code="duplicate_alert",
        )
        return AlertCreateResponse(alert=duplicate, created=False, dispatch=dispatch)

    matches = find_matching_listings(rule, listings or [])
    provider = notification_provider or configured_notification_provider(rule.notification_type)
    dispatch = await provider.dispatch(rule, matches)
    rule = rule.model_copy(update={"last_evaluated_at": _now(), "updated_at": _now()})
    selected_store.alerts[rule.alert_id] = rule
    selected_store.dispatches.append(dispatch)
    await _persist_alert(rule)
    await _persist_dispatch(dispatch)
    return AlertCreateResponse(
        alert=rule,
        created=True,
        dispatch=dispatch,
        matched_listing_ids=[listing.listing_id for listing in matches],
    )


async def update_alert(
    alert_id: str,
    *,
    status: str | None = None,
    budget_max_cents: int | None = None,
    rent_max_cents: int | None = None,
    property_types: list[str] | None = None,
    notification_type: str | None = None,
    store: AlertStore | None = None,
) -> AlertRule:
    selected_store = store or _ALERT_STORE
    existing = selected_store.alerts.get(alert_id)
    if existing is None:
        raise KeyError(alert_id)

    updates: dict[str, object] = {"updated_at": _now()}
    if status is not None:
        updates["status"] = status
    if budget_max_cents is not None:
        updates["budget_max_cents"] = budget_max_cents
    if rent_max_cents is not None:
        updates["rent_max_cents"] = rent_max_cents
    if property_types is not None:
        updates["property_types"] = property_types
    if notification_type is not None:
        updates["notification_type"] = notification_type

    updated = existing.model_copy(update=updates)
    selected_store.alerts[alert_id] = updated
    await _persist_alert(updated)
    return updated


async def delete_alert(alert_id: str, *, store: AlertStore | None = None) -> AlertRule:
    return await update_alert(alert_id, status="deleted", store=store)


def list_alerts(
    *,
    session_id: str | None = None,
    store: AlertStore | None = None,
) -> list[AlertRule]:
    selected_store = store or _ALERT_STORE
    alerts = [
        alert
        for alert in selected_store.alerts.values()
        if alert.status != "deleted" and (session_id is None or alert.session_id == session_id)
    ]
    return sorted(alerts, key=lambda item: item.created_at, reverse=True)
