"""Tests for foundation risk service."""
from unittest.mock import AsyncMock, patch

import pytest

from app.services.foundation_risk import (
    _classify_foundation_risk,
    get_foundation_risk,
)

# --- Pure classification logic (no mocks needed) ---


class TestClassifyFoundationRisk:
    def test_pre_1970_clay_high_subsidence(self):
        level = _classify_foundation_risk(1952, "klei", 3.2)
        assert level == "high"

    def test_pre_1970_peat_high_subsidence(self):
        level = _classify_foundation_risk(1960, "veen", 2.5)
        assert level == "high"

    def test_pre_1970_clay_low_subsidence(self):
        level = _classify_foundation_risk(1952, "klei", 1.5)
        assert level == "medium"

    def test_pre_1970_clay_no_subsidence_data(self):
        level = _classify_foundation_risk(1952, "klei", None)
        assert level == "medium"

    def test_pre_1970_sand(self):
        level = _classify_foundation_risk(1965, "zand", 5.0)
        assert level == "low"

    def test_pre_1970_gravel(self):
        level = _classify_foundation_risk(1940, "grind", None)
        assert level == "low"

    def test_transition_1970_1990_clay_high_subsidence(self):
        level = _classify_foundation_risk(1975, "klei", 2.5)
        assert level == "medium"

    def test_transition_1970_1990_clay_low_subsidence(self):
        level = _classify_foundation_risk(1980, "klei", 1.0)
        assert level == "low"

    def test_transition_1970_1990_sand(self):
        level = _classify_foundation_risk(1985, "zand", 3.0)
        assert level == "low"

    def test_post_1990(self):
        level = _classify_foundation_risk(2005, "klei", 5.0)
        assert level == "low"

    def test_no_soil_data(self):
        level = _classify_foundation_risk(1952, None, 3.0)
        assert level == "unavailable"

    def test_boundary_1970_is_transition(self):
        """1970 itself falls into transition period (1970-1990)."""
        level = _classify_foundation_risk(1970, "klei", 3.0)
        assert level == "medium"

    def test_boundary_1990_is_transition(self):
        """1990 itself falls into transition period (1970-1990)."""
        level = _classify_foundation_risk(1990, "veen", 3.0)
        assert level == "medium"

    def test_boundary_1991_is_post(self):
        level = _classify_foundation_risk(1991, "klei", 5.0)
        assert level == "low"

    def test_subsidence_boundary_2mm(self):
        """Exactly 2.0 mm/year is NOT > 2, so pre-1970 clay = medium."""
        level = _classify_foundation_risk(1952, "klei", 2.0)
        assert level == "medium"


# --- Integration tests with mocked external APIs ---


class TestGetFoundationRisk:
    @pytest.mark.asyncio
    async def test_full_data_high_risk(self):
        with (
            patch(
                "app.services.foundation_risk._fetch_soil_type",
                new_callable=AsyncMock,
                return_value="klei",
            ),
            patch(
                "app.services.foundation_risk._fetch_subsidence_rate",
                new_callable=AsyncMock,
                return_value=3.2,
            ),
        ):
            result = await get_foundation_risk(1952, 121000.0, 487000.0)
        assert result.level == "high"
        assert result.construction_year == 1952
        assert result.soil_type == "klei"
        assert result.subsidence_rate_mm_per_year == 3.2

    @pytest.mark.asyncio
    async def test_soil_fetch_fails_gracefully(self):
        with (
            patch(
                "app.services.foundation_risk._fetch_soil_type",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.services.foundation_risk._fetch_subsidence_rate",
                new_callable=AsyncMock,
                return_value=2.0,
            ),
        ):
            result = await get_foundation_risk(1960, 121000.0, 487000.0)
        assert result.level == "unavailable"
        assert "FOUNDATION_NO_SOIL_DATA" in result.messages

    @pytest.mark.asyncio
    async def test_subsidence_fetch_fails_gracefully(self):
        with (
            patch(
                "app.services.foundation_risk._fetch_soil_type",
                new_callable=AsyncMock,
                return_value="zand",
            ),
            patch(
                "app.services.foundation_risk._fetch_subsidence_rate",
                new_callable=AsyncMock,
                return_value=None,
            ),
        ):
            result = await get_foundation_risk(1965, 121000.0, 487000.0)
        assert result.level == "low"
        assert result.subsidence_rate_mm_per_year is None

    @pytest.mark.asyncio
    async def test_no_construction_year(self):
        """Without construction year, still fetch soil + subsidence but level is unavailable."""
        with (
            patch(
                "app.services.foundation_risk._fetch_soil_type",
                new_callable=AsyncMock,
                return_value="klei",
            ),
            patch(
                "app.services.foundation_risk._fetch_subsidence_rate",
                new_callable=AsyncMock,
                return_value=3.0,
            ),
        ):
            result = await get_foundation_risk(None, 121000.0, 487000.0)
        assert result.level == "unavailable"
        assert result.soil_type == "klei"
