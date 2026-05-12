from __future__ import annotations

from typing import Protocol

import httpx

from app.config import settings
from app.models.match import AlertRule, Listing, NotificationDispatchRecord


class NotificationProvider(Protocol):
    name: str
    mode: str

    async def dispatch(
        self,
        alert: AlertRule,
        matches: list[Listing],
    ) -> NotificationDispatchRecord:
        ...


def notification_provider_placeholder_status() -> dict[str, str | list[str]]:
    mode = settings.match_notification_provider_mode
    configured = bool(
        settings.match_notification_provider_base_url
        and settings.match_notification_provider_api_key
    )
    if mode not in {"mock", "email", "push"}:
        mode = "mock"
    provider_name = (
        "HttpNotificationProvider"
        if mode != "mock" and configured
        else "UnavailableNotificationProvider"
        if mode != "mock"
        else "MockNotificationProvider"
    )
    return {
        "provider_name": provider_name,
        "provider_mode": mode,
        "health": (
            "healthy"
            if mode != "mock" and configured
            else "unconfigured"
            if mode != "mock"
            else "mock_only"
        ),
        "limitations": [
            "Real notification providers are optional; mock dispatch records remain the default.",
        ],
    }


class MockNotificationProvider:
    name = "MockNotificationProvider"
    mode = "mock"

    def __init__(self, *, force_failure: bool = False) -> None:
        self.force_failure = force_failure
        self.records: list[NotificationDispatchRecord] = []

    async def dispatch(
        self,
        alert: AlertRule,
        matches: list[Listing],
    ) -> NotificationDispatchRecord:
        record = NotificationDispatchRecord(
            alert_id=alert.alert_id,
            provider_name=self.name,
            provider_mode="mock",
            result_status="failed" if self.force_failure else "recorded",
            listing_ids=[listing.listing_id for listing in matches],
            error_code="mock_notification_failed" if self.force_failure else None,
        )
        self.records.append(record)
        return record


class UnavailableNotificationProvider:
    name = "UnavailableNotificationProvider"

    def __init__(self, *, mode: str) -> None:
        self.mode = mode if mode in {"email", "push"} else "email"

    async def dispatch(
        self,
        alert: AlertRule,
        matches: list[Listing],
    ) -> NotificationDispatchRecord:
        return NotificationDispatchRecord(
            alert_id=alert.alert_id,
            provider_name=self.name,
            provider_mode=self.mode,  # type: ignore[arg-type]
            result_status="failed",
            listing_ids=[listing.listing_id for listing in matches],
            error_code="notification_provider_unconfigured",
        )


class HttpNotificationProvider:
    name = "HttpNotificationProvider"

    def __init__(
        self,
        *,
        mode: str,
        base_url: str,
        api_key: str,
        timeout_seconds: float = 10.0,
    ) -> None:
        if mode not in {"email", "push"}:
            raise ValueError("HTTP notification mode must be email or push")
        self.mode = mode
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    async def dispatch(
        self,
        alert: AlertRule,
        matches: list[Listing],
    ) -> NotificationDispatchRecord:
        body = {
            "alert_id": alert.alert_id,
            "session_id": alert.session_id,
            "notification_type": alert.notification_type,
            "notification_destination_hash": alert.notification_destination_hash,
            "neighborhood_ids": alert.neighborhood_ids,
            "journey_intent": alert.journey_intent,
            "property_types": alert.property_types,
            "listing_ids": [listing.listing_id for listing in matches],
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/dispatch",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
                response.raise_for_status()
            return NotificationDispatchRecord(
                alert_id=alert.alert_id,
                provider_name=self.name,
                provider_mode=self.mode,
                result_status="sent",
                listing_ids=[listing.listing_id for listing in matches],
            )
        except Exception as exc:
            return NotificationDispatchRecord(
                alert_id=alert.alert_id,
                provider_name=self.name,
                provider_mode=self.mode,
                result_status="failed",
                listing_ids=[listing.listing_id for listing in matches],
                error_code=f"notification_provider_failed:{exc.__class__.__name__}",
            )


def configured_notification_provider(requested_mode: str | None = None) -> NotificationProvider:
    mode = requested_mode or settings.match_notification_provider_mode
    if mode == "mock":
        return MockNotificationProvider()
    if mode not in {"email", "push"}:
        return MockNotificationProvider()
    if (
        settings.match_notification_provider_mode == mode
        and settings.match_notification_provider_base_url
        and settings.match_notification_provider_api_key
    ):
        return HttpNotificationProvider(
            mode=mode,
            base_url=settings.match_notification_provider_base_url,
            api_key=settings.match_notification_provider_api_key,
        )
    return UnavailableNotificationProvider(mode=mode)
