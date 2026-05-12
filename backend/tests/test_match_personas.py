from app.models.match import MatchQuizRequest
from app.services.match.personas import detect_persona_overlays
from app.services.match.preferences import generate_preference_vector


def _request(**overrides) -> MatchQuizRequest:
    payload = {
        "session_id": "anon_persona",
        "locale": "en",
        "journey_intent": "both",
        "budget": {"buy_max": 57500000, "rent_max": 210000},
        "household_type": "couple",
        "current_city": "Amsterdam",
        "preferred_anchor_location": "Haarlem",
        "anchor_locations": [{"label": "Work", "query": "Amsterdam Centraal"}],
        "commute_limits": [{"mode": "bike", "max_minutes": 30}],
        "property_types": ["apartment"],
        "must_haves": ["green_access"],
        "nice_to_haves": ["cafes", "train_nearby"],
        "avoid_signals": ["dense_nightlife"],
        "lifestyle_priorities": {"calmness": 4, "green_space": 4, "amenities": 5},
        "newcomer_status": "no",
    }
    payload.update(overrides)
    return MatchQuizRequest.model_validate(payload)


def _overlay_types(request: MatchQuizRequest) -> set[str]:
    vector = generate_preference_vector(request).preference_vector
    return {overlay.type for overlay in detect_persona_overlays(request, vector)}


def test_detects_family_newcomer_buyer_and_renter_overlays_with_reasons():
    request = _request(
        journey_intent="both",
        household_type="family",
        newcomer_status="yes",
        must_haves=["schools", "green_access"],
        language_preference="en",
    )
    vector = generate_preference_vector(request).preference_vector

    overlays = detect_persona_overlays(request, vector)
    overlay_map = {overlay.type: overlay for overlay in overlays}

    assert {"family", "newcomer", "buyer", "renter"}.issubset(overlay_map)
    assert overlay_map["family"].confidence >= 90
    assert "household_type_family" in overlay_map["family"].reasons
    assert "newcomer_status_yes" in overlay_map["newcomer"].reasons
    assert all(0 <= overlay.confidence <= 100 for overlay in overlays)


def test_detects_city_escape_from_city_anchor_and_calm_green_preferences():
    request = _request(
        journey_intent="buy",
        household_type="couple",
        current_city="Amsterdam",
        preferred_anchor_location="Gouda",
        must_haves=["low_noise", "green_access"],
        lifestyle_priorities={"calmness": 5, "green_space": 5, "amenities": 2},
    )

    assert {"city_escape", "single_couple", "buyer"}.issubset(_overlay_types(request))


def test_detects_single_couple_and_renter_without_family_overlay():
    request = _request(journey_intent="rent", household_type="single", newcomer_status="no")

    overlays = _overlay_types(request)

    assert "single_couple" in overlays
    assert "renter" in overlays
    assert "buyer" not in overlays
    assert "family" not in overlays


def test_persona_detection_excludes_protected_trait_inputs_from_reasons():
    request = _request(
        newcomer_status="yes",
        nationality="Canadian",
        immigration_status="skilled_migrant",
    )
    vector = generate_preference_vector(request).preference_vector

    overlays = detect_persona_overlays(request, vector)
    reason_text = " ".join(reason for overlay in overlays for reason in overlay.reasons)

    assert "Canadian" not in reason_text
    assert "nationality" not in reason_text
    assert "immigration_status" not in reason_text
    assert "newcomer" in {overlay.type for overlay in overlays}
