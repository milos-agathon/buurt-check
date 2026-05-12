import pytest

from app.models.match import ReportInput
from app.services.match.ai_report import build_deterministic_fallback_report


def _report_payload(locale: str = "en"):
    return {
        "session_id": "anon_report_test",
        "locale": locale,
        "generation_mode": "fallback_only",
        "report_input": {
            "locale": locale,
            "profile_summary": {"household_type": "family", "journey_intent": "both"},
            "preference_vector": {
                "preference_vector_id": "pv_api_report",
                "journey_intent": "both",
                "budget_max_cents": 62500000,
                "monthly_rent_max_cents": 220000,
                "property_types": ["apartment"],
                "hard_filters": ["green_access"],
                "lifestyle_weights": {"green_access": 1.0},
                "locale": locale,
                "method_version": "preference-v1",
            },
            "recommendations": [
                {
                    "recommendation_id": "rec_ijburg",
                    "neighborhood_id": "nh_amsterdam_ijburg",
                    "name": "IJburg",
                    "category": "top",
                    "fit_score": 84,
                    "score_drivers": [{"feature": "green_access", "score": 88}],
                    "evidence_refs": ["ev_green_access"],
                }
            ],
            "comparisons": [],
            "similar_neighborhoods": [],
            "listing_context": {"provider_mode": "mock", "listing_count": 0},
            "evidence_items": [
                {
                    "evidence_id": "ev_green_access",
                    "claim_code": "green_access_match",
                    "metric_keys": ["green_access"],
                    "source_refs": ["src_green"],
                    "confidence": {"score": 82, "reasons": ["Seed metadata exists."]},
                    "freshness_status": "mock",
                    "limitations": ["MOCK DATA: representative seed value."],
                }
            ],
            "approved_limitations": ["This report uses labelled seed data."],
            "source_refs": ["src_green"],
        },
    }


@pytest.mark.asyncio
async def test_create_report_endpoint_returns_validated_fallback_snapshot(client):
    response = await client.post("/api/match/reports", json=_report_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "fallback"
    assert body["generated_by"] == "deterministic_fallback"
    assert body["validation_status"] == "fallback_used"
    assert body["generation_metadata"] == {
        "requested_mode": "fallback_only",
        "resolved_mode": "deterministic_fallback",
        "ai_provider": "none",
        "ai_available": False,
        "scoring_mutable_by_ai": False,
        "data_contract": "structured_report_input",
    }
    assert len(body["sections"]) == 8
    assert body["source_refs"] == ["src_green"]
    assert body["report_id"]


@pytest.mark.asyncio
async def test_create_report_endpoint_uses_configured_openai_provider(
    client,
    httpx_mock,
    monkeypatch,
):
    from app.config import settings

    payload = _report_payload()
    payload["generation_mode"] = "ai_with_fallback"
    report_input = ReportInput.model_validate(payload["report_input"])
    ai_output = build_deterministic_fallback_report(report_input).model_copy(
        update={"generated_by": "ai", "validation_status": "passed"}
    )
    monkeypatch.setattr(settings, "match_ai_report_provider_mode", "openai")
    monkeypatch.setattr(settings, "match_ai_report_openai_api_key", "sk-test")
    monkeypatch.setattr(settings, "match_ai_report_openai_base_url", "https://api.openai.test/v1")
    httpx_mock.add_response(
        method="POST",
        url="https://api.openai.test/v1/responses",
        json={
            "output": [
                {
                    "type": "message",
                    "content": [
                        {"type": "output_text", "text": ai_output.model_dump_json()}
                    ],
                }
            ]
        },
    )

    response = await client.post("/api/match/reports", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "generated"
    assert body["generated_by"] == "ai"
    assert body["validation_status"] == "passed"
    assert body["generation_metadata"] == {
        "requested_mode": "ai_with_fallback",
        "resolved_mode": "ai",
        "ai_provider": "openai",
        "ai_available": True,
        "scoring_mutable_by_ai": False,
        "data_contract": "structured_report_input",
    }


@pytest.mark.asyncio
async def test_get_report_endpoint_regenerates_locale_without_score_changes(client):
    created = await client.post("/api/match/reports", json=_report_payload("en"))
    report_id = created.json()["report_id"]

    response = await client.get(f"/api/match/reports/{report_id}?locale=nl")

    assert response.status_code == 200
    body = response.json()
    assert body["locale"] == "nl"
    nl_text = body["sections"][1]["claims"][0]["text"]
    en_text = created.json()["sections"][1]["claims"][0]["text"]
    assert nl_text != en_text
    assert body["report_input"]["recommendations"][0]["fit_score"] == 84


@pytest.mark.asyncio
async def test_create_report_endpoint_rejects_ungrounded_report_input(client):
    payload = _report_payload()
    payload["report_input"]["recommendations"][0]["evidence_refs"] = []

    response = await client.post("/api/match/reports", json=payload)

    assert response.status_code == 422
