import pytest


@pytest.mark.asyncio
async def test_compare_endpoint_rejects_two_neighborhoods(client):
    response = await client.post(
        "/api/match/compare",
        json={
            "preference_vector_id": "pv_test",
            "neighborhood_ids": ["nh_amsterdam_ijburg", "nh_utrecht_leidsche_rijn"],
            "locale": "en",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "match.warning.at_least_three_neighborhoods"


@pytest.mark.asyncio
async def test_compare_endpoint_returns_three_neighborhood_source_backed_rows(client):
    response = await client.post(
        "/api/match/compare",
        json={
            "preference_vector_id": "pv_test",
            "neighborhood_ids": [
                "nh_amsterdam_ijburg",
                "nh_utrecht_leidsche_rijn",
                "nh_rotterdam_katendrecht",
            ],
            "locale": "en",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["neighborhoods"]) == 3
    assert 5 <= len(body["indicators"]) <= 8
    assert any(
        cell["state"] == "missing"
        for row in body["indicators"]
        for cell in row["cells"].values()
    )
    assert body["indicators"][0]["cells"]["nh_amsterdam_ijburg"]["sources"][0]["source_name"]
