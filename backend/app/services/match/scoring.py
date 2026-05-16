from __future__ import annotations

from app.models.match import (
    ConfidenceScore,
    DataFreshnessStatus,
    Neighborhood,
    NeighborhoodFeatureVector,
    NeighborhoodMatchScore,
    PreferenceVector,
    RecommendationExplanation,
    ScoreDriver,
)

METHOD_VERSION = "match-score-v1"

PROTECTED_TRAIT_FIELDS = frozenset(
    {
        "age",
        "disability",
        "ethnicity",
        "gender",
        "immigration_status",
        "income_class_identity",
        "nationality",
        "race",
        "religion",
        "sexual_orientation",
    }
)

FEATURE_ALIASES = {
    "green_space": "green_access",
    "affordability": "affordability",
}

AVOID_SIGNAL_FEATURES = {
    "dense_nightlife": "calmness",
    "high_traffic": "environmental_quality",
    "isolation": "amenities",
}

HARD_FILTER_MINIMUM = 60


def _feature_for_preference(key: str, journey_intent: str) -> str:
    alias = FEATURE_ALIASES.get(key, key)
    if alias == "affordability":
        if journey_intent == "rent":
            return "affordability_rent"
        return "affordability_buy"
    if alias == "budget":
        if journey_intent == "rent":
            return "affordability_rent"
        return "affordability_buy"
    if alias == "commute":
        return "mobility"
    return alias


def _features_for_hard_filter(key: str, journey_intent: str) -> list[str]:
    if key == "intent:buy":
        return ["listing_availability_buy", "housing_stock"]
    if key == "intent:rent":
        return ["listing_availability_rent", "housing_stock"]
    if key == "intent:both":
        return ["listing_availability_buy", "listing_availability_rent", "housing_stock"]
    if key == "budget":
        if journey_intent == "rent":
            return ["affordability_rent"]
        if journey_intent == "both":
            return ["affordability_buy", "affordability_rent"]
        return ["affordability_buy"]
    if key == "commute":
        return ["mobility"]
    return [_feature_for_preference(key, journey_intent)]


def _journey_average(
    vector: NeighborhoodFeatureVector,
    buy_key: str,
    rent_key: str,
    journey_intent: str,
) -> float | None:
    if journey_intent == "rent":
        return vector.features.get(rent_key)
    if journey_intent == "both":
        values = [
            value
            for value in (vector.features.get(buy_key), vector.features.get(rent_key))
            if value is not None
        ]
        return sum(values) / len(values) if values else None
    return vector.features.get(buy_key)


def _weighted_lifestyle_score(
    preference: PreferenceVector,
    vector: NeighborhoodFeatureVector,
) -> tuple[int, list[ScoreDriver], set[str]]:
    total_weight = 0.0
    weighted_total = 0.0
    missing_weighted_features: set[str] = set()
    drivers: list[ScoreDriver] = []

    for preference_key, weight in preference.lifestyle_weights.items():
        if weight <= 0 or preference_key in PROTECTED_TRAIT_FIELDS:
            continue
        feature = _feature_for_preference(preference_key, preference.journey_intent)
        value = vector.features.get(feature)
        if value is None:
            if weight >= 0.5:
                missing_weighted_features.add(feature)
            continue

        total_weight += weight
        weighted_total += value * weight
        source_refs = vector.feature_sources.get(feature, [])
        drivers.append(
            ScoreDriver(
                feature=feature,
                impact=round(value * weight, 3),
                score=value,
                source_refs=source_refs,
            )
        )

    if total_weight == 0:
        return 0, [], missing_weighted_features

    drivers.sort(key=lambda driver: (-driver.impact, driver.feature))
    return int(weighted_total / total_weight), drivers, missing_weighted_features


def _average(values: list[float | None]) -> int:
    present = [value for value in values if value is not None]
    return int(sum(present) / len(present)) if present else 0


def _hard_filter_failures(
    preference: PreferenceVector,
    vector: NeighborhoodFeatureVector,
) -> tuple[list[str], list[str]]:
    failed: list[str] = []
    missing: list[str] = []
    for filter_key in preference.hard_filters:
        if filter_key in PROTECTED_TRAIT_FIELDS:
            continue
        features = _features_for_hard_filter(filter_key, preference.journey_intent)
        values = [
            value
            for feature in features
            if (value := vector.features.get(feature)) is not None
        ]
        if not values:
            missing.append(filter_key)
        elif max(values) < HARD_FILTER_MINIMUM:
            failed.append(filter_key)
    return failed, missing


def _tradeoff_penalty(
    preference: PreferenceVector,
    vector: NeighborhoodFeatureVector,
) -> tuple[int, list[RecommendationExplanation]]:
    penalty = 0
    tradeoffs: list[RecommendationExplanation] = []
    for signal in preference.avoid_signals:
        feature = AVOID_SIGNAL_FEATURES.get(signal)
        if feature is None:
            continue
        value = vector.features.get(feature)
        if value is None:
            continue
        if value < 60:
            penalty += int((60 - value) * 0.2)
            tradeoffs.append(
                RecommendationExplanation(
                    code=f"{signal}_tradeoff",
                    evidence_refs=_evidence_refs_for_features(vector, [feature]),
                )
            )
    return penalty, tradeoffs


def _score_confidence(
    vector: NeighborhoodFeatureVector,
    missing_features: set[str],
) -> ConfidenceScore:
    score = vector.confidence.score
    reasons = list(vector.confidence.reasons)
    if vector.completeness_score < 80:
        score -= 10
        reasons.append("match.results.confidence.incomplete_feature_coverage")
    if vector.missing_features or missing_features:
        score -= 15
        reasons.append("match.results.confidence.missing_score_inputs")
    if vector.stale_features:
        score -= 10
        reasons.append("match.results.confidence.stale_score_inputs")
    return ConfidenceScore(score=max(0, min(100, score)), reasons=reasons)


def _freshness_indicator(vector: NeighborhoodFeatureVector) -> tuple[DataFreshnessStatus, str]:
    if vector.missing_features:
        return DataFreshnessStatus.unavailable, "missing_data"
    if vector.stale_features:
        return DataFreshnessStatus.stale, "stale_data"
    return DataFreshnessStatus.mock, "mock_data"


def _evidence_refs_for_features(
    vector: NeighborhoodFeatureVector,
    features: list[str],
) -> list[str]:
    refs: list[str] = []
    for feature in features:
        for source_ref in vector.feature_sources.get(feature, []):
            refs.append(f"ev_{feature}_{source_ref}")
    return refs


def _source_refs(vector: NeighborhoodFeatureVector) -> list[str]:
    refs = {
        source_ref
        for source_refs in vector.feature_sources.values()
        for source_ref in source_refs
    }
    return sorted(refs)


def _why_it_fits(drivers: list[ScoreDriver]) -> list[RecommendationExplanation]:
    explanations: list[RecommendationExplanation] = []
    for driver in drivers:
        if driver.score < 60:
            continue
        explanations.append(
            RecommendationExplanation(
                code=f"{driver.feature}_match",
                evidence_refs=[f"ev_{driver.feature}_{ref}" for ref in driver.source_refs],
            )
        )
        if len(explanations) == 3:
            break
    return explanations


def _baseline_tradeoffs(
    vector: NeighborhoodFeatureVector,
    confidence: ConfidenceScore,
    components: dict[str, int],
) -> list[RecommendationExplanation]:
    tradeoffs: list[RecommendationExplanation] = []
    for component, score in components.items():
        if score and score < 50:
            tradeoffs.append(RecommendationExplanation(code=f"{component}_tradeoff"))
    for feature in vector.missing_features:
        tradeoffs.append(
            RecommendationExplanation(
                code=f"missing_{feature}",
                evidence_refs=_evidence_refs_for_features(vector, [feature]),
            )
        )
    for feature in vector.stale_features:
        tradeoffs.append(
            RecommendationExplanation(
                code=f"stale_{feature}",
                evidence_refs=_evidence_refs_for_features(vector, [feature]),
            )
        )
    if confidence.score < 60:
        tradeoffs.append(RecommendationExplanation(code="low_confidence"))
    if not tradeoffs:
        tradeoffs.append(RecommendationExplanation(code="review_source_limitations"))
    return tradeoffs


def _eligibility_status(
    *,
    failed_filters: list[str],
    missing_filters: list[str],
    missing_weighted_features: set[str],
    components: dict[str, int],
    confidence: ConfidenceScore,
) -> str:
    if failed_filters:
        return "failed_hard_filter"
    if missing_filters or missing_weighted_features:
        return "insufficient_data"
    if (
        components["budget_realism"] < 45
        or components["commute_feasibility"] < 45
        or components["housing_availability"] < 40
        or confidence.score < 50
    ):
        return "stretch"
    return "eligible"


def score_neighborhoods(
    preference: PreferenceVector,
    neighborhoods: list[Neighborhood],
    feature_vectors: list[NeighborhoodFeatureVector],
) -> list[NeighborhoodMatchScore]:
    neighborhoods_by_id = {item.neighborhood_id: item for item in neighborhoods}
    scores: list[NeighborhoodMatchScore] = []

    for vector in feature_vectors:
        neighborhood = neighborhoods_by_id.get(vector.neighborhood_id)
        if neighborhood is None:
            continue

        lifestyle_score, drivers, missing_weighted_features = _weighted_lifestyle_score(
            preference,
            vector,
        )
        availability_score = _average(
            [
                vector.features.get("housing_stock"),
                _journey_average(
                    vector,
                    "listing_availability_buy",
                    "listing_availability_rent",
                    preference.journey_intent,
                ),
            ]
        )
        budget_score = int(
            _journey_average(
                vector,
                "affordability_buy",
                "affordability_rent",
                preference.journey_intent,
            )
            or 0
        )
        commute_score = int(vector.features.get("mobility") or 0)
        components = {
            "lifestyle": lifestyle_score,
            "housing_availability": availability_score,
            "budget_realism": budget_score,
            "commute_feasibility": commute_score,
        }
        failed_filters, missing_filters = _hard_filter_failures(preference, vector)
        confidence = _score_confidence(vector, missing_weighted_features | set(missing_filters))
        tradeoff_penalty, avoid_tradeoffs = _tradeoff_penalty(preference, vector)

        raw_score = int(
            lifestyle_score * 0.50
            + availability_score * 0.15
            + budget_score * 0.20
            + commute_score * 0.15
        )
        if failed_filters:
            raw_score -= 30
        if confidence.score < 50:
            raw_score -= 10
        raw_score -= tradeoff_penalty
        fit_score = max(0, min(100, raw_score))
        status = _eligibility_status(
            failed_filters=failed_filters,
            missing_filters=missing_filters,
            missing_weighted_features=missing_weighted_features,
            components=components,
            confidence=confidence,
        )
        freshness_status, freshness_indicator = _freshness_indicator(vector)
        tradeoffs = [
            *avoid_tradeoffs,
            *_baseline_tradeoffs(vector, confidence, components),
        ]
        evidence_refs = _evidence_refs_for_features(
            vector,
            [driver.feature for driver in drivers] + list(vector.features),
        )

        scores.append(
            NeighborhoodMatchScore(
                recommendation_id=f"rec_{preference.preference_vector_id}_{vector.neighborhood_id}",
                neighborhood_id=vector.neighborhood_id,
                name=neighborhood.name_en or neighborhood.name_nl,
                municipality=neighborhood.municipality,
                rank=0,
                fit_score=fit_score,
                eligibility_status=status,
                component_scores=components,
                why_it_fits=_why_it_fits(drivers),
                tradeoffs=tradeoffs,
                score_drivers=drivers,
                failed_filters=[*failed_filters, *missing_filters],
                confidence=confidence,
                freshness_status=freshness_status,
                data_freshness_indicator=freshness_indicator,
                source_refs=_source_refs(vector),
                evidence_refs=sorted(set(evidence_refs)),
                missing_features=sorted(set(vector.missing_features) | missing_weighted_features),
            )
        )

    scores.sort(
        key=lambda score: (
            score.eligibility_status != "eligible",
            -score.fit_score,
            score.name,
            score.neighborhood_id,
        )
    )
    return [score.model_copy(update={"rank": index}) for index, score in enumerate(scores, start=1)]
