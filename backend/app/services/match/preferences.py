from __future__ import annotations

from hashlib import sha1

from app.models.match import (
    PREFERENCE_CATEGORY_KEYS,
    MatchQuizRequest,
    MatchValidationWarning,
    PreferenceGenerationResult,
    PreferenceVector,
    UserPreferenceProfile,
)

METHOD_VERSION = "preference-v1"

SIGNAL_CATEGORY_MAP = {
    "calmness": "calmness",
    "low_noise": "calmness",
    "quiet": "calmness",
    "green_access": "green_space",
    "green_space": "green_space",
    "parks": "green_space",
    "schools": "family_fit",
    "childcare": "family_fit",
    "family_fit": "family_fit",
    "train_nearby": "mobility",
    "transit": "mobility",
    "mobility": "mobility",
    "cafes": "amenities",
    "shops": "amenities",
    "amenities": "amenities",
    "affordable": "affordability",
    "affordability": "affordability",
    "safety_context": "safety_context",
    "low_traffic": "environmental_quality",
    "environmental_quality": "environmental_quality",
    "community": "social_lifestyle_fit",
    "social_lifestyle_fit": "social_lifestyle_fit",
    "garden": "housing_stock",
    "housing_stock": "housing_stock",
}


def _stable_id(prefix: str, parts: list[str | None]) -> str:
    digest = sha1("|".join(part or "" for part in parts).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


def _map_signal(signal: str) -> str:
    return SIGNAL_CATEGORY_MAP.get(signal, signal)


def _unique_mapped(signals: list[str]) -> list[str]:
    seen: set[str] = set()
    mapped: list[str] = []
    for signal in signals:
        category = _map_signal(signal)
        if category in PREFERENCE_CATEGORY_KEYS and category not in seen:
            seen.add(category)
            mapped.append(category)
    return mapped


def _normalize_weights(request: MatchQuizRequest, hard_filters: list[str]) -> dict[str, float]:
    weights = {category: 0.0 for category in sorted(PREFERENCE_CATEGORY_KEYS)}
    for category, priority in request.lifestyle_priorities.items():
        weights[category] = round(priority / 5, 2)

    if request.journey_intent in {"buy", "rent", "both"}:
        weights["affordability"] = max(weights["affordability"], 0.6)
    if request.household_type in {"family", "future_family"}:
        weights["family_fit"] = max(weights["family_fit"], 0.8)

    for category in hard_filters:
        weights[category] = 1.0

    return weights


def _validation_warnings(
    request: MatchQuizRequest,
    hard_filters: list[str],
) -> list[MatchValidationWarning]:
    warnings: list[MatchValidationWarning] = []
    if request.journey_intent in {"buy", "both"} and request.budget.buy_max is None:
        warnings.append(
            MatchValidationWarning(
                code="match.warning.budget_max_missing",
                severity="warning",
                field="budget.buy_max",
            )
        )
    if request.journey_intent in {"rent", "both"} and request.budget.rent_max is None:
        warnings.append(
            MatchValidationWarning(
                code="match.warning.rent_max_missing",
                severity="warning",
                field="budget.rent_max",
            )
        )
    if (
        not request.current_city
        and not request.preferred_anchor_location
        and not request.anchor_locations
    ):
        warnings.append(
            MatchValidationWarning(
                code="match.warning.anchor_missing",
                severity="warning",
                field="current_city",
            )
        )
    if not request.commute_limits:
        warnings.append(
            MatchValidationWarning(
                code="match.warning.commute_or_radius_missing",
                severity="info",
                field="commute_limits",
            )
        )
    if len(hard_filters) > 4:
        warnings.append(
            MatchValidationWarning(
                code="match.warning.too_many_hard_filters",
                severity="info",
                field="must_haves",
            )
        )
    return warnings


def generate_preference_vector(request: MatchQuizRequest) -> PreferenceGenerationResult:
    hard_filters = _unique_mapped(request.must_haves)
    nice_to_haves = [
        item for item in _unique_mapped(request.nice_to_haves) if item not in hard_filters
    ]
    locale = request.language_preference or request.locale
    profile_id = _stable_id("profile", [request.session_id, request.household_type, locale])
    vector_id = _stable_id(
        "pv",
        [
            request.session_id,
            request.journey_intent,
            request.household_type,
            request.current_city,
            request.preferred_anchor_location,
            ",".join(request.must_haves),
            ",".join(request.nice_to_haves),
        ],
    )

    profile = UserPreferenceProfile(
        profile_id=profile_id,
        session_id=request.session_id,
        locale=locale,
        household_type=request.household_type,
        newcomer_status=request.newcomer_status,
    )
    vector = PreferenceVector(
        preference_vector_id=vector_id,
        session_id=request.session_id,
        profile_id=profile_id,
        journey_intent=request.journey_intent,
        budget_min_cents=request.budget.buy_min,
        budget_max_cents=request.budget.buy_max,
        monthly_rent_max_cents=request.budget.rent_max,
        anchor_locations=[
            anchor.model_dump(exclude_none=True) for anchor in request.anchor_locations
        ],
        commute_limits=[limit.model_dump(exclude_none=True) for limit in request.commute_limits],
        property_types=request.property_types,
        hard_filters=hard_filters,
        nice_to_haves=nice_to_haves,
        avoid_signals=request.avoid_signals,
        lifestyle_weights=_normalize_weights(request, hard_filters),
        persona_inputs={
            "household_type": request.household_type,
            "newcomer_status": request.newcomer_status,
            "current_city": request.current_city,
            "preferred_anchor_location": request.preferred_anchor_location,
        },
        locale=locale,
        method_version=METHOD_VERSION,
    )
    return PreferenceGenerationResult(
        profile=profile,
        preference_vector=vector,
        validation_warnings=_validation_warnings(request, hard_filters),
    )
