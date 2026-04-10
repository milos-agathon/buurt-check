"""Tests for the Tier B service — crime stats data validation.

Focuses on the zero-crime falsy check bug (#42), buurt_code validation (#48),
and related edge cases.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.tier_b import CrimeStatsCard
from app.services.tier_b import (
    _clean_buurt_code,
    _get_crime_stats,
    _odata_escape,
    _to_float,
)

# ───────── Helpers ──────────


def _mock_response(data: dict, status_code: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.json.return_value = data
    resp.status_code = status_code
    resp.raise_for_status = MagicMock()
    return resp


def _mock_client_with_side_effect(side_effect) -> AsyncMock:
    client = AsyncMock()
    client.get = AsyncMock(side_effect=side_effect)
    client.is_closed = False
    return client


# CBS OData mock data


def _make_yearly_rows(
    total: float | None = 100.0,
    burglary: float | None = 10.0,
    violent_values: dict[str, float | None] | None = None,
) -> list[dict]:
    """Build CBS yearly crime rows with configurable counts."""
    rows = []
    if total is not None:
        rows.append({
            "SoortMisdrijf": "0.0.0 ",
            "GeregistreerdeMisdrijven_1": total,
        })
    if burglary is not None:
        rows.append({
            "SoortMisdrijf": "1.1.1 ",
            "GeregistreerdeMisdrijven_1": burglary,
        })
    if violent_values is not None:
        for code, value in violent_values.items():
            rows.append({
                "SoortMisdrijf": code,
                "GeregistreerdeMisdrijven_1": value,
            })
    return rows


MOCK_PERIOD_RESPONSE = {"value": [{"Key": "2024JJ00"}, {"Key": "2025JJ00"}]}
MOCK_MONTHLY_PERIOD_RESPONSE = {"value": [{"Key": "2025MM01"}, {"Key": "2025MM02"}]}
MOCK_POPULATION_RESPONSE = {
    "features": [
        {"properties": {"aantal_inwoners": 5000}},
    ],
}
MOCK_EMPTY_TYPED = {"value": []}


def _build_side_effect(
    yearly_rows: list[dict],
    monthly_rows: list[dict] | None = None,
    population: float = 5000.0,
    municipality_yearly_rows: list[dict] | None = None,
    municipality_monthly_rows: list[dict] | None = None,
    municipality_population: float | None = 100000.0,
    municipality_name: str = "Delft",
    national_total: float = 930000.0,
):
    """Build a side_effect function that routes CBS API calls correctly."""
    call_urls: list[str] = []

    async def side_effect(url: str, **kwargs):
        call_urls.append(url)

        # Population lookup (CBS wijken/buurten OGC API)
        if "collections/buurten/items" in url:
            return _mock_response({
                "features": [
                    {
                        "properties": {
                            "aantal_inwoners": population,
                            "buurtnaam": "Testbuurt",
                        },
                    },
                ],
            })
        if "collections/gemeenten/items" in url:
            features = []
            if municipality_population is not None:
                features.append({
                    "properties": {
                        "aantal_inwoners": municipality_population,
                        "gemeentenaam": municipality_name,
                    },
                })
            return _mock_response({"features": features})

        # Period lookups
        if url.endswith("/Perioden"):
            if "47022NED" in url:
                return _mock_response(MOCK_MONTHLY_PERIOD_RESPONSE)
            return _mock_response(MOCK_PERIOD_RESPONSE)

        # TypedDataSet (crime rows)
        if url.endswith("/TypedDataSet"):
            params = kwargs.get("params", {})
            filter_expr = params.get("$filter", "")
            if "NL01" in filter_expr:
                return _mock_response({
                    "value": [{
                        "SoortMisdrijf": "0.0.0 ",
                        "GeregistreerdeMisdrijven_1": national_total,
                    }],
                })
            # Monthly if filter contains "SoortMisdrijf eq"
            if "SoortMisdrijf eq" in filter_expr:
                if "GM" in filter_expr and municipality_monthly_rows is not None:
                    return _mock_response({"value": municipality_monthly_rows})
                return _mock_response({"value": monthly_rows or []})
            if "GM" in filter_expr and municipality_yearly_rows is not None:
                return _mock_response({"value": municipality_yearly_rows})
            return _mock_response({"value": yearly_rows})

        return _mock_response({})

    return side_effect


# ═══════ Zero crime falsy check tests (#42) ═══════


@pytest.mark.asyncio
async def test_zero_violent_crimes_not_treated_as_unavailable():
    """violent_count=0.0 must be 0.0, not None (bug #42).

    When all violent crime categories have zero count, the result must be
    0.0 (meaning: zero crimes recorded) rather than None (meaning:
    data unavailable).
    """
    violent_values = {
        "1.4.2 ": 0.0,
        "1.4.3 ": 0.0,
        "1.4.4 ": 0.0,
    }
    yearly_rows = _make_yearly_rows(
        total=50.0,
        burglary=5.0,
        violent_values=violent_values,
    )
    side_effect = _build_side_effect(yearly_rows)
    mock_cl = _mock_client_with_side_effect(side_effect)

    with patch("app.services.tier_b._client.get", return_value=mock_cl):
        result = await _get_crime_stats("BU05370606")

    assert isinstance(result, CrimeStatsCard)
    # The critical assertion: 0.0, NOT None
    assert result.violent_count == 0.0
    assert result.violent_count is not None


@pytest.mark.asyncio
async def test_nonzero_violent_crimes_reported_correctly():
    """Positive violent crime counts sum correctly."""
    violent_values = {
        "1.4.2 ": 3.0,
        "1.4.5 ": 7.0,
    }
    yearly_rows = _make_yearly_rows(
        total=100.0,
        burglary=10.0,
        violent_values=violent_values,
    )
    side_effect = _build_side_effect(yearly_rows)
    mock_cl = _mock_client_with_side_effect(side_effect)

    with patch("app.services.tier_b._client.get", return_value=mock_cl):
        result = await _get_crime_stats("BU05370606")

    assert isinstance(result, CrimeStatsCard)
    assert result.violent_count == 10.0


@pytest.mark.asyncio
async def test_no_violent_keys_in_data_returns_none():
    """When CBS data has no violent crime categories at all, violent_count=None."""
    yearly_rows = _make_yearly_rows(
        total=50.0,
        burglary=5.0,
        violent_values=None,  # no violent categories in response
    )
    side_effect = _build_side_effect(yearly_rows)
    mock_cl = _mock_client_with_side_effect(side_effect)

    with patch("app.services.tier_b._client.get", return_value=mock_cl):
        result = await _get_crime_stats("BU05370606")

    assert isinstance(result, CrimeStatsCard)
    assert result.violent_count is None


@pytest.mark.asyncio
async def test_zero_total_count_not_treated_as_unavailable():
    """total_count=0.0 is preserved (not falsy-checked to None)."""
    yearly_rows = _make_yearly_rows(total=0.0, burglary=0.0, violent_values=None)
    side_effect = _build_side_effect(yearly_rows)
    mock_cl = _mock_client_with_side_effect(side_effect)

    with patch("app.services.tier_b._client.get", return_value=mock_cl):
        result = await _get_crime_stats("BU05370606")

    assert isinstance(result, CrimeStatsCard)
    # total_count comes from code_to_count.get() which returns 0.0 directly
    assert result.total_count == 0.0


@pytest.mark.asyncio
async def test_zero_burglary_count_preserved():
    """burglary_count=0.0 is preserved, not treated as None."""
    yearly_rows = _make_yearly_rows(total=50.0, burglary=0.0, violent_values=None)
    side_effect = _build_side_effect(yearly_rows)
    mock_cl = _mock_client_with_side_effect(side_effect)

    with patch("app.services.tier_b._client.get", return_value=mock_cl):
        result = await _get_crime_stats("BU05370606")

    assert isinstance(result, CrimeStatsCard)
    assert result.burglary_count == 0.0


# ═══════ _to_float edge cases ═══════


def test_to_float_edge_cases():
    """_to_float handles various input types safely."""
    assert _to_float(None) is None
    assert _to_float("abc") is None
    assert _to_float("") is None
    assert _to_float(float("nan")) is None
    assert _to_float(float("inf")) is None
    assert _to_float(0) == 0.0
    assert _to_float(0.0) == 0.0
    assert _to_float("3.14") == 3.14
    assert _to_float(42) == 42.0


@pytest.mark.asyncio
async def test_yearly_period_source_date_is_human_readable():
    yearly_rows = _make_yearly_rows(total=50.0, burglary=5.0)
    side_effect = _build_side_effect(yearly_rows)
    mock_cl = _mock_client_with_side_effect(side_effect)

    with patch("app.services.tier_b._client.get", return_value=mock_cl):
        result = await _get_crime_stats("BU0363AD07")

    assert isinstance(result, CrimeStatsCard)
    assert result.yearly_period == "2025JJ00"
    assert result.source_date == "2025"


@pytest.mark.asyncio
async def test_buurt_scope_uses_buurt_population_denominator():
    yearly_rows = _make_yearly_rows(total=50.0, burglary=5.0)
    side_effect = _build_side_effect(yearly_rows, population=5000.0)
    mock_cl = _mock_client_with_side_effect(side_effect)

    with patch("app.services.tier_b._client.get", return_value=mock_cl):
        result = await _get_crime_stats("BU0363AD07")

    assert isinstance(result, CrimeStatsCard)
    assert result.scope == "buurt"
    assert result.area_code == "BU0363AD07"
    assert result.area_name == "Testbuurt"
    assert result.population == 5000.0
    assert result.population_year == 2024
    assert result.total_count == 50.0
    assert result.total_per_1000 == 10.0


@pytest.mark.asyncio
async def test_municipality_fallback_uses_municipality_population_denominator():
    municipality_rows = _make_yearly_rows(total=100.0, burglary=10.0)
    side_effect = _build_side_effect(
        yearly_rows=[],
        population=5000.0,
        municipality_yearly_rows=municipality_rows,
        municipality_population=100000.0,
        municipality_name="Delft",
    )
    mock_cl = _mock_client_with_side_effect(side_effect)

    with patch("app.services.tier_b._client.get", return_value=mock_cl):
        result = await _get_crime_stats("BU05370606")

    assert isinstance(result, CrimeStatsCard)
    assert result.scope == "gemeente"
    assert result.area_code == "GM0537"
    assert result.area_name == "Delft"
    assert result.population == 100000.0
    assert result.population_year == 2024
    assert result.total_count == 100.0
    assert result.total_per_1000 == 1.0
    assert result.total_per_1000 != 20.0
    assert result.message == "CRIME_MUNICIPALITY_LEVEL"


@pytest.mark.asyncio
async def test_municipality_fallback_without_population_keeps_counts_unscored():
    municipality_rows = _make_yearly_rows(total=100.0, burglary=10.0)
    side_effect = _build_side_effect(
        yearly_rows=[],
        municipality_yearly_rows=municipality_rows,
        municipality_population=None,
    )
    mock_cl = _mock_client_with_side_effect(side_effect)

    with patch("app.services.tier_b._client.get", return_value=mock_cl):
        result = await _get_crime_stats("BU05370606")

    assert isinstance(result, CrimeStatsCard)
    assert result.scope == "gemeente"
    assert result.area_code == "GM0537"
    assert result.population is None
    assert result.population_year is None
    assert result.total_count == 100.0
    assert result.total_per_1000 is None
    assert result.score is None
    assert result.message == "CRIME_NO_POPULATION"


# ═══════ buurt_code validation (#48) ═══════


class TestCleanBuurtCode:
    """Strict regex validation on buurt_code prevents OData injection."""

    def test_valid_all_numeric(self):
        assert _clean_buurt_code("BU05370606") == "BU05370606"

    def test_valid_alphanumeric_suffix(self):
        assert _clean_buurt_code("BU0363AD07") == "BU0363AD07"

    def test_valid_with_whitespace(self):
        assert _clean_buurt_code("  BU05370606  ") == "BU05370606"

    def test_valid_lowercase_normalized(self):
        assert _clean_buurt_code("bu0363ad07") == "BU0363AD07"

    def test_none_returns_none(self):
        assert _clean_buurt_code(None) is None

    def test_empty_string_returns_none(self):
        assert _clean_buurt_code("") is None

    def test_wrong_prefix_returns_none(self):
        assert _clean_buurt_code("WK05370606") is None

    def test_too_short_returns_none(self):
        assert _clean_buurt_code("BU0537") is None

    def test_too_long_returns_none(self):
        assert _clean_buurt_code("BU053706060") is None

    def test_single_quote_injection_rejected(self):
        """A crafted buurt_code with quotes must be rejected."""
        assert _clean_buurt_code("BU0537'OR1") is None

    def test_double_quote_injection_rejected(self):
        assert _clean_buurt_code('BU0537"OR1') is None

    def test_space_injection_rejected(self):
        assert _clean_buurt_code("BU0537 606") is None

    def test_semicolon_injection_rejected(self):
        assert _clean_buurt_code("BU0537;606") is None

    def test_parenthesis_injection_rejected(self):
        assert _clean_buurt_code("BU0537)606") is None


class TestOdataEscape:
    """Defense-in-depth: single quotes doubled in OData string literals."""

    def test_no_quotes_unchanged(self):
        assert _odata_escape("BU05370606") == "BU05370606"

    def test_single_quote_doubled(self):
        assert _odata_escape("BU0537'606") == "BU0537''606"

    def test_multiple_quotes_all_doubled(self):
        assert _odata_escape("a'b'c") == "a''b''c"

    def test_empty_string(self):
        assert _odata_escape("") == ""


@pytest.mark.asyncio
async def test_invalid_buurt_code_returns_no_buurt_message():
    """_get_crime_stats returns CRIME_NO_BUURT_CODE for invalid codes."""
    result = await _get_crime_stats("BU0537'OR 1 eq 1--")
    assert isinstance(result, CrimeStatsCard)
    assert result.message == "CRIME_NO_BUURT_CODE"


@pytest.mark.asyncio
async def test_valid_buurt_code_passes_through():
    """_get_crime_stats accepts a well-formed buurt code."""
    yearly_rows = _make_yearly_rows(total=50.0, burglary=5.0)
    side_effect = _build_side_effect(yearly_rows)
    mock_cl = _mock_client_with_side_effect(side_effect)

    with patch("app.services.tier_b._client.get", return_value=mock_cl):
        result = await _get_crime_stats("BU0363AD07")

    assert isinstance(result, CrimeStatsCard)
    assert result.message != "CRIME_NO_BUURT_CODE"
