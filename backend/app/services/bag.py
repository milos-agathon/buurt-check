import re

import httpx

from app.config import settings
from app.models.building import BuildingFacts

_BAG_ID_PATTERN = re.compile(r"^[0-9]{16}$")


def _validate_bag_id(identifier: str, label: str = "ID") -> None:
    if not _BAG_ID_PATTERN.match(identifier):
        raise ValueError(f"Invalid BAG {label}: must be 16 digits, got '{identifier}'")

_client: httpx.AsyncClient | None = None

# Dutch -> English translation for pand/VBO status
STATUS_TRANSLATIONS: dict[str, str] = {
    "Pand in gebruik": "In use",
    "Pand in gebruik (niet ingemeten)": "In use (not measured)",
    "Pand buiten gebruik": "Not in use",
    "Verbouwing pand": "Under renovation",
    "Sloopvergunning verleend": "Demolition permit granted",
    "Pand gesloopt": "Demolished",
    "Bouwvergunning verleend": "Building permit granted",
    "Bouw gestart": "Construction started",
    "Niet gerealiseerd pand": "Not realized",
    "Pand ten onrechte opgevoerd": "Erroneously registered",
    "Verblijfsobject in gebruik": "In use",
    "Verblijfsobject in gebruik (niet ingemeten)": "In use (not measured)",
    "Verblijfsobject buiten gebruik": "Not in use",
    "Verblijfsobject gevormd": "Formed",
    "Niet gerealiseerd verblijfsobject": "Not realized",
    "Verblijfsobject ingetrokken": "Withdrawn",
    "Verblijfsobject ten onrechte opgevoerd": "Erroneously registered",
}

# Dutch -> English translation for gebruiksdoel
GEBRUIKSDOEL_TRANSLATIONS: dict[str, str] = {
    "woonfunctie": "Residential",
    "bijeenkomstfunctie": "Assembly",
    "celfunctie": "Cell/Detention",
    "gezondheidszorgfunctie": "Healthcare",
    "industriefunctie": "Industrial",
    "kantoorfunctie": "Office",
    "logiesfunctie": "Lodging",
    "onderwijsfunctie": "Education",
    "sportfunctie": "Sports",
    "winkelfunctie": "Retail",
    "overige gebruiksfunctie": "Other",
}


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=15.0)
    return _client


def _translate_status(status: str | None) -> str | None:
    if not status:
        return None
    return STATUS_TRANSLATIONS.get(status, status)


def _translate_gebruiksdoel(doel_str: str | None) -> tuple[list[str], list[str]]:
    if not doel_str:
        return [], []
    doelen = [d.strip() for d in doel_str.split(",") if d.strip()]
    doelen_en = [GEBRUIKSDOEL_TRANSLATIONS.get(d, d) for d in doelen]
    return doelen, doelen_en


def _ogc_id_filter(property_name: str, value: str) -> str:
    """Build an OGC XML Filter for exact property match (URL-encoded)."""
    xml = (
        f"<Filter><PropertyIsEqualTo>"
        f"<PropertyName>{property_name}</PropertyName>"
        f"<Literal>{value}</Literal>"
        f"</PropertyIsEqualTo></Filter>"
    )
    return xml


async def _fetch_verblijfsobject(vbo_id: str) -> dict | None:
    """Fetch verblijfsobject from BAG WFS by identificatie (direct ID lookup)."""
    _validate_bag_id(vbo_id, "VBO ID")
    client = _get_client()

    resp = await client.get(
        settings.bag_wfs_base,
        params={
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeName": "bag:verblijfsobject",
            "Filter": _ogc_id_filter("identificatie", vbo_id),
            "count": "1",
            "outputFormat": "application/json",
        },
    )
    resp.raise_for_status()
    data = resp.json()

    features = data.get("features", [])
    if not features:
        return None

    return features[0]["properties"]


async def _fetch_pand(pand_id: str) -> dict | None:
    """Fetch pand (building) from BAG WFS by identificatie, with footprint geometry in WGS84."""
    _validate_bag_id(pand_id, "pand ID")
    client = _get_client()

    resp = await client.get(
        settings.bag_wfs_base,
        params={
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeName": "bag:pand",
            "Filter": _ogc_id_filter("identificatie", pand_id),
            "count": "1",
            "outputFormat": "application/json",
            "srsName": "EPSG:4326",
        },
    )
    resp.raise_for_status()
    data = resp.json()

    features = data.get("features", [])
    if not features:
        return None

    f = features[0]
    return {**f["properties"], "_geometry": f.get("geometry")}


async def get_building_facts(vbo_id: str) -> BuildingFacts | None:
    """Fetch building facts by querying VBO and pand from BAG WFS."""
    vbo_data = await _fetch_verblijfsobject(vbo_id)

    if not vbo_data:
        return None

    pand_id = vbo_data.get("pandidentificatie")
    pand_data = await _fetch_pand(pand_id) if pand_id else None

    # Build facts from VBO + pand data
    intended_use, intended_use_en = _translate_gebruiksdoel(vbo_data.get("gebruiksdoel"))

    pand_status = pand_data.get("status") if pand_data else vbo_data.get("pandstatus")

    construction_year = (
        vbo_data.get("bouwjaar")
        or (pand_data.get("bouwjaar") if pand_data else None)
    )

    return BuildingFacts(
        pand_id=pand_id or "unknown",
        construction_year=construction_year,
        status=pand_status,
        status_en=_translate_status(pand_status),
        intended_use=intended_use,
        intended_use_en=intended_use_en,
        num_units=pand_data.get("aantal_verblijfsobjecten") if pand_data else None,
        floor_area_m2=vbo_data.get("oppervlakte"),
        footprint_geojson=pand_data.get("_geometry") if pand_data else None,
        document_date=None,  # WFS doesn't provide a separate document date
    )
