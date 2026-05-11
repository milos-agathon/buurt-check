from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.buyer import BUYER_COOKIE_NAME
from app.config import settings
from app.db import get_db, init_db
from app.main import app
from app.services.reports import activate_entitlement, create_report


@pytest.fixture
async def prebid_client(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    monkeypatch.setattr(settings, "database_path", db_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        client.cookies.set(BUYER_COOKIE_NAME, "buyer-1")
        yield client, db_path


async def _report(
    db_path: str, *, buyer_key: str = "buyer-1", vbo_id: str = "0363010000696734"
) -> str:
    report_id = await create_report(
        vbo_id, "address-key", "long", buyer_key=buyer_key, db_path=db_path
    )
    await activate_entitlement(report_id, db_path=db_path)
    return report_id


@pytest.mark.asyncio
async def test_briefing_mints_buyer_bound_source_run(prebid_client):
    client, db_path = prebid_client
    report_id = await _report(db_path)
    with patch("app.services.source_orchestrator._execute_enabled_connector") as connector:
        connector.return_value = None
        response = await client.post(
            "/api/address/0363010000696734/prebid-briefing",
            json={
                "report_id": report_id,
                "confirmed_address": "Keizersgracht 100, Amsterdam",
                "postcode": "1015AA",
                "municipality": "Amsterdam",
                "rd_x": 121000,
                "rd_y": 487000,
                "lat": 52.3676,
                "lng": 4.8846,
                "property_type": "apartment",
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["vbo_id"] == "0363010000696734"
    assert data["address_id"] == "0363010000696734"
    assert data["result_state"] == "data_incomplete"
    assert data["top_actions"][0]["source_refs"]


@pytest.mark.asyncio
async def test_briefing_rejects_cross_buyer_report_before_source_run(prebid_client):
    client, db_path = prebid_client
    report_id = await _report(db_path, buyer_key="other-buyer")
    with patch("app.services.source_orchestrator.run_prebid_source_run") as source_run:
        response = await client.post(
            "/api/address/0363010000696734/prebid-briefing",
            json={"report_id": report_id, "confirmed_address": "Keizersgracht 100, Amsterdam"},
        )
    assert response.status_code == 404
    source_run.assert_not_called()


@pytest.mark.asyncio
async def test_pack_requires_buyer_bound_entitlement(prebid_client):
    client, db_path = prebid_client
    report_id = await _report(db_path)
    with patch("app.services.source_orchestrator._execute_enabled_connector") as connector:
        connector.return_value = None
        briefing = await client.post(
            "/api/address/0363010000696734/prebid-briefing",
            json={"report_id": report_id, "confirmed_address": "Keizersgracht 100, Amsterdam"},
        )
    assert briefing.status_code == 200
    pack = await client.get(f"/api/address/0363010000696734/prebid-pack?report_id={report_id}")
    assert pack.status_code == 200
    assert pack.json()["report_id"] == report_id
    assert pack.json()["status"] in {"ready", "queued_for_review"}

    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT report_id, pack_json FROM prebid_packs WHERE report_id = ?",
            (report_id,),
        )
        stored = await cursor.fetchone()
    assert stored is not None
    assert stored["report_id"] == report_id
    assert "source_appendix" in stored["pack_json"]


@pytest.mark.asyncio
async def test_pack_reuses_stored_snapshot_instead_of_regenerating(prebid_client):
    client, db_path = prebid_client
    report_id = await _report(db_path)
    with patch("app.services.source_orchestrator._execute_enabled_connector") as connector:
        connector.return_value = None
        briefing = await client.post(
            "/api/address/0363010000696734/prebid-briefing",
            json={"report_id": report_id, "confirmed_address": "Keizersgracht 100, Amsterdam"},
        )
    assert briefing.status_code == 200
    first = await client.get(f"/api/address/0363010000696734/prebid-pack?report_id={report_id}")
    assert first.status_code == 200

    async with get_db(db_path) as db:
        await db.execute(
            "UPDATE prebid_packs SET status = ?, pack_json = replace(pack_json, ?, ?) "
            "WHERE report_id = ?",
            ("queued_for_review", "Keizersgracht 100, Amsterdam", "Snapshot Address", report_id),
        )
        await db.commit()

    with patch("app.api.address.generate_pack_from_briefing") as generator:
        second = await client.get(
            f"/api/address/0363010000696734/prebid-pack?report_id={report_id}"
        )
    assert second.status_code == 200
    assert second.json()["address_label"] == "Snapshot Address"
    assert second.json()["status"] == "queued_for_review"
    generator.assert_not_called()


@pytest.mark.asyncio
async def test_admin_review_decision_updates_task_and_action_state(prebid_client, monkeypatch):
    client, db_path = prebid_client
    monkeypatch.setattr(settings, "prebid_admin_token", "admin-token")
    report_id = await _report(db_path)
    with patch("app.services.source_orchestrator._execute_enabled_connector") as connector:
        connector.return_value = None
        briefing = await client.post(
            "/api/address/0363010000696734/prebid-briefing",
            json={"report_id": report_id, "confirmed_address": "Keizersgracht 100, Amsterdam"},
        )
    assert briefing.status_code == 200

    async with get_db(db_path) as db:
        cursor = await db.execute("SELECT source_run_id FROM briefings LIMIT 1")
        source_run = await cursor.fetchone()
        cursor = await db.execute("SELECT action_id FROM action_items LIMIT 1")
        action = await cursor.fetchone()
        assert source_run is not None
        assert action is not None
        await db.execute(
            "UPDATE action_items SET review_state = 'pending' WHERE action_id = ?",
            (action["action_id"],),
        )
        await db.execute(
            "INSERT INTO review_tasks (review_task_id, source_run_id, action_id, reason) "
            "VALUES ('review-1', ?, ?, 'Manual review requested by QA.')",
            (source_run["source_run_id"], action["action_id"]),
        )
        await db.commit()
        cursor = await db.execute("SELECT review_task_id FROM review_tasks LIMIT 1")
        task = await cursor.fetchone()
    assert task is not None

    decision = await client.post(
        f"/api/address/admin/review-tasks/{task['review_task_id']}/decision",
        headers={"Authorization": "Bearer admin-token"},
        json={
            "status": "approved",
            "reviewer": "qa-admin",
            "note": "Source and wording reviewed.",
        },
    )

    assert decision.status_code == 200
    assert decision.json()["status"] == "approved"
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT status, decision_json FROM review_tasks WHERE review_task_id = ?",
            (task["review_task_id"],),
        )
        stored_task = await cursor.fetchone()
        cursor = await db.execute(
            "SELECT review_state FROM action_items WHERE action_id = ?",
            (action["action_id"],),
        )
        action_states = [row["review_state"] for row in await cursor.fetchall()]
    assert stored_task["status"] == "approved"
    assert "qa-admin" in stored_task["decision_json"]
    assert action_states == ["approved"]


@pytest.mark.asyncio
async def test_share_token_is_scoped_and_delete_revokes_access(prebid_client):
    client, db_path = prebid_client
    report_id = await _report(db_path)
    with patch("app.services.source_orchestrator._execute_enabled_connector") as connector:
        connector.return_value = None
        briefing = await client.post(
            "/api/address/0363010000696734/prebid-briefing",
            json={"report_id": report_id, "confirmed_address": "Keizersgracht 100, Amsterdam"},
        )
    briefing_id = briefing.json()["briefing_id"]
    share = await client.post(
        f"/api/address/0363010000696734/prebid-briefing/{briefing_id}/share", json={}
    )
    assert share.status_code == 200
    token = share.json()["share_token"]
    assert (await client.get(f"/api/address/shared/{token}")).status_code == 200
    assert (await client.get(f"/api/address/shared-pack/{token}")).status_code == 404

    deleted = await client.delete(f"/api/address/0363010000696734/prebid-briefing/{briefing_id}")
    assert deleted.status_code == 200
    assert (await client.get(f"/api/address/shared/{token}")).status_code == 404


@pytest.mark.asyncio
async def test_email_requires_consent_and_stores_no_raw_email(prebid_client):
    client, db_path = prebid_client
    report_id = await _report(db_path)
    with patch("app.services.source_orchestrator._execute_enabled_connector") as connector:
        connector.return_value = None
        briefing = await client.post(
            "/api/address/0363010000696734/prebid-briefing",
            json={"report_id": report_id, "confirmed_address": "Keizersgracht 100, Amsterdam"},
        )
    briefing_id = briefing.json()["briefing_id"]
    assert (
        await client.post(
            f"/api/address/0363010000696734/prebid-briefing/{briefing_id}/email",
            json={"email": "buyer@example.com", "consent": False},
        )
    ).status_code == 422
    response = await client.post(
        f"/api/address/0363010000696734/prebid-briefing/{briefing_id}/email",
        json={"email": "buyer@example.com", "consent": True, "language": "en"},
    )
    assert response.status_code == 200
    assert response.json()["email_sent"] is False
    assert response.json()["error_code"] == "email_provider_unavailable"

    async with get_db(db_path) as db:
        cursor = await db.execute("SELECT COUNT(*) AS count FROM user_contacts")
        row = await cursor.fetchone()
    assert row["count"] == 0


@pytest.mark.asyncio
async def test_email_persists_only_keyed_contact_hash_when_configured(prebid_client, monkeypatch):
    client, db_path = prebid_client
    monkeypatch.setattr(settings, "prebid_contact_hash_secret", "test-secret")
    report_id = await _report(db_path)
    with patch("app.services.source_orchestrator._execute_enabled_connector") as connector:
        connector.return_value = None
        briefing = await client.post(
            "/api/address/0363010000696734/prebid-briefing",
            json={"report_id": report_id, "confirmed_address": "Keizersgracht 100, Amsterdam"},
        )
    briefing_id = briefing.json()["briefing_id"]
    response = await client.post(
        f"/api/address/0363010000696734/prebid-briefing/{briefing_id}/email",
        json={"email": "Buyer@Example.com", "consent": True, "language": "en"},
    )
    assert response.status_code == 200

    async with get_db(db_path) as db:
        cursor = await db.execute("SELECT email_hash FROM user_contacts")
        rows = await cursor.fetchall()
    assert len(rows) == 1
    assert rows[0]["email_hash"] != "Buyer@Example.com"
    assert rows[0]["email_hash"] != "buyer@example.com"


@pytest.mark.asyncio
async def test_admin_source_run_audit_and_deleted_tombstone(prebid_client, monkeypatch):
    client, db_path = prebid_client
    monkeypatch.setattr(settings, "prebid_admin_token", "admin-token")
    report_id = await _report(db_path)
    with patch("app.services.source_orchestrator._execute_enabled_connector") as connector:
        connector.return_value = None
        briefing = await client.post(
            "/api/address/0363010000696734/prebid-briefing",
            json={"report_id": report_id, "confirmed_address": "Keizersgracht 100, Amsterdam"},
        )
    briefing_id = briefing.json()["briefing_id"]
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT source_run_id FROM briefings WHERE briefing_id = ?", (briefing_id,)
        )
        row = await cursor.fetchone()
    source_run_id = row["source_run_id"]

    assert (await client.get("/api/address/admin/source-runs")).status_code == 401
    listed = await client.get(
        "/api/address/admin/source-runs",
        headers={"Authorization": "Bearer admin-token"},
    )
    assert listed.status_code == 200
    assert listed.json()["items"][0]["confirmed_address"] == "Keizersgracht 100, Amsterdam"

    detail = await client.get(
        f"/api/address/admin/source-runs/{source_run_id}",
        headers={"Authorization": "Bearer admin-token"},
    )
    assert detail.status_code == 200
    assert detail.json()["coverage"]
    assert detail.json()["actions"]
    assert "buyer_key" not in detail.json()

    deleted = await client.delete(f"/api/address/0363010000696734/prebid-briefing/{briefing_id}")
    assert deleted.status_code == 200
    tombstone = await client.get(
        f"/api/address/admin/source-runs/{source_run_id}",
        headers={"Authorization": "Bearer admin-token"},
    )
    assert tombstone.status_code == 200
    data = tombstone.json()
    assert data["tombstone"] is True
    assert set(data) == {"source_run_id", "deleted_at", "tombstone"}


@pytest.mark.asyncio
async def test_prebid_pack_requires_prebid_briefing_snapshot(prebid_client):
    client, db_path = prebid_client
    report_id = await _report(db_path)

    response = await client.get(f"/api/address/0363010000696734/prebid-pack?report_id={report_id}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Briefing not found"
