from enum import Enum

from pydantic import BaseModel


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    unavailable = "unavailable"


class NoiseRiskCard(BaseModel):
    level: RiskLevel
    lden_db: float | None = None
    source: str
    source_date: str | None = None
    sampled_at: str
    layer: str | None = None
    message: str | None = None


class AirQualityRiskCard(BaseModel):
    level: RiskLevel
    pm25_ug_m3: float | None = None
    no2_ug_m3: float | None = None
    pm25_level: RiskLevel = RiskLevel.unavailable
    no2_level: RiskLevel = RiskLevel.unavailable
    source: str
    source_date: str | None = None
    sampled_at: str
    pm25_layer: str | None = None
    no2_layer: str | None = None
    message: str | None = None


class ClimateStressRiskCard(BaseModel):
    level: RiskLevel
    heat_value: float | None = None
    heat_level: RiskLevel = RiskLevel.unavailable
    water_value: float | None = None
    water_level: RiskLevel = RiskLevel.unavailable
    source: str
    source_date: str | None = None
    sampled_at: str
    heat_layer: str | None = None
    water_layer: str | None = None
    heat_signal: str | None = None
    water_signal: str | None = None
    message: str | None = None


class RiskCardsResponse(BaseModel):
    address_id: str
    noise: NoiseRiskCard
    air_quality: AirQualityRiskCard
    climate_stress: ClimateStressRiskCard
