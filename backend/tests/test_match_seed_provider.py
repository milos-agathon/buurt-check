import json

import pytest

from app.models.match import DataFreshnessStatus, MatchQuizRequest, QuizBudget
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter
from app.services.match.quiz import process_match_quiz
from app.services.match.recommendations import build_match_recommendations


@pytest.mark.asyncio
async def test_seed_importer_loads_representative_dutch_neighborhoods():
    importer = SeedMockImporter()

    result = await importer.load_seed_data(MVP_REGION_CONFIG_ID)

    municipalities = {neighborhood.municipality for neighborhood in result.neighborhoods}
    assert {"Amsterdam", "Utrecht", "Rotterdam", "Den Haag", "Eindhoven"} <= municipalities
    assert any(n.municipality == "Haarlem" for n in result.neighborhoods)
    assert all(n.mock_status == "seeded_mock" for n in result.neighborhoods)
    assert result.source_run.provider_name == "SeedMockImporter"
    assert result.source_run.provider_type == "mock"
    assert result.source_run.records_imported == len(result.metrics)
    assert result.source_health[0].health_status == "mock_only"
    assert result.source_health[0].mock_metric_count > 0


@pytest.mark.asyncio
async def test_seed_data_supports_real_top_ten_recommendations():
    importer = SeedMockImporter()
    seed = await importer.load_seed_data(MVP_REGION_CONFIG_ID)
    preference = process_match_quiz(
        MatchQuizRequest(
            locale="en",
            journey_intent="buy",
            budget=QuizBudget(buy_max=65000000),
            household_type="family",
            current_city="Amsterdam",
            commute_limits=[{"mode": "public_transport", "max_minutes": 45}],
            property_types=["apartment"],
            must_haves=["green_access"],
            nice_to_haves=["train_nearby"],
            lifestyle_priorities={
                "green_space": 5,
                "family_fit": 4,
                "mobility": 4,
                "affordability": 3,
            },
        )
    ).preference_vector

    recommendations = build_match_recommendations(
        preference,
        neighborhoods=seed.neighborhoods,
        feature_vectors=seed.feature_vectors,
        limit=10,
    )

    assert len(seed.neighborhoods) >= 10
    assert len(recommendations.recommendations.top) == 10
    assert recommendations.recommendations.top[-1].rank == 10


@pytest.mark.asyncio
async def test_seed_metrics_are_unique_per_neighborhood():
    importer = SeedMockImporter()
    seed = await importer.load_seed_data(MVP_REGION_CONFIG_ID)

    seen_by_neighborhood: dict[str, set[str]] = {}
    duplicates: list[tuple[str, str]] = []
    for metric in seed.metrics:
        seen = seen_by_neighborhood.setdefault(metric.neighborhood_id, set())
        if metric.metric_key in seen:
            duplicates.append((metric.neighborhood_id, metric.metric_key))
        seen.add(metric.metric_key)

    assert duplicates == []


@pytest.mark.asyncio
async def test_seed_importer_rejects_duplicate_metric_keys(monkeypatch, tmp_path):
    from app.services.match.providers import seed as seed_module

    duplicate_seed = {
        "dataset_label": "duplicate-test",
        "method_version": "seed-test-v1",
        "retrieved_at": "2026-05-12T00:00:00Z",
        "neighborhoods": [
            {
                "neighborhood_id": "nh_duplicate",
                "name_nl": "Duplicate",
                "municipality": "Test",
                "geography_level": "neighborhood",
                "supported_region": True,
                "metrics": [
                    {
                        "metric_key": "mobility",
                        "raw_value": {"value": 60, "unit": "score_0_100"},
                        "normalized_value": 60,
                        "freshness_status": "mock",
                        "measurement_date": "2024-01-01",
                        "confidence": 60,
                        "limitations": ["MOCK DATA: duplicate test."],
                    },
                    {
                        "metric_key": "mobility",
                        "raw_value": {"value": 70, "unit": "score_0_100"},
                        "normalized_value": 70,
                        "freshness_status": "mock",
                        "measurement_date": "2024-01-01",
                        "confidence": 60,
                        "limitations": ["MOCK DATA: duplicate test."],
                    },
                ],
            }
        ],
    }
    seed_path = tmp_path / "duplicate_seed.json"
    seed_path.write_text(json.dumps(duplicate_seed), encoding="utf-8")
    monkeypatch.setattr(seed_module, "_SEED_FILE", seed_path)

    with pytest.raises(ValueError, match="duplicate metric_key"):
        await SeedMockImporter().load_seed_data(MVP_REGION_CONFIG_ID)


@pytest.mark.asyncio
async def test_seed_metrics_are_clearly_labelled_mock_with_source_metadata():
    importer = SeedMockImporter()

    result = await importer.load_seed_data(MVP_REGION_CONFIG_ID)

    assert result.metrics
    for metric in result.metrics:
        assert metric.source.source_type in {"mock", "missing"}
        assert metric.source.source_name.startswith("MOCK DATA")
        assert metric.source.retrieved_at is not None
        assert metric.source.geography_level in {"neighborhood", "municipality", "custom_seed"}
        assert metric.source.confidence >= 0
        assert metric.source.limitations
        assert metric.limitations


@pytest.mark.asyncio
async def test_seed_data_includes_missing_and_stale_examples_for_admin_testing():
    importer = SeedMockImporter()

    result = await importer.load_seed_data(MVP_REGION_CONFIG_ID)
    statuses = {metric.freshness_status for metric in result.metrics}

    assert DataFreshnessStatus.stale in statuses
    assert DataFreshnessStatus.unavailable in statuses
    assert any(vector.missing_features for vector in result.feature_vectors)
    assert any(vector.stale_features for vector in result.feature_vectors)
    assert result.source_health[0].stale_metric_count > 0
    assert result.source_health[0].missing_metric_count > 0


@pytest.mark.asyncio
async def test_seed_importer_rejects_unknown_region():
    importer = SeedMockImporter()

    with pytest.raises(ValueError, match="Unsupported seed region"):
        await importer.load_seed_data("unknown-region")
