"""Reusable deterministic dossier scenarios for Epic 4 QA suites."""

from __future__ import annotations

from copy import deepcopy
from datetime import date
from typing import Any

from app.services.latex_env import (
    compile_latex_to_pdf,
    format_preparation_date,
    render_brief,
    render_dossier,
)

SCENARIOS: tuple[tuple[str, str], ...] = (
    ("full", "en"),
    ("full", "nl"),
    ("partial", "en"),
    ("partial", "nl"),
)

_FIXED_DATE = date(2026, 3, 2)


def _full_risks() -> dict[str, Any]:
    return {
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
            "water_value": 1.0,
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
            "source": "3DBAG + SunCalc",
            "source_date": "2024",
            "score": 72,
            "severity": "good",
            "summary": "Good sunlight access from south-facing facade.",
            "summary_nl": "Goede zonlichttoegang via gevel op het zuiden.",
        },
    }


def _full_neighborhood() -> dict[str, Any]:
    return {
        "buurt_code": "BU03630000",
        "buurt_name": "Burgwallen-Oude Zijde",
        "gemeente_name": "Amsterdam",
        "population_density": {"value": 15234, "unit": "per km2", "available": True},
        "avg_household_size": {"value": 1.6, "available": True},
        "single_person_pct": {"value": 68.2, "available": True},
        "owner_occupied_pct": {"value": 22.1, "available": True},
        "avg_property_value": {"value": "385,000", "available": True},
        "distance_to_train_km": {"value": 0.8, "available": True},
        "distance_to_supermarket_km": {"value": 0.3, "available": True},
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
        "source": "Leefbaarometer",
        "source_date": "2024",
    }


def _full_tier_b() -> dict[str, Any]:
    return {
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
            "confidence": "municipality based",
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
        "vbo_id": "0363010012345678",
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
        "risk_comparisons": None,
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
        kwargs["neighborhood"] = None
        kwargs["livability"] = None
        kwargs["tier_b"] = None
        kwargs["property_warnings"] = None
        kwargs["viewing_questions"] = None

    return kwargs


def render_dossier_pdf(kind: str, language: str, *, timeout: int = 30) -> bytes:
    tex_source = render_dossier(**dossier_kwargs(kind, language))
    return compile_latex_to_pdf(tex_source, timeout=timeout, passes=2)


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
