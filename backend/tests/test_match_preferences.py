import pytest
from pydantic import ValidationError

from app.models.match import MatchQuizRequest
from app.services.match.preferences import generate_preference_vector


def _quiz_payload(**overrides):
    payload = {
        "session_id": "anon_phase2",
        "locale": "en",
        "journey_intent": "both",
        "budget": {"buy_min": 45000000, "buy_max": 65000000, "rent_max": 240000},
        "household_type": "family",
        "current_city": "Amsterdam",
        "anchor_locations": [
            {"label": "Work", "query": "Amsterdam Zuid", "lat": 52.337, "lng": 4.873}
        ],
        "commute_limits": [{"mode": "public_transport", "max_minutes": 45}],
        "property_types": ["apartment", "house"],
        "must_haves": ["schools", "low_noise"],
        "nice_to_haves": ["green_access", "train_nearby"],
        "avoid_signals": ["dense_nightlife", "high_traffic"],
        "lifestyle_priorities": {
            "calmness": 5,
            "green_space": 4,
            "family_fit": 5,
            "mobility": 4,
            "amenities": 3,
            "affordability": 4,
            "safety_context": 3,
            "environmental_quality": 4,
            "social_lifestyle_fit": 2,
            "housing_stock": 3,
        },
    }
    payload.update(overrides)
    return payload


def test_preference_vector_preserves_quiz_constraints_and_normalized_weights():
    request = MatchQuizRequest.model_validate(_quiz_payload())

    result = generate_preference_vector(request)

    vector = result.preference_vector
    assert vector.journey_intent == "both"
    assert vector.budget_min_cents == 45000000
    assert vector.budget_max_cents == 65000000
    assert vector.monthly_rent_max_cents == 240000
    assert vector.anchor_locations[0]["query"] == "Amsterdam Zuid"
    assert vector.commute_limits[0]["max_minutes"] == 45
    assert vector.property_types == ["apartment", "house"]
    assert set(vector.hard_filters) >= {"family_fit", "calmness"}
    assert "mobility" in vector.nice_to_haves
    assert "dense_nightlife" in vector.avoid_signals
    assert vector.locale == "en"

    expected_categories = {
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
    assert set(vector.lifestyle_weights) == expected_categories
    assert vector.lifestyle_weights["family_fit"] == 1.0
    assert vector.lifestyle_weights["social_lifestyle_fit"] == 0.4
    assert result.validation_warnings == []


def test_hard_filters_are_separate_from_weighted_preferences():
    request = MatchQuizRequest.model_validate(
        _quiz_payload(
            must_haves=["schools", "green_access"],
            nice_to_haves=["cafes", "train_nearby"],
            lifestyle_priorities={"amenities": 5, "mobility": 4, "green_space": 3},
        )
    )

    result = generate_preference_vector(request)

    assert set(result.preference_vector.hard_filters) == {"family_fit", "green_space"}
    assert set(result.preference_vector.nice_to_haves) == {"amenities", "mobility"}
    assert result.preference_vector.lifestyle_weights["amenities"] == 1.0
    assert result.preference_vector.lifestyle_weights["green_space"] == 1.0
    assert result.preference_vector.lifestyle_weights["mobility"] == 0.8


def test_preference_vector_returns_recoverable_validation_warnings():
    request = MatchQuizRequest.model_validate(
        _quiz_payload(
            journey_intent="buy",
            budget={"buy_min": 70000000},
            current_city=None,
            preferred_anchor_location=None,
            anchor_locations=[],
            commute_limits=[],
            must_haves=[
                "schools",
                "green_access",
                "low_noise",
                "train_nearby",
                "low_traffic",
                "garden",
            ],
        )
    )

    result = generate_preference_vector(request)

    assert result.preference_vector.budget_max_cents is None
    assert {warning.code for warning in result.validation_warnings} >= {
        "match.warning.budget_max_missing",
        "match.warning.anchor_missing",
        "match.warning.commute_or_radius_missing",
        "match.warning.too_many_hard_filters",
    }
    assert all(warning.severity in {"info", "warning"} for warning in result.validation_warnings)


def test_quiz_request_rejects_invalid_locale_and_empty_property_types():
    with pytest.raises(ValidationError):
        MatchQuizRequest.model_validate(_quiz_payload(locale="de"))

    with pytest.raises(ValidationError, match="property_types"):
        MatchQuizRequest.model_validate(_quiz_payload(property_types=[]))
