"""Live integration smoke tests for F3 risk cards.

Skipped by default by pytest addopts (`-m "not live"`). Run explicitly with:
    python -m pytest tests/test_risk_cards_live.py -m live -v
"""

import pytest

from app.models.risk import RiskLevel
from app.services.risk_cards import (
    _build_air_card,
    _build_climate_card,
    _build_noise_card,
    _get_alo_layers,
    _utc_now_iso_date,
)

pytestmark = pytest.mark.live


AMSTERDAM_RD_X = 121000.0
AMSTERDAM_RD_Y = 487000.0
ROTTERDAM_RD_X = 92500.0
ROTTERDAM_RD_Y = 437500.0


@pytest.mark.asyncio
async def test_alo_layers_include_noise():
    layers = await _get_alo_layers()
    noise_layers = [
        layer for layer in layers
        if "geluid" in layer.lower() and "lden" in layer.lower() and "wegverkeer" in layer.lower()
    ]
    assert len(noise_layers) >= 1


@pytest.mark.asyncio
async def test_noise_card_amsterdam():
    card = await _build_noise_card(AMSTERDAM_RD_X, AMSTERDAM_RD_Y, _utc_now_iso_date())
    assert card.level != RiskLevel.unavailable, card.message
    assert card.lden_db is not None
    assert 30 <= card.lden_db <= 90


@pytest.mark.asyncio
async def test_air_card_amsterdam():
    card = await _build_air_card(AMSTERDAM_RD_X, AMSTERDAM_RD_Y, _utc_now_iso_date())
    assert card.level != RiskLevel.unavailable, card.message
    assert card.pm25_ug_m3 is not None or card.no2_ug_m3 is not None


@pytest.mark.asyncio
async def test_climate_card_amsterdam():
    card = await _build_climate_card(AMSTERDAM_RD_X, AMSTERDAM_RD_Y, _utc_now_iso_date())
    assert (
        card.heat_level != RiskLevel.unavailable
        or card.water_level != RiskLevel.unavailable
    ), card.message


@pytest.mark.asyncio
async def test_noise_card_rotterdam():
    card = await _build_noise_card(ROTTERDAM_RD_X, ROTTERDAM_RD_Y, _utc_now_iso_date())
    assert card.level != RiskLevel.unavailable, card.message
    assert card.lden_db is not None
