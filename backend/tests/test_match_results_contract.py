import json
import re
from pathlib import Path
from unittest.mock import patch

import pytest

from app.config import settings
from app.db import init_db
from app.models.match import ConfidenceLabel
from app.services.match.neighborhood_features import DATA_VERSION, NeighborhoodFeatureStore
from app.services.match.results import _confidence_level
from tests.test_match_sessions import COMPLETE_ANSWERS

STABLE_KEY_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9]*(?:[._:-][A-Za-z0-9]+)+$")


def _load_frontend_i18n(locale: str) -> dict[str, str]:
    path = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n" / f"{locale}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def _assert_frontend_translation_key(
    key: str,
    *,
    en_keys: dict[str, str],
    nl_keys: dict[str, str],
    field_name: str,
) -> None:
    assert STABLE_KEY_PATTERN.match(key), f"{field_name} key is not stable: {key}"
    assert " " not in key, f"{field_name} key contains whitespace: {key}"
    assert key in en_keys, f"{field_name} key missing EN translation: {key}"
    assert key in nl_keys, f"{field_name} key missing NL translation: {key}"


@pytest.fixture
async def match_results_db(tmp_path):
    db_path = str(tmp_path / "match_results.db")
    await init_db(db_path)
    with patch.object(settings, "database_path", db_path):
        yield


async def _run_completed_match(client):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    session_id = create_response.json()["session_id"]
    patch_response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={"locale": "en", "current_step": 11, "answers": COMPLETE_ANSWERS},
    )
    assert patch_response.status_code == 200
    session_response = await client.get(f"/api/match/sessions/{session_id}")
    vector_version = session_response.json()["preference_vector_version"]
    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json={
            "source": "review_final_cta",
            "preference_vector_version": vector_version,
        },
    )
    assert run_response.status_code == 202
    results_response = await client.get(f"/api/match/sessions/{session_id}/results")
    assert results_response.status_code == 200
    return results_response.json()


@pytest.mark.asyncio
async def test_results_schema_contains_ranked_fit_scores_and_geometry(client, match_results_db):
    body = await _run_completed_match(client)

    assert body["session_id"].startswith("match_")
    assert body["status"] in {"completed", "completed_with_fallback"}
    assert body["model_mode"] == "weighted_scoring"
    assert body["model_version"] == "match-score-v1"
    assert body["scoring_version"] == "match-score-v1"
    assert body["data_version"] == "match-seed-v1"
    assert isinstance(body["preference_vector_version"], str)
    assert body["preference_vector_version"]
    assert isinstance(body["runtime_ms"], int)
    assert body["runtime_ms"] >= 0
    assert body["evaluation_status"] == "not_validated_no_labels"
    assert body["predictive_probability_available"] is False
    assert body["map_center"] == {"lat": 52.2, "lng": 5.3}
    assert body["bbox"] == [3.2, 50.7, 7.3, 53.6]
    assert body["candidate_count"] >= len(body["ranked_results"])
    assert body["candidate_count"] == body["scored_candidate_count"]
    assert body["normal_recommendation_count"] == len(body["ranked_results"])

    recommendations = body["ranked_results"]
    assert len(recommendations) > 0
    ranks = [item["rank"] for item in recommendations]
    assert ranks == sorted(ranks)
    assert ranks[0] == 1

    first = recommendations[0]
    assert 0 <= first["fit_score"] <= 100
    assert first["fit_label_key"].startswith("matchFirst.results.fitLabel.")
    assert first["reason_codes"]
    assert first["tradeoffs"]
    assert 0 <= first["confidence"]["score"] <= 100
    assert first["confidence"]["level"] in {"high", "medium", "low", "insufficient"}
    assert first["source_refs"]
    assert first["limitations"]
    assert first["freshness_status"] in {
        "current",
        "aging",
        "stale",
        "mock",
        "unavailable",
        "conflict",
    }
    assert first["geometry_ref"]["centroid_rd"]
    assert first["geometry_ref"]["display_centroid_wgs84"]
    assert first["geometry_ref"]["boundary_ref"].startswith("boundary_")
    assert "predictive_probability" not in first
    assert "raw_model_name" not in first


@pytest.mark.asyncio
async def test_results_do_not_emit_predictive_probability_fields_or_unstable_copy(
    client,
    match_results_db,
):
    body = await _run_completed_match(client)
    serialized = json.dumps(body)

    assert "predictive_probability_available" in body
    assert "predictive_probability" not in serialized.replace(
        "predictive_probability_available",
        "",
    )

    en_keys = _load_frontend_i18n("en")
    nl_keys = _load_frontend_i18n("nl")
    checked_keys: set[str] = set()

    for node in _walk(body):
        if isinstance(node.get("confidence"), dict):
            for reason in node["confidence"].get("reasons", []):
                assert STABLE_KEY_PATTERN.match(reason)
                assert " " not in reason
                assert reason in en_keys
                assert reason in nl_keys
                checked_keys.add(reason)
        for limitation in node.get("limitations", []):
            assert STABLE_KEY_PATTERN.match(limitation)
            assert " " not in limitation
            assert limitation in en_keys
            assert limitation in nl_keys
            checked_keys.add(limitation)

    assert checked_keys


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (19, "insufficient"),
        (20, "low"),
        (49, "low"),
        (50, "medium"),
        (79, "medium"),
        (80, "high"),
    ],
)
def test_confidence_level_boundaries_follow_prd_thresholds(score, expected):
    assert _confidence_level(ConfidenceLabel.low, score) == expected


@pytest.mark.asyncio
async def test_result_reason_codes_and_tradeoffs_are_stable_translatable_keys(
    client,
    match_results_db,
):
    body = await _run_completed_match(client)
    en_keys = _load_frontend_i18n("en")
    nl_keys = _load_frontend_i18n("nl")
    checked_keys: set[str] = set()

    for node in _walk(body):
        for field_name in ("reason_codes", "tradeoffs"):
            for key in node.get(field_name, []):
                _assert_frontend_translation_key(
                    key,
                    en_keys=en_keys,
                    nl_keys=nl_keys,
                    field_name=field_name,
                )
                checked_keys.add(key)

    assert checked_keys


@pytest.mark.asyncio
async def test_results_include_near_misses_but_not_as_normal_top_matches(
    client,
    match_results_db,
):
    body = await _run_completed_match(client)

    normal_ids = {item["neighborhood_id"] for item in body["ranked_results"]}
    near_miss_ids = {item["neighborhood_id"] for item in body["near_misses"]}
    stretch_ids = {item["neighborhood_id"] for item in body["stretch_matches"]}

    assert normal_ids
    assert normal_ids.isdisjoint(near_miss_ids)
    assert normal_ids.isdisjoint(stretch_ids)
    assert all(item["category"] == "stretch" for item in body["stretch_matches"])
    assert all(
        item["eligibility_status"] != "failed_hard_filter"
        for item in body["ranked_results"]
    )


@pytest.mark.asyncio
async def test_result_groups_include_ui_source_freshness_metadata(
    client,
    match_results_db,
):
    body = await _run_completed_match(client)
    en_keys = _load_frontend_i18n("en")
    nl_keys = _load_frontend_i18n("nl")
    checked_result_count = 0

    for group_name in ("ranked_results", "stretch_matches", "near_misses"):
        for result in body[group_name]:
            checked_result_count += 1
            source_refs = set(result["source_refs"])
            source_metadata = result.get("source_metadata")
            assert source_metadata, f"{group_name} result missing source_metadata"
            assert {item["source_id"] for item in source_metadata} == source_refs
            for source in source_metadata:
                assert source["source_id"]
                assert source["source_type"] in {
                    "official",
                    "commercial",
                    "derived",
                    "mock",
                    "user_provided",
                    "missing",
                }
                assert "measurement_date" in source
                assert "retrieved_at" in source
                assert source["freshness_status"] in {
                    "current",
                    "aging",
                    "stale",
                    "mock",
                    "unavailable",
                    "conflict",
                }
                assert 0 <= source["confidence"] <= 100
                assert source["limitations"]
                _assert_frontend_translation_key(
                    source["source_name_key"],
                    en_keys=en_keys,
                    nl_keys=nl_keys,
                    field_name="source_name_key",
                )
                for limitation in source["limitations"]:
                    _assert_frontend_translation_key(
                        limitation,
                        en_keys=en_keys,
                        nl_keys=nl_keys,
                        field_name="source_limitation",
                    )

    assert checked_result_count


@pytest.mark.asyncio
async def test_response_uses_ranked_results_alias_and_recommendations_alias(
    client,
    match_results_db,
):
    body = await _run_completed_match(client)

    assert body["recommendations"] == body["ranked_results"]
    assert body["map"]["type"] == "FeatureCollection"
    assert body["map"]["display_bounds_wgs84"] == body["bbox"]


@pytest.mark.asyncio
async def test_neighborhood_feature_matrix_exposes_source_freshness_and_mock_limitations(
    match_results_db,
):
    matrix = await NeighborhoodFeatureStore().load_matrix()

    assert matrix.data_version == DATA_VERSION
    assert matrix.neighborhoods
    assert matrix.feature_vectors
    assert len(matrix.neighborhoods) == len(matrix.feature_vectors)
    assert matrix.source_context.sources

    first = matrix.feature_vectors[0]
    assert first.features
    assert first.feature_sources
    assert first.confidence.score >= 0
    assert first.freshness_status.value in {
        "current",
        "aging",
        "stale",
        "mock",
        "unavailable",
        "conflict",
    }
    assert first.limitations
