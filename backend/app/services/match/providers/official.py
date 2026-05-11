from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.config import settings
from app.models.match import NeighborhoodMetric, ProviderStatus


@runtime_checkable
class OfficialDataProvider(Protocol):
    name: str
    source_type: str

    async def fetch_metrics(self, region_config_id: str) -> list[NeighborhoodMetric]:
        """Fetch sourced neighborhood metrics for a configured region."""
        ...

    def status(self) -> ProviderStatus:
        """Return admin-visible provider status and limitations."""
        ...


def official_provider_placeholder_status() -> ProviderStatus:
    configured = bool(settings.match_official_data_provider_base_url)
    return ProviderStatus(
        name="OfficialDataProviderPlaceholder",
        mode="unavailable",
        license_status="open" if configured else "unavailable",
        health="unconfigured" if not configured else "degraded",
        limitations=[
            (
                "Official data adapter placeholder; seed/mock data remains active until "
                "a provider is configured."
            ),
        ],
    )
