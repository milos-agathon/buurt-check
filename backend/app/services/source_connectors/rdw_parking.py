from __future__ import annotations

import time

import httpx

from app.config import settings
from app.models.prebid import SourceCoverageItem, SourcePriority, SourceStatus, utc_now_iso
from app.services.source_connectors.base import ConnectorResult, SourceQuery, now_ms


class RdwParkingConnector:
    source_id = "rdw_parking"
    authority = "RDW / Nationaal Parkeer Register"
    label = "RDW/NPR parking context"
    method_version = "rdw-npr-open-parking-v1"

    async def fetch(self, query: SourceQuery) -> ConnectorResult:
        started = time.monotonic()
        status = SourceStatus.checked
        error_code = None
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                response = await client.get(
                    f"{settings.rdw_parking_base.rstrip('/')}/resource/b3us-f26s.json",
                    params={"$limit": "1"},
                )
                response.raise_for_status()
        except Exception as exc:
            status = SourceStatus.unavailable
            error_code = exc.__class__.__name__.casefold()

        return ConnectorResult(
            coverage=SourceCoverageItem(
                source_id=self.source_id,
                authority=self.authority,
                label=self.label,
                priority=SourcePriority.p1,
                status=status,
                checked_at=utc_now_iso(),
                basis="city parking area",
                radius_m=query.radius_m,
                method_version=self.method_version,
                duration_ms=now_ms(started),
                limitation=(
                    "Parking open data may not answer permit eligibility, waiting lists, "
                    "or address-specific rights."
                    if status == SourceStatus.checked
                    else "RDW/NPR parking context could not be checked."
                ),
                error_code=error_code,
            ),
            records=[],
        )
