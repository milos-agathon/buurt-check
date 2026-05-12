import pytest


@pytest.mark.asyncio
async def test_recommendations_endpoint_returns_categories_sources_and_evidence(client):
    quiz = await client.post(
        "/api/match/quiz",
        json={
            "locale": "en",
            "journey_intent": "buy",
            "budget": {"buy_max": 62500000},
            "household_type": "family",
            "current_city": "Amsterdam",
            "commute_limits": [{"mode": "public_transport", "max_minutes": 45}],
            "property_types": ["apartment"],
            "must_haves": ["green_space"],
            "nice_to_haves": ["train_nearby"],
            "lifestyle_priorities": {
                "green_space": 5,
                "family_fit": 5,
                "mobility": 4,
                "affordability": 4,
            },
        },
    )
    assert quiz.status_code == 200

    response = await client.post(
        "/api/match/recommendations",
        json={
            "locale": "en",
            "preference_vector": quiz.json()["preference_vector"],
            "limit": 10,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["preference_vector_id"] == quiz.json()["preference_vector"]["preference_vector_id"]
    items = [
        *body["recommendations"]["top"],
        *body["recommendations"]["surprising"],
        *body["recommendations"]["stretch"],
        *body["recommendations"]["avoid_or_reconsider"],
    ]
    assert items
    first = items[0]
    assert first["fit_score"] >= 0
    assert first["why_it_fits"]
    assert first["tradeoffs"]
    assert first["confidence"]["score"] >= 0
    assert first["source_refs"]
    assert body["evidence_items"]
    assert body["source_coverage"]
