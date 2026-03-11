import asyncio
import logging
import re

import httpx

from app.config import settings
from app.models.address import AddressSuggestion, ResolvedAddress
from app.services.http_client import LoopAwareClient

logger = logging.getLogger(__name__)

_client = LoopAwareClient(
    base_url=settings.locatieserver_base,
    timeout=httpx.Timeout(10.0),
)


_WKT_POINT = re.compile(r"POINT\(([0-9.]+)\s+([0-9.]+)\)")

_RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}


def _parse_wkt_point(wkt: str | None) -> tuple[float, float] | None:
    if not wkt:
        return None
    m = _WKT_POINT.match(wkt)
    if not m:
        return None
    return float(m.group(1)), float(m.group(2))


def _is_retryable_locatieserver_error(exc: Exception) -> bool:
    if isinstance(exc, httpx.RequestError):
        return True
    if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None:
        return exc.response.status_code in _RETRYABLE_STATUS_CODES
    return False


async def _get_with_retry(
    path: str,
    *,
    params: dict[str, str | int],
    attempts: int = 2,
) -> httpx.Response:
    client = _client.get()
    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            resp = await client.get(path, params=params)
            resp.raise_for_status()
            return resp
        except Exception as exc:
            last_exc = exc
            if attempt >= attempts or not _is_retryable_locatieserver_error(exc):
                raise
            logger.warning(
                "locatieserver request retrying path=%s attempt=%d/%d reason=%s",
                path,
                attempt,
                attempts,
                exc,
            )
            await asyncio.sleep(0.15 * attempt)
    assert last_exc is not None
    raise last_exc


async def suggest(query: str, limit: int = 7) -> list[AddressSuggestion]:
    resp = await _get_with_retry(
        "/suggest",
        params={"q": query, "fq": "type:adres", "rows": limit},
    )
    data = resp.json()

    docs = data.get("response", {}).get("docs", [])

    suggestions = []
    for doc in docs:
        suggestions.append(
            AddressSuggestion(
                id=doc.get("id", ""),
                display_name=doc.get("weergavenaam", ""),
                type=doc.get("type", "adres"),
                score=doc.get("score", 0.0),
            )
        )

    return suggestions


async def lookup(locatieserver_id: str) -> ResolvedAddress | None:
    resp = await _get_with_retry(
        "/lookup",
        params={"id": locatieserver_id, "fl": "*"},
    )
    data = resp.json()

    docs = data.get("response", {}).get("docs", [])
    if not docs:
        return None

    doc = docs[0]

    ll = _parse_wkt_point(doc.get("centroide_ll"))
    rd = _parse_wkt_point(doc.get("centroide_rd"))

    return ResolvedAddress(
        id=doc.get("id", ""),
        nummeraanduiding_id=doc.get("nummeraanduiding_id"),
        adresseerbaar_object_id=doc.get("adresseerbaarobject_id"),
        display_name=doc.get("weergavenaam", ""),
        street=doc.get("straatnaam"),
        house_number=str(doc.get("huisnummer", "")) if doc.get("huisnummer") else None,
        house_letter=doc.get("huisletter") or None,
        addition=doc.get("huisnummertoevoeging") or None,
        postcode=doc.get("postcode"),
        city=doc.get("woonplaatsnaam"),
        municipality=doc.get("gemeentenaam"),
        province=doc.get("provincienaam"),
        latitude=ll[1] if ll else None,
        longitude=ll[0] if ll else None,
        rd_x=rd[0] if rd else None,
        rd_y=rd[1] if rd else None,
        buurt_code=doc.get("buurtcode"),
        wijk_code=doc.get("wijkcode"),
    )
