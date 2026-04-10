import asyncio
import logging
import math
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

import httpx

from app.cache.redis import cache_get
from app.config import settings
from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    NoiseRiskCard,
    RiskCardsResponse,
    RiskLevel,
    SeverityLevel,
    SunlightRiskCard,
)
from app.services.scoring import (
    air_summary,
    climate_summary,
    noise_summary,
    normalize_air_score,
    normalize_climate_score,
    normalize_noise_score,
    severity_from_score,
)

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None
_client_loop_id: int | None = None

_alo_layers_cache: tuple[float, list[str]] | None = None
_gcn_layers_cache: tuple[float, list[str]] | None = None
_climate_layers_cache: tuple[float, set[str]] | None = None

_LAYER_CACHE_TTL_SECONDS = 24 * 60 * 60
SUNLIGHT_METHOD_VERSION = "sunlight-v2-interval-dayweighted"


@dataclass(frozen=True)
class ClimateLayerSpec:
    """Curated Klimaateffectatlas layer contract.

    Each layer below is intentionally classified only through documented keys
    for that layer family. Unknown numeric fields are treated as schema drift,
    not as generic risk scores.
    """

    name: str
    sample_type: Literal["raster", "vector"]
    expected_property_keys: tuple[str, ...]
    unit_scale: str
    thresholds: tuple[float, float] | None
    source: str
    rationale: str

    def __iter__(self):
        # Backward-compatible unpacking for older tests/utilities.
        yield self.name
        yield self.sample_type


# Klimaateffectatlas is highly regional; keep this to 10 curated layers only (PRD guidance).
_CLIMATE_HEAT_LAYERS: list[ClimateLayerSpec] = [
    ClimateLayerSpec(
        name="wpn:s0149_hittestress_warme_nachten_huidig",
        sample_type="raster",
        expected_property_keys=("GRAY_INDEX",),
        unit_scale="0-1 heat-stress index",
        thresholds=(0.65, 0.8),
        source="Klimaateffectatlas WPN heat stress layer",
        rationale="National warm-night heat-stress index; higher values mean more heat stress.",
    ),
    ClimateLayerSpec(
        name="zh:1821_pzh_ouderenenhitte",
        sample_type="vector",
        expected_property_keys=("urgentie", "klasse", "risico", "hitte"),
        unit_scale="Dutch qualitative urgency class",
        thresholds=None,
        source="Klimaateffectatlas Zuid-Holland elderly heat layer",
        rationale="Text classes encode heat urgency for elderly residents.",
    ),
    ClimateLayerSpec(
        name="twn_klimaatatlas:1830_twn_hitte_percentage_ouderen",
        sample_type="vector",
        expected_property_keys=("percentage", "percentage_ouderen", "ouderen", "perc_ouder"),
        unit_scale="percent elderly heat exposure",
        thresholds=(15.0, 25.0),
        source="Klimaateffectatlas Twente elderly heat layer",
        rationale="Higher percentage of exposed older residents increases heat vulnerability.",
    ),
    ClimateLayerSpec(
        name="maastricht_klimaatatlas:1811_maastricht_hitte_urgentiekaart",
        sample_type="vector",
        expected_property_keys=("urgentie", "klasse", "hitte"),
        unit_scale="Dutch qualitative urgency class",
        thresholds=None,
        source="Klimaateffectatlas Maastricht heat urgency layer",
        rationale="Text classes encode heat urgency.",
    ),
    ClimateLayerSpec(
        name="haarlemmermeer_klimaatatlas:1815_haarlemmermeer_risico_hitte",
        sample_type="vector",
        expected_property_keys=("risico", "klasse", "hitte"),
        unit_scale="Dutch qualitative risk class",
        thresholds=None,
        source="Klimaateffectatlas Haarlemmermeer heat risk layer",
        rationale="Text classes encode local heat risk.",
    ),
]

_CLIMATE_WATER_LAYERS: list[ClimateLayerSpec] = [
    ClimateLayerSpec(
        name="mra_klimaatatlas:1826_mra_overstromingskans_20cm",
        sample_type="vector",
        expected_property_keys=(
            "klasse_20",
            "klasse_50",
            "klasse_200",
            "klasse_0",
            "overstromi",
            "overstro_1",
            "overstro_2",
            "overstro_3",
        ),
        unit_scale="flood probability/impact class",
        thresholds=(1.0, 2.0),
        source="Klimaateffectatlas MRA flood probability layer",
        rationale="Class values encode increasing flood probability or impact.",
    ),
    ClimateLayerSpec(
        name="wpn:s0149_wateroverlast_wpn",
        sample_type="vector",
        expected_property_keys=("GRIDCODE", "gridcode", "ror"),
        unit_scale="water-nuisance class",
        thresholds=(1.0, 2.0),
        source="Klimaateffectatlas WPN water nuisance layer",
        rationale="Grid classes encode increasing water nuisance.",
    ),
    ClimateLayerSpec(
        name="etten:gr1_t100",
        sample_type="vector",
        expected_property_keys=("GRIDCODE", "gridcode", "diepte"),
        unit_scale="rainfall depth/class",
        thresholds=(0.1, 0.3),
        source="Klimaateffectatlas Etten T100 rainfall layer",
        rationale="Depth classes encode modeled pluvial flooding.",
    ),
    ClimateLayerSpec(
        name="mra_klimaatatlas:1826_mra_begaanbaarheid_wegen_70mm",
        sample_type="vector",
        expected_property_keys=("Begaanbaar", "begaanbaar", "begaanbaarheid"),
        unit_scale="road passability class",
        thresholds=None,
        source="Klimaateffectatlas MRA road passability layer",
        rationale="Text classes encode passability during 70 mm rainfall.",
    ),
    ClimateLayerSpec(
        name="rotterdam_klimaatatlas:1842_rotterdam_begaanbaarheid_wegen",
        sample_type="vector",
        expected_property_keys=("Begaanbaar", "begaanbaar", "begaanbaarheid"),
        unit_scale="road passability class",
        thresholds=None,
        source="Klimaateffectatlas Rotterdam road passability layer",
        rationale="Text classes encode road passability.",
    ),
]

# GeoServer metadata for curated Klimaateffectatlas layers is inconsistent:
# some layers expose a machine-readable created/modified timestamp, others do
# not. Use the atlas publication year as a stable provenance fallback whenever
# the layer identifier itself is undated.
_CLIMATE_PUBLICATION_YEAR_FALLBACKS: dict[str, str] = {
    "wpn:s0149_hittestress_warme_nachten_huidig": "2024",
    "zh:1821_pzh_ouderenenhitte": "2024",
    "twn_klimaatatlas:1830_twn_hitte_percentage_ouderen": "2024",
    "maastricht_klimaatatlas:1811_maastricht_hitte_urgentiekaart": "2024",
    "haarlemmermeer_klimaatatlas:1815_haarlemmermeer_risico_hitte": "2024",
    "mra_klimaatatlas:1826_mra_overstromingskans_20cm": "2024",
    "wpn:s0149_wateroverlast_wpn": "2024",
    "etten:gr1_t100": "2024",
    "mra_klimaatatlas:1826_mra_begaanbaarheid_wegen_70mm": "2024",
    "rotterdam_klimaatatlas:1842_rotterdam_begaanbaarheid_wegen": "2024",
}


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


def _resolve_climate_layer_date(layer_name: str | None) -> str | None:
    if not layer_name:
        return None
    return _extract_layer_date(layer_name) or _CLIMATE_PUBLICATION_YEAR_FALLBACKS.get(
        layer_name
    )


def _risk_from_threshold(value: float, low_max: float, medium_max: float) -> RiskLevel:
    if not math.isfinite(value):
        return RiskLevel.unavailable
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


def _normalize_card_warnings(card: Any) -> None:
    warnings = list(getattr(card, "warnings", []) or [])
    message = getattr(card, "message", None)
    if message and message not in warnings:
        warnings.append(message)
    card.warnings = warnings


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
        "bbox": f"{rd_x - 5},{rd_y - 5},{rd_x + 5},{rd_y + 5},EPSG:28992",
        "srsName": "EPSG:28992",
        "count": "5",
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
    if len(features) == 1:
        return features[0].get("properties") or {}

    containing: list[tuple[dict[str, Any], float]] = []
    for feat in features:
        geom = feat.get("geometry")
        if _geometry_contains_point(geom, rd_x, rd_y):
            containing.append((feat, _bbox_area(feat.get("bbox"))))
    if containing:
        containing.sort(key=lambda item: item[1])
        return containing[0][0].get("properties") or {}

    # Multiple features: pick the one whose bbox centroid is closest to query point
    best: dict[str, Any] | None = None
    best_dist = float("inf")
    for feat in features:
        geom = feat.get("geometry")
        if not geom:
            continue
        bbox = feat.get("bbox")
        if bbox and len(bbox) >= 4:
            cx = (bbox[0] + bbox[2]) / 2
            cy = (bbox[1] + bbox[3]) / 2
        else:
            # Fallback: skip distance check, use first feature
            if best is None:
                best = feat.get("properties") or {}
            continue
        dist = (cx - rd_x) ** 2 + (cy - rd_y) ** 2
        if dist < best_dist:
            best_dist = dist
            best = feat.get("properties") or {}
    return best if best is not None else (features[0].get("properties") or {})


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
        if not math.isfinite(numeric):
            continue
        # Common no-data sentinel values in geospatial rasters.
        if numeric <= -999 or numeric >= 1e30:
            continue
        return numeric, key
    return None, None


def _spec_by_name(layer: str | None) -> ClimateLayerSpec | None:
    if layer is None:
        return None
    for spec in (*_CLIMATE_HEAT_LAYERS, *_CLIMATE_WATER_LAYERS):
        if spec.name == layer:
            return spec
    return None


def _property_value_for_keys(
    props: dict[str, Any],
    keys: tuple[str, ...],
) -> tuple[Any, str | None]:
    lower_to_key = {key.lower(): key for key in props}
    for expected in keys:
        actual = lower_to_key.get(expected.lower())
        if actual is not None:
            return props.get(actual), actual
    return None, None


def _qualitative_level_from_text(value: Any) -> tuple[RiskLevel, str | None]:
    if not isinstance(value, str):
        return RiskLevel.unavailable, None
    text = value.lower()
    if "zeer hoog" in text or "hoge urgentie" in text or "onbegaan" in text:
        return RiskLevel.high, value
    if "hoog" in text:
        return RiskLevel.high, value
    if "beperkt" in text or "kwetsbaar" in text or "matig" in text or "middel" in text:
        return RiskLevel.medium, value
    if "begaanbaar" in text or "laag" in text:
        return RiskLevel.low, value
    return RiskLevel.unavailable, None


def _sanitize_raster_value(
    value: float | None,
    *,
    min_value: float | None = None,
) -> float | None:
    if value is None:
        return None
    if not math.isfinite(value):
        return None
    if value <= -999 or value >= 1e30:
        return None
    if min_value is not None and value < min_value:
        return None
    return value


def _point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    if len(ring) < 3:
        return False
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        intersects = ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / (yj - yi) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def _point_in_polygon(x: float, y: float, rings: list[list[list[float]]]) -> bool:
    if not rings:
        return False
    if not _point_in_ring(x, y, rings[0]):
        return False
    for hole in rings[1:]:
        if _point_in_ring(x, y, hole):
            return False
    return True


def _geometry_contains_point(geometry: dict[str, Any] | None, x: float, y: float) -> bool:
    if not geometry:
        return False
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if not coords:
        return False
    if geom_type == "Polygon":
        return _point_in_polygon(x, y, coords)
    if geom_type in {"MultiPolygon", "MultiSurface"}:
        return any(_point_in_polygon(x, y, polygon) for polygon in coords)
    return False


def _bbox_area(bbox: list[float] | None) -> float:
    if bbox and len(bbox) >= 4:
        return abs((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]))
    return float("inf")


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

    spec = _spec_by_name(layer)
    if spec is None:
        return RiskLevel.unavailable, None, None

    if spec.name == "wpn:s0149_hittestress_warme_nachten_huidig":
        value, key = _property_value_for_keys(props, spec.expected_property_keys)
        if not isinstance(value, (int, float)):
            return RiskLevel.unavailable, None, None
        number = _sanitize_raster_value(float(value), min_value=0.0)
        if number is None or spec.thresholds is None:
            return RiskLevel.unavailable, None, None
        low_max, medium_max = spec.thresholds
        return _risk_from_threshold(number, low_max, medium_max), round(number, 3), "heat index"

    value, key = _property_value_for_keys(props, spec.expected_property_keys)
    level, signal = _qualitative_level_from_text(value)
    if level != RiskLevel.unavailable:
        return level, None, signal

    if isinstance(value, (int, float)) and spec.thresholds is not None:
        number = _sanitize_raster_value(float(value), min_value=0.0)
        if number is None:
            return RiskLevel.unavailable, None, None
        low_max, medium_max = spec.thresholds
        return _risk_from_threshold(number, low_max, medium_max), round(number, 2), key

    return RiskLevel.unavailable, None, None


def _classify_water_from_properties(
    props: dict[str, Any],
    layer: str | None = None,
) -> tuple[RiskLevel, float | None, str | None]:
    if not props:
        return RiskLevel.unavailable, None, None

    spec = _spec_by_name(layer)
    if spec is None:
        return RiskLevel.unavailable, None, None

    value, key = _property_value_for_keys(props, spec.expected_property_keys)
    level, signal = _qualitative_level_from_text(value)
    if level != RiskLevel.unavailable:
        return level, None, signal

    if not isinstance(value, (int, float)):
        return RiskLevel.unavailable, None, None
    numeric = _sanitize_raster_value(float(value), min_value=0.0)
    if numeric is None:
        return RiskLevel.unavailable, None, None

    key_l = (key or "").lower()
    if "diepte" in key_l:
        return _risk_from_threshold(numeric, 0.1, 0.3), round(numeric, 3), key
    if key_l == "ror":
        if numeric <= 2:
            return RiskLevel.low, numeric, key
        if numeric <= 4:
            return RiskLevel.medium, numeric, key
        return RiskLevel.high, numeric, key
    if key_l.startswith("overstro") or key_l == "overstromi":
        if numeric <= 0:
            return RiskLevel.low, numeric, key
        if numeric <= 1:
            return RiskLevel.medium, numeric, key
        return RiskLevel.high, numeric, key
    if spec.thresholds is None:
        return RiskLevel.unavailable, None, None
    low_max, medium_max = spec.thresholds
    return _risk_from_threshold(numeric, low_max, medium_max), numeric, key


async def _build_noise_card(rd_x: float, rd_y: float, sampled_at: str) -> NoiseRiskCard:
    try:
        layer_names = await _get_alo_layers()
        layer = _select_noise_layer(layer_names)
        if layer is None:
            return NoiseRiskCard(
                level=RiskLevel.unavailable,
                source="RIVM (Dutch National Health Institute)",
                sampled_at=sampled_at,
                message="NOISE_LAYER_UNAVAILABLE",
            )

        props = await _sample_wms_properties(settings.rivm_alo_wms_base, layer, rd_x, rd_y)
        value = None
        if props:
            raw = props.get("GRAY_INDEX")
            if isinstance(raw, (int, float)):
                value = _sanitize_raster_value(float(raw), min_value=0.0)

        if value is None:
            return NoiseRiskCard(
                level=RiskLevel.unavailable,
                source="RIVM (Dutch National Health Institute)",
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
            source="RIVM (Dutch National Health Institute)",
            source_date=_extract_layer_date(layer),
            sampled_at=sampled_at,
            layer=layer,
        )
    except Exception:
        return NoiseRiskCard(
            level=RiskLevel.unavailable,
            source="RIVM (Dutch National Health Institute)",
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
                pm25_value = _sanitize_raster_value(float(props[pm25_layer]), min_value=0.0)
            elif props:
                pm25_value, _ = _extract_numeric(props)
                pm25_value = _sanitize_raster_value(pm25_value, min_value=0.0)
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
                no2_value = _sanitize_raster_value(float(props[no2_layer]), min_value=0.0)
            elif props:
                no2_value, _ = _extract_numeric(props)
                no2_value = _sanitize_raster_value(no2_value, min_value=0.0)
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
            source="RIVM (Dutch National Health Institute)",
            source_date=source_date,
            sampled_at=sampled_at,
            pm25_layer=pm25_layer,
            no2_layer=no2_layer,
            message=message,
        )
    except Exception:
        return AirQualityRiskCard(
            level=RiskLevel.unavailable,
            source="RIVM (Dutch National Health Institute)",
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
        warnings: list[str] = []
        for spec in _CLIMATE_HEAT_LAYERS:
            if spec.name not in available_layers:
                continue
            try:
                props = await _sample_climate_layer(
                    spec.name,
                    spec.sample_type,
                    rd_x,
                    rd_y,
                )
            except Exception:
                continue
            level, value, signal = _classify_heat_from_properties(props or {}, spec.name)
            if level == RiskLevel.unavailable:
                if props and "CLIMATE_LAYER_UNMAPPED" not in warnings:
                    warnings.append("CLIMATE_LAYER_UNMAPPED")
                continue
            if _level_rank(level) > _level_rank(heat_level):
                heat_level = level
                heat_value = value
                heat_signal = signal
                heat_layer_used = spec.name

        water_level = RiskLevel.unavailable
        water_value: float | None = None
        water_signal: str | None = None
        water_layer_used: str | None = None
        for spec in _CLIMATE_WATER_LAYERS:
            if spec.name not in available_layers:
                continue
            try:
                props = await _sample_climate_layer(
                    spec.name,
                    spec.sample_type,
                    rd_x,
                    rd_y,
                )
            except Exception:
                continue
            level, value, signal = _classify_water_from_properties(
                props or {},
                spec.name,
            )
            if level == RiskLevel.unavailable:
                if props and "CLIMATE_LAYER_UNMAPPED" not in warnings:
                    warnings.append("CLIMATE_LAYER_UNMAPPED")
                continue
            if _level_rank(level) > _level_rank(water_level):
                water_level = level
                water_value = value
                water_signal = signal
                water_layer_used = spec.name

        overall = _max_level([heat_level, water_level])

        message = None
        if overall == RiskLevel.unavailable:
            message = "CLIMATE_NO_DATA"
        elif heat_level == RiskLevel.unavailable or water_level == RiskLevel.unavailable:
            message = "CLIMATE_PARTIAL"

        source_date = _resolve_climate_layer_date(
            heat_layer_used
        ) or _resolve_climate_layer_date(water_layer_used)

        return ClimateStressRiskCard(
            level=overall,
            heat_value=heat_value,
            heat_level=heat_level,
            water_value=water_value,
            water_level=water_level,
            source="Klimaateffectatlas (Dutch Climate Atlas)",
            source_date=source_date,
            sampled_at=sampled_at,
            heat_layer=heat_layer_used,
            water_layer=water_layer_used,
            heat_signal=heat_signal,
            water_signal=water_signal,
            message=message,
            warnings=warnings,
        )
    except Exception:
        return ClimateStressRiskCard(
            level=RiskLevel.unavailable,
            source="Klimaateffectatlas (Dutch Climate Atlas)",
            sampled_at=sampled_at,
            message="CLIMATE_LOOKUP_FAILED",
        )


_PER_CARD_TIMEOUT_SECONDS = 18.0


def _noise_timeout_card(sampled_at: str) -> NoiseRiskCard:
    """Return an unavailable noise card for timeout scenarios."""
    return NoiseRiskCard(
        level=RiskLevel.unavailable,
        source="RIVM (Dutch National Health Institute)",
        sampled_at=sampled_at,
        message="NOISE_TIMEOUT",
    )


def _air_timeout_card(sampled_at: str) -> AirQualityRiskCard:
    """Return an unavailable air quality card for timeout scenarios."""
    return AirQualityRiskCard(
        level=RiskLevel.unavailable,
        source="RIVM (Dutch National Health Institute)",
        sampled_at=sampled_at,
        message="AIR_TIMEOUT",
    )


def _climate_timeout_card(sampled_at: str) -> ClimateStressRiskCard:
    """Return an unavailable climate card for timeout scenarios."""
    return ClimateStressRiskCard(
        level=RiskLevel.unavailable,
        source="Klimaateffectatlas (Dutch Climate Atlas)",
        sampled_at=sampled_at,
        message="CLIMATE_TIMEOUT",
    )


async def _build_card_with_timeout(
    coro,
    timeout_card,
    card_name: str,
):
    """Wrap a card-builder coroutine in a per-card timeout.

    If the coroutine exceeds *_PER_CARD_TIMEOUT_SECONDS*, log a warning and
    return *timeout_card* (an unavailable card) instead of propagating the
    TimeoutError.  This ensures that slow external APIs degrade one card at a
    time while the other cards still return data.
    """
    try:
        return await asyncio.wait_for(coro, timeout=_PER_CARD_TIMEOUT_SECONDS)
    except TimeoutError:
        logger.warning(
            "risk_card_timeout card=%s timeout=%.1fs",
            card_name,
            _PER_CARD_TIMEOUT_SECONDS,
        )
        return timeout_card


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

    start = time.monotonic()
    noise_card, air_card, climate_card = await asyncio.gather(
        _build_card_with_timeout(
            _build_noise_card(rd_x, rd_y, sampled_at),
            _noise_timeout_card(sampled_at),
            "noise",
        ),
        _build_card_with_timeout(
            _build_air_card(rd_x, rd_y, sampled_at),
            _air_timeout_card(sampled_at),
            "air",
        ),
        _build_card_with_timeout(
            _build_climate_card(rd_x, rd_y, sampled_at),
            _climate_timeout_card(sampled_at),
            "climate",
        ),
    )
    total_ms = (time.monotonic() - start) * 1000

    logger.info(
        "risk_cards vbo=%s noise=%s air=%s climate=%s total_ms=%.0f",
        vbo_id,
        noise_card.level.value,
        air_card.level.value,
        climate_card.level.value,
        total_ms,
    )

    noise_score = normalize_noise_score(noise_card.lden_db)
    noise_card.score = noise_score
    noise_card.severity = (
        severity_from_score(noise_score)
        if noise_score is not None
        else SeverityLevel.unavailable
    )
    noise_en, noise_nl = noise_summary(noise_score, noise_card.lden_db)
    noise_card.summary = noise_en
    noise_card.summary_nl = noise_nl

    air_score = normalize_air_score(air_card.pm25_ug_m3, air_card.no2_ug_m3)
    air_card.score = air_score
    air_card.severity = (
        severity_from_score(air_score)
        if air_score is not None
        else SeverityLevel.unavailable
    )
    air_en, air_nl = air_summary(air_score, air_card.pm25_ug_m3, air_card.no2_ug_m3)
    air_card.summary = air_en
    air_card.summary_nl = air_nl

    climate_score = normalize_climate_score(
        climate_card.heat_level.value,
        climate_card.water_level.value,
    )
    climate_card.score = climate_score
    climate_card.severity = (
        severity_from_score(climate_score)
        if climate_score is not None
        else SeverityLevel.unavailable
    )
    climate_en, climate_nl = climate_summary(
        climate_score,
        climate_card.heat_level.value,
        climate_card.water_level.value,
    )
    climate_card.summary = climate_en
    climate_card.summary_nl = climate_nl

    _normalize_card_warnings(noise_card)
    _normalize_card_warnings(air_card)
    _normalize_card_warnings(climate_card)

    sunlight_card: SunlightRiskCard | None = None
    cached_sunlight = await cache_get(f"sunlight:{vbo_id}")
    if isinstance(cached_sunlight, dict):
        try:
            sunlight_card = SunlightRiskCard(**cached_sunlight)
            if sunlight_card.method_version != SUNLIGHT_METHOD_VERSION:
                sunlight_card = None
        except Exception:
            sunlight_card = None

    return RiskCardsResponse(
        address_id=vbo_id,
        noise=noise_card,
        air_quality=air_card,
        climate_stress=climate_card,
        sunlight=sunlight_card,
    )
