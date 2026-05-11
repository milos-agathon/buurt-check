from __future__ import annotations

from typing import Protocol, runtime_checkable

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
