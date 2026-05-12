import pytest

from tests.test_match_api_reports import _report_payload


@pytest.mark.asyncio
async def test_save_share_and_export_report_paths(client):
    created = await client.post("/api/match/reports", json=_report_payload())
    report_id = created.json()["report_id"]

    saved = await client.post(
        f"/api/match/reports/{report_id}/save",
        json={"session_id": "anon_save"},
    )
    shared = await client.post(
        f"/api/match/reports/{report_id}/share",
        json={
            "scope": "report_view",
            "locale": "en",
            "expires_in_days": 30,
            "consent_to_share": True,
        },
    )
    exported = await client.post(
        f"/api/match/reports/{report_id}/export",
        json={"export_type": "json", "locale": "en"},
    )

    assert saved.status_code == 200
    assert saved.json()["saved"] is True
    assert shared.status_code == 200
    assert "/shared/match/report/" in shared.json()["share_url"]
    assert "token_hash" not in shared.json()
    assert exported.status_code == 200
    assert exported.json()["status"] == "created"
    assert exported.json()["payload"]["source_refs"] == ["src_green"]
    assert exported.json()["payload"]["limitations"]


@pytest.mark.asyncio
async def test_shared_report_token_opens_scoped_report_without_exposing_hash(client):
    created = await client.post("/api/match/reports", json=_report_payload())
    report_id = created.json()["report_id"]
    shared = await client.post(
        f"/api/match/reports/{report_id}/share",
        json={
            "scope": "report_view",
            "locale": "en",
            "expires_in_days": 30,
            "consent_to_share": True,
        },
    )
    token = shared.json()["share_url"].rstrip("/").split("/")[-1]

    opened = await client.get(f"/api/match/shared/{token}")

    assert opened.status_code == 200
    body = opened.json()
    assert body["report_id"] == report_id
    assert body["source_refs"] == ["src_green"]
    assert body["limitations"]
    assert "token_hash" not in body


@pytest.mark.asyncio
async def test_share_requires_consent_and_export_supports_pdf(client):
    created = await client.post("/api/match/reports", json=_report_payload())
    report_id = created.json()["report_id"]

    refused = await client.post(
        f"/api/match/reports/{report_id}/share",
        json={"scope": "report_view", "locale": "en", "consent_to_share": False},
    )
    pdf = await client.post(
        f"/api/match/reports/{report_id}/export",
        json={"export_type": "pdf", "locale": "en"},
    )

    assert refused.status_code == 422
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
