"""Pydantic models for Leefbaarometer livability data."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class LivabilityDimension(BaseModel):
    name: Literal["physical", "safety", "social", "amenities", "housing"]
    raw_score: int = Field(..., ge=1, le=9)
    normalized_score: int = Field(..., ge=0, le=100)
    label_code: str  # i18n key: "livability.dimension.physical"


class LivabilityTrendPoint(BaseModel):
    year: str  # "2002", "2008", ..., "2024"
    overall_score: int = Field(..., ge=1, le=9)
    overall_normalized: int = Field(..., ge=0, le=100)
    dimensions: list[LivabilityDimension] = Field(default_factory=list)


class LivabilityComparisonRow(BaseModel):
    level: Literal["buurt", "wijk", "gemeente"]
    name: str
    overall_score: int = Field(..., ge=1, le=9)
    overall_normalized: int = Field(..., ge=0, le=100)
    dimensions: list[LivabilityDimension] = Field(default_factory=list)


class LivabilityComparison(BaseModel):
    """Container for comparison rows."""

    rows: list[LivabilityComparisonRow] = Field(default_factory=list)


class LivabilityResponse(BaseModel):
    available: bool = True
    buurt_code: str = ""
    buurt_name: str = ""
    gemeente: str = ""
    year: str = ""
    overall_score: int = Field(default=1, ge=1, le=9)
    overall_normalized: int = Field(default=0, ge=0, le=100)
    dimensions: list[LivabilityDimension] = Field(default_factory=list)
    trend: list[LivabilityTrendPoint] = Field(default_factory=list)
    comparison: list[LivabilityComparisonRow] = Field(default_factory=list)
    source: str = "Leefbaarometer 3.0, Ministerie van BZK"
    source_date: str | None = None
    messages: list[str] = Field(default_factory=list)
