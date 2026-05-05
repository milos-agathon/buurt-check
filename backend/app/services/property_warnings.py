"""Property warnings aggregation — foundation, erfpacht, VvE, asbestos."""
from __future__ import annotations

import logging

from app.config import settings
from app.models.property_warnings import (
    AsbestosWarning,
    AttentionFlag,
    AttentionSummary,
    ErfpachtWarning,
    LeadPipeWarning,
    PropertyWarningsResponse,
    SharedBuildingInfo,
    VvEInfo,
)
from app.services import bag, foundation_risk
from app.services.scoring import severity_from_score

logger = logging.getLogger(__name__)


def build_attention_summary(
    *,
    risk_scores: dict[str, int | None],
    foundation_level: str,
    erfpacht_detected: bool,
    is_apartment: bool,
    shared_building_detected: bool = False,
    construction_year: int | None,
) -> AttentionSummary:
    """Build attention summary from all available signals."""
    flags: list[AttentionFlag] = []

    category_labels = {
        "noise": "noise risk",
        "air_quality": "air quality risk",
        "climate": "climate risk",
        "climate_stress": "climate stress risk",
        "sunlight": "sunlight risk",
    }
    severity_labels = {
        "critical": "Critical",
        "poor": "Poor",
        "moderate": "Moderate",
    }
    assessed = 0
    for cat, score in risk_scores.items():
        if score is None:
            continue
        assessed += 1
        severity = severity_from_score(score).value
        if severity == "good":
            continue
        flags.append(
            AttentionFlag(
                category=cat,
                severity=severity,
                label=f"{severity_labels[severity]} {category_labels.get(cat, cat)}",
            )
        )

    # Foundation risk
    if foundation_level == "high":
        flags.append(
            AttentionFlag(
                category="foundation",
                severity="poor",
                label="High foundation risk",
            )
        )
    elif foundation_level == "medium":
        flags.append(
            AttentionFlag(
                category="foundation",
                severity="moderate",
                label="Foundation risk needs verification",
            )
        )

    # Erfpacht
    if erfpacht_detected:
        flags.append(
            AttentionFlag(
                category="erfpacht",
                severity="info",
                label="Erfpacht common in this municipality - verify status",
            )
        )

    # VvE — flagged for apartments
    if is_apartment:
        flags.append(
            AttentionFlag(
                category="vve",
                severity="info",
                label="VvE (owners' association) — review financials",
            )
        )

    # Asbestos awareness follows the same pre-1994 era threshold as the main card.
    if construction_year is not None and construction_year < 1994:
        flags.append(
            AttentionFlag(
                category="asbestos",
                severity="info",
                label="Pre-1994 building — asbestos awareness",
            )
        )

    # Multiple addressable units in one BAG pand can be apartments, split houses,
    # or semi-detached homes. Treat it as a boundary/geometry note, not VvE proof.
    if shared_building_detected and not is_apartment:
        flags.append(
            AttentionFlag(
                category="shared_building",
                severity="info",
                label="BAG building contains multiple address units - verify property scope",
            )
        )

    return AttentionSummary(
        flag_count=len(flags),
        flags=flags,
        risk_categories_assessed=assessed,
        risk_categories_total=len(risk_scores),
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
    # Self-serve missing building facts from BAG when client didn't supply them
    if construction_year is None or num_units is None:
        try:
            facts = await bag.get_building_facts(vbo_id)
            if facts:
                if construction_year is None:
                    construction_year = facts.construction_year
                if num_units is None:
                    num_units = facts.num_units
        except Exception:
            logger.warning("BAG fallback fetch failed for vbo_id=%s", vbo_id)

    # Foundation risk (async — calls external APIs)
    fr = await foundation_risk.get_foundation_risk(
        construction_year, rd_x, rd_y, municipality=municipality
    )

    # Erfpacht detection (sync — municipality list lookup)
    # Normalize municipality input (strip + casefold) to match case-insensitively
    # against the configured list. This prevents cache poisoning when the first
    # request uses a non-canonical casing (e.g. "amsterdam" vs "Amsterdam").
    mu_norm = municipality.strip().casefold() if municipality else None
    erfpacht_detected = mu_norm is not None and any(
        m.casefold() == mu_norm for m in settings.erfpacht_municipalities
    )
    erfpacht = ErfpachtWarning(
        detected=erfpacht_detected,
        confidence="municipality_based" if erfpacht_detected else None,
        municipality=municipality.strip() if erfpacht_detected and municipality else None,
        scope="municipality",
        verified_property_level=False,
        messages=["ERFPACHT_NOTE_MUNICIPALITY_ONLY"] if erfpacht_detected else [],
    )

    # VvE detection requires stronger evidence than BAG's addressable-unit count.
    # A multi-VBO pand may be a semi-detached house or split farmhouse, so keep
    # the VvE signal off until a property-type source is available.
    is_apartment = False
    vve = VvEInfo(
        is_apartment=is_apartment,
        num_units=num_units if is_apartment else None,
    )
    shared_building_detected = num_units is not None and num_units > 1
    shared_building = SharedBuildingInfo(
        detected=shared_building_detected,
        num_addressable_units=num_units if shared_building_detected else None,
        messages=["BAG_MULTI_UNIT_BUILDING"] if shared_building_detected else [],
    )

    # Asbestos flag (sync — construction year threshold)
    asbestos_flagged = construction_year is not None and construction_year < 1994
    asbestos = AsbestosWarning(
        flagged=asbestos_flagged,
        construction_year=construction_year if asbestos_flagged else None,
    )

    # Lead pipe proxy (construction year < 1960)
    lead_pipe_flagged = construction_year is not None and construction_year < 1960
    lead_pipe = LeadPipeWarning(
        flagged=lead_pipe_flagged,
        construction_year=construction_year if lead_pipe_flagged else None,
        messages=["LEAD_PIPE_PRE_1960"] if lead_pipe_flagged else [],
    )

    # Attention summary — property-level signals only (risk scores not available here)
    attention = build_attention_summary(
        risk_scores={},
        foundation_level=fr.level,
        erfpacht_detected=erfpacht_detected,
        is_apartment=is_apartment,
        shared_building_detected=shared_building_detected,
        construction_year=construction_year,
    )
    if lead_pipe_flagged:
        attention.flags.append(
            AttentionFlag(
                category="lead_pipe",
                severity="info",
                label="Lead pipe risk (pre-1960 construction)",
            )
        )
        attention.flag_count = len(attention.flags)

    return PropertyWarningsResponse(
        address_id=vbo_id,
        attention_summary=attention,
        foundation_risk=fr,
        erfpacht=erfpacht,
        vve=vve,
        shared_building=shared_building,
        asbestos=asbestos,
        lead_pipe=lead_pipe,
    )
