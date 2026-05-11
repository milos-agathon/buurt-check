from __future__ import annotations

import time
from collections.abc import Iterable
from typing import Any

import httpx

from app.models.prebid import (
    SourceCoverageItem,
    SourcePriority,
    SourceRecord,
    SourceStatus,
    utc_now_iso,
)
from app.services.source_connectors.base import ConnectorResult, SourceQuery, now_ms

DATE_KEYS = (
    "datum",
    "date",
    "issued",
    "begin",
    "eind",
    "registratiedatum",
    "publication",
)
STATUS_KEYS = ("status", "state", "fase", "zaakstatus", "indicatie")
TITLE_KEYS = (
    "titel",
    "title",
    "naam",
    "name",
    "omschrijving",
    "description",
    "type",
    "soort",
    "categorie",
    "designation",
)


class WfsJsonConnector:
    source_id: str
    authority: str
    label: str
    priority: SourcePriority
    method_version: str
    base_url: str
    layers: tuple[str, ...]
    basis: str
    limitation_checked: str
    limitation_failed: str
    radius_m: int
    timeout_s: float = 6.0

    async def fetch(self, query: SourceQuery) -> ConnectorResult:
        started = time.monotonic()
        records: list[SourceRecord] = []
        status = SourceStatus.checked
        error_code = None
        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                for layer in self.layers:
                    response = await client.get(
                        self.base_url,
                        params=self._params(layer, query),
                    )
                    response.raise_for_status()
                    records.extend(self._parse_feature_collection(layer, response.json()))
        except Exception as exc:
            records = []
            status = (
                SourceStatus.failed
                if self.priority == SourcePriority.p0
                else SourceStatus.unavailable
            )
            error_code = exc.__class__.__name__.casefold()

        return ConnectorResult(
            coverage=SourceCoverageItem(
                source_id=self.source_id,
                authority=self.authority,
                label=self.label,
                priority=self.priority,
                status=status,
                checked_at=utc_now_iso(),
                basis=self.basis,
                radius_m=self.radius_m,
                method_version=self.method_version,
                duration_ms=now_ms(started),
                limitation=(
                    self.limitation_checked
                    if status == SourceStatus.checked
                    else self.limitation_failed
                ),
                error_code=error_code,
            ),
            records=records,
        )

    def _params(self, layer: str, query: SourceQuery) -> dict[str, str]:
        if query.rd_x is None or query.rd_y is None:
            raise ValueError("RD geometry is required for WFS source")
        radius = self.radius_m
        return {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": layer,
            "bbox": (
                f"{query.rd_x - radius},{query.rd_y - radius},"
                f"{query.rd_x + radius},{query.rd_y + radius},EPSG:28992"
            ),
            "srsName": "EPSG:28992",
            "count": "10",
            "outputFormat": "application/json",
        }

    def _parse_feature_collection(self, layer: str, data: dict[str, Any]) -> list[SourceRecord]:
        features = data.get("features")
        if not isinstance(features, list):
            return []
        records: list[SourceRecord] = []
        for index, feature in enumerate(features):
            if not isinstance(feature, dict):
                continue
            properties = feature.get("properties")
            if not isinstance(properties, dict):
                properties = {}
            record_id = str(feature.get("id") or f"{self.source_id}:{layer}:{index}")
            title = _first_text(properties, TITLE_KEYS) or self.label
            records.append(
                SourceRecord(
                    record_id=record_id,
                    source_id=self.source_id,
                    authority=self.authority,
                    title=title,
                    source_url=None,
                    source_date=_first_text(properties, DATE_KEYS),
                    status_label=_first_text(properties, STATUS_KEYS) or "checked",
                    evidence_payload={
                        "layer": layer,
                        "properties": _minimized_properties(properties),
                        "retrieved_at": utc_now_iso(),
                    },
                )
            )
        return records


def _first_text(properties: dict[str, Any], candidates: Iterable[str]) -> str | None:
    for key, value in properties.items():
        lowered = key.casefold()
        if any(candidate in lowered for candidate in candidates) and value not in (None, ""):
            return str(value)
    return None


def _minimized_properties(properties: dict[str, Any]) -> dict[str, Any]:
    minimized: dict[str, Any] = {}
    for key, value in properties.items():
        if len(minimized) >= 12:
            break
        if value is None or isinstance(value, dict | list):
            continue
        minimized[str(key)] = value
    return minimized
