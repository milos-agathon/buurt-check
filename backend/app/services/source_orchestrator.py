from __future__ import annotations

import hashlib
import json

from app.cache.redis import cache_get, cache_set
from app.models.prebid import (
    ActionItem,
    PrebidBriefingResponse,
    ResultState,
    SourceCoverageItem,
    SourcePriority,
    SourceRecord,
    SourceStatus,
    utc_now_iso,
)
from app.services.action_generator import actions_from_signals
from app.services.briefing_store import (
    STANDARD_DISCLAIMER,
    create_briefing,
    create_review_tasks_for_pending_actions,
    create_source_run,
    record_audit_event,
    store_action_items,
    store_coverage_items,
    store_signals,
    store_source_records,
)
from app.services.signal_normalizer import normalize_signals
from app.services.source_connectors.base import ConnectorResult, SourceQuery, inactive_coverage
from app.services.source_connectors.ep_online import EpOnlineConnector
from app.services.source_connectors.official_publications import OfficialPublicationsConnector
from app.services.source_connectors.pdok_sources import (
    PdokParcelConnector,
    RceCultureConnector,
    WkpbConnector,
)
from app.services.source_connectors.rdw_parking import RdwParkingConnector
from app.services.source_registry import SourceSpec, get_prebid_source_specs


def _enum_value(value: object) -> str:
    return value.value if hasattr(value, "value") else str(value)


def derive_result_state(
    *,
    coverage: list[SourceCoverageItem],
    actions: list[ActionItem],
    outside_coverage: bool,
) -> str:
    if outside_coverage:
        return ResultState.outside_coverage.value
    p0 = [item for item in coverage if item.priority == SourcePriority.p0]
    if p0 and all(item.status == SourceStatus.not_supported for item in p0):
        return ResultState.outside_coverage.value
    if any(action.review_state == "pending" for action in actions) or any(
        item.priority == SourcePriority.p0 and item.status == SourceStatus.manual_review
        for item in coverage
    ):
        return ResultState.needs_human_review.value
    if any(
        item.priority == SourcePriority.p0
        and item.status in {SourceStatus.failed, SourceStatus.unavailable}
        for item in coverage
    ):
        return ResultState.data_incomplete.value
    if actions:
        return ResultState.signals_found.value
    return ResultState.no_major_signal_found.value


async def _execute_enabled_connector(
    spec: SourceSpec,
    query: SourceQuery,
) -> ConnectorResult | None:
    if spec.source_id == "official_publications":
        return await OfficialPublicationsConnector().fetch(query)
    if spec.source_id == "pdok_parcel":
        return await PdokParcelConnector().fetch(query)
    if spec.source_id == "wkpb":
        return await WkpbConnector().fetch(query)
    if spec.source_id == "rce_culture":
        return await RceCultureConnector().fetch(query)
    if spec.source_id == "ep_online":
        return await EpOnlineConnector().fetch(query)
    if spec.source_id == "rdw_parking":
        return await RdwParkingConnector().fetch(query)
    return None


def _missing_geometry(spec: SourceSpec) -> SourceCoverageItem:
    status = "failed" if spec.priority == "p0" else "unavailable"
    return inactive_coverage(
        spec,
        status=status,
        error_code="missing_geometry",
        limitation=(
            f"{spec.label} could not be checked because the confirmed address did not include "
            "coordinates needed for this geometry-based source."
        ),
    )


def _source_cache_key(spec: SourceSpec, query: SourceQuery) -> str:
    payload = {
        "source_id": spec.source_id,
        "method_version": spec.method_version,
        "vbo_id": query.vbo_id,
        "confirmed_address": query.confirmed_address,
        "postcode": query.postcode,
        "municipality": query.municipality,
        "rd_x": query.rd_x,
        "rd_y": query.rd_y,
        "lat": query.lat,
        "lng": query.lng,
        "radius_m": query.radius_m,
        "property_type": query.property_type,
    }
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:24]
    return f"prebid-source:{spec.source_id}:{digest}"


def _cacheable_connector_result(result: ConnectorResult) -> bool:
    status = _enum_value(result.coverage.status)
    return status in {"checked", "manual_review"} and len(result.records) > 0


def _connector_result_from_cache(value: object) -> ConnectorResult | None:
    if not isinstance(value, dict):
        return None
    coverage = value.get("coverage")
    records = value.get("records")
    if not isinstance(coverage, dict) or not isinstance(records, list) or not records:
        return None
    try:
        return ConnectorResult(
            coverage=SourceCoverageItem(**coverage),
            records=[SourceRecord(**record) for record in records],
        )
    except Exception:
        return None


async def _run_connector_with_cache(spec: SourceSpec, query: SourceQuery) -> ConnectorResult | None:
    cache_key = _source_cache_key(spec, query)
    cached = _connector_result_from_cache(await cache_get(cache_key))
    if cached is not None:
        return cached

    result = await _execute_enabled_connector(spec, query)
    if result is not None and _cacheable_connector_result(result):
        await cache_set(
            cache_key,
            {
                "coverage": result.coverage.model_dump(mode="json"),
                "records": [record.model_dump(mode="json") for record in result.records],
            },
            ttl=spec.ttl_s,
        )
    return result


async def run_prebid_source_run(
    *,
    report_id: str | None,
    buyer_key: str | None,
    vbo_id: str,
    confirmed_address: str,
    postcode: str | None,
    municipality: str | None,
    rd_x: float | None,
    rd_y: float | None,
    lat: float | None,
    lng: float | None,
    property_type: str = "unknown",
) -> PrebidBriefingResponse:
    radius = 250
    query = SourceQuery(
        vbo_id=vbo_id,
        confirmed_address=confirmed_address,
        postcode=postcode,
        municipality=municipality,
        rd_x=rd_x,
        rd_y=rd_y,
        lat=lat,
        lng=lng,
        radius_m=radius,
        property_type=property_type,
    )
    coverage: list[SourceCoverageItem] = []
    records = []
    has_geometry = all(value is not None for value in (rd_x, rd_y, lat, lng))
    for spec in get_prebid_source_specs(municipality=municipality):
        if spec.requires_geometry and not has_geometry and spec.inactive_status != "not_supported":
            coverage.append(_missing_geometry(spec))
            continue
        if not spec.enabled:
            coverage.append(inactive_coverage(spec))
            continue
        result = await _run_connector_with_cache(spec, query)
        if result is None:
            coverage.append(inactive_coverage(spec))
            continue
        coverage.append(result.coverage)
        records.extend(result.records)

    created_at = utc_now_iso()
    signals = normalize_signals(
        records=records,
        coverage=coverage,
        source_run_created_at=created_at,
    )
    actions = actions_from_signals(signals, property_type=property_type)
    result_state = derive_result_state(
        coverage=coverage,
        actions=actions,
        outside_coverage=False,
    )
    source_run_id = await create_source_run(
        vbo_id=vbo_id,
        confirmed_address=confirmed_address,
        result_state=result_state,
        report_id=report_id,
        buyer_key=buyer_key,
        postcode=postcode,
        rd_x=rd_x,
        rd_y=rd_y,
        lat=lat,
        lng=lng,
        municipality=municipality,
        property_type=property_type,
    )
    await store_coverage_items(source_run_id, coverage)
    await store_source_records(source_run_id, records)
    await store_signals(source_run_id, signals)
    await store_action_items(source_run_id, actions)
    review_task_ids = await create_review_tasks_for_pending_actions(source_run_id, actions)
    briefing_id = await create_briefing(source_run_id, report_id, buyer_key or "", vbo_id)
    await record_audit_event(
        "prebid_source_run_created",
        {
            "coverage_count": len(coverage),
            "action_count": len(actions),
            "review_task_count": len(review_task_ids),
            "result_state": result_state,
        },
        source_run_id=source_run_id,
        report_id=report_id,
    )
    return PrebidBriefingResponse(
        briefing_id=briefing_id,
        report_id=report_id,
        vbo_id=vbo_id,
        confirmed_address=confirmed_address,
        postcode=postcode,
        municipality=municipality,
        rd_x=rd_x,
        rd_y=rd_y,
        lat=lat,
        lng=lng,
        property_type=property_type,
        checked_at=created_at,
        result_state=result_state,
        top_actions=actions[:3],
        lower_context=signals,
        coverage=coverage,
        disclaimer=STANDARD_DISCLAIMER,
    )
