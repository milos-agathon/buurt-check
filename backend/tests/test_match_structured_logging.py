import logging

import pytest

from app.models.match import ScoringAnomalySummary
from app.services.match.admin import build_admin_health_dashboard
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter


async def _seed():
    return await SeedMockImporter().load_seed_data(MVP_REGION_CONFIG_ID)


@pytest.mark.asyncio
async def test_admin_health_emits_structured_match_logs(caplog):
    seed_result = await _seed()
    anomaly = ScoringAnomalySummary(
        anomaly_type="missing_driver",
        severity="warning",
        count=1,
    )

    with caplog.at_level(logging.INFO, logger="app.services.match"):
        build_admin_health_dashboard(
            seed_result=seed_result,
            scoring_anomalies=[anomaly],
        )

    records = [record for record in caplog.records if record.message == "match_observation"]
    assert records
    payload = next(record.match for record in records if record.match["event"] == "scoring_anomaly")
    assert payload["event"] == "scoring_anomaly"
    assert payload["provider_name"] == "match_scoring"
    assert payload["region_config_id"] == MVP_REGION_CONFIG_ID
    assert payload["status"] == "warning"
