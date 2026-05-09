from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SourcePriority(StrEnum):
    p0 = "p0"
    p1 = "p1"
    p2 = "p2"


class SourceStatus(StrEnum):
    checked = "checked"
    failed = "failed"
    unavailable = "unavailable"
    not_supported = "not_supported"
    manual_review = "manual_review"
    skipped = "skipped"


class ResultState(StrEnum):
    signals_found = "signals_found"
    no_major_signal_found = "no_major_signal_found"
    data_incomplete = "data_incomplete"
    needs_human_review = "needs_human_review"
    outside_coverage = "outside_coverage"


class ConfidenceLabel(StrEnum):
    high = "high"
    medium = "medium"
    low = "low"
    needs_review = "needs_review"
    data_incomplete = "data_incomplete"


class PropertyType(StrEnum):
    apartment = "apartment"
    house = "house"
    mixed_use = "mixed_use"
    unknown = "unknown"


class ShareScope(StrEnum):
    briefing = "briefing"
    pack = "pack"


class ReviewState(StrEnum):
    not_required = "not_required"
    pending = "pending"
    approved = "approved"
    changes_requested = "changes_requested"


class PrebidRecipient(StrEnum):
    selling_agent = "selling_agent"
    seller = "seller"
    vve = "vve"
    municipality = "municipality"
    notary = "notary"
    buyers_agent = "buyers_agent"
    inspector = "inspector"
    mortgage_advisor = "mortgage_advisor"


class SourceReference(BaseModel):
    source_id: str
    authority: str
    name: str
    url: str | None = None
    retrieved_at: str
    source_date: str | None = None
    status_label: str | None = None
    record_id: str | None = None


class SourceCoverageItem(BaseModel):
    source_id: str
    authority: str
    label: str
    priority: SourcePriority
    status: SourceStatus
    checked_at: str | None = None
    basis: str
    radius_m: int | None = None
    method_version: str | None = None
    duration_ms: int | None = None
    automated: bool = True
    human_reviewed: bool = False
    limitation: str
    error_code: str | None = None


class SourceRecord(BaseModel):
    record_id: str
    source_id: str
    authority: str
    title: str
    source_url: str | None = None
    source_date: str | None = None
    status_label: str | None = None
    distance_m: float | None = None
    evidence_payload: dict[str, Any] = Field(default_factory=dict)


def _require_non_empty(value: list[Any], field_name: str) -> list[Any]:
    if not value:
        raise ValueError(f"{field_name} must be non-empty")
    return value


class Signal(BaseModel):
    signal_id: str
    signal_type: Literal[
        "planning_change",
        "public_notice",
        "parcel",
        "wkpb_restriction",
        "monument_or_protected_view",
        "energy_label",
        "parking",
        "source_incomplete",
    ]
    title: str
    finding: str
    status: str | None = None
    proximity_m: float | None = None
    buyer_impact_tags: list[str] = Field(default_factory=list)
    confidence: ConfidenceLabel
    limitation: str
    recommended_action: str
    materiality: int = Field(ge=0, le=100)
    source_refs: list[SourceReference]
    requires_review: bool = False
    review_reason: str | None = None

    @field_validator("source_refs")
    @classmethod
    def _source_refs_non_empty(cls, value: list[SourceReference]) -> list[SourceReference]:
        return _require_non_empty(value, "source_refs")


class ActionItem(BaseModel):
    action_id: str
    signal_id: str
    rank: int = Field(ge=1)
    rank_score: int = Field(ge=0, le=100)
    finding: str
    why_it_matters: str
    ask_this_en: str
    ask_this_nl: str
    request_this_en: str
    request_this_nl: str
    who_to_ask: list[PrebidRecipient | str]
    confidence: ConfidenceLabel
    limitation: str
    source_refs: list[SourceReference]
    review_state: ReviewState = ReviewState.not_required

    @field_validator("source_refs")
    @classmethod
    def _source_refs_non_empty(cls, value: list[SourceReference]) -> list[SourceReference]:
        return _require_non_empty(value, "source_refs")

    @field_validator("who_to_ask")
    @classmethod
    def _who_to_ask_non_empty(
        cls,
        value: list[PrebidRecipient | str],
    ) -> list[PrebidRecipient | str]:
        return _require_non_empty(value, "who_to_ask")


class SourceQualitySummary(BaseModel):
    unknown_source_date_count: int = 0
    generic_confidence_count: int = 0
    generic_limitation_count: int = 0
    missing_source_ref_count: int = 0
    missing_recipient_count: int = 0
    caps: list[str] = Field(default_factory=list)


class PrebidBriefingRequest(BaseModel):
    report_id: str | None = None
    confirmed_address: str | None = None
    postcode: str | None = None
    municipality: str | None = None
    rd_x: float | None = None
    rd_y: float | None = None
    lat: float | None = None
    lng: float | None = None
    property_type: PropertyType = PropertyType.unknown
    address: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _populate_from_legacy_address(self) -> PrebidBriefingRequest:
        if self.address and not self.confirmed_address:
            self.confirmed_address = str(self.address.get("display_name") or "")
            self.postcode = self.postcode or self.address.get("postcode")
            self.municipality = (
                self.municipality or self.address.get("municipality") or self.address.get("city")
            )
            self.rd_x = self.rd_x if self.rd_x is not None else self.address.get("rd_x")
            self.rd_y = self.rd_y if self.rd_y is not None else self.address.get("rd_y")
            self.lat = self.lat if self.lat is not None else self.address.get("latitude")
            self.lng = self.lng if self.lng is not None else self.address.get("longitude")
        if not self.confirmed_address:
            raise ValueError("confirmed_address is required")
        return self


class PrebidBriefingResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    briefing_id: str
    report_id: str | None = None
    vbo_id: str
    confirmed_address: str
    postcode: str | None = None
    municipality: str | None = None
    rd_x: float | None = None
    rd_y: float | None = None
    lat: float | None = None
    lng: float | None = None
    property_type: PropertyType = PropertyType.unknown
    checked_at: str
    result_state: ResultState
    top_actions: list[ActionItem] = Field(default_factory=list, max_length=3)
    lower_context: list[Signal] = Field(default_factory=list)
    coverage: list[SourceCoverageItem] = Field(default_factory=list)
    disclaimer: str
    source_quality: SourceQualitySummary = Field(default_factory=SourceQualitySummary)


class PrebidPackSection(BaseModel):
    title: str
    body: list[str]


class PrebidPackResponse(BaseModel):
    pack_id: str
    briefing_id: str
    report_id: str
    vbo_id: str
    confirmed_address: str
    checked_at: str
    status: Literal["ready", "queued_for_review"]
    address_summary: PrebidPackSection
    top_items: list[ActionItem]
    questions_en: dict[str, list[str]]
    questions_nl: dict[str, list[str]]
    document_requests_en: list[str]
    document_requests_nl: list[str]
    evidence_narrative: list[str] = Field(default_factory=list)
    coverage_detail: list[str] = Field(default_factory=list)
    source_appendix: list[SourceCoverageItem]
    not_covered: list[str]
    disclaimer: str


class ShareLinkResponse(BaseModel):
    ok: bool = True
    scope: ShareScope
    share_token: str
    share_url: str
    expires_at: str | None = None


class EmailShareRequest(BaseModel):
    email: str
    consent: Literal[True]
    language: Literal["en", "nl"] = "en"


class LegacyEmailShareRequest(BaseModel):
    email: str
    consent_to_email: Literal[True]


class EmailShareResponse(ShareLinkResponse):
    email_sent: bool
    error_code: Literal["email_provider_unavailable"] | None = None


class ShareRequest(BaseModel):
    consent_to_share: Literal[True] | None = None


class DeleteBriefingResponse(BaseModel):
    deleted: bool
    briefing_id: str


class SharedPrebidResponse(BaseModel):
    state: Literal["valid", "expired", "revoked", "deleted", "forbidden", "not_found"]
    mode: Literal["briefing", "pack"]
    briefing: dict[str, Any] | None = None
    pack: dict[str, Any] | None = None
    support_email: str | None = "support@buurt-check.nl"


class ReviewTask(BaseModel):
    review_task_id: str
    source_run_id: str
    action_id: str | None = None
    status: Literal["pending", "approved", "changes_requested"] = "pending"
    reason: str
    created_at: str
    decided_at: str | None = None


class AdminSourceRunListItem(BaseModel):
    source_run_id: str
    created_at: str
    deleted_at: str | None = None
    tombstone: bool = False
    report_id: str | None = None
    vbo_id: str | None = None
    confirmed_address: str | None = None
    result_state: str | None = None
    review_status: str | None = None
    coverage_counts: dict[str, int] | None = None


class AdminSourceRunResponse(BaseModel):
    source_run_id: str
    created_at: str
    report_id: str | None = None
    vbo_id: str
    confirmed_address: str
    postcode: str | None = None
    rd_x: float | None = None
    rd_y: float | None = None
    lat: float | None = None
    lng: float | None = None
    result_state: str
    buyer_key_present: bool
    coverage: list[SourceCoverageItem]
    records: list[SourceRecord]
    signals: list[Signal]
    actions: list[ActionItem]
    review_tasks: list[ReviewTask] = Field(default_factory=list)
    audit_events: list[dict[str, Any]] = Field(default_factory=list)


class AdminSourceRunTombstoneResponse(BaseModel):
    source_run_id: str
    deleted_at: str
    tombstone: Literal[True] = True


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
