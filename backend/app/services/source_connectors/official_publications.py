from __future__ import annotations

import time
import xml.etree.ElementTree as ET
from urllib.parse import urlencode

import httpx

from app.config import settings
from app.models.prebid import (
    SourceCoverageItem,
    SourcePriority,
    SourceRecord,
    SourceStatus,
    utc_now_iso,
)
from app.services.source_connectors.base import ConnectorResult, SourceQuery, now_ms


class OfficialPublicationsConnector:
    source_id = "official_publications"
    authority = "KOOP / officielebekendmakingen.nl"
    label = "Official public notices"
    method_version = "koop-sru-1.2-address-keyword-v1"

    async def fetch(self, query: SourceQuery) -> ConnectorResult:
        started = time.monotonic()
        params = {
            "version": "1.2",
            "operation": "searchRetrieve",
            "x-connection": "officielebekendmakingen",
            "query": " ".join(
                value
                for value in (
                    query.municipality,
                    query.postcode,
                    "omgevingsvergunning vergunning bekendmaking",
                )
                if value
            ),
            "maximumRecords": "10",
        }
        url = f"{settings.official_publications_sru_base}?{urlencode(params)}"
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                response = await client.get(url)
            response.raise_for_status()
            records = _parse_records(response.text)
            status = SourceStatus.checked
            error_code = None
        except Exception as exc:
            records = []
            status = SourceStatus.failed
            error_code = exc.__class__.__name__.casefold()
        coverage = SourceCoverageItem(
            source_id=self.source_id,
            authority=self.authority,
            label=self.label,
            priority=SourcePriority.p0,
            status=status,
            checked_at=utc_now_iso(),
            basis="address text, postcode, municipality, publication window",
            radius_m=query.radius_m,
            method_version=self.method_version,
            duration_ms=now_ms(started),
            limitation=(
                "The publication search may miss records if wording, geography, or publication "
                "metadata differ from the checked query."
            )
            if status == SourceStatus.checked
            else "Official public notices could not be checked for this address.",
            error_code=error_code,
        )
        return ConnectorResult(coverage=coverage, records=records)


def _parse_records(xml_text: str) -> list[SourceRecord]:
    root = ET.fromstring(xml_text)
    records: list[SourceRecord] = []
    for record in root.findall(".//{*}record"):
        data = record.find(".//{*}originalData")
        if data is None:
            data = record
        identifier = _find_text(data, "identifier") or f"official-publication-{len(records) + 1}"
        title = _find_text(data, "title") or "Official public notice"
        url = _find_text(data, "preferredUrl")
        source_date = _find_text(data, "date")
        records.append(
            SourceRecord(
                record_id=identifier,
                source_id="official_publications",
                authority="KOOP / officielebekendmakingen.nl",
                title=title,
                source_url=url,
                source_date=source_date,
                status_label="checked",
                evidence_payload={"title": title, "preferred_url": url, "source_date": source_date},
            )
        )
    return records


def _find_text(node: ET.Element, local_name: str) -> str | None:
    found = node.find(f".//{{*}}{local_name}")
    if found is None or found.text is None:
        return None
    return found.text.strip() or None
