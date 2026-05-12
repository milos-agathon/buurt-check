from datetime import UTC, datetime

from app.models.match import DataFreshnessStatus, MetricSource, NeighborhoodMetric, ProviderStatus
from app.services.match.providers.official import OfficialDataProvider


class FakeOfficialProvider:
    name = "FakeOfficialProvider"
    source_type = "official"

    async def fetch_metrics(self, region_config_id: str) -> list[NeighborhoodMetric]:
        source = MetricSource(
            source_id=f"src_fake_{region_config_id}_green",
            source_name="Fake official source",
            source_type="official",
            metric_name="green_access",
            license_status="open",
            measurement_date="2024-01-01",
            retrieved_at=datetime(2026, 5, 11, tzinfo=UTC),
            geography_level="neighborhood",
            method_version="fake-v1",
            limitations=["Contract test source only."],
            confidence=85,
            freshness_status=DataFreshnessStatus.current,
        )
        return [
            NeighborhoodMetric(
                metric_id="metric_fake_green",
                neighborhood_id="nh_amsterdam_ijburg",
                metric_key="green_access",
                raw_value={"value": 84},
                normalized_value=84,
                source=source,
                freshness_status=DataFreshnessStatus.current,
                confidence=85,
                geography_level="neighborhood",
                limitations=["Contract test metric only."],
            )
        ]

    def status(self) -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            mode="licensed",
            license_status="open",
            health="healthy",
            limitations=["Contract test provider only."],
        )


def test_official_provider_protocol_accepts_typed_provider():
    provider = FakeOfficialProvider()

    assert isinstance(provider, OfficialDataProvider)
