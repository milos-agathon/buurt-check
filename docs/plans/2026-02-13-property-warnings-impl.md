# Property Warnings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 property warning signals (foundation risk, erfpacht, VvE, asbestos, attention summary) to the buurt-check dossier — Phase 1 of the premium features design.

**Architecture:** Single new backend endpoint `GET /{vbo_id}/property-warnings` aggregating foundation risk (PDOK BRO soil + Klimaateffectatlas subsidence + construction year), erfpacht (municipality-based), VvE (BAG apartment detection), and asbestos (construction year < 1994). Frontend renders `AttentionSummary` (delayed until all data resolves) and `PropertyWarningsCard` (individual warning cards). All data from existing or new PDOK WFS endpoints — no new Python packages, no new npm packages.

**Tech Stack:** FastAPI + httpx + Pydantic (backend), React + TypeScript + plain CSS + Framer Motion (frontend), existing PDOK/Klimaateffectatlas WFS, existing i18next infrastructure.

**Design doc:** `docs/plans/2026-02-13-premium-features-design.md` (approved, committed at `6ef710a`)

**Test baselines:** Backend 321+ non-live, Frontend 338+. Final count must exceed both.

---

## Task 0: API Research — PDOK BRO + Klimaateffectatlas Subsidence

**Purpose:** Validate data source assumptions before writing any code.

**Step 1: Research PDOK BRO WFS for soil type**

Use the `dutch-geo-api-researcher` subagent to investigate:
- PDOK BRO WFS endpoint URL and GetCapabilities
- Layer name for soil type classification (grondsoort/lithologie)
- Response schema (what field contains the soil type string?)
- Coordinate system (EPSG:28992 expected)
- Whether a ±5m bbox point query returns useful results
- Rate limits, attribution requirements

**Step 2: Research Klimaateffectatlas subsidence layers**

Use the `dutch-geo-api-researcher` subagent to investigate:
- Which Klimaateffectatlas WFS/WMS layer(s) contain subsidence rate data
- Whether subsidence is already fetched by the existing climate risk endpoint in `risk_cards.py`
- Response schema (what field, what units — mm/year?)
- Whether a WMS GetFeatureInfo or WFS GetFeature approach is needed

**Step 3: Document findings**

Record the exact endpoint URLs, layer names, field names, and query patterns as comments in the implementation code. If BRO WFS doesn't expose the needed soil data, document the fallback (skip soil type, use construction year + subsidence only) and adjust classification logic.

**No commit for this task — research feeds Tasks 1-3.**

---

## Task 1: Backend Models — `property_warnings.py`

**Files:**
- Create: `backend/app/models/property_warnings.py`
- Test: `backend/tests/test_property_warnings_models.py`

**Step 1: Write the test**

```python
# backend/tests/test_property_warnings_models.py
"""Tests for property warning Pydantic models."""
import pytest
from app.models.property_warnings import (
    FoundationRisk,
    ErfpachtWarning,
    VvEInfo,
    AsbestosWarning,
    AttentionFlag,
    AttentionSummary,
    PropertyWarningsResponse,
)


def test_foundation_risk_defaults():
    risk = FoundationRisk(level="high", construction_year=1952, soil_type="klei")
    assert risk.level == "high"
    assert risk.subsidence_rate_mm_per_year is None
    assert risk.messages == []


def test_foundation_risk_unavailable():
    risk = FoundationRisk(level="unavailable")
    assert risk.construction_year is None
    assert risk.soil_type is None


def test_erfpacht_warning():
    w = ErfpachtWarning(detected=True, confidence="municipality_based", municipality="Amsterdam")
    assert w.detected is True
    assert w.messages == []


def test_erfpacht_not_detected():
    w = ErfpachtWarning(detected=False)
    assert w.confidence is None
    assert w.municipality is None


def test_vve_info():
    v = VvEInfo(is_apartment=True, num_units=12)
    assert v.is_apartment is True


def test_asbestos_warning():
    a = AsbestosWarning(flagged=True, construction_year=1965)
    assert a.flagged is True


def test_attention_summary_no_flags():
    s = AttentionSummary(
        flag_count=0,
        flags=[],
        risk_categories_assessed=4,
        risk_categories_total=4,
    )
    assert s.flag_count == 0


def test_attention_summary_with_flags():
    s = AttentionSummary(
        flag_count=2,
        flags=[
            AttentionFlag(category="foundation", severity="high", label="High foundation risk"),
            AttentionFlag(category="erfpacht", severity="info", label="Erfpacht detected"),
        ],
        risk_categories_assessed=3,
        risk_categories_total=4,
    )
    assert s.flag_count == 2
    assert len(s.flags) == 2


def test_property_warnings_response_serialization():
    resp = PropertyWarningsResponse(
        address_id="0363200000000001",
        attention_summary=AttentionSummary(
            flag_count=0, flags=[], risk_categories_assessed=4, risk_categories_total=4,
        ),
        foundation_risk=FoundationRisk(level="low", construction_year=2005, soil_type="zand"),
        erfpacht=ErfpachtWarning(detected=False),
        vve=VvEInfo(is_apartment=False),
        asbestos=AsbestosWarning(flagged=False),
    )
    data = resp.model_dump()
    assert data["address_id"] == "0363200000000001"
    assert data["foundation_risk"]["level"] == "low"
    assert data["erfpacht"]["detected"] is False
    # Round-trip
    resp2 = PropertyWarningsResponse(**data)
    assert resp2.attention_summary.flag_count == 0
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_property_warnings_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.property_warnings'`

**Step 3: Write the models**

```python
# backend/app/models/property_warnings.py
"""Pydantic models for property warnings (foundation, erfpacht, VvE, asbestos)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class FoundationRisk(BaseModel):
    level: Literal["high", "medium", "low", "unavailable"]
    construction_year: int | None = None
    soil_type: str | None = None
    subsidence_rate_mm_per_year: float | None = None
    messages: list[str] = []


class ErfpachtWarning(BaseModel):
    detected: bool
    confidence: Literal["confirmed", "municipality_based"] | None = None
    municipality: str | None = None
    messages: list[str] = []


class VvEInfo(BaseModel):
    is_apartment: bool
    num_units: int | None = None
    messages: list[str] = []


class AsbestosWarning(BaseModel):
    flagged: bool
    construction_year: int | None = None
    messages: list[str] = []


class AttentionFlag(BaseModel):
    category: str
    severity: str
    label: str


class AttentionSummary(BaseModel):
    flag_count: int
    flags: list[AttentionFlag]
    risk_categories_assessed: int
    risk_categories_total: int = 4


class PropertyWarningsResponse(BaseModel):
    address_id: str
    attention_summary: AttentionSummary
    foundation_risk: FoundationRisk
    erfpacht: ErfpachtWarning
    vve: VvEInfo
    asbestos: AsbestosWarning
```

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_property_warnings_models.py -v`
Expected: 9 PASSED

**Step 5: Lint**

Run: `cd backend && ruff check app/models/property_warnings.py tests/test_property_warnings_models.py`
Expected: Clean

**Step 6: Commit**

```bash
git add backend/app/models/property_warnings.py backend/tests/test_property_warnings_models.py
git commit -m "feat: add property warnings Pydantic models (foundation, erfpacht, VvE, asbestos)"
```

---

## Task 2: Backend Config — Erfpacht Municipalities + Cache TTL

**Files:**
- Modify: `backend/app/config.py`

**Step 1: Add erfpacht municipalities and cache TTL to config**

Add to `Settings` class in `config.py`:

```python
# Property warnings
erfpacht_municipalities: list[str] = [
    # Last verified: 2026-02-13. Recheck annually — municipalities occasionally
    # convert erfpacht portfolios to eigendom or adopt new erfpacht policies.
    "Amsterdam", "Den Haag", "Rotterdam", "Utrecht",
    "Leiden", "Zaanstad", "Amstelveen", "Haarlem",
]
cache_ttl_property_warnings: int = 604800  # 7 days
cache_ttl_foundation: int = 2592000  # 30 days (soil doesn't change)

# PDOK BRO (Basisregistratie Ondergrond) — soil type data
bro_wfs_base: str = "https://service.pdok.nl/bzk/bro-bodemkundigevlakkenkaart/wfs/v1_0"
```

Note: The exact BRO WFS URL will be confirmed by Task 0 research. Use the best-known URL as default; it can be overridden via `BUURT_BRO_WFS_BASE` env var.

**Step 2: Run existing tests**

Run: `cd backend && pytest -x -q -m "not live"`
Expected: All 321+ pass (no behavior change)

**Step 3: Lint**

Run: `cd backend && ruff check app/config.py`

**Step 4: Commit**

```bash
git add backend/app/config.py
git commit -m "feat: add erfpacht municipalities config + BRO WFS base URL + property warnings TTL"
```

---

## Task 3: Backend Service — `foundation_risk.py`

**Files:**
- Create: `backend/app/services/foundation_risk.py`
- Test: `backend/tests/test_foundation_risk.py`

**Step 1: Write the failing tests**

```python
# backend/tests/test_foundation_risk.py
"""Tests for foundation risk service."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.foundation_risk import (
    get_foundation_risk,
    _classify_foundation_risk,
    _fetch_soil_type,
    _fetch_subsidence_rate,
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
            patch("app.services.foundation_risk._fetch_soil_type",
                  new_callable=AsyncMock, return_value="klei"),
            patch("app.services.foundation_risk._fetch_subsidence_rate",
                  new_callable=AsyncMock, return_value=3.2),
        ):
            result = await get_foundation_risk(1952, 121000.0, 487000.0)
        assert result.level == "high"
        assert result.construction_year == 1952
        assert result.soil_type == "klei"
        assert result.subsidence_rate_mm_per_year == 3.2

    @pytest.mark.asyncio
    async def test_soil_fetch_fails_gracefully(self):
        with (
            patch("app.services.foundation_risk._fetch_soil_type",
                  new_callable=AsyncMock, return_value=None),
            patch("app.services.foundation_risk._fetch_subsidence_rate",
                  new_callable=AsyncMock, return_value=2.0),
        ):
            result = await get_foundation_risk(1960, 121000.0, 487000.0)
        assert result.level == "unavailable"
        assert "FOUNDATION_NO_SOIL_DATA" in result.messages

    @pytest.mark.asyncio
    async def test_subsidence_fetch_fails_gracefully(self):
        with (
            patch("app.services.foundation_risk._fetch_soil_type",
                  new_callable=AsyncMock, return_value="zand"),
            patch("app.services.foundation_risk._fetch_subsidence_rate",
                  new_callable=AsyncMock, return_value=None),
        ):
            result = await get_foundation_risk(1965, 121000.0, 487000.0)
        assert result.level == "low"
        assert result.subsidence_rate_mm_per_year is None

    @pytest.mark.asyncio
    async def test_no_construction_year(self):
        """Without construction year, still fetch soil + subsidence but classification is limited."""
        with (
            patch("app.services.foundation_risk._fetch_soil_type",
                  new_callable=AsyncMock, return_value="klei"),
            patch("app.services.foundation_risk._fetch_subsidence_rate",
                  new_callable=AsyncMock, return_value=3.0),
        ):
            result = await get_foundation_risk(None, 121000.0, 487000.0)
        assert result.level == "unavailable"
        assert result.soil_type == "klei"
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_foundation_risk.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Write the service**

```python
# backend/app/services/foundation_risk.py
"""Foundation risk assessment from soil type, subsidence, and construction year."""
from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import settings
from app.models.property_warnings import FoundationRisk

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None
_client_loop_id: int | None = None


def _get_client() -> httpx.AsyncClient:
    global _client, _client_loop_id
    loop_id = id(asyncio.get_running_loop())
    if _client is None or _client.is_closed or _client_loop_id != loop_id:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0))
        _client_loop_id = loop_id
    return _client


def _classify_foundation_risk(
    construction_year: int | None,
    soil_type: str | None,
    subsidence_rate: float | None,
) -> str:
    """Classify foundation risk level from inputs.

    Returns "high", "medium", "low", or "unavailable".
    """
    if soil_type is None or construction_year is None:
        return "unavailable"

    soft_soil = soil_type.lower() in ("klei", "veen")
    high_subsidence = subsidence_rate is not None and subsidence_rate > 2.0

    if construction_year < 1970:
        if soft_soil:
            return "high" if high_subsidence else "medium"
        return "low"

    if construction_year <= 1990:
        if soft_soil and high_subsidence:
            return "medium"
        return "low"

    # Post-1990: modern foundations
    return "low"


async def _fetch_soil_type(rd_x: float, rd_y: float) -> str | None:
    """Fetch soil type from PDOK BRO WFS at given RD coordinates.

    Returns normalized soil type string or None on failure.
    """
    client = _get_client()
    try:
        # Query BRO soil map WFS with tight bbox (±5m)
        resp = await client.get(
            settings.bro_wfs_base,
            params={
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": "bodemkundigevlakkenkaart:bodemkundige_vlakken",
                "bbox": f"{rd_x - 5},{rd_y - 5},{rd_x + 5},{rd_y + 5},EPSG:28992",
                "count": "1",
                "outputFormat": "application/json",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        if not features:
            return None

        props = features[0].get("properties", {})
        # BRO soil map returns grondsoort or bodemtype field
        # The exact field name depends on the layer — adapt after Task 0 research
        for key in ("grondsoort", "bodemtype", "grondsoort_code", "bodem_klasse"):
            if key in props and props[key]:
                return _normalize_soil_type(str(props[key]).lower())
        return None
    except Exception:
        logger.warning("BRO soil type fetch failed at rd_x=%.0f rd_y=%.0f", rd_x, rd_y)
        return None


def _normalize_soil_type(raw: str) -> str | None:
    """Map BRO soil classifications to our simplified categories."""
    if any(term in raw for term in ("klei", "clay")):
        return "klei"
    if any(term in raw for term in ("veen", "peat")):
        return "veen"
    if any(term in raw for term in ("zand", "sand")):
        return "zand"
    if any(term in raw for term in ("grind", "gravel")):
        return "grind"
    if any(term in raw for term in ("leem", "loam", "silt")):
        return "leem"
    # Unknown soil type — return raw for logging, treat as unavailable in classification
    logger.info("Unrecognized soil type: %s", raw)
    return raw  # Let classification handle non-standard types as non-soft-soil


async def _fetch_subsidence_rate(rd_x: float, rd_y: float) -> float | None:
    """Fetch subsidence rate from Klimaateffectatlas WFS/WMS.

    Returns mm/year or None on failure.
    """
    client = _get_client()
    try:
        # Use WMS GetFeatureInfo on subsidence layer
        resp = await client.get(
            settings.climate_atlas_wms_base,
            params={
                "service": "WMS",
                "version": "1.3.0",
                "request": "GetFeatureInfo",
                "layers": "bodemdaling_actueel",
                "query_layers": "bodemdaling_actueel",
                "crs": "EPSG:28992",
                "bbox": f"{rd_x - 25},{rd_y - 25},{rd_x + 25},{rd_y + 25}",
                "width": "101",
                "height": "101",
                "i": "50",
                "j": "50",
                "info_format": "application/json",
            },
        )
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "")
        if "json" not in content_type and "text" not in content_type:
            return None

        data = resp.json()
        features = data.get("features", [])
        if not features:
            return None

        props = features[0].get("properties", {})
        # Extract numeric subsidence rate (mm/year)
        for key, value in props.items():
            if not isinstance(value, (int, float)):
                continue
            if any(skip in key.lower() for skip in ("id", "code", "fid", "shape")):
                continue
            rate = float(value)
            if rate <= -999 or rate >= 1e30:
                continue
            return abs(rate)  # Subsidence rates may be negative (sinking)
        return None
    except Exception:
        logger.warning("Subsidence rate fetch failed at rd_x=%.0f rd_y=%.0f", rd_x, rd_y)
        return None


async def get_foundation_risk(
    construction_year: int | None,
    rd_x: float,
    rd_y: float,
) -> FoundationRisk:
    """Assess foundation risk from soil type, subsidence, and construction year."""
    soil_type, subsidence_rate = await asyncio.gather(
        _fetch_soil_type(rd_x, rd_y),
        _fetch_subsidence_rate(rd_x, rd_y),
    )

    level = _classify_foundation_risk(construction_year, soil_type, subsidence_rate)

    messages: list[str] = []
    if soil_type is None:
        messages.append("FOUNDATION_NO_SOIL_DATA")
    if subsidence_rate is None and soil_type is not None:
        messages.append("FOUNDATION_NO_SUBSIDENCE_DATA")
    if construction_year is None:
        messages.append("FOUNDATION_NO_YEAR")

    return FoundationRisk(
        level=level,
        construction_year=construction_year,
        soil_type=soil_type,
        subsidence_rate_mm_per_year=subsidence_rate,
        messages=messages,
    )
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_foundation_risk.py -v`
Expected: 19 PASSED (15 classification + 4 integration)

**Step 5: Lint**

Run: `cd backend && ruff check app/services/foundation_risk.py tests/test_foundation_risk.py`

**Step 6: Run full backend suite**

Run: `cd backend && pytest -x -q -m "not live"`
Expected: 321 + 19 = 340+ PASSED

**Step 7: Commit**

```bash
git add backend/app/services/foundation_risk.py backend/tests/test_foundation_risk.py
git commit -m "feat: add foundation risk service with BRO soil + subsidence classification"
```

---

## Task 4: Backend Service — `property_warnings.py`

**Files:**
- Create: `backend/app/services/property_warnings.py`
- Test: `backend/tests/test_property_warnings.py`

**Step 1: Write the failing tests**

```python
# backend/tests/test_property_warnings.py
"""Tests for property warnings aggregation service."""
import pytest
from unittest.mock import AsyncMock, patch

from app.models.property_warnings import FoundationRisk, PropertyWarningsResponse
from app.services.property_warnings import get_property_warnings, build_attention_summary


# --- Erfpacht detection ---

class TestErfpachtDetection:
    @pytest.mark.asyncio
    async def test_amsterdam_flags_erfpacht(self):
        with patch("app.services.property_warnings.foundation_risk.get_foundation_risk",
                    new_callable=AsyncMock,
                    return_value=FoundationRisk(level="low", construction_year=2000)):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0, rd_y=487000.0,
                construction_year=2000, num_units=1, municipality="Amsterdam",
            )
        assert result.erfpacht.detected is True
        assert result.erfpacht.confidence == "municipality_based"
        assert result.erfpacht.municipality == "Amsterdam"

    @pytest.mark.asyncio
    async def test_haarlem_flags_erfpacht(self):
        with patch("app.services.property_warnings.foundation_risk.get_foundation_risk",
                    new_callable=AsyncMock,
                    return_value=FoundationRisk(level="low", construction_year=2000)):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0, rd_y=487000.0,
                construction_year=2000, num_units=1, municipality="Haarlem",
            )
        assert result.erfpacht.detected is True

    @pytest.mark.asyncio
    async def test_non_erfpacht_city_no_flag(self):
        with patch("app.services.property_warnings.foundation_risk.get_foundation_risk",
                    new_callable=AsyncMock,
                    return_value=FoundationRisk(level="low", construction_year=2000)):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0, rd_y=487000.0,
                construction_year=2000, num_units=1, municipality="Maastricht",
            )
        assert result.erfpacht.detected is False


# --- VvE detection ---

class TestVvEDetection:
    @pytest.mark.asyncio
    async def test_multi_unit_is_apartment(self):
        with patch("app.services.property_warnings.foundation_risk.get_foundation_risk",
                    new_callable=AsyncMock,
                    return_value=FoundationRisk(level="low", construction_year=2000)):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0, rd_y=487000.0,
                construction_year=2000, num_units=8, municipality="Eindhoven",
            )
        assert result.vve.is_apartment is True
        assert result.vve.num_units == 8

    @pytest.mark.asyncio
    async def test_single_unit_not_apartment(self):
        with patch("app.services.property_warnings.foundation_risk.get_foundation_risk",
                    new_callable=AsyncMock,
                    return_value=FoundationRisk(level="low", construction_year=2000)):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0, rd_y=487000.0,
                construction_year=2000, num_units=1, municipality="Eindhoven",
            )
        assert result.vve.is_apartment is False


# --- Asbestos detection ---

class TestAsbestosDetection:
    @pytest.mark.asyncio
    async def test_pre_1994_flagged(self):
        with patch("app.services.property_warnings.foundation_risk.get_foundation_risk",
                    new_callable=AsyncMock,
                    return_value=FoundationRisk(level="low", construction_year=1985)):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0, rd_y=487000.0,
                construction_year=1985, num_units=1, municipality="Eindhoven",
            )
        assert result.asbestos.flagged is True
        assert result.asbestos.construction_year == 1985

    @pytest.mark.asyncio
    async def test_post_1993_not_flagged(self):
        with patch("app.services.property_warnings.foundation_risk.get_foundation_risk",
                    new_callable=AsyncMock,
                    return_value=FoundationRisk(level="low", construction_year=1994)):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0, rd_y=487000.0,
                construction_year=1994, num_units=1, municipality="Eindhoven",
            )
        assert result.asbestos.flagged is False

    @pytest.mark.asyncio
    async def test_no_year_not_flagged(self):
        with patch("app.services.property_warnings.foundation_risk.get_foundation_risk",
                    new_callable=AsyncMock,
                    return_value=FoundationRisk(level="unavailable")):
            result = await get_property_warnings(
                vbo_id="0363200000000001",
                rd_x=121000.0, rd_y=487000.0,
                construction_year=None, num_units=1, municipality="Eindhoven",
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
            construction_year=1952,
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
            risk_scores={"noise": 75, "air_quality": None, "climate": 85, "sunlight": None},
            foundation_level="low",
            erfpacht_detected=False,
            is_apartment=False,
            construction_year=2005,
        )
        assert summary.risk_categories_assessed == 2
        assert summary.risk_categories_total == 4
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_property_warnings.py -v`
Expected: FAIL

**Step 3: Write the service**

```python
# backend/app/services/property_warnings.py
"""Property warnings aggregation — foundation, erfpacht, VvE, asbestos."""
from __future__ import annotations

import logging

from app.config import settings
from app.models.property_warnings import (
    AsbestosWarning,
    AttentionFlag,
    AttentionSummary,
    ErfpachtWarning,
    FoundationRisk,
    PropertyWarningsResponse,
    VvEInfo,
)
from app.services import foundation_risk

logger = logging.getLogger(__name__)


def build_attention_summary(
    *,
    risk_scores: dict[str, int | None],
    foundation_level: str,
    erfpacht_detected: bool,
    is_apartment: bool,
    construction_year: int | None,
) -> AttentionSummary:
    """Build attention summary from all available signals."""
    flags: list[AttentionFlag] = []

    # Risk scores: flag critical (<30) and poor (<50)
    category_labels = {
        "noise": "noise risk",
        "air_quality": "air quality risk",
        "climate": "climate risk",
        "sunlight": "sunlight risk",
    }
    assessed = 0
    for cat, score in risk_scores.items():
        if score is None:
            continue
        assessed += 1
        if score < 30:
            flags.append(AttentionFlag(
                category=cat, severity="critical",
                label=f"Critical {category_labels.get(cat, cat)}",
            ))
        elif score < 50:
            flags.append(AttentionFlag(
                category=cat, severity="elevated",
                label=f"Elevated {category_labels.get(cat, cat)}",
            ))

    # Foundation risk
    if foundation_level == "high":
        flags.append(AttentionFlag(
            category="foundation", severity="high",
            label="High foundation risk",
        ))
    elif foundation_level == "medium":
        flags.append(AttentionFlag(
            category="foundation", severity="medium",
            label="Foundation risk needs verification",
        ))

    # Erfpacht
    if erfpacht_detected:
        flags.append(AttentionFlag(
            category="erfpacht", severity="info",
            label="Erfpacht (ground lease) detected",
        ))

    # VvE — flagged for apartments
    if is_apartment:
        flags.append(AttentionFlag(
            category="vve", severity="info",
            label="VvE (owners' association) — review financials",
        ))

    # Asbestos — flagged only for pre-1980 (extensive structural use)
    if construction_year is not None and construction_year < 1980:
        flags.append(AttentionFlag(
            category="asbestos", severity="info",
            label="Pre-1980 building — asbestos risk in structural materials",
        ))

    return AttentionSummary(
        flag_count=len(flags),
        flags=flags,
        risk_categories_assessed=assessed,
        risk_categories_total=4,
    )


async def get_property_warnings(
    *,
    vbo_id: str,
    rd_x: float,
    rd_y: float,
    construction_year: int | None,
    num_units: int | None,
    municipality: str | None,
) -> PropertyWarningsResponse:
    """Aggregate all property warnings for an address."""
    # Foundation risk (async — calls external APIs)
    fr = await foundation_risk.get_foundation_risk(construction_year, rd_x, rd_y)

    # Erfpacht detection (sync — municipality list lookup)
    erfpacht_detected = (
        municipality is not None
        and municipality in settings.erfpacht_municipalities
    )
    erfpacht = ErfpachtWarning(
        detected=erfpacht_detected,
        confidence="municipality_based" if erfpacht_detected else None,
        municipality=municipality if erfpacht_detected else None,
    )

    # VvE detection (sync — unit count from BAG)
    is_apartment = num_units is not None and num_units > 1
    vve = VvEInfo(
        is_apartment=is_apartment,
        num_units=num_units if is_apartment else None,
    )

    # Asbestos flag (sync — construction year threshold)
    asbestos_flagged = construction_year is not None and construction_year < 1994
    asbestos = AsbestosWarning(
        flagged=asbestos_flagged,
        construction_year=construction_year if asbestos_flagged else None,
    )

    # Attention summary is built by the frontend (it needs risk scores too)
    # Backend provides individual warnings; frontend synthesizes
    # But we provide a partial summary for caching purposes
    attention = AttentionSummary(
        flag_count=0,  # Placeholder — real count computed frontend-side with risk scores
        flags=[],
        risk_categories_assessed=0,
        risk_categories_total=4,
    )

    return PropertyWarningsResponse(
        address_id=vbo_id,
        attention_summary=attention,
        foundation_risk=fr,
        erfpacht=erfpacht,
        vve=vve,
        asbestos=asbestos,
    )
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_property_warnings.py -v`
Expected: All PASSED (3 erfpacht + 2 VvE + 3 asbestos + 12 attention summary = 20)

**Step 5: Lint + full suite**

Run: `cd backend && ruff check app/services/property_warnings.py tests/test_property_warnings.py && pytest -x -q -m "not live"`
Expected: Clean, 340+ PASSED

**Step 6: Commit**

```bash
git add backend/app/services/property_warnings.py backend/tests/test_property_warnings.py
git commit -m "feat: add property warnings service with erfpacht, VvE, asbestos detection + attention summary"
```

---

## Task 5: Backend Endpoint — `/property-warnings`

**Files:**
- Modify: `backend/app/api/address.py` (add new endpoint)
- Test: `backend/tests/test_address_api.py` (add endpoint test)

**Step 1: Write the failing test**

Add to `backend/tests/test_address_api.py`:

```python
# Add these tests to the existing test file

class TestPropertyWarningsEndpoint:
    @pytest.mark.asyncio
    async def test_property_warnings_success(self, client):
        with patch("app.api.address.property_warnings.get_property_warnings",
                    new_callable=AsyncMock) as mock_pw:
            mock_pw.return_value = PropertyWarningsResponse(
                address_id="0363200000000001",
                attention_summary=AttentionSummary(
                    flag_count=0, flags=[],
                    risk_categories_assessed=0, risk_categories_total=4,
                ),
                foundation_risk=FoundationRisk(level="low", construction_year=2000),
                erfpacht=ErfpachtWarning(detected=False),
                vve=VvEInfo(is_apartment=False),
                asbestos=AsbestosWarning(flagged=False),
            )
            resp = await client.get(
                "/api/address/0363200000000001/property-warnings",
                params={"rd_x": "121000", "rd_y": "487000"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["address_id"] == "0363200000000001"
        assert data["foundation_risk"]["level"] == "low"
        assert data["erfpacht"]["detected"] is False

    @pytest.mark.asyncio
    async def test_property_warnings_invalid_vbo(self, client):
        resp = await client.get(
            "/api/address/invalid/property-warnings",
            params={"rd_x": "121000", "rd_y": "487000"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_property_warnings_missing_params(self, client):
        resp = await client.get("/api/address/0363200000000001/property-warnings")
        assert resp.status_code == 422
```

**Step 2: Run to verify fail**

Run: `cd backend && pytest tests/test_address_api.py::TestPropertyWarningsEndpoint -v`
Expected: FAIL (endpoint doesn't exist)

**Step 3: Add endpoint to `address.py`**

Add to `backend/app/api/address.py` (after existing endpoints, before export):

```python
from app.services import property_warnings
from app.models.property_warnings import PropertyWarningsResponse

@router.get("/{vbo_id}/property-warnings", response_model=PropertyWarningsResponse)
async def address_property_warnings(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
    construction_year: int | None = Query(None),
    num_units: int | None = Query(None),
    municipality: str | None = Query(None),
):
    """Property warnings: foundation risk, erfpacht, VvE, asbestos."""
    t0 = time.monotonic()
    cache_key = f"property_warnings:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        logger.info("property_warnings cache_hit vbo=%s", vbo_id)
        return PropertyWarningsResponse(**cached)

    try:
        result = await property_warnings.get_property_warnings(
            vbo_id=vbo_id,
            rd_x=rd_x,
            rd_y=rd_y,
            construction_year=construction_year,
            num_units=num_units,
            municipality=municipality,
        )
    except Exception as exc:
        logger.error("property_warnings failed vbo=%s: %s", vbo_id, exc)
        raise HTTPException(status_code=502, detail="Property warnings fetch failed") from exc

    # Cache if foundation risk has real data
    if result.foundation_risk.level != "unavailable":
        await cache_set(cache_key, result.model_dump(), ttl=settings.cache_ttl_property_warnings)
        logger.info("property_warnings cache_set vbo=%s latency=%.0fms",
                     vbo_id, (time.monotonic() - t0) * 1000)

    return result
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_address_api.py::TestPropertyWarningsEndpoint -v`
Expected: 3 PASSED

**Step 5: Full suite**

Run: `cd backend && ruff check app/api/address.py && pytest -x -q -m "not live"`
Expected: Clean, 343+ PASSED

**Step 6: Commit**

```bash
git add backend/app/api/address.py backend/tests/test_address_api.py
git commit -m "feat: add GET /{vbo_id}/property-warnings endpoint with caching"
```

---

## Task 6: Frontend Types + API Client

**Files:**
- Modify: `frontend/src/types/api.ts` (add interfaces)
- Modify: `frontend/src/services/api.ts` (add fetch function)
- Modify: `frontend/src/services/api.test.ts` (add tests)

**Step 1: Add TypeScript interfaces**

Add to `frontend/src/types/api.ts`:

```typescript
// Property Warnings
export interface FoundationRisk {
  level: 'high' | 'medium' | 'low' | 'unavailable';
  construction_year?: number;
  soil_type?: string;
  subsidence_rate_mm_per_year?: number;
  messages: string[];
}

export interface ErfpachtWarning {
  detected: boolean;
  confidence?: 'confirmed' | 'municipality_based';
  municipality?: string;
  messages: string[];
}

export interface VvEInfo {
  is_apartment: boolean;
  num_units?: number;
  messages: string[];
}

export interface AsbestosWarning {
  flagged: boolean;
  construction_year?: number;
  messages: string[];
}

export interface AttentionFlag {
  category: string;
  severity: string;
  label: string;
}

export interface AttentionSummary {
  flag_count: number;
  flags: AttentionFlag[];
  risk_categories_assessed: number;
  risk_categories_total: number;
}

export interface PropertyWarningsResponse {
  address_id: string;
  attention_summary: AttentionSummary;
  foundation_risk: FoundationRisk;
  erfpacht: ErfpachtWarning;
  vve: VvEInfo;
  asbestos: AsbestosWarning;
}
```

**Step 2: Add API fetch function**

Add to `frontend/src/services/api.ts`:

```typescript
export async function getPropertyWarnings(
  vboId: string,
  rdX: number,
  rdY: number,
  options?: {
    constructionYear?: number;
    numUnits?: number;
    municipality?: string;
  },
): Promise<PropertyWarningsResponse> {
  const params = new URLSearchParams({
    rd_x: String(rdX),
    rd_y: String(rdY),
  });
  if (options?.constructionYear != null) params.set('construction_year', String(options.constructionYear));
  if (options?.numUnits != null) params.set('num_units', String(options.numUnits));
  if (options?.municipality) params.set('municipality', options.municipality);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${API_BASE}/address/${vboId}/property-warnings?${params}`, {
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Property warnings failed: ${resp.status}`);
    return resp.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Step 3: Add tests**

Add to `frontend/src/services/api.test.ts`:

```typescript
describe('getPropertyWarnings', () => {
  it('sends GET with required params', async () => {
    mockFetch.mockResolvedValue(okResponse({
      address_id: 'vbo-123',
      foundation_risk: { level: 'low', messages: [] },
      erfpacht: { detected: false, messages: [] },
      vve: { is_apartment: false, messages: [] },
      asbestos: { flagged: false, messages: [] },
      attention_summary: { flag_count: 0, flags: [], risk_categories_assessed: 4, risk_categories_total: 4 },
    }));
    const result = await getPropertyWarnings('0363200000000001', 121000, 487000);
    expect(result.address_id).toBe('vbo-123');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/property-warnings?');
    expect(url).toContain('rd_x=121000');
  });

  it('sends optional params when provided', async () => {
    mockFetch.mockResolvedValue(okResponse({ address_id: 'vbo-123' }));
    await getPropertyWarnings('0363200000000001', 121000, 487000, {
      constructionYear: 1952,
      numUnits: 8,
      municipality: 'Amsterdam',
    });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('construction_year=1952');
    expect(url).toContain('num_units=8');
    expect(url).toContain('municipality=Amsterdam');
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue(errorResponse(502));
    await expect(getPropertyWarnings('0363200000000001', 121000, 487000))
      .rejects.toThrow('Property warnings failed: 502');
  });
});
```

**Step 4: Run tests**

Run: `cd frontend && npx vitest run src/services/api.test.ts`
Expected: All PASSED (existing + 3 new)

**Step 5: Build check**

Run: `cd frontend && npm run build`
Expected: Clean (TypeScript strict mode passes)

**Step 6: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/services/api.ts frontend/src/services/api.test.ts
git commit -m "feat: add PropertyWarnings types + getPropertyWarnings API client"
```

---

## Task 7: Frontend — `PropertyWarningsCard` Component

**Files:**
- Create: `frontend/src/components/PropertyWarningsCard.tsx`
- Create: `frontend/src/components/PropertyWarningsCard.css`
- Create: `frontend/src/components/PropertyWarningsCard.test.tsx`
- Modify: `frontend/src/test/helpers.ts` (add factory)

**Step 1: Add test factory to helpers.ts**

```typescript
// Add to frontend/src/test/helpers.ts
export function makePropertyWarningsResponse(
  overrides: Partial<PropertyWarningsResponse> = {},
): PropertyWarningsResponse {
  return {
    address_id: 'vbo-123',
    attention_summary: {
      flag_count: 0,
      flags: [],
      risk_categories_assessed: 4,
      risk_categories_total: 4,
    },
    foundation_risk: {
      level: 'low',
      construction_year: 2005,
      soil_type: 'zand',
      messages: [],
    },
    erfpacht: { detected: false, messages: [] },
    vve: { is_apartment: false, messages: [] },
    asbestos: { flagged: false, messages: [] },
    ...overrides,
  };
}
```

**Step 2: Write the tests**

```typescript
// frontend/src/components/PropertyWarningsCard.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import PropertyWarningsCard from './PropertyWarningsCard';
import { setupTestI18n, makePropertyWarningsResponse } from '../test/helpers';
import type { PropertyWarningsResponse } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderCard(data?: PropertyWarningsResponse, loading = false, error = false) {
  return render(
    <I18nextProvider i18n={i18n}>
      <PropertyWarningsCard data={data} loading={loading} error={error} />
    </I18nextProvider>,
  );
}

describe('PropertyWarningsCard', () => {
  it('renders nothing when no data and not loading', () => {
    const { container } = renderCard();
    expect(container.querySelector('.property-warnings')).not.toBeInTheDocument();
  });

  it('shows loading state', () => {
    renderCard(undefined, true);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    renderCard(undefined, false, true);
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it('renders foundation risk card with high severity', () => {
    const data = makePropertyWarningsResponse({
      foundation_risk: {
        level: 'high',
        construction_year: 1952,
        soil_type: 'klei',
        subsidence_rate_mm_per_year: 3.2,
        messages: [],
      },
    });
    renderCard(data);
    expect(screen.getByText(/foundation/i)).toBeInTheDocument();
  });

  it('renders erfpacht card when detected', () => {
    const data = makePropertyWarningsResponse({
      erfpacht: {
        detected: true,
        confidence: 'municipality_based',
        municipality: 'Amsterdam',
        messages: [],
      },
    });
    renderCard(data);
    expect(screen.getByText(/erfpacht/i)).toBeInTheDocument();
  });

  it('does not render erfpacht card when not detected', () => {
    const data = makePropertyWarningsResponse();
    renderCard(data);
    expect(screen.queryByText(/erfpacht/i)).not.toBeInTheDocument();
  });

  it('renders VvE card for apartments', () => {
    const data = makePropertyWarningsResponse({
      vve: { is_apartment: true, num_units: 12, messages: [] },
    });
    renderCard(data);
    expect(screen.getByText(/VvE/)).toBeInTheDocument();
  });

  it('does not render VvE card for houses', () => {
    const data = makePropertyWarningsResponse();
    renderCard(data);
    expect(screen.queryByText(/VvE/)).not.toBeInTheDocument();
  });

  it('renders asbestos card for pre-1994 buildings', () => {
    const data = makePropertyWarningsResponse({
      asbestos: { flagged: true, construction_year: 1965, messages: [] },
    });
    renderCard(data);
    expect(screen.getByText(/asbestos/i)).toBeInTheDocument();
  });

  it('does not render asbestos card for post-1993 buildings', () => {
    const data = makePropertyWarningsResponse();
    renderCard(data);
    expect(screen.queryByText(/asbestos/i)).not.toBeInTheDocument();
  });

  it('renders in Dutch', async () => {
    const nlI18n = await setupTestI18n('nl');
    const data = makePropertyWarningsResponse({
      foundation_risk: {
        level: 'high', construction_year: 1952, soil_type: 'klei', messages: [],
      },
    });
    render(
      <I18nextProvider i18n={nlI18n}>
        <PropertyWarningsCard data={data} />
      </I18nextProvider>,
    );
    expect(screen.getByText(/fundering/i)).toBeInTheDocument();
  });
});
```

**Step 3: Run to verify fail, then implement component**

The component implementation follows the existing card pattern (TierBSignalsCard). Each warning renders as a sub-card with severity badge, description, viewing questions (collapsible), and source. Uses BEM CSS with `property-warnings__` prefix. Loading/error/data three-state model.

**Step 4: Run tests + build**

Run: `cd frontend && npx vitest run src/components/PropertyWarningsCard.test.tsx && npm run build`

**Step 5: Commit**

```bash
git add frontend/src/components/PropertyWarningsCard.tsx frontend/src/components/PropertyWarningsCard.css frontend/src/components/PropertyWarningsCard.test.tsx frontend/src/test/helpers.ts
git commit -m "feat: add PropertyWarningsCard component with foundation, erfpacht, VvE, asbestos cards"
```

---

## Task 8: Frontend — `AttentionSummary` Component

**Files:**
- Create: `frontend/src/components/AttentionSummary.tsx`
- Create: `frontend/src/components/AttentionSummary.css`
- Create: `frontend/src/components/AttentionSummary.test.tsx`

**Step 1: Write the tests**

```typescript
// frontend/src/components/AttentionSummary.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import AttentionSummary from './AttentionSummary';
import { setupTestI18n } from '../test/helpers';
import type { RiskCardsResponse, PropertyWarningsResponse } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderSummary(props: {
  riskCards?: RiskCardsResponse;
  warnings?: PropertyWarningsResponse;
  sunlightScore?: number;
}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <AttentionSummary {...props} />
    </I18nextProvider>,
  );
}

describe('AttentionSummary', () => {
  it('shows green badge when no flags', () => {
    // All good scores, no warnings
    renderSummary({
      riskCards: makeGoodRiskCards(),
      warnings: makeCleanWarnings(),
      sunlightScore: 80,
    });
    expect(screen.getByText(/no flags raised/i)).toBeInTheDocument();
  });

  it('shows amber badge for single flag', () => {
    renderSummary({
      riskCards: makePoorNoiseRiskCards(),
      warnings: makeCleanWarnings(),
      sunlightScore: 80,
    });
    expect(screen.getByText(/1 item needs attention/i)).toBeInTheDocument();
  });

  it('shows red badge for multiple flags', () => {
    renderSummary({
      riskCards: makeCriticalRiskCards(),
      warnings: makeFoundationHighWarnings(),
      sunlightScore: 80,
    });
    const badge = screen.getByText(/items need attention/i);
    expect(badge).toBeInTheDocument();
  });

  it('shows data completeness suffix', () => {
    renderSummary({
      riskCards: makeGoodRiskCards(),
      warnings: makeCleanWarnings(),
      sunlightScore: 80,
    });
    expect(screen.getByText(/4 of 4/i)).toBeInTheDocument();
  });

  it('shows partial data completeness', () => {
    renderSummary({
      riskCards: makePartialRiskCards(),
      warnings: makeCleanWarnings(),
    });
    expect(screen.getByText(/2 of 4/i)).toBeInTheDocument();
  });

  it('includes VvE in flag count for apartments', () => {
    renderSummary({
      riskCards: makeGoodRiskCards(),
      warnings: makeApartmentWarnings(),
      sunlightScore: 80,
    });
    expect(screen.getByText(/1 item needs attention/i)).toBeInTheDocument();
  });

  it('includes asbestos in flag count for pre-1980', () => {
    renderSummary({
      riskCards: makeGoodRiskCards(),
      warnings: makePre1980Warnings(),
      sunlightScore: 80,
    });
    expect(screen.getByText(/1 item needs attention/i)).toBeInTheDocument();
  });

  it('renders in Dutch', async () => {
    const nlI18n = await setupTestI18n('nl');
    render(
      <I18nextProvider i18n={nlI18n}>
        <AttentionSummary
          riskCards={makeGoodRiskCards()}
          warnings={makeCleanWarnings()}
          sunlightScore={80}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText(/geen/i)).toBeInTheDocument();
  });
});
```

Note: The test file will use local helper functions (`makeGoodRiskCards`, etc.) that compose from `makeRiskCardsResponse` and `makePropertyWarningsResponse` factories. These should be defined at the top of the test file or added to helpers.

**Step 2: Implement the component**

The `AttentionSummary` component:
- Receives `riskCards`, `warnings`, and `sunlightScore` as props
- Computes flags client-side using the same logic as `build_attention_summary` from the design doc
- Renders three states: green (0 flags), amber (1 flag), red (2+ flags)
- Shows data completeness suffix
- Uses `motion.div` with `SPRING_REVEAL` for entry animation
- CSS uses badge tokens (`--color-badge-positive-*`, `--color-badge-caution-*`, `--color-badge-negative-*`)

**Step 3: Run tests + build**

Run: `cd frontend && npx vitest run src/components/AttentionSummary.test.tsx && npm run build`

**Step 4: Commit**

```bash
git add frontend/src/components/AttentionSummary.tsx frontend/src/components/AttentionSummary.css frontend/src/components/AttentionSummary.test.tsx
git commit -m "feat: add AttentionSummary component with green/amber/red badge states"
```

---

## Task 9: i18n — Add Translation Keys

**Files:**
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/nl.json`

**Step 1: Add ~50 new keys to both files**

Add to `en.json` (and corresponding Dutch translations to `nl.json`):

```json
"warnings.sectionTitle": "Property Warnings",
"warnings.loading": "Analyzing property warnings...",
"warnings.error": "Property warnings could not be loaded.",
"warnings.attention.no_flags": "No flags raised",
"warnings.attention.no_flags_detail": "All assessed risk categories are within normal ranges.",
"warnings.attention.items_attention": "{{count}} item needs attention",
"warnings.attention.items_attention_plural": "{{count}} items need attention",
"warnings.attention.based_on": "Based on {{assessed}} of {{total}} environmental risk categories + property analysis.",
"warnings.attention.unavailable": "{{categories}} could not be assessed.",
"warnings.attention.disclaimer": "This summary synthesizes multiple data sources into a single overview. It is not professional property advice. Individual risk assessments are indicative and based on publicly available data. Always commission professional inspections (bouwkundige keuring, funderingsonderzoek) before making a purchase decision.",
"warnings.foundation.title": "Foundation Risk",
"warnings.foundation.high": "Built in {{year}} on {{soil}} soil with {{rate}} mm/year subsidence. Approximately 425,000 Dutch homes have foundation problems — pre-1970 buildings on soft soil are most affected. Repair costs typically range from EUR 60,000 to EUR 100,000+.",
"warnings.foundation.medium": "Built in {{year}} on {{soil}} soil. This building was constructed during a transition period in foundation practices. While modern concrete piles are likely, the soft soil in this area warrants verification.",
"warnings.foundation.low": "Built in {{year}} on {{soil}} soil. Modern foundation practices and stable soil conditions indicate low foundation risk.",
"warnings.foundation.unavailable": "Foundation risk cannot be fully assessed — soil type data is unavailable for this location.",
"warnings.foundation.question_1": "Has a foundation inspection (funderingsonderzoek) been performed? Request the report.",
"warnings.foundation.question_2": "Look for visible signs: cracks near windows and doors, tilting walls, doors that stick or won't close, uneven floors.",
"warnings.foundation.question_3": "If this is an apartment: has the VvE discussed or budgeted for foundation repair?",
"warnings.foundation.question_4": "Ask neighbors: have any buildings on this street had foundation work done?",
"warnings.foundation.source": "Soil type: PDOK Basisregistratie Ondergrond (BRO). Subsidence rate: Klimaateffectatlas. Construction year: BAG Kadaster.",
"warnings.foundation.disclaimer": "This is an indicative risk assessment based on building age, soil type, and regional subsidence data. It is NOT a foundation inspection. Only a professional funderingsonderzoek can determine actual foundation condition.",
"warnings.erfpacht.title": "Erfpacht (Ground Lease)",
"warnings.erfpacht.confirmed": "This property is on erfpacht. You own the building but lease the land from the municipality. This results in a recurring canon payment on top of your mortgage. The canon amount is reviewed periodically and can increase significantly at renewal.",
"warnings.erfpacht.likely": "{{municipality}} issues erfpacht for many properties. While not all properties in this municipality are on erfpacht, it is common. Verify the property's eigendomsstatus with the seller or via Kadaster.",
"warnings.erfpacht.question_1": "Is this eigendom (freehold) or erfpacht (leasehold)?",
"warnings.erfpacht.question_2": "If erfpacht: is it eeuwigdurend (perpetual) or tijdelijk (temporary)?",
"warnings.erfpacht.question_3": "What is the current annual canon? When is the next canon review?",
"warnings.erfpacht.question_4": "If temporary: when does the lease expire? What are the terms for renewal?",
"warnings.erfpacht.question_5": "Has the canon recently been converted to eeuwigdurend? At what rate?",
"warnings.erfpacht.source": "Municipality: PDOK Locatieserver. Erfpacht prevalence based on municipal land policy records.",
"warnings.erfpacht.disclaimer": "Erfpacht status should be confirmed via the Kadaster register or the seller's notary deed (leveringsakte). Municipality-based detection is indicative.",
"warnings.vve.title": "VvE (Owners' Association)",
"warnings.vve.description": "This is an apartment with mandatory VvE membership. All owners share responsibility for the building's maintenance, insurance, and communal areas. VvE decisions are legally binding — including large expenditures like foundation repair, elevator replacement, or facade renovation. Monthly VvE contributions typically range from EUR 100-400.",
"warnings.vve.question_1": "Request the VvE jaarrekening (annual financial report) — is the reserve fund healthy?",
"warnings.vve.question_2": "Request the MJOP (meerjarenonderhoudsplan) — what large costs are planned in the next 5-10 years?",
"warnings.vve.question_3": "Request the notulen (minutes) of the last 3 VvE meetings — any disputes, pending assessments, or deferred maintenance?",
"warnings.vve.question_4": "What is the monthly VvE bijdrage (contribution)? Is it sufficient to cover the MJOP?",
"warnings.vve.question_5": "How many units are in the VvE? (Fewer units = higher per-unit cost for shared repairs)",
"warnings.vve.question_6": "Is the building insured through the VvE? What does the policy cover?",
"warnings.vve.source": "Building type: BAG Kadaster.",
"warnings.asbestos.title": "Asbestos Awareness",
"warnings.asbestos.description": "Built in {{year}}, before the 1993 asbestos ban. Asbestos-containing materials (roof tiles, floor tiles, insulation, pipe lagging, window putty) may be present. Professional removal is legally required if materials are disturbed during renovation. Removal costs range from EUR 1,000 to EUR 15,000+.",
"warnings.asbestos.question_1": "Has an asbestos inventory (asbestinventarisatie) been conducted? Request the report.",
"warnings.asbestos.question_2": "Are there corrugated cement roof panels, vinyl floor tiles from the 1960s-1980s, or visible pipe insulation?",
"warnings.asbestos.question_3": "If renovation is planned: has the seller disclosed potential asbestos-containing materials?",
"warnings.asbestos.question_4": "Is there an asbestos-free certificate (asbestvrij verklaring) for any previous renovation work?",
"warnings.asbestos.source": "Construction year: BAG Kadaster. Dutch asbestos ban: Asbestverwijderingsbesluit 2005 (products banned from 1 July 1993).",
"warnings.asbestos.disclaimer": "The presence of asbestos can only be confirmed by professional inspection. This flag is based solely on construction year."
```

**Step 2: Add corresponding Dutch keys to `nl.json`**

All keys must have Dutch translations. Use professional real-estate Dutch terminology.

**Step 3: Verify key counts match**

Run: `node -e "const en=require('./src/i18n/en.json'); const nl=require('./src/i18n/nl.json'); console.log('EN:', Object.keys(en).length, 'NL:', Object.keys(nl).length)"`
Expected: Counts match

**Step 4: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All 338+ tests pass (i18n tests use real translation files, so missing keys would fail)

**Step 5: Commit**

```bash
git add frontend/src/i18n/en.json frontend/src/i18n/nl.json
git commit -m "feat: add ~50 i18n keys for property warnings (EN + NL)"
```

---

## Task 10: Frontend Integration — Wire into App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Add state + import**

Add to App.tsx imports:

```typescript
import AttentionSummary from './components/AttentionSummary';
import PropertyWarningsCard from './components/PropertyWarningsCard';
import { getPropertyWarnings } from './services/api';
import type { PropertyWarningsResponse } from './types/api';
```

Add to state declarations (after tierB state):

```typescript
const [propertyWarnings, setPropertyWarnings] = useState<PropertyWarningsResponse | null>(null);
const [propertyWarningsLoading, setPropertyWarningsLoading] = useState(false);
const [propertyWarningsError, setPropertyWarningsError] = useState(false);
```

**Step 2: Add IIFE in handleAddressSelect**

After the tierB IIFE block (around line 411), add:

```typescript
setPropertyWarningsLoading(true);
void (async () => {
  try {
    const warnings = await getPropertyWarnings(vboId, rd_x, rd_y, {
      constructionYear: undefined, // Will be set after building facts load
      numUnits: undefined,
      municipality: resolved.municipality ?? undefined,
    });
    if (neighborhood3DRequestId.current === requestId) {
      setPropertyWarnings(warnings);
      setPropertyWarningsLoading(false);
    }
  } catch {
    if (neighborhood3DRequestId.current === requestId) {
      setPropertyWarningsError(true);
      setPropertyWarningsLoading(false);
    }
  }
})();
```

Note: Construction year and num_units come from building facts which loads separately. For the initial call, pass what's available from the resolved address. After building facts load, consider a second call — or pass construction_year/num_units from the frontend to the backend. The simpler approach: pass municipality from resolved address (available immediately), and pass construction_year + num_units when the building response arrives. Since the endpoint is GET with query params, the frontend can fire a second call once building data arrives. For MVP, fire once with municipality only — the backend handles None gracefully.

**Step 3: Add reset in handleAddressSelect state clearing**

Add to the reset block (around line 294):

```typescript
setPropertyWarnings(null);
setPropertyWarningsLoading(false);
setPropertyWarningsError(false);
```

**Step 4: Add AttentionSummary to dossier layout**

Insert BEFORE the SummaryStrip (around line 666), with delayed rendering:

```tsx
{/* AttentionSummary — delayed until both risks and warnings resolve */}
{((!riskLoading && (riskCards || riskError)) &&
  (!propertyWarningsLoading && (propertyWarnings || propertyWarningsError))) && (
  <motion.div
    initial={{ opacity: 0, y: -8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={SPRING_REVEAL}
  >
    <AttentionSummary
      riskCards={riskCards ?? undefined}
      warnings={propertyWarnings ?? undefined}
      sunlightScore={sunlight ? Math.max(0, Math.min(100, Math.round((sunlight.winter / 6) * 100))) : undefined}
    />
  </motion.div>
)}
```

**Step 5: Add PropertyWarningsCard to dossier layout**

Insert AFTER the RiskCardsPanel/LayoutGroup block (around line 784), BEFORE neighborhood stats:

```tsx
{(propertyWarningsLoading || propertyWarnings || propertyWarningsError) && (
  <>
    <h3 className="app__section-label">{t('warnings.sectionTitle')}</h3>
    <PropertyWarningsCard
      data={propertyWarnings ?? undefined}
      loading={propertyWarningsLoading}
      error={propertyWarningsError}
    />
  </>
)}
```

**Step 6: Add to DossierSeedState interface**

```typescript
interface DossierSeedState {
  // ... existing fields
  propertyWarnings?: PropertyWarningsResponse;
}
```

**Step 7: Run build + tests**

Run: `cd frontend && npm run build && npx vitest run`
Expected: Clean build, all tests pass

**Step 8: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire property warnings + attention summary into dossier screen"
```

---

## Task 11: Quality Gate Verification

**Step 1: Backend quality gates**

```bash
cd backend && ruff check . && pytest -x -q -m "not live"
```
Expected: Clean lint, 321 + ~32 new = 353+ tests pass

**Step 2: Frontend quality gates**

```bash
cd frontend && npm run build && npx vitest run
```
Expected: Clean build, 338 + ~21 new = 359+ tests pass

**Step 3: i18n consistency**

Verify EN and NL key counts match.

**Step 4: Manual verification**

- Start backend: `cd backend && uvicorn app.main:app --reload --port 8000`
- Start frontend: `cd frontend && npm run dev`
- Search for an Amsterdam address (erfpacht should be detected)
- Search for a pre-1970 address (foundation risk should show)
- Search for an apartment (VvE should show)
- Verify AttentionSummary appears only after risks + warnings both resolve
- Verify all cards follow 4-part hierarchy
- Toggle to Dutch — verify translations
- Toggle dark mode — verify badge colors

**Step 5: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: quality gate fixes for property warnings"
```

---

## Summary

| Task | Files | New Tests | Commit |
|------|-------|-----------|--------|
| 0 | (research) | 0 | none |
| 1 | models/property_warnings.py | 9 | models |
| 2 | config.py | 0 | config |
| 3 | services/foundation_risk.py | 19 | foundation service |
| 4 | services/property_warnings.py | 20 | warnings service |
| 5 | api/address.py | 3 | endpoint |
| 6 | types/api.ts, services/api.ts | 3 | frontend API |
| 7 | PropertyWarningsCard.tsx | 10 | warnings component |
| 8 | AttentionSummary.tsx | 8 | attention summary |
| 9 | en.json, nl.json | 0 | i18n |
| 10 | App.tsx | 0 | integration |
| 11 | (verification) | 0 | fixups |
| **Total** | | **~72** | **9 commits** |

Final test counts: Backend 353+ (baseline 321 + 51 new), Frontend 359+ (baseline 338 + 21 new).
