from __future__ import annotations

from typing import Protocol

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
