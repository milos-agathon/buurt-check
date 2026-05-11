from unittest.mock import AsyncMock, patch

import pytest

from app.models.prebid import SourceCoverageItem, SourcePriority, SourceStatus
from app.services.source_orchestrator import derive_result_state


def _coverage(
    source_id: str,
    status: SourceStatus,
    priority: SourcePriority = SourcePriority.p0,
) -> SourceCoverageItem:
    return SourceCoverageItem(
        source_id=source_id,
        authority="Authority",
        label="Label",
        priority=priority,
        status=status,
        basis="address",
        limitation="Source limitation.",
    )


def test_failed_p0_source_forces_data_incomplete():
    assert (
        derive_result_state(
            coverage=[_coverage("official_publications", SourceStatus.failed)],
            actions=[],
            outside_coverage=False,
        )
        == "data_incomplete"
    )


def test_manual_review_p0_source_forces_needs_human_review():
    assert (
        derive_result_state(
            coverage=[_coverage("official_publications", SourceStatus.manual_review)],
            actions=[],
            outside_coverage=False,
        )
        == "needs_human_review"
    )


def test_no_actions_with_all_p0_checked_is_safe_wording_state():
    assert (
        derive_result_state(
            coverage=[_coverage("official_publications", SourceStatus.checked)],
            actions=[],
            outside_coverage=False,
        )
        == "no_major_signal_found"
    )


def test_not_supported_p0_does_not_force_data_incomplete_when_other_p0_checked():
    assert (
        derive_result_state(
            coverage=[
                _coverage("official_publications", SourceStatus.checked),
                _coverage("legacy_p0_source", SourceStatus.not_supported),
            ],
            actions=[],
            outside_coverage=False,
        )
        == "no_major_signal_found"
    )


def test_all_p0_sources_not_supported_returns_outside_coverage():
    assert (
        derive_result_state(
            coverage=[_coverage("legacy_p0_source", SourceStatus.not_supported)],
            actions=[],
            outside_coverage=False,
        )
        == "outside_coverage"
    )


def test_review_state_takes_precedence_over_failed_p0():
    assert (
        derive_result_state(
            coverage=[
                _coverage("official_publications", SourceStatus.failed),
                _coverage("legacy_p0_source", SourceStatus.manual_review),
            ],
            actions=[],
            outside_coverage=False,
        )
        == "needs_human_review"
    )


def test_missing_geometry_for_applicable_p0_is_data_incomplete():
    item = _coverage("official_publications", SourceStatus.failed)
    item.error_code = "missing_geometry"
    assert (
        derive_result_state(coverage=[item], actions=[], outside_coverage=False)
        == "data_incomplete"
    )


@pytest.mark.asyncio
async def test_source_run_includes_official_publications_and_p1_sources(tmp_path, monkeypatch):
    from app.config import settings
    from app.db import init_db
    from app.services.source_orchestrator import run_prebid_source_run

    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    monkeypatch.setattr(settings, "database_path", db_path)

    with patch("app.services.source_orchestrator._execute_enabled_connector") as connector:
        connector.return_value = None
        briefing = await run_prebid_source_run(
            report_id="report-1",
            buyer_key="buyer-1",
            vbo_id="0363010000696734",
            confirmed_address="Keizersgracht 100, Amsterdam",
            postcode="1015AA",
            municipality="Amsterdam",
            rd_x=121000,
            rd_y=487000,
            lat=52.3676,
            lng=4.8846,
        )

    assert briefing.result_state == "data_incomplete"
    source_ids = {row.source_id for row in briefing.coverage}
    assert "official_publications" in source_ids
    assert {
        "pdok_parcel",
        "wkpb",
        "rce_culture",
        "ep_online",
        "rdw_parking",
    }.issubset(source_ids)
    assert briefing.top_actions
    assert briefing.top_actions[0].source_refs[0].source_id == "official_publications"


@pytest.mark.asyncio
async def test_source_run_uses_cache_for_successful_non_empty_connector_result(
    tmp_path, monkeypatch,
):
    from app.config import settings
    from app.db import init_db
    from app.models.prebid import SourceRecord
    from app.services.source_connectors.base import ConnectorResult
    from app.services.source_orchestrator import run_prebid_source_run
    from app.services.source_registry import SourceSpec

    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    monkeypatch.setattr(settings, "database_path", db_path)
    spec = SourceSpec(
        "official_publications",
        "KOOP",
        "Official public notices",
        "p0",
        True,
        6.0,
        86400,
        "address",
        250,
        method_version="koop-test-v1",
    )
    coverage = SourceCoverageItem(
        source_id="official_publications",
        authority="KOOP",
        label="Official public notices",
        priority=SourcePriority.p0,
        status=SourceStatus.checked,
        checked_at="2026-05-07T10:00:00Z",
        basis="address",
        limitation="Checked limitation.",
    )
    record = SourceRecord(
        record_id="pub-1",
        source_id="official_publications",
        authority="KOOP",
        title="Permit notice",
        evidence_payload={"title": "Permit notice"},
    )
    cache_store: dict[str, dict] = {}

    async def cache_get(key: str):
        return cache_store.get(key)

    async def cache_set(key: str, value: dict, ttl: int | None = None):
        cache_store[key] = value

    connector = AsyncMock(return_value=ConnectorResult(coverage=coverage, records=[record]))
    monkeypatch.setattr(
        "app.services.source_orchestrator.get_prebid_source_specs",
        lambda **_: [spec],
    )
    monkeypatch.setattr("app.services.source_orchestrator._execute_enabled_connector", connector)
    monkeypatch.setattr("app.services.source_orchestrator.cache_get", cache_get)
    monkeypatch.setattr("app.services.source_orchestrator.cache_set", cache_set)

    kwargs = dict(
        report_id="report-1",
        buyer_key="buyer-1",
        vbo_id="0363010000696734",
        confirmed_address="Keizersgracht 100, Amsterdam",
        postcode="1015AA",
        municipality="Amsterdam",
        rd_x=121000,
        rd_y=487000,
        lat=52.3676,
        lng=4.8846,
    )
    first = await run_prebid_source_run(**kwargs)
    second = await run_prebid_source_run(**{**kwargs, "report_id": "report-2"})

    assert connector.await_count == 1
    assert first.coverage[0].status == SourceStatus.checked
    assert second.coverage[0].source_id == "official_publications"
    assert cache_store
