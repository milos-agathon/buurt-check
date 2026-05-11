from __future__ import annotations

from app.models.prebid import ConfidenceLabel, Signal

TYPE_WEIGHTS = {
    "wkpb_restriction": 28,
    "planning_change": 25,
    "public_notice": 21,
    "monument_or_protected_view": 20,
    "parcel": 14,
    "energy_label": 12,
    "parking": 10,
    "source_incomplete": 30,
}

CONFIDENCE_WEIGHTS = {
    ConfidenceLabel.high: 12,
    ConfidenceLabel.medium: 7,
    ConfidenceLabel.low: 0,
    ConfidenceLabel.needs_review: 5,
    ConfidenceLabel.data_incomplete: 5,
}


def _proximity_bonus(distance_m: float | None) -> int:
    if distance_m is None:
        return 0
    if distance_m <= 50:
        return 10
    if distance_m <= 150:
        return 6
    if distance_m <= 250:
        return 3
    return 0


def rank_signal(signal: Signal, *, property_type: str = "unknown") -> int:
    score = (
        TYPE_WEIGHTS[signal.signal_type]
        + min(signal.materiality, 100) * 0.45
        + CONFIDENCE_WEIGHTS[signal.confidence]
        + _proximity_bonus(signal.proximity_m)
    )
    if property_type == "apartment" and signal.signal_type in {"wkpb_restriction", "parcel"}:
        score += 2
    return max(0, min(100, round(score)))


def rank_signals(
    signals: list[Signal], *, property_type: str = "unknown", limit: int = 3
) -> list[Signal]:
    return sorted(
        signals, key=lambda item: rank_signal(item, property_type=property_type), reverse=True
    )[:limit]
