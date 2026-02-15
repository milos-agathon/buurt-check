"""Pydantic models for property warnings (foundation, erfpacht, VvE, asbestos)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class FoundationRisk(BaseModel):
    level: Literal["high", "medium", "low", "unavailable"]
    construction_year: int | None = None
    soil_type: str | None = None
    subsidence_rate_mm_per_year: float | None = None
    messages: list[str] = Field(default_factory=list)


class ErfpachtWarning(BaseModel):
    detected: bool
    confidence: Literal["confirmed", "municipality_based"] | None = None
    municipality: str | None = None
    messages: list[str] = Field(default_factory=list)


class VvEInfo(BaseModel):
    is_apartment: bool
    num_units: int | None = None
    messages: list[str] = Field(default_factory=list)


class AsbestosWarning(BaseModel):
    flagged: bool
    construction_year: int | None = None
    messages: list[str] = Field(default_factory=list)


class LeadPipeWarning(BaseModel):
    flagged: bool
    construction_year: int | None = None
    messages: list[str] = Field(default_factory=list)


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
    lead_pipe: LeadPipeWarning = Field(
        default_factory=lambda: LeadPipeWarning(flagged=False)
    )
