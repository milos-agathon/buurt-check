"""Pydantic model for the report entity."""

from pydantic import BaseModel


class Report(BaseModel):
    report_id: str
    report_type: str  # 'short' | 'long'
    address_key: str
    vbo_id: str
    generation_version: str
    created_at: str
    payment_status: str  # 'unpaid' | 'paid' | 'failed' | 'refunded'
    entitlement_status: str  # 'active' | 'inactive' | 'revoked'
    provider: str | None = None
    provider_payment_id: str | None = None
    provider_session_id: str | None = None
    purchased_at: str | None = None
