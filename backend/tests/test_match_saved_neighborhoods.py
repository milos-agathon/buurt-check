import pytest


@pytest.mark.asyncio
async def test_saved_neighborhood_api_saves_lists_and_deletes(client):
    payload = {
        "session_id": "anon_saved",
        "preference_vector_id": "pv_saved",
        "report_id": "report_saved",
        "neighborhood_id": "nh_amsterdam_ijburg",
        "saved_from": "recommendation",
        "note": {"label": "Partner favorite"},
    }

    saved = await client.post("/api/match/saved-neighborhoods", json=payload)
    listed = await client.get("/api/match/saved-neighborhoods", params={"session_id": "anon_saved"})
    deleted = await client.delete(
        f"/api/match/saved-neighborhoods/{saved.json()['saved_neighborhood_id']}"
    )

    assert saved.status_code == 200
    assert saved.json()["neighborhood_id"] == "nh_amsterdam_ijburg"
    assert saved.json()["analytics_event"] == "match_neighborhood_saved"
    assert listed.status_code == 200
    assert listed.json()["saved_neighborhoods"][0]["neighborhood_id"] == "nh_amsterdam_ijburg"
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True

