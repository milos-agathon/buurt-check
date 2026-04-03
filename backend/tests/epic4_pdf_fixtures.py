"""Reusable deterministic dossier scenarios for Epic 4 QA suites."""

from __future__ import annotations

import base64
import io
from copy import deepcopy
from datetime import date
from typing import Any
from unittest.mock import patch

from PIL import Image, ImageDraw

from app.models.livability import LivabilityResponse
from app.models.neighborhood import NeighborhoodStats
from app.models.property_warnings import PropertyWarningsResponse
from app.models.report import ProvenanceData
from app.models.risk import RiskCardsResponse, RiskComparisonsResponse, ViewingQuestionsResponse
from app.models.tier_b import TierBResponse
from app.services.latex_env import (
    compile_latex_to_pdf,
    format_preparation_date,
    render_brief,
)
from app.services.pdf_export import generate_full_dossier

SCENARIOS: tuple[tuple[str, str], ...] = (
    ("full", "en"),
    ("full", "nl"),
    ("partial", "en"),
    ("partial", "nl"),
)

_FIXED_DATE = date(2026, 3, 2)
_ADDRESS_ID = "0363010012345678"


class _FrozenDate(date):
    """Freeze date.today() so PDF fixtures stay deterministic."""

    @classmethod
    def today(cls) -> "_FrozenDate":
        return cls(_FIXED_DATE.year, _FIXED_DATE.month, _FIXED_DATE.day)


def _shadow_snapshot_png_b64(
    *,
    sky_rgb: tuple[int, int, int],
    ground_rgb: tuple[int, int, int],
    shadow_rgb: tuple[int, int, int],
    sun_center: tuple[int, int],
    target_shadow: list[tuple[int, int]],
    ambient_shadows: list[list[tuple[int, int]]],
) -> str:
    image = Image.new("RGB", (320, 180), sky_rgb)
    draw = ImageDraw.Draw(image)

    draw.rectangle((0, 104, 320, 180), fill=ground_rgb)
    draw.rectangle((0, 100, 320, 104), fill=(210, 219, 228))

    for x in range(-20, 340, 36):
        draw.line((x, 124, x + 16, 180), fill=(198, 206, 214), width=2)

    sun_x, sun_y = sun_center
    draw.ellipse(
        (sun_x - 13, sun_y - 13, sun_x + 13, sun_y + 13),
        fill=(250, 212, 110),
        outline=(238, 186, 58),
        width=2,
    )

    left_mass = (28, 84, 96, 140)
    right_mass = (228, 90, 290, 142)
    target_mass = (128, 66, 194, 134)

    for polygon in ambient_shadows:
        draw.polygon(polygon, fill=shadow_rgb)

    draw.rectangle(left_mass, fill=(154, 165, 178), outline=(111, 123, 138), width=2)
    draw.rectangle(right_mass, fill=(168, 178, 190), outline=(122, 132, 145), width=2)
    draw.polygon(target_shadow, fill=shadow_rgb)
    draw.rectangle(target_mass, fill=(228, 233, 239), outline=(46, 196, 182), width=4)

    for x in (145, 168):
        draw.rectangle((x, 82, x + 12, 98), fill=(187, 210, 230), outline=(111, 123, 138))
    draw.rectangle((153, 108, 171, 134), fill=(137, 147, 162), outline=(96, 107, 121))
    draw.line((128, 100, 194, 100), fill=(170, 181, 194), width=2)

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _seasonal_top_shadow_images() -> list[dict[str, Any]]:
    return [
        {
            "hour": 12,
            "label": "winter",
            "image_b64": _shadow_snapshot_png_b64(
                sky_rgb=(216, 232, 244),
                ground_rgb=(231, 235, 240),
                shadow_rgb=(137, 152, 171),
                sun_center=(256, 34),
                target_shadow=[(194, 132), (240, 132), (300, 174), (224, 174)],
                ambient_shadows=[
                    [(96, 138), (140, 138), (210, 174), (150, 174)],
                    [(290, 140), (320, 144), (320, 180), (252, 180)],
                ],
            ),
            "viewpoint": "winter",
            "sun_azimuth": 165.0,
            "sun_altitude": 15.0,
        },
        {
            "hour": 12,
            "label": "equinox",
            "image_b64": _shadow_snapshot_png_b64(
                sky_rgb=(244, 233, 178),
                ground_rgb=(232, 226, 201),
                shadow_rgb=(145, 145, 132),
                sun_center=(210, 26),
                target_shadow=[(194, 132), (228, 132), (256, 164), (208, 164)],
                ambient_shadows=[
                    [(96, 138), (126, 138), (168, 166), (126, 166)],
                    [(228, 142), (290, 142), (320, 162), (264, 162)],
                ],
            ),
            "viewpoint": "equinox",
            "sun_azimuth": 180.0,
            "sun_altitude": 38.0,
        },
        {
            "hour": 12,
            "label": "summer",
            "image_b64": _shadow_snapshot_png_b64(
                sky_rgb=(239, 208, 170),
                ground_rgb=(228, 215, 188),
                shadow_rgb=(151, 136, 118),
                sun_center=(160, 22),
                target_shadow=[(194, 132), (214, 132), (232, 150), (202, 150)],
                ambient_shadows=[
                    [(96, 138), (116, 138), (140, 154), (112, 154)],
                    [(228, 142), (280, 142), (302, 154), (258, 154)],
                ],
            ),
            "viewpoint": "summer",
            "sun_azimuth": 195.0,
            "sun_altitude": 60.0,
        },
    ]


def _seasonal_facade_shadow_images() -> list[dict[str, Any]]:
    return [
        {
            "hour": 12,
            "label": "equinox_front",
            "image_b64": _shadow_snapshot_png_b64(
                sky_rgb=(245, 236, 191),
                ground_rgb=(234, 228, 206),
                shadow_rgb=(145, 145, 132),
                sun_center=(212, 28),
                target_shadow=[(194, 132), (228, 132), (260, 166), (208, 166)],
                ambient_shadows=[
                    [(96, 138), (128, 138), (172, 166), (126, 166)],
                    [(228, 142), (290, 142), (320, 160), (264, 160)],
                ],
            ),
            "viewpoint": "front",
            "season": "equinox",
            "sun_azimuth": 180.0,
            "sun_altitude": 38.0,
        },
        {
            "hour": 12,
            "label": "equinox_rear",
            "image_b64": _shadow_snapshot_png_b64(
                sky_rgb=(245, 236, 191),
                ground_rgb=(232, 227, 203),
                shadow_rgb=(141, 141, 129),
                sun_center=(108, 28),
                target_shadow=[(128, 132), (164, 132), (196, 164), (146, 164)],
                ambient_shadows=[
                    [(28, 142), (86, 142), (118, 162), (66, 162)],
                    [(194, 138), (226, 138), (266, 166), (220, 166)],
                ],
            ),
            "viewpoint": "rear",
            "season": "equinox",
            "sun_azimuth": 180.0,
            "sun_altitude": 38.0,
        },
        {
            "hour": 12,
            "label": "summer_front",
            "image_b64": _shadow_snapshot_png_b64(
                sky_rgb=(239, 208, 170),
                ground_rgb=(228, 215, 188),
                shadow_rgb=(151, 136, 118),
                sun_center=(164, 22),
                target_shadow=[(194, 132), (214, 132), (232, 150), (202, 150)],
                ambient_shadows=[
                    [(96, 138), (116, 138), (142, 154), (112, 154)],
                    [(228, 142), (280, 142), (304, 154), (258, 154)],
                ],
            ),
            "viewpoint": "front",
            "season": "summer",
            "sun_azimuth": 195.0,
            "sun_altitude": 60.0,
        },
        {
            "hour": 12,
            "label": "summer_rear",
            "image_b64": _shadow_snapshot_png_b64(
                sky_rgb=(239, 208, 170),
                ground_rgb=(227, 214, 186),
                shadow_rgb=(147, 133, 116),
                sun_center=(126, 22),
                target_shadow=[(150, 132), (170, 132), (188, 150), (158, 150)],
                ambient_shadows=[
                    [(30, 142), (82, 142), (106, 154), (60, 154)],
                    [(194, 138), (214, 138), (240, 154), (210, 154)],
                ],
            ),
            "viewpoint": "rear",
            "season": "summer",
            "sun_azimuth": 195.0,
            "sun_altitude": 60.0,
        },
        {
            "hour": 12,
            "label": "winter_front",
            "image_b64": _shadow_snapshot_png_b64(
                sky_rgb=(216, 232, 244),
                ground_rgb=(231, 235, 240),
                shadow_rgb=(137, 152, 171),
                sun_center=(256, 34),
                target_shadow=[(194, 132), (242, 132), (306, 176), (224, 176)],
                ambient_shadows=[
                    [(96, 138), (142, 138), (214, 176), (152, 176)],
                    [(290, 140), (320, 144), (320, 180), (250, 180)],
                ],
            ),
            "viewpoint": "front",
            "season": "winter",
            "sun_azimuth": 165.0,
            "sun_altitude": 15.0,
        },
        {
            "hour": 12,
            "label": "winter_rear",
            "image_b64": _shadow_snapshot_png_b64(
                sky_rgb=(216, 232, 244),
                ground_rgb=(230, 234, 240),
                shadow_rgb=(132, 147, 168),
                sun_center=(74, 34),
                target_shadow=[(108, 132), (156, 132), (220, 176), (138, 176)],
                ambient_shadows=[
                    [(16, 142), (70, 142), (144, 178), (72, 178)],
                    [(194, 138), (240, 138), (312, 176), (250, 176)],
                ],
            ),
            "viewpoint": "rear",
            "season": "winter",
            "sun_azimuth": 165.0,
            "sun_altitude": 15.0,
        },
    ]


def _full_risks() -> dict[str, Any]:
    return {
        "address_id": _ADDRESS_ID,
        "noise": {
            "level": "medium",
            "lden_db": 58.3,
            "source": "RIVM - Atlas Leefomgeving",
            "source_date": "2024",
            "sampled_at": "2026-03-01T12:00:00Z",
            "score": 62,
            "severity": "moderate",
            "summary": "Moderate road traffic noise. Verify peak evening traffic.",
            "summary_nl": "Matig verkeerslawaai. Controleer piek in de avond.",
        },
        "air_quality": {
            "level": "low",
            "pm25_ug_m3": 9.2,
            "no2_ug_m3": 18.5,
            "pm25_level": "low",
            "no2_level": "low",
            "source": "RIVM - GCN",
            "source_date": "2024",
            "sampled_at": "2026-03-01T12:00:00Z",
            "score": 81,
            "severity": "good",
            "summary": "Air quality is good. PM2.5 and NO2 are within limits.",
            "summary_nl": "Luchtkwaliteit is goed. PM2.5 en NO2 zijn binnen de norm.",
        },
        "climate_stress": {
            "level": "medium",
            "heat_value": 2.5,
            "heat_level": "medium",
            "water_value": 1.0,
            "water_level": "low",
            "source": "Klimaateffectatlas",
            "source_date": "2023",
            "sampled_at": "2026-03-01T12:00:00Z",
            "score": 50,
            "severity": "moderate",
            "summary": "Moderate heat stress. Some flood risk in heavy rain.",
            "summary_nl": "Matige hittestress. Enig risico bij zware neerslag.",
        },
        "sunlight": {
            "level": "good",
            "winter_hours": 3.5,
            "summer_hours": 8.2,
            "equinox_hours": 5.4,
            "svf_percent": 63.0,
            "source": "3DBAG + SunCalc",
            "source_date": "2024",
            "score": 72,
            "svf_score": 63,
            "severity": "good",
            "summary": "Good sunlight access from a south-facing facade.",
            "summary_nl": "Goede zonlichttoegang via gevel op het zuiden.",
            "annual_average": 5.7,
            "ground_annual_average": 4.8,
            "svf_anisotropic": 59.0,
            "irradiance_kwh_m2": 915.0,
            "facade_results": [
                {
                    "orientation": "south",
                    "height_label": "3m",
                    "winter_hours": 4.0,
                    "summer_hours": 10.9,
                    "annual_average": 7.1,
                },
                {
                    "orientation": "east",
                    "height_label": "3m",
                    "winter_hours": 2.1,
                    "summer_hours": 8.0,
                    "annual_average": 5.0,
                },
            ],
        },
    }


def _full_risk_comparisons() -> dict[str, Any]:
    return {
        "address_id": _ADDRESS_ID,
        "noise": [
            {"label_code": "address", "value": 62},
            {"label_code": "city_avg", "value": 55},
            {"label_code": "nl_avg", "value": 60},
            {"label_code": "who_limit", "value": 74, "pattern": "dashed"},
        ],
        "air_quality": [
            {"label_code": "address", "value": 81},
            {"label_code": "city_avg", "value": 72},
            {"label_code": "nl_avg", "value": 76},
        ],
        "climate_stress": [
            {"label_code": "address", "value": 50},
            {"label_code": "city_avg", "value": 58},
            {"label_code": "adaptation_target", "value": 70, "pattern": "dashed"},
        ],
        "sunlight": [
            {"label_code": "address", "value": 72},
            {"label_code": "city_avg", "value": 64},
            {"label_code": "daylight_target", "value": 60, "pattern": "dashed"},
        ],
        "generated_at": "2026-03-02T12:00:00Z",
    }


def _full_neighborhood() -> dict[str, Any]:
    return {
        "buurt_code": "BU03630000",
        "buurt_name": "Burgwallen-Oude Zijde",
        "gemeente_name": "Amsterdam",
        "population_density": {
            "value": 15234,
            "unit": "per km2",
            "available": True,
            "quartile": 4,
        },
        "avg_household_size": {"value": 1.6, "available": True, "quartile": 1},
        "single_person_pct": {"value": 68.2, "available": True, "quartile": 4},
        "age_profile": {"age_0_24": 18.0, "age_25_64": 67.0, "age_65_plus": 15.0},
        "owner_occupied_pct": {"value": 22.1, "available": True, "quartile": 1},
        "avg_property_value": {"value": 385000, "available": True, "quartile": 4},
        "distance_to_train_km": {"value": 0.8, "available": True, "quartile": 1},
        "distance_to_supermarket_km": {"value": 0.3, "available": True, "quartile": 1},
        "urbanization": "very_urban",
    }


def _full_livability() -> dict[str, Any]:
    return {
        "available": True,
        "buurt_code": "BU03630000",
        "buurt_name": "Burgwallen-Oude Zijde",
        "gemeente": "Amsterdam",
        "year": "2024",
        "overall_score": 5,
        "overall_normalized": 50,
        "dimensions": [
            {
                "name": "physical",
                "raw_score": 6,
                "normalized_score": 63,
                "label_code": "livability.dimension.physical",
            },
            {
                "name": "safety",
                "raw_score": 3,
                "normalized_score": 25,
                "label_code": "livability.dimension.safety",
            },
            {
                "name": "social",
                "raw_score": 5,
                "normalized_score": 50,
                "label_code": "livability.dimension.social",
            },
            {
                "name": "amenities",
                "raw_score": 7,
                "normalized_score": 75,
                "label_code": "livability.dimension.amenities",
            },
            {
                "name": "housing",
                "raw_score": 4,
                "normalized_score": 38,
                "label_code": "livability.dimension.housing",
            },
        ],
        "trend": [
            {"year": "2018", "overall_score": 4, "overall_normalized": 44},
            {"year": "2022", "overall_score": 5, "overall_normalized": 48},
            {"year": "2024", "overall_score": 5, "overall_normalized": 50},
        ],
        "comparison": [
            {
                "level": "wijk",
                "name": "Centrum-West",
                "overall_score": 6,
                "overall_normalized": 58,
            },
            {
                "level": "gemeente",
                "name": "Amsterdam",
                "overall_score": 6,
                "overall_normalized": 61,
            },
        ],
        "source": "Leefbaarometer",
        "source_date": "2024",
    }


def _full_tier_b() -> dict[str, Any]:
    return {
        "address_id": _ADDRESS_ID,
        "crime": {
            "total_per_1000": 142.3,
            "national_per_1000": 52.1,
            "burglary_per_1000": 8.7,
            "violent_per_1000": 12.4,
            "yearly_period": "2024",
            "score": 28,
            "severity": "poor",
            "meaning_en": "Crime rate is above the national average.",
            "meaning_nl": "Criminaliteit ligt boven het landelijk gemiddelde.",
            "source": "CBS",
            "source_date": "2024",
        },
    }


def _full_property_warnings(language: str) -> dict[str, Any]:
    if language == "nl":
        foundation_messages = [
            "Gebouwd op kleigrond met houten palen uit deze bouwperiode.",
            "Plan een funderingsinspectie voor aankoop.",
        ]
        erfpacht_messages = [
            "Amsterdam gebruikt vaak erfpacht.",
            "Controleer canon en afkoopopties.",
        ]
        vve_messages = [
            "Vraag notulen en MJOP op.",
            "Controleer reservefonds en achterstallig onderhoud.",
        ]
        asbestos_messages = ["Gebouw is van voor 1994. Asbestinspectie aanbevolen."]
        lead_messages = ["Gebouw is van voor 1960. Loden leidingen zijn mogelijk."]
    else:
        foundation_messages = [
            "Built on clay soil with wooden piles common to this era.",
            "Schedule a foundation inspection before purchase.",
        ]
        erfpacht_messages = [
            "Amsterdam often applies ground lease.",
            "Check canon level and buyout options.",
        ]
        vve_messages = [
            "Request owners association minutes and maintenance plan.",
            "Review reserve fund adequacy.",
        ]
        asbestos_messages = ["Building predates 1994. Asbestos inspection advised."]
        lead_messages = ["Building predates 1960. Lead pipes may still be present."]

    return {
        "address_id": _ADDRESS_ID,
        "attention_summary": {
            "flag_count": 2,
            "flags": [
                {
                    "category": "foundation",
                    "severity": "moderate",
                    "label": "Moderate foundation risk",
                },
                {
                    "category": "asbestos",
                    "severity": "poor",
                    "label": "Asbestos risk",
                },
            ],
            "risk_categories_assessed": 4,
            "risk_categories_total": 4,
        },
        "foundation_risk": {
            "level": "medium",
            "construction_year": 1920,
            "soil_type": "clay",
            "messages": foundation_messages,
        },
        "erfpacht": {
            "detected": True,
            "confidence": "municipality_based",
            "municipality": "Amsterdam",
            "messages": erfpacht_messages,
        },
        "vve": {
            "is_apartment": True,
            "num_units": 12,
            "messages": vve_messages,
        },
        "asbestos": {
            "flagged": True,
            "construction_year": 1920,
            "messages": asbestos_messages,
        },
        "lead_pipe": {
            "flagged": True,
            "construction_year": 1920,
            "messages": lead_messages,
        },
    }


def _full_viewing_questions() -> dict[str, Any]:
    return {
        "categories": [
            {
                "name": "Noise",
                "name_nl": "Geluid",
                "severity": "moderate",
                "questions": [
                    {
                        "text_en": "Open a window facing the street. How loud is traffic?",
                        "text_nl": "Open een raam aan de straatkant. Hoe luid is het verkeer?",
                    },
                    {
                        "text_en": "Visit at multiple times to check noise variation.",
                        "text_nl": "Bezoek op meerdere tijdstippen voor geluidsverschillen.",
                    },
                ],
            },
            {
                "name": "Foundation",
                "name_nl": "Fundering",
                "severity": "poor",
                "questions": [
                    {
                        "text_en": "Check walls for cracks near windows and doors.",
                        "text_nl": "Controleer muren op scheuren bij ramen en deuren.",
                    },
                    {
                        "text_en": "Ask for the most recent foundation inspection report.",
                        "text_nl": "Vraag naar het meest recente funderingsrapport.",
                    },
                ],
            },
        ],
    }


def _full_provenance() -> dict[str, Any]:
    return {
        "report_id": "rpt-epic4-0001",
        "vbo_id": _ADDRESS_ID,
        "pand_id": "0363100012345678",
        "buurt_code": "BU03630000",
        "gemeente_name": "Amsterdam",
        "methodology_version": "v2.1 (2026-02-28)",
    }


def dossier_kwargs(kind: str, language: str) -> dict[str, Any]:
    if kind not in {"full", "partial"}:
        raise ValueError(f"Unsupported dossier scenario kind: {kind}")
    if language not in {"en", "nl"}:
        raise ValueError(f"Unsupported language: {language}")

    kwargs: dict[str, Any] = {
        "address": "Damrak 1, 1012 LG Amsterdam",
        "language": language,
        "building_year": 1920,
        "building_use": "Residential" if language == "en" else "Woonfunctie",
        "floor_area": 85,
        "preparation_date": format_preparation_date(_FIXED_DATE, language),
        "risks": _full_risks(),
        "sunlight_score": 72,
        "risk_comparisons": _full_risk_comparisons(),
        "neighborhood": _full_neighborhood(),
        "livability": _full_livability(),
        "tier_b": _full_tier_b(),
        "property_warnings": _full_property_warnings(language),
        "viewing_questions": _full_viewing_questions(),
        "provenance": _full_provenance(),
        "risk_grid_chart": None,
        "comparison_charts": None,
        "age_chart": None,
        "livability_chart": None,
        "shadow_images": None,
        "location_map": None,
    }

    if kind == "partial":
        kwargs = deepcopy(kwargs)
        kwargs["risks"]["sunlight"] = None
        kwargs["sunlight_score"] = None
        kwargs["risk_comparisons"] = None
        kwargs["neighborhood"] = None
        kwargs["livability"] = None
        kwargs["tier_b"] = None
        kwargs["property_warnings"] = None
        kwargs["viewing_questions"] = None

    return kwargs


def _full_dossier_kwargs(kind: str, language: str) -> dict[str, Any]:
    kwargs = dossier_kwargs(kind, language)
    risks = RiskCardsResponse.model_validate(kwargs["risks"])
    seasonal_facade_images = _seasonal_facade_shadow_images() if kind == "full" else None
    seasonal_top_images = _seasonal_top_shadow_images() if kind == "full" else None
    viewing_questions = None
    if kwargs["viewing_questions"] is not None:
        viewing_questions = ViewingQuestionsResponse.model_validate(
            {
                "address_id": _ADDRESS_ID,
                **kwargs["viewing_questions"],
            }
        )

    return {
        "address": kwargs["address"],
        "building_year": kwargs["building_year"],
        "building_use": kwargs["building_use"],
        "risks": risks,
        "sunlight_score": kwargs["sunlight_score"],
        "viewing_questions": viewing_questions,
        "shadow_image_b64": seasonal_top_images[0]["image_b64"] if seasonal_top_images else None,
        "language": language,
        "floor_area": kwargs["floor_area"],
        "neighborhood_stats": (
            NeighborhoodStats.model_validate(kwargs["neighborhood"])
            if kwargs["neighborhood"] is not None
            else None
        ),
        "tier_b": (
            TierBResponse.model_validate(kwargs["tier_b"])
            if kwargs["tier_b"] is not None
            else None
        ),
        "risk_comparisons": (
            RiskComparisonsResponse.model_validate(kwargs["risk_comparisons"])
            if kwargs["risk_comparisons"] is not None
            else None
        ),
        "property_warnings_data": (
            PropertyWarningsResponse.model_validate(kwargs["property_warnings"])
            if kwargs["property_warnings"] is not None
            else None
        ),
        "provenance": ProvenanceData.model_validate(kwargs["provenance"]),
        "location_map_b64": None,
        "livability": (
            LivabilityResponse.model_validate(kwargs["livability"])
            if kwargs["livability"] is not None
            else None
        ),
        "shadow_images": seasonal_facade_images,
        "shadow_equinox_b64": seasonal_top_images[1]["image_b64"] if seasonal_top_images else None,
        "shadow_summer_b64": seasonal_top_images[2]["image_b64"] if seasonal_top_images else None,
        "postcode": "1012LG",
        "footprint_geojson": None,
        "map_lat": 52.372,
        "map_lng": 4.892,
    }


def render_dossier_pdf(kind: str, language: str, *, timeout: int = 30) -> bytes:
    del timeout
    with patch("app.services.pdf_export.date", _FrozenDate):
        return generate_full_dossier(**_full_dossier_kwargs(kind, language))


def render_brief_pdf(language: str = "en", *, timeout: int = 30) -> bytes:
    kwargs = dossier_kwargs("full", language)
    tex_source = render_brief(
        address=kwargs["address"],
        language=language,
        building_year=kwargs["building_year"],
        building_use=kwargs["building_use"],
        floor_area=kwargs["floor_area"],
        preparation_date=kwargs["preparation_date"],
        risks=kwargs["risks"],
        sunlight_score=kwargs["sunlight_score"],
        risk_grid_chart=None,
        shadow_image=None,
        location_map=None,
        viewing_questions=kwargs["viewing_questions"],
    )
    return compile_latex_to_pdf(tex_source, timeout=timeout, passes=1)
