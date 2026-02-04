import re

import httpx

from app.config import settings
from app.models.address import AddressSuggestion, ResolvedAddress

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=settings.locatieserver_base,
            timeout=10.0,
        )
    return _client


_WKT_POINT = re.compile(r"POINT\(([0-9.]+)\s+([0-9.]+)\)")


def _parse_wkt_point(wkt: str | None) -> tuple[float, float] | None:
    if not wkt:
        return None
    m = _WKT_POINT.match(wkt)
    if not m:
        return None
    return float(m.group(1)), float(m.group(2))


async def suggest(query: str, limit: int = 7) -> list[AddressSuggestion]:
    client = _get_client()
    resp = await client.get(
        "/suggest",
        params={"q": query, "fq": "type:adres", "rows": limit},
    )
    resp.raise_for_status()
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
    client = _get_client()
    resp = await client.get(
        "/lookup",
        params={"id": locatieserver_id, "fl": "*"},
    )
    resp.raise_for_status()
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
