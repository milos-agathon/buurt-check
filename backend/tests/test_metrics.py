"""Tests for metrics service and API endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services import metrics


@pytest.fixture(autouse=True)
def _reset_metrics():
    metrics.reset()
    yield
    metrics.reset()


class TestMetricsService:
    def test_counter_increment(self):
        metrics.inc("test.counter")
        metrics.inc("test.counter")
        snap = metrics.snapshot()
        assert snap["counters"]["test.counter"] == 2

    def test_latency_recording(self):
        for i in range(10):
            metrics.record_latency("test.latency", float(i * 10))
        snap = metrics.snapshot()
        assert snap["latencies"]["test.latency"]["count"] == 10
        assert snap["latencies"]["test.latency"]["p50"] == 50.0

    def test_bounded_deque(self):
        for i in range(1500):
            metrics.record_latency("bounded", float(i))
        snap = metrics.snapshot()
        assert snap["latencies"]["bounded"]["count"] == 1000

    def test_snapshot_empty(self):
        snap = metrics.snapshot()
        assert snap == {"counters": {}, "latencies": {}}


@pytest.mark.asyncio
class TestMetricsAPI:
    async def test_disabled_returns_404(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("app.api.metrics.settings") as mock_settings:
                mock_settings.metrics_enabled = False
                resp = await client.get("/api/metrics")
                assert resp.status_code == 404

    async def test_enabled_returns_snapshot(self):
        metrics.inc("test.req")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("app.api.metrics.settings") as mock_settings:
                mock_settings.metrics_enabled = True
                mock_settings.metrics_token = None
                resp = await client.get("/api/metrics")
                assert resp.status_code == 200
                data = resp.json()
                assert "counters" in data

    async def test_token_required_returns_401(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("app.api.metrics.settings") as mock_settings:
                mock_settings.metrics_enabled = True
                mock_settings.metrics_token = "secret123"
                resp = await client.get("/api/metrics")
                assert resp.status_code == 401

    async def test_beacon_records_known_event(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("app.api.metrics.settings") as mock_settings:
                mock_settings.metrics_enabled = True
                resp = await client.post(
                    "/api/metrics/event",
                    json={"event": "dossier_viewed"},
                )
                assert resp.status_code == 200
                snap = metrics.snapshot()
                assert snap["counters"]["kpi.dossier_viewed"] == 1

    async def test_beacon_ignores_unknown_event(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("app.api.metrics.settings") as mock_settings:
                mock_settings.metrics_enabled = True
                resp = await client.post(
                    "/api/metrics/event",
                    json={"event": "unknown_event"},
                )
                assert resp.status_code == 200
                snap = metrics.snapshot()
                assert "kpi.unknown_event" not in snap["counters"]


@pytest.mark.asyncio
class TestTier1EndpointMetrics:
    async def test_building_success_increments_counter(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("app.api.address.bag") as mock_bag, \
                 patch("app.api.address.cache_get", return_value=None), \
                 patch("app.api.address.cache_set"):
                mock_bag.get_building_facts = AsyncMock(return_value=None)
                resp = await client.get("/api/address/0363010000696734/building")
                assert resp.status_code == 200
                snap = metrics.snapshot()
                assert snap["counters"].get("building.success", 0) >= 1
                assert "building" in snap["latencies"]

    async def test_building_error_increments_counter(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("app.api.address.bag") as mock_bag, \
                 patch("app.api.address.cache_get", return_value=None):
                mock_bag.get_building_facts = AsyncMock(
                    side_effect=RuntimeError("boom")
                )
                resp = await client.get("/api/address/0363010000696734/building")
                assert resp.status_code == 502
                snap = metrics.snapshot()
                assert snap["counters"].get("building.error", 0) >= 1

    async def test_risks_success_increments_counter(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("app.api.address.risk_cards") as mock_rc, \
                 patch("app.api.address.cache_get", return_value=None), \
                 patch("app.api.address.cache_set"):
                from app.models.risk import (
                    AirQualityRiskCard,
                    ClimateStressRiskCard,
                    NoiseRiskCard,
                    RiskCardsResponse,
                    RiskLevel,
                )
                mock_rc.get_risk_cards = AsyncMock(
                    return_value=RiskCardsResponse(
                        address_id="0363010000696734",
                        noise=NoiseRiskCard(
                            level=RiskLevel.low, source="test", sampled_at="2026-01-01"
                        ),
                        air_quality=AirQualityRiskCard(
                            level=RiskLevel.low, source="test", sampled_at="2026-01-01"
                        ),
                        climate_stress=ClimateStressRiskCard(
                            level=RiskLevel.low, source="test", sampled_at="2026-01-01"
                        ),
                    )
                )
                resp = await client.get(
                    "/api/address/0363010000696734/risks",
                    params={"rd_x": 121000, "rd_y": 487000, "lat": 52.37, "lng": 4.88},
                )
                assert resp.status_code == 200
                snap = metrics.snapshot()
                assert snap["counters"].get("risks.success", 0) >= 1
                assert "risks" in snap["latencies"]


@pytest.mark.asyncio
class TestRequestLoggingMiddleware:
    async def test_middleware_logs_request(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("app.main._access") as mock_logger:
                resp = await client.get("/health")
                assert resp.status_code == 200
                mock_logger.info.assert_called_once()
                args = mock_logger.info.call_args[0]
                # args[0] is the format string, args[1:] are values
                assert args[2] == "GET"       # method
                assert args[3] == "/health"   # path
                assert args[4] == 200         # status
