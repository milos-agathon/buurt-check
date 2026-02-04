from typing import Any

from pydantic import BaseModel, Field


class BuildingFacts(BaseModel):
    pand_id: str
    construction_year: int | None = None
    status: str | None = None
    status_en: str | None = None
    intended_use: list[str] = Field(default_factory=list)
    intended_use_en: list[str] = Field(default_factory=list)
    num_units: int | None = None
    floor_area_m2: int | None = None
    footprint_geojson: dict[str, Any] | None = None
    document_date: str | None = None


class BuildingFactsResponse(BaseModel):
    address_id: str
    building: BuildingFacts | None = None
    message: str | None = None
