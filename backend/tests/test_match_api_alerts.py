import pytest


@pytest.mark.asyncio
async def test_alert_api_create_update_delete_with_mock_dispatch(client):
    payload = {
        "session_id": "anon_api_alert",
        "source_context": "report",
        "neighborhood_ids": ["nh_amsterdam_ijburg"],
        "journey_intent": "both",
        "budget_max_cents": 65000000,
        "rent_max_cents": 250000,
        "property_types": ["apartment"],
        "notification_type": "mock",
    }

    created = await client.post("/api/match/alerts", json=payload)
    duplicate = await client.post("/api/match/alerts", json=payload)
    alert_id = created.json()["alert"]["alert_id"]
    updated = await client.patch(f"/api/match/alerts/{alert_id}", json={"status": "paused"})
    deleted = await client.delete(f"/api/match/alerts/{alert_id}")

    assert created.status_code == 200
    assert created.json()["created"] is True
    assert created.json()["dispatch"]["provider_mode"] == "mock"
    assert created.json()["analytics_event"] == "match_alert_created"
    assert duplicate.json()["created"] is False
    assert updated.json()["status"] == "paused"
    assert deleted.json()["status"] == "deleted"


@pytest.mark.asyncio
async def test_alert_api_rejects_missing_neighborhoods(client):
    response = await client.post(
        "/api/match/alerts",
        json={
            "journey_intent": "buy",
            "budget_max_cents": 65000000,
            "property_types": ["apartment"],
            "notification_type": "mock",
        },
    )

    assert response.status_code == 422

