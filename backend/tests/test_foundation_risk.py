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
        level, _ = _classify_foundation_risk(1952, "klei", 3.2)
        assert level == "high"

    def test_pre_1970_peat_high_subsidence(self):
        level, _ = _classify_foundation_risk(1960, "veen", 2.5)
        assert level == "high"

    def test_pre_1970_clay_low_subsidence(self):
        level, _ = _classify_foundation_risk(1952, "klei", 1.5)
        assert level == "medium"

    def test_pre_1970_clay_no_subsidence_data(self):
        level, _ = _classify_foundation_risk(1952, "klei", None)
        assert level == "medium"

    def test_pre_1970_sand(self):
        level, _ = _classify_foundation_risk(1965, "zand", 5.0)
        assert level == "low"

    def test_pre_1970_gravel(self):
        level, _ = _classify_foundation_risk(1940, "grind", None)
        assert level == "low"

    def test_transition_1970_1990_clay_high_subsidence(self):
        level, _ = _classify_foundation_risk(1975, "klei", 2.5)
        assert level == "medium"

    def test_transition_1970_1990_clay_low_subsidence(self):
        level, _ = _classify_foundation_risk(1980, "klei", 1.0)
        assert level == "low"

    def test_transition_1970_1990_sand(self):
        level, _ = _classify_foundation_risk(1985, "zand", 3.0)
        assert level == "low"

    def test_post_1990(self):
        level, _ = _classify_foundation_risk(2005, "klei", 5.0)
        assert level == "low"

    def test_no_soil_data_no_municipality(self):
        """No soil data and no municipality → fallback uses year only."""
        level, _ = _classify_foundation_risk(1952, None, 3.0)
        assert level == "medium"  # pre-1970 elsewhere

    def test_no_construction_year(self):
        """No construction year → unavailable regardless of other data."""
        level, _ = _classify_foundation_risk(None, "klei", 3.0)
        assert level == "unavailable"

    def test_boundary_1970_is_transition(self):
        """1970 itself falls into transition period (1970-1990)."""
        level, _ = _classify_foundation_risk(1970, "klei", 3.0)
        assert level == "medium"

    def test_boundary_1990_is_transition(self):
        """1990 itself falls into transition period (1970-1990)."""
        level, _ = _classify_foundation_risk(1990, "veen", 3.0)
        assert level == "medium"

    def test_boundary_1991_is_post(self):
        level, _ = _classify_foundation_risk(1991, "klei", 5.0)
        assert level == "low"

    def test_subsidence_boundary_2mm(self):
        """Exactly 2.0 mm/year is NOT > 2, so pre-1970 clay = medium."""
        level, _ = _classify_foundation_risk(1952, "klei", 2.0)
        assert level == "medium"

    def test_soil_present_no_msg_code(self):
        """When soil data is available, msg_code is None (primary path)."""
        _, msg = _classify_foundation_risk(1952, "klei", 3.2)
        assert msg is None


# --- Fallback classification (no soil data, using municipality heuristic) ---


class TestFallbackClassification:
    def test_pre_1970_soft_soil_city_high(self):
        level, msg = _classify_foundation_risk(1952, None, None, "Amsterdam")
        assert level == "high"
        assert msg == "FOUNDATION_SOFT_SOIL_CITY"

    def test_pre_1970_non_soft_city_medium(self):
        level, msg = _classify_foundation_risk(1952, None, None, "Maastricht")
        assert level == "medium"
        assert msg == "FOUNDATION_YEAR_ONLY"

    def test_pre_1970_no_municipality_medium(self):
        level, msg = _classify_foundation_risk(1952, None, None, None)
        assert level == "medium"
        assert msg == "FOUNDATION_YEAR_ONLY"

    def test_transition_soft_soil_city_medium(self):
        level, msg = _classify_foundation_risk(1975, None, None, "Rotterdam")
        assert level == "medium"
        assert msg == "FOUNDATION_SOFT_SOIL_CITY"

    def test_pre_1970_utrecht_soft_soil_fallback_high(self):
        level, msg = _classify_foundation_risk(1955, None, None, "Utrecht")
        assert level == "high"
        assert msg == "FOUNDATION_SOFT_SOIL_CITY"

    def test_transition_utrecht_soft_soil_fallback_medium(self):
        level, msg = _classify_foundation_risk(1980, None, None, "Utrecht")
        assert level == "medium"
        assert msg == "FOUNDATION_SOFT_SOIL_CITY"

    def test_pre_1970_den_haag_soft_soil_fallback_high(self):
        level, msg = _classify_foundation_risk(1955, None, None, "Den Haag")
        assert level == "high"
        assert msg == "FOUNDATION_SOFT_SOIL_CITY"

    def test_transition_den_haag_soft_soil_fallback_medium(self):
        level, msg = _classify_foundation_risk(1980, None, None, "Den Haag")
        assert level == "medium"
        assert msg == "FOUNDATION_SOFT_SOIL_CITY"

    def test_transition_non_soft_city_low(self):
        level, msg = _classify_foundation_risk(1980, None, None, "Eindhoven")
        assert level == "low"
        assert msg == "FOUNDATION_YEAR_ONLY"

    def test_post_1990_soft_soil_city_low(self):
        level, msg = _classify_foundation_risk(2005, None, None, "Amsterdam")
        assert level == "low"
        assert msg == "FOUNDATION_YEAR_ONLY"

    def test_post_1990_no_municipality_low(self):
        level, msg = _classify_foundation_risk(2010, None, None, None)
        assert level == "low"
        assert msg == "FOUNDATION_YEAR_ONLY"

    def test_soft_soil_city_case_insensitive(self):
        level, _ = _classify_foundation_risk(1950, None, None, "AMSTERDAM")
        assert level == "high"

    def test_soft_soil_city_whitespace(self):
        level, _ = _classify_foundation_risk(1950, None, None, " Gouda ")
        assert level == "high"


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
    async def test_soil_fetch_fails_uses_fallback(self):
        """When soil data unavailable, fallback uses year + municipality."""
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
            result = await get_foundation_risk(
                1960, 121000.0, 487000.0, municipality="Amsterdam"
            )
        assert result.level == "high"
        assert "FOUNDATION_NO_SOIL_DATA" in result.messages
        assert "FOUNDATION_SOFT_SOIL_CITY" in result.messages

    @pytest.mark.asyncio
    async def test_soil_fetch_fails_no_municipality_fallback(self):
        """When soil data unavailable and no municipality, year-only fallback."""
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
        assert result.level == "medium"
        assert "FOUNDATION_NO_SOIL_DATA" in result.messages
        assert "FOUNDATION_YEAR_ONLY" in result.messages

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
