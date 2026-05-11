import pytest


def _payload(**overrides):
    payload = {
        "session_id": "anon_api_quiz",
        "locale": "nl",
        "journey_intent": "buy",
        "budget": {"buy_min": 42500000, "buy_max": 62500000},
        "household_type": "future_family",
        "current_city": "Rotterdam",
        "preferred_anchor_location": "Delft",
        "anchor_locations": [{"label": "Work", "query": "Rotterdam Centraal"}],
        "commute_limits": [{"mode": "public_transport", "max_minutes": 35}],
        "property_types": ["house"],
        "must_haves": ["schools", "green_access"],
        "nice_to_haves": ["train_nearby"],
        "avoid_signals": ["high_traffic"],
        "language_preference": "nl",
        "lifestyle_priorities": {
            "calmness": 4,
            "green_space": 5,
            "family_fit": 5,
            "mobility": 4,
        },
        "newcomer_status": "yes",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_match_quiz_endpoint_returns_profile_vector_personas_and_event(client):
    response = await client.post("/api/match/quiz", json=_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["locale"] == "nl"
    assert body["profile"]["household_type"] == "future_family"
    assert body["preference_vector"]["journey_intent"] == "buy"
    assert body["preference_vector"]["budget_max_cents"] == 62500000
    assert body["preference_vector"]["locale"] == "nl"
    assert body["analytics_event"] == "match_quiz_completed"
    assert {"family", "newcomer", "buyer"}.issubset(
        {overlay["type"] for overlay in body["persona_overlays"]}
    )


@pytest.mark.asyncio
async def test_match_quiz_endpoint_preserves_rent_and_both_intents(client):
    rent_response = await client.post(
        "/api/match/quiz",
        json=_payload(
            journey_intent="rent",
            budget={"rent_max": 190000},
            household_type="single",
            property_types=["studio"],
        ),
    )
    both_response = await client.post(
        "/api/match/quiz",
        json=_payload(journey_intent="both", budget={"buy_max": 62500000, "rent_max": 220000}),
    )

    assert rent_response.status_code == 200
    assert both_response.status_code == 200
    assert rent_response.json()["preference_vector"]["journey_intent"] == "rent"
    assert rent_response.json()["preference_vector"]["monthly_rent_max_cents"] == 190000
    assert both_response.json()["preference_vector"]["journey_intent"] == "both"
    assert both_response.json()["preference_vector"]["monthly_rent_max_cents"] == 220000


@pytest.mark.asyncio
async def test_match_quiz_endpoint_returns_warning_codes_not_copy(client):
    response = await client.post(
        "/api/match/quiz",
            json=_payload(
                budget={"buy_min": 70000000},
                current_city=None,
                preferred_anchor_location=None,
                anchor_locations=[],
            commute_limits=[],
        ),
    )

    assert response.status_code == 200
    warning_codes = {warning["code"] for warning in response.json()["validation_warnings"]}
    assert "match.warning.budget_max_missing" in warning_codes
    assert "match.warning.anchor_missing" in warning_codes
    assert all(code.startswith("match.warning.") for code in warning_codes)


@pytest.mark.asyncio
async def test_match_quiz_endpoint_rejects_invalid_locale(client):
    response = await client.post("/api/match/quiz", json=_payload(locale="fr"))

    assert response.status_code == 422
