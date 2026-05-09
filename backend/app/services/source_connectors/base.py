from __future__ import annotations

import time
from dataclasses import dataclass

from app.models.prebid import SourceCoverageItem, SourceRecord
from app.services.source_registry import SourceSpec


@dataclass(frozen=True)
class SourceQuery:
    vbo_id: str
    confirmed_address: str
    postcode: str | None
    municipality: str | None
    rd_x: float | None
    rd_y: float | None
    lat: float | None
    lng: float | None
    radius_m: int
    property_type: str = "unknown"


@dataclass(frozen=True)
class ConnectorResult:
    coverage: SourceCoverageItem
    records: list[SourceRecord]


def now_ms(started: float) -> int:
    return max(0, round((time.monotonic() - started) * 1000))


def inactive_coverage(
    spec: SourceSpec,
    *,
    status: str | None = None,
    error_code: str | None = None,
    limitation: str | None = None,
) -> SourceCoverageItem:
    return SourceCoverageItem(
        source_id=spec.source_id,
        authority=spec.authority,
        label=spec.label,
        priority=spec.priority,
        status=status or spec.inactive_status,
        basis=spec.basis,
        radius_m=spec.radius_m,
        method_version=spec.method_version,
        automated=True,
        limitation=limitation or _default_limitation(spec, status or spec.inactive_status),
        error_code=error_code,
    )


def _default_limitation(spec: SourceSpec, status: str) -> str:
    if status == "not_supported":
        return f"{spec.label} is outside declared coverage for this address."
    if status == "skipped":
        return f"{spec.label} is listed in the source stack but was not enabled for this run."
    if status == "failed":
        return f"{spec.label} could not be checked for this address."
    return f"{spec.label} returned no usable result for this address."
