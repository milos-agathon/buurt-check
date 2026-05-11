import pytest

from app.models.match import DataFreshnessStatus
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter


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
