"""Tests for property warnings aggregation service."""
from unittest.mock import AsyncMock, patch

import pytest

from app.models.property_warnings import FoundationRisk
from app.services.property_warnings import build_attention_summary, get_property_warnings

# --- Erfpacht detection ---


class TestErfpachtDetection:
    @pytest.mark.asyncio
    async def test_amsterdam_flags_erfpacht(self):
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=2000),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=2000,
                num_units=1,
                municipality="Amsterdam",
            )
        assert result.erfpacht.detected is True
        assert result.erfpacht.confidence == "municipality_based"
        assert result.erfpacht.municipality == "Amsterdam"

    @pytest.mark.asyncio
    async def test_haarlem_flags_erfpacht(self):
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=2000),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=2000,
                num_units=1,
                municipality="Haarlem",
            )
        assert result.erfpacht.detected is True

    @pytest.mark.asyncio
    async def test_amsterdam_lowercase_flags_erfpacht(self):
        """Case-insensitive: 'amsterdam' must match configured 'Amsterdam'."""
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=2000),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=2000,
                num_units=1,
                municipality="amsterdam",
            )
        assert result.erfpacht.detected is True
        assert result.erfpacht.confidence == "municipality_based"

    @pytest.mark.asyncio
    async def test_amsterdam_whitespace_flags_erfpacht(self):
        """Leading/trailing whitespace: ' Amsterdam ' must match."""
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=2000),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=2000,
                num_units=1,
                municipality=" Amsterdam ",
            )
        assert result.erfpacht.detected is True
        assert result.erfpacht.municipality == "Amsterdam"

    @pytest.mark.asyncio
    async def test_amsterdam_mixed_case_flags_erfpacht(self):
        """Mixed case: 'AMSTERDAM' must match."""
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=2000),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=2000,
                num_units=1,
                municipality="AMSTERDAM",
            )
        assert result.erfpacht.detected is True

    @pytest.mark.asyncio
    async def test_non_erfpacht_city_no_flag(self):
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=2000),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=2000,
                num_units=1,
                municipality="Maastricht",
            )
        assert result.erfpacht.detected is False


# --- VvE detection ---


class TestVvEDetection:
    @pytest.mark.asyncio
    async def test_multi_unit_is_apartment(self):
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=2000),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=2000,
                num_units=8,
                municipality="Eindhoven",
            )
        assert result.vve.is_apartment is True
        assert result.vve.num_units == 8

    @pytest.mark.asyncio
    async def test_single_unit_not_apartment(self):
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=2000),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=2000,
                num_units=1,
                municipality="Eindhoven",
            )
        assert result.vve.is_apartment is False


# --- Asbestos detection ---


class TestAsbestosDetection:
    @pytest.mark.asyncio
    async def test_pre_1994_flagged(self):
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=1985),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=1985,
                num_units=1,
                municipality="Eindhoven",
            )
        assert result.asbestos.flagged is True
        assert result.asbestos.construction_year == 1985

    @pytest.mark.asyncio
    async def test_post_1993_not_flagged(self):
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=1994),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=1994,
                num_units=1,
                municipality="Eindhoven",
            )
        assert result.asbestos.flagged is False

    @pytest.mark.asyncio
    async def test_no_year_not_flagged(self):
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="unavailable"),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=None,
                num_units=1,
                municipality="Eindhoven",
            )
        assert result.asbestos.flagged is False


# --- Attention summary ---


class TestAttentionSummary:
    def test_no_flags_green(self):
        summary = build_attention_summary(
            risk_scores={"noise": 75, "air_quality": 80, "climate": 85, "sunlight": 70},
            foundation_level="low",
            erfpacht_detected=False,
            is_apartment=False,
            construction_year=2005,
        )
        assert summary.flag_count == 0
        assert len(summary.flags) == 0

    def test_critical_risk_flagged(self):
        summary = build_attention_summary(
            risk_scores={"noise": 22, "air_quality": 80, "climate": 85, "sunlight": 70},
            foundation_level="low",
            erfpacht_detected=False,
            is_apartment=False,
            construction_year=2005,
        )
        assert summary.flag_count == 1
        assert summary.flags[0].category == "noise"

    def test_poor_risk_flagged(self):
        summary = build_attention_summary(
            risk_scores={"noise": 38, "air_quality": 80, "climate": 85, "sunlight": 70},
            foundation_level="low",
            erfpacht_detected=False,
            is_apartment=False,
            construction_year=2005,
        )
        assert summary.flag_count == 1
        assert summary.flags[0].severity == "elevated"

    def test_moderate_risk_not_flagged(self):
        summary = build_attention_summary(
            risk_scores={"noise": 55, "air_quality": 80, "climate": 85, "sunlight": 70},
            foundation_level="low",
            erfpacht_detected=False,
            is_apartment=False,
            construction_year=2005,
        )
        assert summary.flag_count == 0

    def test_foundation_high_flagged(self):
        summary = build_attention_summary(
            risk_scores={"noise": 75, "air_quality": 80, "climate": 85, "sunlight": 70},
            foundation_level="high",
            erfpacht_detected=False,
            is_apartment=False,
            construction_year=2005,  # Post-1980 to isolate foundation flag
        )
        assert summary.flag_count == 1
        assert summary.flags[0].category == "foundation"

    def test_erfpacht_flagged(self):
        summary = build_attention_summary(
            risk_scores={"noise": 75, "air_quality": 80, "climate": 85, "sunlight": 70},
            foundation_level="low",
            erfpacht_detected=True,
            is_apartment=False,
            construction_year=2005,
        )
        assert summary.flag_count == 1
        assert summary.flags[0].category == "erfpacht"

    def test_vve_flagged_for_apartment(self):
        summary = build_attention_summary(
            risk_scores={"noise": 75, "air_quality": 80, "climate": 85, "sunlight": 70},
            foundation_level="low",
            erfpacht_detected=False,
            is_apartment=True,
            construction_year=2005,
        )
        assert summary.flag_count == 1
        assert summary.flags[0].category == "vve"

    def test_asbestos_flagged_pre_1980(self):
        summary = build_attention_summary(
            risk_scores={"noise": 75, "air_quality": 80, "climate": 85, "sunlight": 70},
            foundation_level="low",
            erfpacht_detected=False,
            is_apartment=False,
            construction_year=1965,
        )
        assert summary.flag_count == 1
        assert summary.flags[0].category == "asbestos"

    def test_asbestos_not_flagged_post_1980_pre_1994(self):
        """Post-1980 pre-1994 gets asbestos CARD but NOT attention flag."""
        summary = build_attention_summary(
            risk_scores={"noise": 75, "air_quality": 80, "climate": 85, "sunlight": 70},
            foundation_level="low",
            erfpacht_detected=False,
            is_apartment=False,
            construction_year=1985,
        )
        assert summary.flag_count == 0

    def test_multiple_flags(self):
        summary = build_attention_summary(
            risk_scores={"noise": 22, "air_quality": 80, "climate": 15, "sunlight": 70},
            foundation_level="high",
            erfpacht_detected=True,
            is_apartment=True,
            construction_year=1965,
        )
        categories = {f.category for f in summary.flags}
        assert "noise" in categories
        assert "climate" in categories
        assert "foundation" in categories
        assert "erfpacht" in categories
        assert "vve" in categories
        assert "asbestos" in categories
        assert summary.flag_count == 6

    def test_risk_categories_assessed_counts_non_none(self):
        summary = build_attention_summary(
            risk_scores={
                "noise": 75,
                "air_quality": None,
                "climate": 85,
                "sunlight": None,
            },
            foundation_level="low",
            erfpacht_detected=False,
            is_apartment=False,
            construction_year=2005,
        )
        assert summary.risk_categories_assessed == 2
        assert summary.risk_categories_total == 4


# --- Lead pipe proxy warning ---


class TestLeadPipeWarning:
    @pytest.mark.asyncio
    async def test_pre_1960_building_flagged(self):
        """Pre-1960 building → flagged, message present."""
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=1955),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=1955,
                num_units=1,
                municipality=None,
            )
        assert result.lead_pipe.flagged is True
        assert result.lead_pipe.construction_year == 1955
        assert "LEAD_PIPE_PRE_1960" in result.lead_pipe.messages

    @pytest.mark.asyncio
    async def test_post_1960_building_not_flagged(self):
        """Post-1960 building → not flagged."""
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=1975),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=1975,
                num_units=1,
                municipality=None,
            )
        assert result.lead_pipe.flagged is False
        assert result.lead_pipe.construction_year is None

    @pytest.mark.asyncio
    async def test_no_construction_year_not_flagged(self):
        """No construction year → not flagged."""
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="unavailable"),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=None,
                num_units=1,
                municipality=None,
            )
        assert result.lead_pipe.flagged is False

    @pytest.mark.asyncio
    async def test_attention_summary_includes_lead_pipe(self):
        """Attention summary includes lead pipe flag when pre-1960."""
        with patch(
            "app.services.property_warnings.foundation_risk.get_foundation_risk",
            new_callable=AsyncMock,
            return_value=FoundationRisk(level="low", construction_year=1950),
        ):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0,
                rd_y=487000.0,
                construction_year=1950,
                num_units=1,
                municipality=None,
            )
        categories = {f.category for f in result.attention_summary.flags}
        assert "lead_pipe" in categories
