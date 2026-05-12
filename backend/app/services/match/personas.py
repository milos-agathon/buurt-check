from __future__ import annotations

from app.models.match import MatchQuizRequest, PersonaOverlay, PreferenceVector

LARGE_CITY_ANCHORS = {
    "amsterdam",
    "rotterdam",
    "utrecht",
    "den haag",
    "the hague",
    "eindhoven",
}


def _has_weight(vector: PreferenceVector, key: str, minimum: float) -> bool:
    return vector.lifestyle_weights.get(key, 0) >= minimum


def _city_escape_signal(request: MatchQuizRequest, vector: PreferenceVector) -> bool:
    current_city = (request.current_city or "").strip().lower()
    preferred = (request.preferred_anchor_location or "").strip().lower()
    wants_calm_green = _has_weight(vector, "calmness", 0.8) and _has_weight(
        vector, "green_space", 0.8
    )
    return bool(
        current_city in LARGE_CITY_ANCHORS
        and preferred
        and preferred != current_city
        and wants_calm_green
    )


def detect_persona_overlays(
    request: MatchQuizRequest,
    vector: PreferenceVector,
) -> list[PersonaOverlay]:
    overlays: list[PersonaOverlay] = []

    if request.household_type in {"family", "future_family"}:
        confidence = 95 if request.household_type == "family" else 86
        reason = (
            "household_type_family"
            if request.household_type == "family"
            else "household_type_future_family"
        )
        overlays.append(PersonaOverlay(type="family", confidence=confidence, reasons=[reason]))

    if request.newcomer_status == "yes" or request.language_preference == "en":
        reasons = []
        if request.newcomer_status == "yes":
            reasons.append("newcomer_status_yes")
        if request.language_preference == "en":
            reasons.append("english_language_preference")
        overlays.append(PersonaOverlay(type="newcomer", confidence=88, reasons=reasons))

    if _city_escape_signal(request, vector):
        overlays.append(
            PersonaOverlay(
                type="city_escape",
                confidence=82,
                reasons=["large_city_current_anchor", "calm_green_priority"],
            )
        )

    if request.household_type in {"single", "couple"}:
        overlays.append(
            PersonaOverlay(
                type="single_couple",
                confidence=90,
                reasons=[f"household_type_{request.household_type}"],
            )
        )

    if request.household_type == "starter":
        overlays.append(
            PersonaOverlay(type="starter", confidence=86, reasons=["household_type_starter"])
        )

    if request.journey_intent in {"buy", "both"}:
        overlays.append(PersonaOverlay(type="buyer", confidence=92, reasons=["journey_intent_buy"]))

    if request.journey_intent in {"rent", "both"}:
        overlays.append(
            PersonaOverlay(type="renter", confidence=92, reasons=["journey_intent_rent"])
        )

    return overlays
