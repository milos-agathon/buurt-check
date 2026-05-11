import pytest


@pytest.mark.asyncio
async def test_get_listings_returns_mock_buy_rent_supply_and_provider_status(client):
    response = await client.get(
        "/api/match/listings",
        params={
            "neighborhood_id": "nh_amsterdam_ijburg",
            "journey_intent": "both",
            "budget_max_cents": 65000000,
            "rent_max_cents": 250000,
            "property_type": "apartment",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"]["name"] == "MockListingProvider"
    assert body["provider"]["mode"] == "mock"
    assert body["provider"]["license_status"] == "mock"
    assert body["provider"]["limitations"]
    assert body["availability_density"] is not None
    assert {item["journey_intent"] for item in body["listings"]} == {"buy", "rent"}
    assert all(item["days_on_market"] is not None for item in body["listings"])
    assert all("MOCK DATA" in item["limitations"][0] for item in body["listings"])


@pytest.mark.asyncio
async def test_get_listings_exposes_unavailable_provider_state(client):
    response = await client.get(
        "/api/match/listings",
        params={"neighborhood_id": "nh_unknown", "journey_intent": "buy"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"]["mode"] == "mock"
    assert body["provider"]["health"] == "degraded"
    assert body["listings"] == []
    assert body["unavailable_reason"] == "neighborhood_not_in_mock_seed"

