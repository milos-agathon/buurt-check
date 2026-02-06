from enum import Enum

from pydantic import BaseModel


class UrbanizationLevel(str, Enum):
    very_urban = "very_urban"
    urban = "urban"
    moderate = "moderate"
    rural = "rural"
    very_rural = "very_rural"
    unknown = "unknown"


class AgeProfile(BaseModel):
    age_0_24: float | None = None
    age_25_64: float | None = None
    age_65_plus: float | None = None


class NeighborhoodIndicator(BaseModel):
    value: float | str | None = None
    unit: str | None = None
    available: bool = True


class NeighborhoodStats(BaseModel):
    buurt_code: str
    buurt_name: str | None = None
    gemeente_name: str | None = None
    population_density: NeighborhoodIndicator
    avg_household_size: NeighborhoodIndicator
    single_person_pct: NeighborhoodIndicator
    age_profile: AgeProfile
    owner_occupied_pct: NeighborhoodIndicator
    avg_property_value: NeighborhoodIndicator
    distance_to_train_km: NeighborhoodIndicator
    distance_to_supermarket_km: NeighborhoodIndicator
    urbanization: UrbanizationLevel = UrbanizationLevel.unknown


class NeighborhoodStatsResponse(BaseModel):
    address_id: str
    stats: NeighborhoodStats | None = None
    source: str = "CBS Wijken & Buurten 2024"
    source_year: int = 2024
    message: str | None = None
