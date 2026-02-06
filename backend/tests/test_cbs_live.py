"""Live smoke tests for CBS Wijken & Buurten integration.

These tests call the real CBS OGC API and verify F4 neighborhood stats work correctly.
They are marked with @pytest.mark.live and excluded from CI by default.

Run with: pytest -m live
"""

import pytest

from app.services import cbs

pytestmark = pytest.mark.live


@pytest.mark.asyncio
async def test_cbs_amsterdam_centrum_by_buurt_code():
    """Verify CBS lookup by buurt_code returns valid data."""
    result = await cbs.get_neighborhood_stats(
        vbo_id="0363010000696734",
        lat=52.3676,
        lng=4.8846,
        buurt_code="BU03630000",  # Amsterdam Centrum-West
    )
    assert result.stats is not None
    # The buurt_code may differ from requested if bbox fallback is used
    assert result.stats.buurt_code is not None
    assert result.stats.buurt_name is not None
    assert result.stats.population_density.available is True
    # Urbanization may be unknown for some buurten
    assert result.stats.urbanization is not None


@pytest.mark.asyncio
async def test_cbs_amsterdam_bbox_fallback():
    """Verify CBS bbox lookup works when buurt_code not provided."""
    result = await cbs.get_neighborhood_stats(
        vbo_id="0363010000696734",
        lat=52.3676,
        lng=4.8846,
    )
    assert result.stats is not None
    assert result.stats.buurt_name is not None


@pytest.mark.asyncio
async def test_cbs_rotterdam():
    """Verify CBS works in different city (Rotterdam)."""
    result = await cbs.get_neighborhood_stats(
        vbo_id="0599010000796099",
        lat=51.9225,
        lng=4.4792,
        buurt_code="BU05990401",  # Rotterdam Centrum
    )
    assert result.stats is not None
    assert result.stats.gemeente_name == "Rotterdam"


@pytest.mark.asyncio
async def test_cbs_response_structure():
    """Verify all expected fields are present in live response."""
    result = await cbs.get_neighborhood_stats(
        vbo_id="0363010000696734",
        lat=52.3676,
        lng=4.8846,
        buurt_code="BU03630000",
    )
    stats = result.stats
    assert stats is not None
    # Verify all 8 indicators exist
    assert hasattr(stats, "population_density")
    assert hasattr(stats, "avg_household_size")
    assert hasattr(stats, "single_person_pct")
    assert hasattr(stats, "age_profile")
    assert hasattr(stats, "owner_occupied_pct")
    assert hasattr(stats, "avg_property_value")
    assert hasattr(stats, "distance_to_train_km")
    assert hasattr(stats, "distance_to_supermarket_km")
    # Verify age profile has 3 bands
    assert hasattr(stats.age_profile, "age_0_24")
    assert hasattr(stats.age_profile, "age_25_64")
    assert hasattr(stats.age_profile, "age_65_plus")
