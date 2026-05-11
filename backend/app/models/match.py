from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


def utc_now() -> datetime:
    return datetime.now(UTC)


class DataFreshnessStatus(StrEnum):
    current = "current"
    aging = "aging"
    stale = "stale"
    unavailable = "unavailable"
    mock = "mock"
    conflict = "conflict"


class ConfidenceLabel(StrEnum):
    high = "high"
    medium = "medium"
    low = "low"


class ConfidenceScore(BaseModel):
    score: int = Field(ge=0, le=100)
    label: ConfidenceLabel | None = None
    reasons: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def derive_label(self) -> ConfidenceScore:
        if self.label is None:
            if self.score >= 80:
                self.label = ConfidenceLabel.high
            elif self.score >= 50:
                self.label = ConfidenceLabel.medium
            else:
                self.label = ConfidenceLabel.low
        return self


class MetricSource(BaseModel):
    source_id: str = Field(min_length=1)
    source_name: str = Field(min_length=1)
    source_type: Literal["official", "commercial", "derived", "mock", "user_provided", "missing"]
    metric_name: str = Field(min_length=1)
    source_url: HttpUrl | None = None
    license_status: Literal["open", "licensed", "mock", "unknown", "unavailable"]
    measurement_date: str | None = None
    retrieved_at: datetime | None = None
    geography_level: Literal["neighborhood", "district", "municipality", "custom_seed"]
    method_version: str = Field(min_length=1)
    limitations: list[str] = Field(min_length=1)
    confidence: int = Field(ge=0, le=100)
    freshness_status: DataFreshnessStatus = DataFreshnessStatus.current

    @model_validator(mode="after")
    def validate_mock_and_missing_labels(self) -> MetricSource:
        if self.source_type == "mock" and self.license_status != "mock":
            raise ValueError("mock sources must use mock license_status")
        if (
            self.source_type == "missing"
            and self.freshness_status != DataFreshnessStatus.unavailable
        ):
            raise ValueError("missing sources must use unavailable freshness_status")
        return self


class Neighborhood(BaseModel):
    neighborhood_id: str = Field(min_length=1)
    official_code: str | None = None
    name_nl: str = Field(min_length=1)
    name_en: str | None = None
    municipality: str = Field(min_length=1)
    province: str | None = None
    geography_level: Literal["neighborhood", "district", "municipality", "custom_seed"]
    centroid_rd_x: float | None = None
    centroid_rd_y: float | None = None
    centroid_lat: float | None = None
    centroid_lng: float | None = None
    geometry_ref: str | None = None
    supported_region: bool = True
    mock_status: Literal["real", "seeded_mock", "mixed"]
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class NeighborhoodMetric(BaseModel):
    metric_id: str = Field(min_length=1)
    neighborhood_id: str = Field(min_length=1)
    metric_key: str = Field(min_length=1)
    raw_value: dict[str, object]
    normalized_value: float | None = Field(default=None, ge=0, le=100)
    source: MetricSource
    freshness_status: DataFreshnessStatus
    confidence: int = Field(ge=0, le=100)
    geography_level: Literal["neighborhood", "district", "municipality", "custom_seed"]
    limitations: list[str] = Field(min_length=1)
    imported_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def source_must_match_metric(self) -> NeighborhoodMetric:
        if self.source.metric_name != self.metric_key:
            raise ValueError("source metric_name must match metric_key")
        return self


SUPPORTED_FEATURE_KEYS = frozenset(
    {
        "calmness",
        "green_access",
        "family_fit",
        "mobility",
        "amenities",
        "affordability_buy",
        "affordability_rent",
        "safety_context",
        "environmental_quality",
        "social_lifestyle_fit",
        "housing_stock",
        "listing_availability_buy",
        "listing_availability_rent",
    }
)


class NeighborhoodFeatureVector(BaseModel):
    feature_vector_id: str = Field(min_length=1)
    neighborhood_id: str = Field(min_length=1)
    method_version: str = Field(min_length=1)
    features: dict[str, float | None]
    feature_sources: dict[str, list[str]]
    completeness_score: int = Field(ge=0, le=100)
    confidence: ConfidenceScore
    missing_features: list[str] = Field(default_factory=list)
    stale_features: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def validate_features_and_sources(self) -> NeighborhoodFeatureVector:
        unsupported = sorted(set(self.features) - SUPPORTED_FEATURE_KEYS)
        if unsupported:
            raise ValueError(f"unsupported_metric: {', '.join(unsupported)}")

        for key, value in self.features.items():
            if value is not None and not 0 <= value <= 100:
                raise ValueError(f"feature {key} must be between 0 and 100")
            if value is not None and not self.feature_sources.get(key):
                raise ValueError(f"feature {key} requires source metadata")
        return self


class UserPreferenceProfile(BaseModel):
    profile_id: str = Field(min_length=1)
    session_id: str | None = None
    locale: Literal["en", "nl"]
    household_type: Literal["starter", "single", "couple", "family", "future_family", "other"]
    newcomer_status: Literal["yes", "no", "prefer_not_to_say", "unknown"] = "unknown"
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class PreferenceVector(BaseModel):
    preference_vector_id: str = Field(min_length=1)
    session_id: str | None = None
    profile_id: str | None = None
    journey_intent: Literal["buy", "rent", "both"]
    budget_min_cents: int | None = Field(default=None, ge=0)
    budget_max_cents: int | None = Field(default=None, ge=0)
    monthly_rent_max_cents: int | None = Field(default=None, ge=0)
    anchor_locations: list[dict[str, object]] = Field(default_factory=list)
    commute_limits: list[dict[str, object]] = Field(default_factory=list)
    property_types: list[str] = Field(default_factory=list)
    hard_filters: list[str] = Field(default_factory=list)
    nice_to_haves: list[str] = Field(default_factory=list)
    avoid_signals: list[str] = Field(default_factory=list)
    lifestyle_weights: dict[str, float] = Field(default_factory=dict)
    persona_inputs: dict[str, object] = Field(default_factory=dict)
    locale: Literal["en", "nl"]
    method_version: str = Field(min_length=1)
    created_at: datetime = Field(default_factory=utc_now)

    @field_validator("lifestyle_weights")
    @classmethod
    def validate_weights(cls, value: dict[str, float]) -> dict[str, float]:
        for key, weight in value.items():
            if key not in SUPPORTED_FEATURE_KEYS and key != "affordability":
                raise ValueError(f"unsupported lifestyle weight: {key}")
            if not 0 <= weight <= 1:
                raise ValueError(f"lifestyle weight {key} must be between 0 and 1")
        return value


class RecommendationEvidence(BaseModel):
    evidence_id: str = Field(min_length=1)
    claim_code: str = Field(min_length=1)
    metric_keys: list[str] = Field(min_length=1)
    source_refs: list[str] = Field(min_length=1)
    confidence: ConfidenceScore
    freshness_status: DataFreshnessStatus
    limitations: list[str] = Field(min_length=1)


class ReportInput(BaseModel):
    locale: Literal["en", "nl"]
    profile_summary: dict[str, object]
    preference_vector: PreferenceVector
    recommendations: list[dict[str, object]]
    evidence_items: list[RecommendationEvidence] = Field(min_length=1)
    approved_limitations: list[str] = Field(min_length=1)


class ReportOutput(BaseModel):
    locale: Literal["en", "nl"]
    validation_status: Literal["passed", "fallback_used", "blocked"]
    profile_narrative: str
    recommendation_sections: list[dict[str, object]] = Field(default_factory=list)
    limitations: list[str] = Field(min_length=1)


class ProviderStatus(BaseModel):
    name: str = Field(min_length=1)
    mode: Literal["licensed", "mock", "user_provided", "outbound_placeholder", "unavailable"]
    license_status: Literal["open", "licensed", "mock", "unknown", "unavailable"]
    health: Literal["healthy", "degraded", "failed", "unconfigured", "mock_only"]
    limitations: list[str] = Field(min_length=1)
    last_success_at: datetime | None = None


class ListingCriteria(BaseModel):
    neighborhood_id: str = Field(min_length=1)
    journey_intent: Literal["buy", "rent", "both"]
    budget_max_cents: int | None = Field(default=None, ge=0)
    rent_max_cents: int | None = Field(default=None, ge=0)
    property_type: str | None = None


class Listing(BaseModel):
    listing_id: str = Field(min_length=1)
    provider_listing_id: str | None = None
    provider_name: str = Field(min_length=1)
    provider_mode: Literal[
        "licensed",
        "mock",
        "user_provided",
        "outbound_placeholder",
        "unavailable",
    ]
    license_status: Literal["open", "licensed", "mock", "unknown", "unavailable"]
    neighborhood_id: str = Field(min_length=1)
    journey_intent: Literal["buy", "rent"]
    property_type: str | None = None
    price_cents: int | None = Field(default=None, ge=0)
    rent_cents: int | None = Field(default=None, ge=0)
    currency: Literal["EUR"] = "EUR"
    bedrooms: int | None = Field(default=None, ge=0)
    floor_area_m2: float | None = Field(default=None, ge=0)
    availability_status: Literal["available", "reserved", "sold_rented", "expired", "unknown"]
    days_on_market: int | None = Field(default=None, ge=0)
    source_url: HttpUrl | None = None
    freshness_status: DataFreshnessStatus
    confidence: int = Field(ge=0, le=100)
    limitations: list[str] = Field(min_length=1)
    retrieved_at: datetime = Field(default_factory=utc_now)


class ListingProviderResult(BaseModel):
    provider: ProviderStatus
    listings: list[Listing] = Field(default_factory=list)
    unavailable_reason: str | None = None


class SourceRun(BaseModel):
    source_run_id: str = Field(min_length=1)
    provider_name: str = Field(min_length=1)
    provider_type: Literal["official", "commercial", "mock", "derived"]
    region_config_id: str = Field(min_length=1)
    status: Literal["started", "succeeded", "partial", "failed"]
    started_at: datetime = Field(default_factory=utc_now)
    finished_at: datetime | None = None
    records_imported: int = Field(ge=0)
    records_failed: int = Field(ge=0)
    error_summary: list[str] = Field(default_factory=list)


class SourceHealthSnapshot(BaseModel):
    source_health_id: str = Field(min_length=1)
    provider_name: str = Field(min_length=1)
    region_config_id: str = Field(min_length=1)
    health_status: Literal["healthy", "degraded", "failed", "mock_only", "unconfigured"]
    last_success_at: datetime | None = None
    stale_metric_count: int = Field(ge=0)
    missing_metric_count: int = Field(ge=0)
    mock_metric_count: int = Field(ge=0)
    failed_run_count: int = Field(ge=0)
    details: dict[str, object] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class SeedImportResult(BaseModel):
    region_config_id: str
    neighborhoods: list[Neighborhood]
    sources: list[MetricSource]
    metrics: list[NeighborhoodMetric]
    feature_vectors: list[NeighborhoodFeatureVector]
    source_run: SourceRun
    source_health: list[SourceHealthSnapshot]
