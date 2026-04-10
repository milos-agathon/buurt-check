from typing import Literal

from pydantic import BaseModel


class CrimeStatsCard(BaseModel):
    scope: Literal["buurt", "gemeente"] = "buurt"
    area_code: str | None = None
    area_name: str | None = None
    population: float | None = None
    population_source: str | None = None
    population_year: int | None = None
    population_is_estimate: bool | None = None
    total_per_1000: float | None = None
    national_per_1000: float | None = None
    national_population_source: str | None = None
    national_population_year: int | None = None
    national_population_is_estimate: bool | None = None
    burglary_per_1000: float | None = None
    violent_per_1000: float | None = None
    yearly_period: str | None = None
    monthly_total_per_1000: float | None = None
    monthly_period: str | None = None
    total_count: float | None = None
    burglary_count: float | None = None
    violent_count: float | None = None
    monthly_total_count: float | None = None
    score: int | None = None
    severity: str | None = None
    meaning_en: str | None = None
    meaning_nl: str | None = None
    source: str = "CBS (Statistics Netherlands)"
    source_date: str | None = None
    message: str | None = None


class TierBResponse(BaseModel):
    address_id: str
    crime: CrimeStatsCard
