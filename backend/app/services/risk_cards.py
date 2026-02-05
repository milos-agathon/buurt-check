import asyncio
import re
import time
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from typing import Any

import httpx

from app.config import settings
from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    NoiseRiskCard,
    RiskCardsResponse,
    RiskLevel,
)

_client: httpx.AsyncClient | None = None
_client_loop_id: int | None = None

_alo_layers_cache: tuple[float, list[str]] | None = None
_gcn_layers_cache: tuple[float, list[str]] | None = None
_climate_layers_cache: tuple[float, set[str]] | None = None

_LAYER_CACHE_TTL_SECONDS = 24 * 60 * 60

# Klimaateffectatlas is highly regional; keep this to 10 curated layers only (PRD guidance).
_CLIMATE_HEAT_LAYERS: list[tuple[str, str]] = [
    # National raster coverage
    ("wpn:s0149_hittestress_warme_nachten_huidig", "raster"),
    # Regional enrichments
    ("zh:1821_pzh_ouderenenhitte", "vector"),
    ("twn_klimaatatlas:1830_twn_hitte_percentage_ouderen", "vector"),
    ("maastricht_klimaatatlas:1811_maastricht_hitte_urgentiekaart", "vector"),
    ("haarlemmermeer_klimaatatlas:1815_haarlemmermeer_risico_hitte", "vector"),
]

_CLIMATE_WATER_LAYERS: list[tuple[str, str]] = [
    # National-ish polygon layer with broad NL coverage
    ("mra_klimaatatlas:1826_mra_overstromingskans_20cm", "vector"),
    # National `wpn:` fallback for compatibility with existing atlas namespace
    ("wpn:s0149_wateroverlast_wpn", "vector"),
    # Regional enrichments
    ("etten:gr1_t100", "vector"),
    ("mra_klimaatatlas:1826_mra_begaanbaarheid_wegen_70mm", "vector"),
    ("rotterdam_klimaatatlas:1842_rotterdam_begaanbaarheid_wegen", "vector"),
]


def _get_client() -> httpx.AsyncClient:
    global _client, _client_loop_id
    loop_id = id(asyncio.get_running_loop())
    if _client is None or _client.is_closed or _client_loop_id != loop_id:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=4.0))
        _client_loop_id = loop_id
    return _client


def _utc_now_iso_date() -> str:
    return datetime.now(UTC).date().isoformat()


def _extract_layer_date(layer_name: str | None) -> str | None:
    if not layer_name:
        return None

    m_full = re.search(r"(\d{8})", layer_name)
    if m_full:
        raw = m_full.group(1)
        return f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"

    m_year = re.search(r"(?<!\d)(20\d{2})(?!\d)", layer_name)
    if m_year:
        return m_year.group(1)

    return None


def _risk_from_threshold(value: float, low_max: float, medium_max: float) -> RiskLevel:
    if value <= low_max:
        return RiskLevel.low
    if value <= medium_max:
        return RiskLevel.medium
    return RiskLevel.high


def _level_rank(level: RiskLevel) -> int:
    return {
        RiskLevel.unavailable: 0,
        RiskLevel.low: 1,
        RiskLevel.medium: 2,
        RiskLevel.high: 3,
    }[level]


def _max_level(levels: list[RiskLevel]) -> RiskLevel:
    if not levels:
        return RiskLevel.unavailable
    return max(levels, key=_level_rank)


def _parse_wms_layer_names(xml_text: str) -> list[str]:
    root = ET.fromstring(xml_text)
    names: list[str] = []
    for elem in root.iter():
        if elem.tag.split("}")[-1] == "Name" and elem.text:
            names.append(elem.text.strip())
    return names


async def _fetch_wms_layer_names(base_url: str) -> list[str]:
    client = _get_client()
    resp = await client.get(
        base_url,
        params={"service": "WMS", "request": "GetCapabilities"},
    )
    resp.raise_for_status()
    return _parse_wms_layer_names(resp.text)


async def _get_alo_layers() -> list[str]:
    global _alo_layers_cache
    now = time.monotonic()
    if _alo_layers_cache and now - _alo_layers_cache[0] < _LAYER_CACHE_TTL_SECONDS:
        return _alo_layers_cache[1]

    layers = await _fetch_wms_layer_names(settings.rivm_alo_wms_base)
    _alo_layers_cache = (now, layers)
    return layers


async def _get_gcn_layers() -> list[str]:
    global _gcn_layers_cache
    now = time.monotonic()
    if _gcn_layers_cache and now - _gcn_layers_cache[0] < _LAYER_CACHE_TTL_SECONDS:
        return _gcn_layers_cache[1]

    layers = await _fetch_wms_layer_names(settings.rivm_gcn_wms_base)
    _gcn_layers_cache = (now, layers)
    return layers


async def _get_climate_layer_names() -> set[str]:
    global _climate_layers_cache
    now = time.monotonic()
    if _climate_layers_cache and now - _climate_layers_cache[0] < _LAYER_CACHE_TTL_SECONDS:
        return _climate_layers_cache[1]

    client = _get_client()
    resp = await client.get(settings.climate_atlas_layers_index)
    resp.raise_for_status()
    data = resp.json()
    names = {
        item["name"]
        for item in data.get("layers", {}).get("layer", [])
        if isinstance(item, dict) and isinstance(item.get("name"), str)
    }
    _climate_layers_cache = (now, names)
    return names


async def _sample_wms_properties(
    base_url: str,
    layer: str,
    rd_x: float,
    rd_y: float,
) -> dict[str, Any] | None:
    client = _get_client()

    params = {
        "service": "WMS",
        "version": "1.3.0",
        "request": "GetFeatureInfo",
        "layers": layer,
        "query_layers": layer,
        "crs": "EPSG:28992",
        "bbox": f"{rd_x - 25},{rd_y - 25},{rd_x + 25},{rd_y + 25}",
        "width": "101",
        "height": "101",
        "i": "50",
        "j": "50",
        "info_format": "application/json",
        "feature_count": "1",
    }

    resp = await client.get(base_url, params=params)
    resp.raise_for_status()
    if "application/json" not in (resp.headers.get("content-type") or ""):
        return None

    data = resp.json()
    features = data.get("features") or []
    if not features:
        return None
    return features[0].get("properties") or {}


async def _sample_wfs_properties(layer: str, rd_x: float, rd_y: float) -> dict[str, Any] | None:
    client = _get_client()
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": layer,
        "bbox": f"{rd_x - 300},{rd_y - 300},{rd_x + 300},{rd_y + 300},EPSG:28992",
        "srsName": "EPSG:28992",
        "count": "1",
        "outputFormat": "application/json",
    }
    resp = await client.get(settings.climate_atlas_wms_base, params=params)
    resp.raise_for_status()
    if "application/json" not in (resp.headers.get("content-type") or ""):
        return None
    data = resp.json()
    features = data.get("features") or []
    if not features:
        return None
    return features[0].get("properties") or {}


def _extract_numeric(
    props: dict[str, Any],
    *,
    ignore_key_patterns: tuple[str, ...] = ("id", "code", "shape", "fid"),
) -> tuple[float | None, str | None]:
    for key, value in props.items():
        if not isinstance(value, (int, float)):
            continue
        key_l = key.lower()
        if any(pattern in key_l for pattern in ignore_key_patterns):
            continue
        numeric = float(value)
        # Common no-data sentinel values in geospatial rasters.
        if numeric <= -9990 or numeric >= 1e30:
            continue
        return numeric, key
    return None, None


def _select_noise_layer(layer_names: list[str]) -> str | None:
    pattern = re.compile(r"^rivm_(\d{8})_[Gg]eluid_lden_wegverkeer_\d{4}$")
    matches: list[tuple[str, str]] = []
    for layer in set(layer_names):
        m = pattern.match(layer)
        if m:
            matches.append((m.group(1), layer))
    if matches:
        matches.sort()
        return matches[-1][1]

    fallback = [
        layer for layer in set(layer_names)
        if "geluid_lden_wegverkeer" in layer.lower()
    ]
    dated = [layer for layer in fallback if re.search(r"\d{8}", layer)]
    if dated:
        return sorted(dated)[-1]
    return sorted(fallback)[-1] if fallback else None


def _select_air_layer(layer_names: list[str], pollutant: str) -> str | None:
    pollutant = pollutant.upper()
    pattern = re.compile(rf"^conc_{pollutant}_(20\d{{2}})$")
    matches: list[tuple[int, str]] = []
    for layer in set(layer_names):
        m = pattern.match(layer)
        if m:
            matches.append((int(m.group(1)), layer))
    if matches:
        matches.sort()
        return matches[-1][1]

    fallback = [
        layer for layer in set(layer_names)
        if f"conc_{pollutant.lower()}" in layer.lower()
    ]
    return sorted(fallback)[-1] if fallback else None


def _classify_heat_from_properties(
    props: dict[str, Any],
    layer: str,
) -> tuple[RiskLevel, float | None, str | None]:
    if not props:
        return RiskLevel.unavailable, None, None

    layer_lower = layer.lower()
    text_values = " ".join(
        str(v).lower() for v in props.values() if isinstance(v, str)
    )

    if "hittestress_warme_nachten_huidig" in layer_lower:
        value = props.get("GRAY_INDEX")
        if isinstance(value, (int, float)):
            number = float(value)
            if number <= -9990 or number >= 1e30:
                return RiskLevel.unavailable, None, None
            return _risk_from_threshold(number, 0.65, 0.8), round(number, 3), "heat index"

    if "zeer hoog" in text_values or "hoge urgentie" in text_values:
        return RiskLevel.high, None, "very high"
    if "hoog" in text_values:
        return RiskLevel.high, None, "high"
    if "matig" in text_values or "middel" in text_values:
        return RiskLevel.medium, None, "moderate"
    if "laag" in text_values:
        return RiskLevel.low, None, "low"

    value, key = _extract_numeric(props)
    if value is None:
        return RiskLevel.unavailable, None, None

    key_l = (key or "").lower()
    if "score" in key_l or "broos" in key_l or "ouder" in key_l:
        level = _risk_from_threshold(value, 15.0, 25.0)
        return level, round(value, 2), key

    if 0.0 <= value <= 1.0:
        level = _risk_from_threshold(value, 0.65, 0.8)
        return level, round(value, 3), key

    level = _risk_from_threshold(value, 10.0, 20.0)
    return level, round(value, 2), key


def _classify_water_from_properties(
    props: dict[str, Any],
) -> tuple[RiskLevel, float | None, str | None]:
    if not props:
        return RiskLevel.unavailable, None, None

    for key, value in props.items():
        if "begaan" not in key.lower() or not isinstance(value, str):
            continue
        text = value.lower()
        if "onbegaan" in text:
            return RiskLevel.high, None, value
        if "beperkt" in text or "kwetsbaar" in text:
            return RiskLevel.medium, None, value
        if "begaanbaar" in text:
            return RiskLevel.low, None, value

    for key in ("klasse_20", "klasse_50", "klasse_200", "klasse_0"):
        value = props.get(key)
        if not isinstance(value, (int, float)):
            continue
        klasse = float(value)
        if klasse <= 1:
            return RiskLevel.low, klasse, key
        if klasse <= 2:
            return RiskLevel.medium, klasse, key
        return RiskLevel.high, klasse, key

    for key in ("overstromi", "overstro_1", "overstro_2", "overstro_3"):
        value = props.get(key)
        if not isinstance(value, (int, float)):
            continue
        numeric = float(value)
        if numeric <= 0:
            return RiskLevel.low, numeric, key
        if numeric <= 1:
            return RiskLevel.medium, numeric, key
        return RiskLevel.high, numeric, key

    label_text = " ".join(
        str(v).lower() for v in props.values() if isinstance(v, str)
    )
    if "<" in label_text and "100 duizend" in label_text:
        return RiskLevel.low, None, "low impact label"
    if "1 miljoen" in label_text or "zeer hoog" in label_text:
        return RiskLevel.high, None, "high impact label"
    if "100 duizend" in label_text or "hoog" in label_text:
        return RiskLevel.medium, None, "medium impact label"

    if isinstance(props.get("GRIDCODE"), (int, float)):
        grid = float(props["GRIDCODE"])
        if grid <= 1:
            return RiskLevel.low, grid, "GRIDCODE"
        if grid == 2:
            return RiskLevel.medium, grid, "GRIDCODE"
        return RiskLevel.high, grid, "GRIDCODE"

    if isinstance(props.get("ror"), (int, float)):
        ror = float(props["ror"])
        if ror <= 2:
            return RiskLevel.low, ror, "ror"
        if ror <= 4:
            return RiskLevel.medium, ror, "ror"
        return RiskLevel.high, ror, "ror"

    value, key = _extract_numeric(props)
    if value is None:
        return RiskLevel.unavailable, None, None

    if "diepte" in (key or "").lower():
        level = _risk_from_threshold(value, 0.1, 0.3)
        return level, round(value, 3), key

    level = _risk_from_threshold(value, 1.0, 2.0)
    return level, round(value, 2), key


async def _build_noise_card(rd_x: float, rd_y: float, sampled_at: str) -> NoiseRiskCard:
    try:
        layer_names = await _get_alo_layers()
        layer = _select_noise_layer(layer_names)
        if layer is None:
            return NoiseRiskCard(
                level=RiskLevel.unavailable,
                source="RIVM / Atlas Leefomgeving WMS",
                sampled_at=sampled_at,
                message="NOISE_LAYER_UNAVAILABLE",
            )

        props = await _sample_wms_properties(settings.rivm_alo_wms_base, layer, rd_x, rd_y)
        value = None
        if props:
            raw = props.get("GRAY_INDEX")
            if isinstance(raw, (int, float)):
                number = float(raw)
                if -9990 < number < 1e30:
                    value = number

        if value is None:
            return NoiseRiskCard(
                level=RiskLevel.unavailable,
                source="RIVM / Atlas Leefomgeving WMS",
                source_date=_extract_layer_date(layer),
                sampled_at=sampled_at,
                layer=layer,
                message="NOISE_NO_VALUE",
            )

        # Noise thresholds — WHO Environmental Noise Guidelines for the
        # European Region (2018).  Lden 53 dB: onset of adverse health effects;
        # 63 dB: high annoyance threshold.
        # Ref: https://www.who.int/publications/i/item/9789289053563
        level = _risk_from_threshold(value, 53.0, 63.0)
        return NoiseRiskCard(
            level=level,
            lden_db=round(value, 1),
            source="RIVM / Atlas Leefomgeving WMS",
            source_date=_extract_layer_date(layer),
            sampled_at=sampled_at,
            layer=layer,
        )
    except Exception:
        return NoiseRiskCard(
            level=RiskLevel.unavailable,
            source="RIVM / Atlas Leefomgeving WMS",
            sampled_at=sampled_at,
            message="NOISE_LOOKUP_FAILED",
        )


async def _build_air_card(rd_x: float, rd_y: float, sampled_at: str) -> AirQualityRiskCard:
    try:
        layer_names = await _get_gcn_layers()
        pm25_layer = _select_air_layer(layer_names, "PM25")
        no2_layer = _select_air_layer(layer_names, "NO2")

        pm25_value: float | None = None
        pm25_level = RiskLevel.unavailable
        if pm25_layer:
            props = await _sample_wms_properties(settings.rivm_gcn_wms_base, pm25_layer, rd_x, rd_y)
            if props and isinstance(props.get(pm25_layer), (int, float)):
                pm25_value = float(props[pm25_layer])
            elif props:
                pm25_value, _ = _extract_numeric(props)
            if pm25_value is not None:
                # PM2.5 — WHO Global Air Quality Guidelines (2021).
                # AQG level: 5 µg/m³; interim target 4: 10 µg/m³.
                # Ref: https://www.who.int/publications/i/item/9789240034228
                pm25_level = _risk_from_threshold(pm25_value, 5.0, 10.0)

        no2_value: float | None = None
        no2_level = RiskLevel.unavailable
        if no2_layer:
            props = await _sample_wms_properties(settings.rivm_gcn_wms_base, no2_layer, rd_x, rd_y)
            if props and isinstance(props.get(no2_layer), (int, float)):
                no2_value = float(props[no2_layer])
            elif props:
                no2_value, _ = _extract_numeric(props)
            if no2_value is not None:
                # NO2 — WHO Global Air Quality Guidelines (2021).
                # AQG level: 10 µg/m³; interim target 4: 20 µg/m³.
                no2_level = _risk_from_threshold(no2_value, 10.0, 20.0)

        level = _max_level([pm25_level, no2_level])
        message = None
        if pm25_level == RiskLevel.unavailable and no2_level == RiskLevel.unavailable:
            message = "AIR_NO_VALUE"
        elif pm25_level == RiskLevel.unavailable or no2_level == RiskLevel.unavailable:
            message = "AIR_PARTIAL"

        source_date = _extract_layer_date(pm25_layer) or _extract_layer_date(no2_layer)

        return AirQualityRiskCard(
            level=level,
            pm25_ug_m3=round(pm25_value, 2) if pm25_value is not None else None,
            no2_ug_m3=round(no2_value, 2) if no2_value is not None else None,
            pm25_level=pm25_level,
            no2_level=no2_level,
            source="RIVM GCN WMS",
            source_date=source_date,
            sampled_at=sampled_at,
            pm25_layer=pm25_layer,
            no2_layer=no2_layer,
            message=message,
        )
    except Exception:
        return AirQualityRiskCard(
            level=RiskLevel.unavailable,
            source="RIVM GCN WMS",
            sampled_at=sampled_at,
            message="AIR_LOOKUP_FAILED",
        )


async def _sample_climate_layer(
    layer: str,
    layer_type: str,
    rd_x: float,
    rd_y: float,
) -> dict[str, Any] | None:
    if layer_type == "raster":
        return await _sample_wms_properties(settings.climate_atlas_wms_base, layer, rd_x, rd_y)
    return await _sample_wfs_properties(layer, rd_x, rd_y)


async def _build_climate_card(rd_x: float, rd_y: float, sampled_at: str) -> ClimateStressRiskCard:
    try:
        available_layers = await _get_climate_layer_names()

        heat_level = RiskLevel.unavailable
        heat_value: float | None = None
        heat_signal: str | None = None
        heat_layer_used: str | None = None
        for layer, layer_type in _CLIMATE_HEAT_LAYERS:
            if layer not in available_layers:
                continue
            try:
                props = await _sample_climate_layer(layer, layer_type, rd_x, rd_y)
            except Exception:
                continue
            level, value, signal = _classify_heat_from_properties(props or {}, layer)
            if level == RiskLevel.unavailable:
                continue
            if _level_rank(level) > _level_rank(heat_level):
                heat_level = level
                heat_value = value
                heat_signal = signal
                heat_layer_used = layer

        water_level = RiskLevel.unavailable
        water_value: float | None = None
        water_signal: str | None = None
        water_layer_used: str | None = None
        for layer, layer_type in _CLIMATE_WATER_LAYERS:
            if layer not in available_layers:
                continue
            try:
                props = await _sample_climate_layer(layer, layer_type, rd_x, rd_y)
            except Exception:
                continue
            level, value, signal = _classify_water_from_properties(props or {})
            if level == RiskLevel.unavailable:
                continue
            if _level_rank(level) > _level_rank(water_level):
                water_level = level
                water_value = value
                water_signal = signal
                water_layer_used = layer

        overall = _max_level([heat_level, water_level])

        message = None
        if overall == RiskLevel.unavailable:
            message = "CLIMATE_NO_DATA"
        elif heat_level == RiskLevel.unavailable or water_level == RiskLevel.unavailable:
            message = "CLIMATE_PARTIAL"

        source_date = (
            _extract_layer_date(heat_layer_used)
            or _extract_layer_date(water_layer_used)
            or sampled_at
        )

        return ClimateStressRiskCard(
            level=overall,
            heat_value=heat_value,
            heat_level=heat_level,
            water_value=water_value,
            water_level=water_level,
            source="Klimaateffectatlas WMS/WFS",
            source_date=source_date,
            sampled_at=sampled_at,
            heat_layer=heat_layer_used,
            water_layer=water_layer_used,
            heat_signal=heat_signal,
            water_signal=water_signal,
            message=message,
        )
    except Exception:
        return ClimateStressRiskCard(
            level=RiskLevel.unavailable,
            source="Klimaateffectatlas WMS/WFS",
            sampled_at=sampled_at,
            message="CLIMATE_LOOKUP_FAILED",
        )


async def get_risk_cards(
    *,
    vbo_id: str,
    rd_x: float,
    rd_y: float,
    lat: float,
    lng: float,
) -> RiskCardsResponse:
    """Fetch F3 risk cards for a resolved address location."""
    _ = (lat, lng)  # reserved for future climate layer selection by geographic extent
    sampled_at = _utc_now_iso_date()

    noise_card, air_card, climate_card = await asyncio.gather(
        _build_noise_card(rd_x, rd_y, sampled_at),
        _build_air_card(rd_x, rd_y, sampled_at),
        _build_climate_card(rd_x, rd_y, sampled_at),
    )

    return RiskCardsResponse(
        address_id=vbo_id,
        noise=noise_card,
        air_quality=air_card,
        climate_stress=climate_card,
    )
