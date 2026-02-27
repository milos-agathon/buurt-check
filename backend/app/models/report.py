"""Pydantic model for the report entity."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

ReportType = Literal["short", "long"]
PaymentStatus = Literal["unpaid", "paid", "failed", "refunded"]
EntitlementStatus = Literal["active", "inactive", "revoked"]


class Report(BaseModel):
    model_config = ConfigDict(extra="ignore")

    report_id: str
    report_type: ReportType
    address_key: str
    vbo_id: str
    generation_version: str
    created_at: str  # ISO 8601 (from SQLite strftime default)
    payment_status: PaymentStatus
    entitlement_status: EntitlementStatus
    provider: str | None = None
    provider_payment_id: str | None = None
    provider_session_id: str | None = None
    purchased_at: str | None = None
