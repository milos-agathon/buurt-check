from pydantic import BaseModel


class EnergyLabelCard(BaseModel):
    label: str | None = None
    source: str = "EP-Online"
    source_date: str | None = None
    message: str | None = None


class CrimeStatsCard(BaseModel):
    total_per_1000: float | None = None
    burglary_per_1000: float | None = None
    violent_per_1000: float | None = None
    yearly_period: str | None = None
    monthly_total_per_1000: float | None = None
    monthly_period: str | None = None
    source: str = "CBS OData 47018NED/47022NED"
    source_date: str | None = None
    message: str | None = None


class TierBResponse(BaseModel):
    address_id: str
    energy_label: EnergyLabelCard
    crime: CrimeStatsCard
