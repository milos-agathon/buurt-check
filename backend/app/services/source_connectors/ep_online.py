from __future__ import annotations

import time

from app.models.prebid import SourceCoverageItem, SourcePriority, SourceStatus, utc_now_iso
from app.services.source_connectors.base import ConnectorResult, SourceQuery, now_ms


class EpOnlineConnector:
    source_id = "ep_online"
    authority = "RVO / EP-Online"
    label = "EP-Online energy label"
    method_version = "ep-online-api-v5-blocked-without-key"

    async def fetch(self, query: SourceQuery) -> ConnectorResult:
        started = time.monotonic()
        return ConnectorResult(
            coverage=SourceCoverageItem(
                source_id=self.source_id,
                authority=self.authority,
                label=self.label,
                priority=SourcePriority.p1,
                status=SourceStatus.unavailable,
                checked_at=utc_now_iso(),
                basis="adresseerbaar object id",
                radius_m=None,
                method_version=self.method_version,
                duration_ms=now_ms(started),
                limitation=(
                    "EP-Online was not checked because the credentialed address/BAG-object "
                    "query must be validated before buyer-facing use."
                ),
                error_code="ep_online_query_unvalidated",
            ),
            records=[],
        )
