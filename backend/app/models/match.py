from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

from app.services.match.survey_constants import MATCH_SURVEY_QUESTION_COUNT


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

PREFERENCE_CATEGORY_KEYS = frozenset(
    {
        "calmness",
        "green_space",
        "family_fit",
        "mobility",
        "amenities",
        "affordability",
        "safety_context",
        "environmental_quality",
        "social_lifestyle_fit",
        "housing_stock",
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
    freshness_status: DataFreshnessStatus = DataFreshnessStatus.mock
    limitations: list[str] = Field(
        default_factory=lambda: ["limitation.seed_mock_feature_matrix_not_live"]
    )
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
    source_answer_version: int | None = Field(default=None, ge=0)
    vector_version: str | None = None
    raw_answer_refs: dict[str, object] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)

    @field_validator("lifestyle_weights")
    @classmethod
    def validate_weights(cls, value: dict[str, float]) -> dict[str, float]:
        for key, weight in value.items():
            if key not in PREFERENCE_CATEGORY_KEYS and key not in SUPPORTED_FEATURE_KEYS:
                raise ValueError(f"unsupported lifestyle weight: {key}")
            if not 0 <= weight <= 1:
                raise ValueError(f"lifestyle weight {key} must be between 0 and 1")
        return value


MatchSessionPhase = Literal[
    "landing",
    "survey_intro",
    "survey_question",
    "review",
    "matching",
    "success",
    "results_map",
    "neighborhood_detail",
    "dossier",
]

class MatchSessionCreateRequest(BaseModel):
    locale: Literal["en", "nl"] = "en"
    source: Literal["landing", "intro", "resume"] = "landing"


class MatchSessionCreateResponse(BaseModel):
    session_id: str = Field(min_length=1)
    locale: Literal["en", "nl"]
    phase: MatchSessionPhase
    current_step: int | None = None
    answer_version: int = Field(ge=0)
    expires_at: datetime


class SurveyAnswerValidation(BaseModel):
    valid: bool
    required: bool
    error_code: str | None = None


class SurveyAnswerPatchRequest(BaseModel):
    answers: dict[str, object]
    current_step: int | None = Field(default=None, ge=1, le=MATCH_SURVEY_QUESTION_COUNT)
    locale: Literal["en", "nl"] = "en"


class SurveyAnswerPatchResponse(BaseModel):
    session_id: str = Field(min_length=1)
    answer_version: int = Field(ge=0)
    is_complete: bool
    validation: dict[str, SurveyAnswerValidation]
    stale_results: bool = True


class MatchRunRequest(BaseModel):
    source: str | None = None
    preference_vector_version: str | None = None


class MatchSessionResponse(BaseModel):
    session_id: str = Field(min_length=1)
    locale: Literal["en", "nl"]
    phase: MatchSessionPhase
    current_step: int | None = None
    answer_version: int = Field(ge=0)
    answers: dict[str, object] = Field(default_factory=dict)
    validation: dict[str, SurveyAnswerValidation] = Field(default_factory=dict)
    is_complete: bool = False
    preference_vector_id: str | None = None
    preference_vector_version: str | None = None
    preference_vector: PreferenceVector | None = None
    active_job_id: str | None = None
    selected_neighborhood_id: str | None = None
    map_state: dict[str, object] | None = None
    dossier_return_context: dict[str, object] | None = None
    expires_at: datetime | None = None


MatchJobPublicStatus = Literal[
    "created",
    "queued",
    "running",
    "matching_slow",
    "completed",
    "failed",
    "completed_with_fallback",
    "completed_no_strong_matches",
    "expired",
    "cancelled",
]

MatchJobStage = Literal[
    "created",
    "queued",
    "reading_preferences",
    "building_profile",
    "loading_neighborhood_data",
    "applying_filters",
    "running_models",
    "scoring_tradeoffs",
    "preparing_map",
    "completed",
    "completed_with_fallback",
    "completed_no_strong_matches",
    "failed",
    "expired",
]


class MatchRunResponse(BaseModel):
    session_id: str = Field(min_length=1)
    job_id: str = Field(min_length=1)
    status: MatchJobPublicStatus
    stage: MatchJobStage
    progress: int = Field(ge=0, le=100)
    message_key: str = Field(pattern=r"^matchFirst\.progress\.")
    preference_vector_id: str = Field(min_length=1)
    poll_after_ms: int = Field(default=1000, ge=250, le=5000)


class MatchJobStatusResponse(BaseModel):
    session_id: str = Field(min_length=1)
    job_id: str = Field(min_length=1)
    status: MatchJobPublicStatus
    stage: MatchJobStage
    progress: int = Field(ge=0, le=100)
    message_key: str = Field(pattern=r"^matchFirst\.progress\.")
    model_mode: Literal["weighted_scoring", "predictive_candidate"] = "weighted_scoring"
    model_version: str = "match-score-v1"
    scoring_version: str = "match-score-v1"
    evaluation_status: Literal[
        "not_validated_no_labels",
        "labels_available_not_trained",
        "not_validated_missing_evaluation",
        "validated_labels_available",
    ] = "not_validated_no_labels"
    fallback_used: bool = False
    fallback_reason_code: str | None = None
    result_set_id: str | None = None
    error_code: str | None = None
    runtime_ms: int = Field(default=0, ge=0)
    updated_at: datetime


class MatchResultConfidence(BaseModel):
    score: int = Field(ge=0, le=100)
    level: Literal["high", "medium", "low", "insufficient"]
    reasons: list[str] = Field(default_factory=list)


class MatchResultSourceMetadata(BaseModel):
    source_id: str = Field(min_length=1)
    source_type: Literal["official", "commercial", "derived", "mock", "user_provided", "missing"]
    source_name_key: str = Field(pattern=r"^match\.results\.sources\.")
    metric_keys: list[str] = Field(default_factory=list)
    measurement_date: str | None = None
    retrieved_at: datetime | None = None
    freshness_status: DataFreshnessStatus
    confidence: int = Field(ge=0, le=100)
    limitations: list[str] = Field(default_factory=list)


class MatchGeometryReference(BaseModel):
    centroid_rd: dict[str, float]
    bounds_rd: list[float] = Field(min_length=4, max_length=4)
    display_centroid_wgs84: dict[str, float]
    display_bounds_wgs84: list[float] = Field(min_length=4, max_length=4)
    boundary_ref: str = Field(min_length=1)
    boundary_source: str = "match_seed"
    boundary_freshness: DataFreshnessStatus = DataFreshnessStatus.mock
    building_layer_ref: str | None = None
    building_layer_available: bool = False
    amenity_layer_refs: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class MatchResultRecommendation(BaseModel):
    rank: int = Field(ge=1)
    recommendation_id: str = Field(min_length=1)
    neighborhood_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    municipality: str = Field(min_length=1)
    fit_score: int = Field(ge=0, le=100)
    fit_label_key: str = Field(pattern=r"^matchFirst\.results\.fitLabel\.")
    category: Literal["top", "surprising", "stretch", "avoid_or_reconsider"]
    eligibility_status: Literal[
        "eligible",
        "stretch",
        "failed_hard_filter",
        "insufficient_data",
    ]
    confidence: MatchResultConfidence
    reason_codes: list[str] = Field(default_factory=list)
    tradeoffs: list[str] = Field(default_factory=list)
    component_scores: dict[str, int] = Field(default_factory=dict)
    matched_preferences: list[str] = Field(default_factory=list)
    failed_filters: list[str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)
    source_metadata: list[MatchResultSourceMetadata] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    freshness_status: DataFreshnessStatus
    geometry_ref: MatchGeometryReference
    amenity_refs: list[str] = Field(default_factory=list)


class MatchResultsMap(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    display_bounds_wgs84: list[float] = Field(min_length=4, max_length=4)
    features: list[dict[str, object]] = Field(default_factory=list)


class MatchResultsResponse(BaseModel):
    session_id: str = Field(min_length=1)
    job_id: str = Field(min_length=1)
    result_set_id: str = Field(min_length=1)
    preference_vector_version: str = Field(min_length=1)
    status: Literal["completed", "completed_with_fallback", "completed_no_strong_matches"]
    generated_at: datetime
    runtime_ms: int = Field(default=0, ge=0)
    model_mode: Literal["weighted_scoring"] = "weighted_scoring"
    model_version: str = "match-score-v1"
    scoring_version: str = "match-score-v1"
    data_version: str = Field(min_length=1)
    evaluation_status: Literal["not_validated_no_labels"] = "not_validated_no_labels"
    predictive_probability_available: Literal[False] = False
    fallback_used: bool = False
    fallback_reason_code: str | None = None
    ranked_results: list[MatchResultRecommendation] = Field(default_factory=list)
    recommendations: list[MatchResultRecommendation] = Field(default_factory=list)
    stretch_matches: list[MatchResultRecommendation] = Field(default_factory=list)
    near_misses: list[MatchResultRecommendation] = Field(default_factory=list)
    normal_recommendation_count: int = Field(default=0, ge=0)
    candidate_count: int = Field(default=0, ge=0)
    scored_candidate_count: int = Field(default=0, ge=0)
    empty_state_code: str | None = None
    map_center: dict[str, float]
    bbox: list[float] = Field(min_length=4, max_length=4)
    map: MatchResultsMap

    @model_validator(mode="after")
    def mirror_recommendation_alias(self) -> MatchResultsResponse:
        if not self.recommendations:
            self.recommendations = self.ranked_results
        return self


class QuizBudget(BaseModel):
    buy_min: int | None = Field(default=None, ge=0)
    buy_max: int | None = Field(default=None, ge=0)
    rent_max: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_buy_range(self) -> QuizBudget:
        if (
            self.buy_min is not None
            and self.buy_max is not None
            and self.buy_min > self.buy_max
        ):
            raise ValueError("buy_min cannot exceed buy_max")
        return self


class LocationAnchor(BaseModel):
    label: str = Field(min_length=1)
    query: str = Field(min_length=1)
    lat: float | None = None
    lng: float | None = None


class CommuteLimit(BaseModel):
    mode: Literal["bike", "walk", "car", "public_transport", "mixed", "radius"]
    max_minutes: int | None = Field(default=None, ge=1, le=180)
    radius_km: float | None = Field(default=None, ge=0.5, le=150)

    @model_validator(mode="after")
    def validate_limit(self) -> CommuteLimit:
        if self.max_minutes is None and self.radius_km is None:
            raise ValueError("commute limit requires max_minutes or radius_km")
        return self


class MatchQuizRequest(BaseModel):
    session_id: str | None = None
    locale: Literal["en", "nl"]
    journey_intent: Literal["buy", "rent", "both"]
    budget: QuizBudget = Field(default_factory=QuizBudget)
    household_type: Literal["starter", "single", "couple", "family", "future_family", "other"]
    current_city: str | None = None
    preferred_anchor_location: str | None = None
    anchor_locations: list[LocationAnchor] = Field(default_factory=list)
    commute_limits: list[CommuteLimit] = Field(default_factory=list)
    property_types: list[str] = Field(min_length=1)
    must_haves: list[str] = Field(default_factory=list)
    nice_to_haves: list[str] = Field(default_factory=list)
    avoid_signals: list[str] = Field(default_factory=list)
    language_preference: Literal["en", "nl"] | None = None
    lifestyle_priorities: dict[str, int] = Field(default_factory=dict)
    newcomer_status: Literal["yes", "no", "prefer_not_to_say", "unknown"] = "unknown"
    nationality: str | None = Field(default=None, exclude=True)
    immigration_status: str | None = Field(default=None, exclude=True)

    @field_validator("lifestyle_priorities")
    @classmethod
    def validate_lifestyle_priorities(cls, value: dict[str, int]) -> dict[str, int]:
        for key, weight in value.items():
            if key not in PREFERENCE_CATEGORY_KEYS:
                raise ValueError(f"unsupported lifestyle priority: {key}")
            if not 1 <= weight <= 5:
                raise ValueError(f"lifestyle priority {key} must be between 1 and 5")
        return value


class MatchValidationWarning(BaseModel):
    code: str = Field(pattern=r"^match\.warning\.")
    severity: Literal["info", "warning"]
    field: str | None = None


class PersonaOverlay(BaseModel):
    type: Literal[
        "family",
        "newcomer",
        "city_escape",
        "single_couple",
        "buyer",
        "renter",
        "starter",
    ]
    confidence: int = Field(ge=0, le=100)
    reasons: list[str] = Field(min_length=1)


class PreferenceGenerationResult(BaseModel):
    profile: UserPreferenceProfile
    preference_vector: PreferenceVector
    validation_warnings: list[MatchValidationWarning] = Field(default_factory=list)


class MatchQuizResponse(BaseModel):
    profile: UserPreferenceProfile
    preference_vector: PreferenceVector
    persona_overlays: list[PersonaOverlay] = Field(default_factory=list)
    validation_warnings: list[MatchValidationWarning] = Field(default_factory=list)
    estimated_completion_minutes: list[int] = Field(default_factory=lambda: [3, 6])
    prd_traceability: list[str] = Field(default_factory=lambda: ["FR1", "FR2", "FR3", "FR12"])
    analytics_event: Literal["match_quiz_completed"] = "match_quiz_completed"


class RecommendationEvidence(BaseModel):
    evidence_id: str = Field(min_length=1)
    claim_code: str = Field(min_length=1)
    metric_keys: list[str] = Field(min_length=1)
    source_refs: list[str] = Field(min_length=1)
    confidence: ConfidenceScore
    freshness_status: DataFreshnessStatus
    limitations: list[str] = Field(min_length=1)


class RecommendationExplanation(BaseModel):
    code: str = Field(min_length=1)
    evidence_refs: list[str] = Field(default_factory=list)


class ScoreDriver(BaseModel):
    feature: str = Field(min_length=1)
    impact: float
    score: float = Field(ge=0, le=100)
    source_refs: list[str] = Field(default_factory=list)


class NeighborhoodMatchScore(BaseModel):
    recommendation_id: str = Field(min_length=1)
    neighborhood_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    municipality: str = Field(min_length=1)
    rank: int = Field(ge=0)
    category: Literal["top", "surprising", "stretch", "avoid_or_reconsider"] | None = None
    fit_score: int = Field(ge=0, le=100)
    eligibility_status: Literal[
        "eligible",
        "stretch",
        "failed_hard_filter",
        "insufficient_data",
    ]
    component_scores: dict[str, int] = Field(default_factory=dict)
    why_it_fits: list[RecommendationExplanation] = Field(default_factory=list)
    tradeoffs: list[RecommendationExplanation] = Field(default_factory=list)
    score_drivers: list[ScoreDriver] = Field(default_factory=list)
    failed_filters: list[str] = Field(default_factory=list)
    confidence: ConfidenceScore
    freshness_status: DataFreshnessStatus
    data_freshness_indicator: str = Field(min_length=1)
    source_refs: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    missing_features: list[str] = Field(default_factory=list)


class RecommendationSet(BaseModel):
    top: list[NeighborhoodMatchScore] = Field(default_factory=list)
    surprising: list[NeighborhoodMatchScore] = Field(default_factory=list)
    stretch: list[NeighborhoodMatchScore] = Field(default_factory=list)
    avoid_or_reconsider: list[NeighborhoodMatchScore] = Field(default_factory=list)
    empty_result_relaxations: list[str] = Field(default_factory=list)
    source_coverage: list[str] = Field(default_factory=list)


class MatchRecommendationsRequest(BaseModel):
    preference_vector: PreferenceVector
    limit: int = Field(default=10, ge=1, le=20)
    locale: Literal["en", "nl"] = "en"


class MatchRecommendationsResponse(BaseModel):
    preference_vector_id: str = Field(min_length=1)
    locale: Literal["en", "nl"]
    recommendations: RecommendationSet
    evidence_items: list[RecommendationEvidence] = Field(default_factory=list)
    source_coverage: list[str] = Field(default_factory=list)
    empty_state_code: str | None = None


class SimilarNeighborhoodResult(BaseModel):
    neighborhood_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    municipality: str = Field(min_length=1)
    similarity_score: int = Field(ge=0, le=100)
    shared_drivers: list[ScoreDriver] = Field(default_factory=list)
    meaningful_differences: list[ScoreDriver] = Field(default_factory=list)
    constraints: list[RecommendationExplanation] = Field(default_factory=list)
    confidence: ConfidenceScore
    source_refs: list[str] = Field(default_factory=list)


class MatchSimilarRequest(BaseModel):
    source_neighborhood_id: str = Field(min_length=1)
    preference_vector_id: str | None = None
    filters: dict[Literal["cheaper", "greener", "calmer"], bool] = Field(default_factory=dict)
    limit: int = Field(default=8, ge=1, le=20)


class MatchSimilarResponse(BaseModel):
    source_neighborhood_id: str = Field(min_length=1)
    results: list[SimilarNeighborhoodResult] = Field(default_factory=list)
    unsupported_regions: list[str] = Field(default_factory=list)
    empty_state_code: str | None = None


class MatchCompareRequest(BaseModel):
    preference_vector_id: str | None = None
    neighborhood_ids: list[str] = Field(default_factory=list, max_length=8)
    locale: Literal["en", "nl"] = "en"


class ComparisonCell(BaseModel):
    value: float | None = None
    display_value: str
    state: Literal["available", "missing", "stale", "mock"]
    confidence: int = Field(ge=0, le=100)
    freshness_status: DataFreshnessStatus
    source_refs: list[str] = Field(default_factory=list)
    sources: list[MetricSource] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class ComparisonIndicatorRow(BaseModel):
    indicator_key: str = Field(min_length=1)
    label_code: str = Field(pattern=r"^match\.comparison\.indicator\.")
    cells: dict[str, ComparisonCell]


class ComparisonNeighborhoodSummary(BaseModel):
    neighborhood_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    municipality: str = Field(min_length=1)
    score: int = Field(ge=0, le=100)
    dimension_scores: dict[str, int | None] = Field(default_factory=dict)
    evidence: list[RecommendationExplanation] = Field(default_factory=list)
    tradeoffs: list[RecommendationExplanation] = Field(default_factory=list)
    confidence: ConfidenceScore
    freshness_status: DataFreshnessStatus
    missing_data: list[str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)


class MatchCompareResponse(BaseModel):
    preference_vector_id: str | None = None
    locale: Literal["en", "nl"]
    neighborhoods: list[ComparisonNeighborhoodSummary] = Field(min_length=3)
    indicators: list[ComparisonIndicatorRow] = Field(min_length=5, max_length=8)
    source_coverage: list[str] = Field(default_factory=list)
    missing_data_states: list[str] = Field(default_factory=list)


class MapMissingCoordinate(BaseModel):
    neighborhood_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    reason_code: Literal["match.map.missingCoordinates"] = "match.map.missingCoordinates"


class MatchMapFeatureGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]


class MatchMapFeatureProperties(BaseModel):
    neighborhood_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    municipality: str = Field(min_length=1)
    match_score: int = Field(ge=0, le=100)
    category: Literal["top", "surprising", "stretch", "avoid_or_reconsider"]
    confidence: ConfidenceScore
    freshness_status: DataFreshnessStatus
    source_refs: list[str] = Field(default_factory=list)
    missing_data: list[str] = Field(default_factory=list)


class MatchMapFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: MatchMapFeatureGeometry
    properties: MatchMapFeatureProperties


class MatchMapResponse(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    bounds: list[float] = Field(min_length=4, max_length=4)
    features: list[MatchMapFeature] = Field(default_factory=list)
    unsupported_regions: list[str] = Field(default_factory=list)
    missing_coordinates: list[MapMissingCoordinate] = Field(default_factory=list)
    empty_state_code: str | None = None


ReportSectionType = Literal[
    "profile_summary",
    "top_neighborhood_matches",
    "why_these_neighborhoods_fit",
    "tradeoffs_and_watchouts",
    "similar_neighborhoods",
    "live_homes_available_now",
    "suggested_alerts",
    "next_steps",
]


def _guardrail_event_id() -> str:
    return f"gr_{uuid4().hex}"


class GuardrailEvent(BaseModel):
    guardrail_event_id: str = Field(default_factory=_guardrail_event_id)
    report_id: str | None = None
    event_type: Literal[
        "missing_citation",
        "unsupported_claim",
        "unsupported_safety_claim",
        "protected_trait_claim",
        "certainty_language",
        "schema_invalid",
        "score_driver_mismatch",
        "provider_unavailable",
        "source_ref_mismatch",
        "freshness_mismatch",
        "confidence_mismatch",
        "forbidden_advice_claim",
    ]
    action_taken: Literal["blocked", "rewritten", "fallback_used", "logged"]
    details: dict[str, object] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class ReportClaim(BaseModel):
    text: str = Field(min_length=1)
    evidence_refs: list[str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)
    freshness_status: DataFreshnessStatus
    confidence: ConfidenceScore
    score_driver_refs: list[str] = Field(default_factory=list)


class ReportSection(BaseModel):
    section_type: ReportSectionType
    title: str = Field(min_length=1)
    body: str = Field(min_length=1)
    neighborhood_id: str | None = None
    claims: list[ReportClaim] = Field(default_factory=list)


class ReportInput(BaseModel):
    locale: Literal["en", "nl"]
    profile_summary: dict[str, object]
    preference_vector: PreferenceVector
    recommendations: list[dict[str, object]]
    comparisons: list[dict[str, object]] = Field(default_factory=list)
    similar_neighborhoods: list[dict[str, object]] = Field(default_factory=list)
    listing_context: dict[str, object] = Field(default_factory=dict)
    evidence_items: list[RecommendationEvidence] = Field(min_length=1)
    approved_limitations: list[str] = Field(min_length=1)
    source_refs: list[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def validate_evidence_refs(self) -> ReportInput:
        evidence_ids = {item.evidence_id for item in self.evidence_items}
        for recommendation in self.recommendations:
            refs = recommendation.get("evidence_refs", [])
            if not isinstance(refs, list) or not refs:
                raise ValueError("recommendation requires evidence coverage")
            unknown = sorted(str(ref) for ref in refs if str(ref) not in evidence_ids)
            if unknown:
                refs_text = ", ".join(unknown)
                raise ValueError(f"recommendation references unknown evidence: {refs_text}")
        return self


class ReportOutput(BaseModel):
    locale: Literal["en", "nl"]
    validation_status: Literal["passed", "fallback_used", "blocked"]
    generated_by: Literal["ai", "deterministic_fallback"] = "deterministic_fallback"
    sections: list[ReportSection] = Field(default_factory=list)
    profile_narrative: str = ""
    recommendation_sections: list[dict[str, object]] = Field(default_factory=list)
    limitations: list[str] = Field(min_length=1)


class MatchReportCreateRequest(BaseModel):
    session_id: str | None = None
    preference_vector_id: str | None = None
    recommendation_ids: list[str] = Field(default_factory=list)
    locale: Literal["en", "nl"]
    generation_mode: Literal["ai_with_fallback", "fallback_only"] = "ai_with_fallback"
    report_input: ReportInput


class ReportGenerationMetadata(BaseModel):
    requested_mode: Literal["ai_with_fallback", "fallback_only"]
    resolved_mode: Literal["ai", "deterministic_fallback"]
    ai_provider: str
    ai_available: bool
    scoring_mutable_by_ai: bool = False
    data_contract: Literal["structured_report_input"] = "structured_report_input"


class MatchReportResponse(BaseModel):
    report_id: str = Field(min_length=1)
    status: Literal["generated", "fallback", "invalid"]
    generated_by: Literal["ai", "deterministic_fallback"]
    validation_status: Literal["passed", "fallback_used", "blocked"]
    locale: Literal["en", "nl"]
    sections: list[ReportSection] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)
    guardrail_events: list[GuardrailEvent] = Field(default_factory=list)
    report_input: ReportInput
    generation_metadata: ReportGenerationMetadata
    generated_at: datetime = Field(default_factory=utc_now)


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
    availability_density: int | None = Field(default=None, ge=0, le=100)
    unavailable_reason: str | None = None


class NotificationDispatchRecord(BaseModel):
    dispatch_id: str = Field(default_factory=lambda: f"dispatch_{uuid4().hex}")
    alert_id: str = Field(min_length=1)
    provider_name: str = Field(min_length=1)
    provider_mode: Literal["mock", "email", "push"]
    result_status: Literal["recorded", "sent", "failed", "skipped"]
    listing_ids: list[str] = Field(default_factory=list)
    error_code: str | None = None
    created_at: datetime = Field(default_factory=utc_now)


class AlertRule(BaseModel):
    alert_id: str = Field(default_factory=lambda: f"alert_{uuid4().hex}")
    session_id: str | None = None
    preference_vector_id: str | None = None
    neighborhood_ids: list[str] = Field(min_length=1)
    journey_intent: Literal["buy", "rent", "both"]
    budget_max_cents: int | None = Field(default=None, ge=0)
    rent_max_cents: int | None = Field(default=None, ge=0)
    property_types: list[str] = Field(min_length=1)
    notification_destination_hash: str | None = None
    notification_type: Literal["mock", "email", "push", "none"] = "mock"
    status: Literal["active", "paused", "deleted"] = "active"
    source_context: Literal[
        "report", "listing", "saved", "map", "manual", "recommendation"
    ] = "manual"
    last_evaluated_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def validate_budget_for_intent(self) -> AlertRule:
        if self.journey_intent in {"buy", "both"} and self.budget_max_cents is None:
            raise ValueError("buy alerts require budget_max_cents")
        if self.journey_intent in {"rent", "both"} and self.rent_max_cents is None:
            raise ValueError("rent alerts require rent_max_cents")
        return self


class AlertCreateRequest(BaseModel):
    session_id: str | None = None
    preference_vector_id: str | None = None
    source_context: Literal[
        "report", "listing", "saved", "map", "manual", "recommendation"
    ] = "manual"
    neighborhood_ids: list[str] = Field(min_length=1)
    journey_intent: Literal["buy", "rent", "both"]
    budget_max_cents: int | None = Field(default=None, ge=0)
    rent_max_cents: int | None = Field(default=None, ge=0)
    property_types: list[str] = Field(min_length=1)
    notification_destination: str | None = Field(default=None, exclude=True)
    notification_destination_hash: str | None = None
    notification_type: Literal["mock", "email", "push", "none"] = "mock"

    def to_rule(self, *, alert_id: str | None = None) -> AlertRule:
        return AlertRule(
            alert_id=alert_id or f"alert_{uuid4().hex}",
            session_id=self.session_id,
            preference_vector_id=self.preference_vector_id,
            neighborhood_ids=self.neighborhood_ids,
            journey_intent=self.journey_intent,
            budget_max_cents=self.budget_max_cents,
            rent_max_cents=self.rent_max_cents,
            property_types=self.property_types,
            notification_destination_hash=self.notification_destination_hash,
            notification_type=self.notification_type,
            source_context=self.source_context,
        )


class AlertUpdateRequest(BaseModel):
    status: Literal["active", "paused", "deleted"] | None = None
    budget_max_cents: int | None = Field(default=None, ge=0)
    rent_max_cents: int | None = Field(default=None, ge=0)
    property_types: list[str] | None = None
    notification_type: Literal["mock", "email", "push", "none"] | None = None


class AlertCreateResponse(BaseModel):
    alert: AlertRule
    created: bool
    dispatch: NotificationDispatchRecord
    matched_listing_ids: list[str] = Field(default_factory=list)
    analytics_event: Literal["match_alert_created"] = "match_alert_created"


class AlertListResponse(BaseModel):
    alerts: list[AlertRule] = Field(default_factory=list)


class SavedNeighborhoodCreateRequest(BaseModel):
    session_id: str | None = None
    preference_vector_id: str | None = None
    report_id: str | None = None
    neighborhood_id: str = Field(min_length=1)
    saved_from: Literal["recommendation", "map", "comparison", "listing", "manual"]
    note: dict[str, object] = Field(default_factory=dict)


class SavedNeighborhood(BaseModel):
    saved_neighborhood_id: str = Field(default_factory=lambda: f"saved_nh_{uuid4().hex}")
    session_id: str | None = None
    preference_vector_id: str | None = None
    report_id: str | None = None
    neighborhood_id: str = Field(min_length=1)
    saved_from: Literal["recommendation", "map", "comparison", "listing", "manual"]
    note: dict[str, object] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    deleted_at: datetime | None = None
    analytics_event: Literal["match_neighborhood_saved"] = "match_neighborhood_saved"


class SavedNeighborhoodListResponse(BaseModel):
    saved_neighborhoods: list[SavedNeighborhood] = Field(default_factory=list)


class DeleteResponse(BaseModel):
    deleted: bool


class ReportSaveRequest(BaseModel):
    session_id: str | None = None


class ReportSaveResponse(BaseModel):
    report_id: str
    saved: bool
    status: Literal["saved", "not_found"]


class ReportShareRequest(BaseModel):
    scope: Literal["report_view", "report_export"] = "report_view"
    locale: Literal["en", "nl"] = "en"
    expires_in_days: int | None = Field(default=30, ge=1, le=365)
    consent_to_share: bool


class ReportShareResponse(BaseModel):
    share_url: str
    expires_at: datetime | None = None


class ReportExportRequest(BaseModel):
    export_type: Literal["pdf", "html", "json"] = "pdf"
    locale: Literal["en", "nl"] = "en"


class ReportExportResponse(BaseModel):
    export_id: str
    report_id: str
    export_type: Literal["html", "json"]
    locale: Literal["en", "nl"]
    status: Literal["created", "failed"]
    payload: dict[str, object]
    error_code: str | None = None
    created_at: datetime = Field(default_factory=utc_now)


AnalyticsEventName = Literal[
    "match_final_run_cta_clicked",
    "match_job_queued",
    "match_job_running",
    "match_job_completed",
    "match_job_failed",
    "match_job_completed_with_fallback",
    "match_job_completed_no_strong_matches",
    "match_job_slow",
    "match_quiz_started",
    "match_quiz_completed",
    "match_report_viewed",
    "match_time_to_first_saved_neighborhood",
    "match_neighborhood_saved",
    "match_listing_clicked",
    "match_alert_created",
    "match_report_helpfulness_submitted",
    "match_follow_up_question_submitted",
    "match_feedback_submitted",
    "match_source_clicked",
]


PROTECTED_FEEDBACK_PAYLOAD_KEYS = frozenset(
    {"nationality", "ethnicity", "religion", "immigration_status", "race"}
)


def _analytics_event_id() -> str:
    return f"analytics_{uuid4().hex}"


def _feedback_event_id() -> str:
    return f"feedback_{uuid4().hex}"


def _payload_contains_protected_key(payload: object) -> bool:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if str(key).lower() in PROTECTED_FEEDBACK_PAYLOAD_KEYS:
                return True
            if _payload_contains_protected_key(value):
                return True
    if isinstance(payload, list):
        return any(_payload_contains_protected_key(item) for item in payload)
    return False


class AnalyticsEvent(BaseModel):
    analytics_event_id: str = Field(default_factory=_analytics_event_id)
    event_name: AnalyticsEventName
    session_id: str | None = None
    locale: Literal["en", "nl"] = "en"
    journey_intent: Literal["buy", "rent", "both"] | None = None
    context: dict[str, object] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)

    @field_validator("context")
    @classmethod
    def validate_privacy_safe_context(cls, value: dict[str, object]) -> dict[str, object]:
        if _payload_contains_protected_key(value):
            raise ValueError("analytics context must not include protected traits")
        return value


class SuccessMetricSummary(BaseModel):
    event_name: AnalyticsEventName
    count: int = Field(ge=0)
    latest_value: int | float | None = None


class PrdTraceabilityItem(BaseModel):
    fr_id: str = Field(pattern=r"^FR([1-9]|1[0-4])$")
    label: str
    status: Literal["implemented", "partial", "deferred"]


class MatchFeedbackRequest(BaseModel):
    session_id: str | None = None
    report_id: str | None = None
    recommendation_id: str | None = None
    neighborhood_id: str = Field(min_length=1)
    feedback_type: Literal["love", "maybe", "not_for_me", "undo"]
    reason_code: str | None = None
    payload: dict[str, object] = Field(default_factory=dict)

    @field_validator("payload")
    @classmethod
    def validate_feedback_payload(cls, value: dict[str, object]) -> dict[str, object]:
        if _payload_contains_protected_key(value):
            raise ValueError("feedback payload must not include protected traits")
        return value


class FeedbackEvent(BaseModel):
    feedback_event_id: str = Field(default_factory=_feedback_event_id)
    session_id: str | None = None
    report_id: str | None = None
    recommendation_id: str | None = None
    neighborhood_id: str = Field(min_length=1)
    feedback_type: Literal["love", "maybe", "not_for_me", "undo"]
    reason_code: str | None = None
    payload: dict[str, object] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class FeedbackRerankingHint(BaseModel):
    boost_neighborhood_ids: list[str] = Field(default_factory=list)
    soften_neighborhood_ids: list[str] = Field(default_factory=list)
    suppress_neighborhood_ids: list[str] = Field(default_factory=list)
    adjusted_weight_inputs: dict[str, float] = Field(default_factory=dict)
    explanation_code: str = "match.feedback.explanation.updatedRanking"
    historical_recommendations_mutated: bool = False


class MatchFeedbackResponse(BaseModel):
    feedback_event_id: str
    feedback_event: FeedbackEvent
    reranking_available: bool
    reranking_hint: FeedbackRerankingHint
    explanation_code: str = "match.feedback.explanation.updatedRanking"
    analytics_event: Literal["match_feedback_submitted"] = "match_feedback_submitted"


class AdminRegionStatus(BaseModel):
    region_config_id: str
    status: Literal["healthy", "degraded", "failed", "mock_only", "unconfigured"]


class DataQualityIndicator(BaseModel):
    label: str
    status: Literal["current", "aging", "stale", "unavailable", "mock", "conflict", "failed"]
    count: int = Field(ge=0)


class MissingDataIndicator(BaseModel):
    metric_key: str
    count: int = Field(ge=0)
    severity: Literal["info", "warning", "critical"]


class SourceFailureIndicator(BaseModel):
    provider_name: str
    status: Literal["degraded", "failed"]
    error_code: str


class ScoringAnomalySummary(BaseModel):
    anomaly_type: Literal[
        "score_outlier",
        "empty_result",
        "confidence_outlier",
        "category_distribution",
        "missing_driver",
    ]
    severity: Literal["info", "warning", "critical"]
    count: int = Field(ge=0)


class AlertDispatchFailure(BaseModel):
    alert_id: str
    error_code: str | None = None


class AlertDispatcherStatus(BaseModel):
    provider_name: str
    health: Literal["healthy", "degraded", "failed", "mock_only", "unconfigured"]
    failures: list[AlertDispatchFailure] = Field(default_factory=list)


class MatchAdminHealthResponse(BaseModel):
    overall_status: Literal["healthy", "degraded", "failed", "mock_only", "unconfigured"]
    regions: list[AdminRegionStatus] = Field(default_factory=list)
    source_health: list[SourceHealthSnapshot] = Field(default_factory=list)
    data_freshness: list[DataQualityIndicator] = Field(default_factory=list)
    missing_data: list[MissingDataIndicator] = Field(default_factory=list)
    stale_data: list[MissingDataIndicator] = Field(default_factory=list)
    source_failures: list[SourceFailureIndicator] = Field(default_factory=list)
    scoring_anomalies: list[ScoringAnomalySummary] = Field(default_factory=list)
    listing_provider_status: list[ProviderStatus] = Field(default_factory=list)
    alert_dispatcher_status: AlertDispatcherStatus
    report_generation_failures: list[dict[str, object]] = Field(default_factory=list)
    mock_data_indicators: list[DataQualityIndicator] = Field(default_factory=list)
    live_data_indicators: list[DataQualityIndicator] = Field(default_factory=list)
    success_metrics: list[SuccessMetricSummary] = Field(default_factory=list)
    prd_traceability: list[PrdTraceabilityItem] = Field(default_factory=list)


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
