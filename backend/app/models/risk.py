from enum import Enum

from pydantic import BaseModel


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    unavailable = "unavailable"


class SeverityLevel(str, Enum):
    good = "good"
    moderate = "moderate"
    poor = "poor"
    critical = "critical"
    unavailable = "unavailable"


class NoiseRiskCard(BaseModel):
    level: RiskLevel
    lden_db: float | None = None
    source: str
    source_date: str | None = None
    sampled_at: str
    layer: str | None = None
    message: str | None = None
    score: int | None = None
    severity: SeverityLevel | None = None
    summary: str | None = None
    summary_nl: str | None = None


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
    score: int | None = None
    severity: SeverityLevel | None = None
    summary: str | None = None
    summary_nl: str | None = None


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
    score: int | None = None
    severity: SeverityLevel | None = None
    summary: str | None = None
    summary_nl: str | None = None


class SunlightRiskCard(BaseModel):
    level: SeverityLevel = SeverityLevel.unavailable
    winter_hours: float | None = None
    summer_hours: float | None = None
    equinox_hours: float | None = None
    svf_percent: float | None = None
    source: str
    source_date: str | None = None
    score: int | None = None
    svf_score: int | None = None
    severity: SeverityLevel | None = None
    summary: str | None = None
    summary_nl: str | None = None


class RiskCardsResponse(BaseModel):
    address_id: str
    noise: NoiseRiskCard
    air_quality: AirQualityRiskCard
    climate_stress: ClimateStressRiskCard
    sunlight: SunlightRiskCard | None = None


class ComparisonPattern(str, Enum):
    solid = "solid"
    dashed = "dashed"


class RiskComparisonRow(BaseModel):
    label_code: str
    value: int
    pattern: ComparisonPattern = ComparisonPattern.solid
    source: str | None = None
    source_date: str | None = None


class RiskComparisonsResponse(BaseModel):
    address_id: str
    noise: list[RiskComparisonRow]
    air_quality: list[RiskComparisonRow]
    climate_stress: list[RiskComparisonRow]
    sunlight: list[RiskComparisonRow]
    generated_at: str


class ViewingQuestion(BaseModel):
    text_en: str
    text_nl: str


class QuestionCategory(BaseModel):
    name: str
    name_nl: str
    severity: str
    questions: list[ViewingQuestion]


class ViewingQuestionsResponse(BaseModel):
    address_id: str
    categories: list[QuestionCategory]
