"""Pydantic model for the report entity."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

ReportType = Literal["short", "long"]
PaymentStatus = Literal["unpaid", "paid", "failed", "refunded"]
EntitlementStatus = Literal["active", "inactive", "revoked"]

# Bump when scoring logic or data-source interpretation changes.
METHODOLOGY_VERSION = "v2.1 (2026-02-28)"


class Report(BaseModel):
    model_config = ConfigDict(extra="ignore")

    report_id: str
    report_type: ReportType
    address_key: str
    vbo_id: str
    buyer_key: str
    generation_version: str
    created_at: str  # ISO 8601 (from SQLite strftime default)
    payment_status: PaymentStatus
    entitlement_status: EntitlementStatus
    provider: str | None = None
    provider_payment_id: str | None = None
    provider_session_id: str | None = None
    purchased_at: str | None = None


class ProvenanceData(BaseModel):
    """Structured metadata block printed in the PDF for reproducibility."""

    report_id: str | None = None
    vbo_id: str | None = None
    pand_id: str | None = None
    buurt_code: str | None = None
    gemeente_name: str | None = None
    lat: float | None = None
    lng: float | None = None
    rd_x: float | None = None
    rd_y: float | None = None
    methodology_version: str = METHODOLOGY_VERSION

    @property
    def gemeente_code(self) -> str | None:
        """Derive 4-digit gemeente code from buurt_code (BU + 4-digit code + ...)."""
        if self.buurt_code and len(self.buurt_code) >= 6:
            return self.buurt_code[2:6]
        return None
