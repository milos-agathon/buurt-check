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
            flags.append(
                AttentionFlag(
                    category=cat,
                    severity="critical",
                    label=f"Critical {category_labels.get(cat, cat)}",
                )
            )
        elif score < 50:
            flags.append(
                AttentionFlag(
                    category=cat,
                    severity="elevated",
                    label=f"Elevated {category_labels.get(cat, cat)}",
                )
            )

    # Foundation risk
    if foundation_level == "high":
        flags.append(
            AttentionFlag(
                category="foundation",
                severity="high",
                label="High foundation risk",
            )
        )
    elif foundation_level == "medium":
        flags.append(
            AttentionFlag(
                category="foundation",
                severity="medium",
                label="Foundation risk needs verification",
            )
        )

    # Erfpacht
    if erfpacht_detected:
        flags.append(
            AttentionFlag(
                category="erfpacht",
                severity="info",
                label="Erfpacht (ground lease) detected",
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

    # Asbestos — flagged only for pre-1980 (extensive structural use)
    if construction_year is not None and construction_year < 1980:
        flags.append(
            AttentionFlag(
                category="asbestos",
                severity="info",
                label="Pre-1980 building — asbestos risk in structural materials",
            )
        )

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

    # Lead pipe proxy (construction year < 1960)
    lead_pipe_flagged = construction_year is not None and construction_year < 1960
    lead_pipe = LeadPipeWarning(
        flagged=lead_pipe_flagged,
        construction_year=construction_year if lead_pipe_flagged else None,
        messages=["LEAD_PIPE_PRE_1960"] if lead_pipe_flagged else [],
    )

    # Attention summary — includes lead pipe flag
    flags: list[AttentionFlag] = []
    if lead_pipe_flagged:
        flags.append(
            AttentionFlag(
                category="lead_pipe",
                severity="info",
                label="Lead pipe risk (pre-1960 construction)",
            )
        )

    attention = AttentionSummary(
        flag_count=len(flags),
        flags=flags,
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
        lead_pipe=lead_pipe,
    )
