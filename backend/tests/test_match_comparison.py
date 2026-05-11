import pytest

from app.services.match.comparison import build_neighborhood_comparison
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter


@pytest.mark.asyncio
async def test_comparison_requires_at_least_three_neighborhoods():
    seed = await SeedMockImporter().load_seed_data(MVP_REGION_CONFIG_ID)

    with pytest.raises(ValueError, match="at_least_three_neighborhoods"):
        build_neighborhood_comparison(
            ["nh_amsterdam_ijburg", "nh_utrecht_leidsche_rijn"],
            neighborhoods=seed.neighborhoods,
            feature_vectors=seed.feature_vectors,
            metrics=seed.metrics,
            locale="en",
        )


@pytest.mark.asyncio
async def test_comparison_supports_three_plus_with_sources_confidence_and_missing_states():
    seed = await SeedMockImporter().load_seed_data(MVP_REGION_CONFIG_ID)

    comparison = build_neighborhood_comparison(
        [
            "nh_amsterdam_ijburg",
            "nh_utrecht_leidsche_rijn",
            "nh_rotterdam_katendrecht",
        ],
        neighborhoods=seed.neighborhoods,
        feature_vectors=seed.feature_vectors,
        metrics=seed.metrics,
        locale="en",
    )

    assert len(comparison.neighborhoods) == 3
    assert 5 <= len(comparison.indicators) <= 8
    assert {row.indicator_key for row in comparison.indicators} >= {
        "green_access",
        "mobility",
        "affordability_buy",
    }
    assert all(set(row.cells) == {item.neighborhood_id for item in comparison.neighborhoods}
               for row in comparison.indicators)
    assert any(
        cell.state == "missing"
        for row in comparison.indicators
        for cell in row.cells.values()
    )
    first_green = next(row for row in comparison.indicators if row.indicator_key == "green_access")
    ijburg_cell = first_green.cells["nh_amsterdam_ijburg"]
    assert ijburg_cell.source_refs
    assert ijburg_cell.sources[0].source_name.startswith("MOCK DATA")
    assert ijburg_cell.sources[0].measurement_date == "2024-01-01"
    assert comparison.neighborhoods[0].confidence.score <= 100
    assert comparison.neighborhoods[0].evidence
    assert comparison.neighborhoods[0].tradeoffs
