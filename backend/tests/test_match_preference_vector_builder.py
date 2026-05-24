import pytest

from app.services.match.preference_vector import build_preference_vector_from_answers


def _answers(**overrides):
    answers = {
        "intent": "buy",
        "budget": {"buy_min": 45000000, "buy_max": 65000000},
        "household_type": "family_young_child",
        "anchor_location": {"type": "city", "label": "Utrecht Centraal"},
        "commute": {"max_minutes": 45},
        "lifestyle_priorities": ["green_access", "calmness", "public_transport"],
        "must_haves": ["parks_nearby", "good_transit"],
        "dealbreakers": ["busy_nightlife", "high_noise"],
        "housing_types": ["row_house", "family_house"],
        "area_character": "quiet_city",
        "language": "nl",
        "nationality": "Dutch",
    }
    answers.update(overrides)
    return answers


def test_preference_vector_separates_filters_weights_avoid_list_and_raw_answers():
    vector = build_preference_vector_from_answers(
        session_id="match_vector",
        locale="en",
        answers=_answers(),
        answer_version=7,
    )

    assert vector.session_id == "match_vector"
    assert vector.journey_intent == "buy"
    assert vector.budget_min_cents == 45000000
    assert vector.budget_max_cents == 65000000
    assert vector.locale == "nl"
    expected_filters = {"intent:buy", "budget", "commute", "green_space", "mobility"}
    assert expected_filters <= set(vector.hard_filters)
    assert vector.avoid_signals == ["busy_nightlife", "high_noise"]
    assert vector.property_types == ["row_house", "family_house"]
    assert vector.source_answer_version == 7
    assert vector.raw_answer_refs["intent"] == "buy"
    assert vector.raw_answer_refs["lifestyle_priorities"] == [
        "green_access",
        "calmness",
        "public_transport",
    ]
    assert "nationality" not in vector.raw_answer_refs
    assert vector.method_version == "preference-vector-v2"
    assert vector.vector_version

    assert sum(vector.lifestyle_weights.values()) == pytest.approx(1.0)
    assert vector.lifestyle_weights["green_access"] > vector.lifestyle_weights["calmness"]


def test_preference_vector_has_stable_version_independent_of_answer_order():
    first = build_preference_vector_from_answers(
        session_id="match_vector",
        locale="en",
        answers=_answers(),
        answer_version=7,
    )
    reordered = build_preference_vector_from_answers(
        session_id="match_vector",
        locale="en",
        answers={
            "language": "nl",
            "area_character": "quiet_city",
            "housing_types": ["row_house", "family_house"],
            "dealbreakers": ["busy_nightlife", "high_noise"],
            "must_haves": ["parks_nearby", "good_transit"],
            "lifestyle_priorities": ["green_access", "calmness", "public_transport"],
            "commute": {"max_minutes": 45},
            "anchor_location": {"label": "Utrecht Centraal", "type": "city"},
            "household_type": "family_young_child",
            "budget": {"buy_max": 65000000, "buy_min": 45000000},
            "intent": "buy",
        },
        answer_version=7,
    )

    assert reordered.preference_vector_id == first.preference_vector_id
    assert reordered.vector_version == first.vector_version


def test_preference_vector_supports_rent_only_budget():
    vector = build_preference_vector_from_answers(
        session_id="match_rent_vector",
        locale="en",
        answers=_answers(
            intent="rent",
            budget={"rent_max": 220000},
            housing_types=["apartment"],
        ),
        answer_version=8,
    )

    assert vector.journey_intent == "rent"
    assert vector.budget_min_cents is None
    assert vector.budget_max_cents is None
    assert vector.monthly_rent_max_cents == 220000
    assert "intent:rent" in vector.hard_filters


@pytest.mark.parametrize(
    ("intent", "budget"),
    [
        ("buy", {"rent_max": 220000}),
        ("rent", {"buy_min": 45000000, "buy_max": 65000000}),
        ("both", {"buy_min": 45000000, "buy_max": 65000000}),
        ("both", {"rent_max": 220000}),
    ],
)
def test_preference_vector_rejects_budget_that_does_not_match_intent(intent, budget):
    with pytest.raises(ValueError, match="match.warning.answers_incomplete"):
        build_preference_vector_from_answers(
            session_id="match_budget_intent",
            locale="en",
            answers=_answers(intent=intent, budget=budget),
            answer_version=9,
        )


def test_preference_vector_keeps_only_budget_dimensions_for_intent():
    vector = build_preference_vector_from_answers(
        session_id="match_both_vector",
        locale="en",
        answers=_answers(
            intent="both",
            budget={"buy_min": 45000000, "buy_max": 65000000, "rent_max": 220000},
            housing_types=["apartment"],
        ),
        answer_version=10,
    )

    assert vector.journey_intent == "both"
    assert vector.budget_min_cents == 45000000
    assert vector.budget_max_cents == 65000000
    assert vector.monthly_rent_max_cents == 220000
    assert "intent:both" in vector.hard_filters


def test_preference_vector_rejects_incomplete_required_answers():
    with pytest.raises(ValueError, match="match.warning.answers_incomplete"):
        build_preference_vector_from_answers(
            session_id="match_vector",
            locale="en",
            answers=_answers(budget=None),
            answer_version=7,
        )
