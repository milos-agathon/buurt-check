import pytest

from app.models.match import AlertCreateRequest, Listing
from app.services.match.alerts import (
    AlertStore,
    create_alert,
    delete_alert,
    find_matching_listings,
    update_alert,
)


def _listing(**overrides):
    payload = {
        "listing_id": "listing_1",
        "provider_name": "MockListingProvider",
        "provider_mode": "mock",
        "license_status": "mock",
        "neighborhood_id": "nh_amsterdam_ijburg",
        "journey_intent": "buy",
        "property_type": "apartment",
        "price_cents": 59000000,
        "availability_status": "available",
        "freshness_status": "mock",
        "confidence": 55,
        "limitations": ["MOCK DATA: example listing."],
    }
    payload.update(overrides)
    return Listing(**payload)


@pytest.mark.asyncio
async def test_alert_create_update_delete_and_duplicate_handling():
    store = AlertStore()
    payload = AlertCreateRequest(
        session_id="anon_alert",
        neighborhood_ids=["nh_amsterdam_ijburg"],
        journey_intent="buy",
        budget_max_cents=65000000,
        property_types=["apartment"],
        notification_type="mock",
    )

    created = await create_alert(payload, store=store)
    duplicate = await create_alert(payload, store=store)
    updated = await update_alert(
        created.alert.alert_id,
        status="paused",
        rent_max_cents=230000,
        store=store,
    )
    deleted = await delete_alert(created.alert.alert_id, store=store)

    assert created.created is True
    assert created.dispatch.result_status == "recorded"
    assert duplicate.created is False
    assert duplicate.alert.alert_id == created.alert.alert_id
    assert updated.status == "paused"
    assert updated.rent_max_cents == 230000
    assert deleted.status == "deleted"


@pytest.mark.asyncio
async def test_alert_create_uses_configured_http_notification_provider(monkeypatch, httpx_mock):
    from app.config import settings

    monkeypatch.setattr(settings, "match_notification_provider_mode", "email")
    monkeypatch.setattr(settings, "match_notification_provider_base_url", "https://notify.test")
    monkeypatch.setattr(settings, "match_notification_provider_api_key", "notify-token")
    httpx_mock.add_response(method="POST", json={"status": "sent"})
    store = AlertStore()
    payload = AlertCreateRequest(
        session_id="anon_alert",
        neighborhood_ids=["nh_amsterdam_ijburg"],
        journey_intent="buy",
        budget_max_cents=65000000,
        property_types=["apartment"],
        notification_type="email",
        notification_destination_hash="hashed-destination",
    )

    created = await create_alert(payload, listings=[_listing()], store=store)

    assert created.dispatch.provider_name == "HttpNotificationProvider"
    assert created.dispatch.provider_mode == "email"
    assert created.dispatch.result_status == "sent"
    assert created.matched_listing_ids == ["listing_1"]


def test_alert_matching_logic_respects_budget_property_type_and_intent():
    alert = AlertCreateRequest(
        neighborhood_ids=["nh_amsterdam_ijburg"],
        journey_intent="buy",
        budget_max_cents=65000000,
        property_types=["apartment"],
        notification_type="mock",
    ).to_rule(alert_id="alert_match")

    matches = find_matching_listings(
        alert,
        [
            _listing(listing_id="match"),
            _listing(listing_id="too_expensive", price_cents=70000000),
            _listing(listing_id="wrong_type", property_type="house"),
            _listing(listing_id="wrong_intent", journey_intent="rent", rent_cents=210000),
        ],
    )

    assert [listing.listing_id for listing in matches] == ["match"]
