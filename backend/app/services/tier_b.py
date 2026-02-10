import asyncio
import logging
from typing import Any

import httpx

from app.config import settings
from app.models.tier_b import CrimeStatsCard, EnergyLabelCard, TierBResponse

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None

_CRIME_TOTAL_KEY = "0.0.0 "
_CRIME_BURGLARY_KEY = "1.1.1 "
_CRIME_VIOLENT_KEYS = {"1.4.2 ", "1.4.3 ", "1.4.4 ", "1.4.5 ", "1.4.6 ", "1.4.7 "}


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=4.0))
    return _client


def _clean_buurt_code(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip().upper()
    return cleaned if cleaned.startswith("BU") else None


def _first_present(obj: dict[str, Any], keys: list[str]) -> str | None:
    for key in keys:
        value = obj.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _per_1000(count: float | None, population: float | None) -> float | None:
    if count is None or population is None or population <= 0:
        return None
    return round((count / population) * 1000.0, 2)


async def _fetch_latest_period(base_url: str) -> str | None:
    client = _get_client()
    resp = await client.get(
        f"{base_url}/Perioden",
        params={"$format": "json"},
    )
    resp.raise_for_status()
    values = (resp.json() or {}).get("value") or []
    keys = [
        item.get("Key")
        for item in values
        if isinstance(item, dict) and isinstance(item.get("Key"), str)
    ]
    return max(keys) if keys else None


async def _fetch_typed_rows(
    base_url: str,
    filter_expr: str,
    top: int = 200,
) -> list[dict[str, Any]]:
    client = _get_client()
    resp = await client.get(
        f"{base_url}/TypedDataSet",
        params={
            "$format": "json",
            "$top": str(top),
            "$filter": filter_expr,
        },
    )
    resp.raise_for_status()
    return (resp.json() or {}).get("value") or []


async def _fetch_population(buurt_code: str) -> float | None:
    client = _get_client()
    resp = await client.get(
        f"{settings.cbs_wijken_buurten_base}/collections/buurten/items",
        params={
            "buurtcode": buurt_code,
            "f": "json",
            "limit": "1",
        },
    )
    resp.raise_for_status()
    features = (resp.json() or {}).get("features") or []
    if not features:
        return None
    props = (features[0] or {}).get("properties") or {}
    inhabitants = props.get("aantal_inwoners")
    if not isinstance(inhabitants, (int, float)) or inhabitants <= 0 or inhabitants <= -99990:
        return None
    return float(inhabitants)


async def _get_energy_label(
    postcode: str | None,
    house_number: str | None,
    house_letter: str | None,
    addition: str | None,
) -> EnergyLabelCard:
    if not postcode or not house_number:
        return EnergyLabelCard(message="ENERGY_INPUT_MISSING")

    client = _get_client()
    headers: dict[str, str] = {}
    if settings.energy_label_api_key:
        headers["X-Api-Key"] = settings.energy_label_api_key

    params = {
        "postcode": postcode.replace(" ", "").upper(),
        "huisnummer": house_number,
    }
    if house_letter:
        params["huisletter"] = house_letter
    if addition:
        params["huisnummertoevoeging"] = addition

    try:
        resp = await client.get(settings.energy_label_base, params=params, headers=headers)
    except Exception:
        logger.exception("Energy label lookup failed")
        return EnergyLabelCard(message="ENERGY_LOOKUP_FAILED")

    if resp.status_code == 401:
        return EnergyLabelCard(message="ENERGY_AUTH_REQUIRED")
    if resp.status_code == 404:
        return EnergyLabelCard(message="ENERGY_NOT_FOUND")
    if resp.status_code >= 400:
        return EnergyLabelCard(message="ENERGY_LOOKUP_FAILED")

    payload = resp.json()
    if isinstance(payload, list):
        record = payload[0] if payload else {}
    elif isinstance(payload, dict):
        if isinstance(payload.get("items"), list):
            items = payload.get("items") or []
            record = items[0] if items else {}
        else:
            record = payload
    else:
        record = {}

    label = _first_present(
        record,
        [
            "label",
            "Label",
            "labelLetter",
            "LabelLetter",
            "Energielabel",
            "EnergieLabel",
            "labelKlasse",
            "energyLabel",
            "EnergyLabel",
        ],
    )
    source_date = _first_present(
        record,
        [
            "RegistratieDatum",
            "registratieDatum",
            "Opnamedatum",
            "Datum",
            "date",
        ],
    )

    if label is None:
        return EnergyLabelCard(source_date=source_date, message="ENERGY_NOT_FOUND")
    return EnergyLabelCard(label=label, source_date=source_date)


async def _get_crime_stats(buurt_code: str | None) -> CrimeStatsCard:
    cleaned_buurt = _clean_buurt_code(buurt_code)
    if not cleaned_buurt:
        return CrimeStatsCard(message="CRIME_NO_BUURT_CODE")

    try:
        population = await _fetch_population(cleaned_buurt)
    except Exception:
        logger.exception("Population lookup failed for buurt=%s", cleaned_buurt)
        population = None

    try:
        latest_year = await _fetch_latest_period(settings.cbs_crime_yearly_base)
        latest_month = await _fetch_latest_period(settings.cbs_crime_monthly_base)
        if not latest_year or not latest_month:
            return CrimeStatsCard(message="CRIME_PERIOD_LOOKUP_FAILED")

        yearly_rows = await _fetch_typed_rows(
            settings.cbs_crime_yearly_base,
            filter_expr=(
                f"WijkenEnBuurten eq '{cleaned_buurt}' and Perioden eq '{latest_year}'"
            ),
            top=250,
        )
        monthly_rows = await _fetch_typed_rows(
            settings.cbs_crime_monthly_base,
            filter_expr=(
                f"SoortMisdrijf eq '{_CRIME_TOTAL_KEY}' and "
                f"WijkenEnBuurten eq '{cleaned_buurt}' and Perioden eq '{latest_month}'"
            ),
            top=5,
        )
    except Exception:
        logger.exception("Crime lookup failed for buurt=%s", cleaned_buurt)
        return CrimeStatsCard(message="CRIME_LOOKUP_FAILED")

    code_to_count: dict[str, float | None] = {}
    for row in yearly_rows:
        code = row.get("SoortMisdrijf")
        if not isinstance(code, str):
            continue
        code_to_count[code] = _to_float(row.get("GeregistreerdeMisdrijven_1"))

    total_count = code_to_count.get(_CRIME_TOTAL_KEY)
    burglary_count = code_to_count.get(_CRIME_BURGLARY_KEY)
    violent_count = sum(
        value or 0.0
        for code, value in code_to_count.items()
        if code in _CRIME_VIOLENT_KEYS
    )
    monthly_count = None
    if monthly_rows:
        monthly_count = _to_float(monthly_rows[0].get("GeregistreerdeMisdrijven_1"))

    message: str | None = None
    if population is None:
        message = "CRIME_NO_POPULATION"
    elif total_count is None:
        message = "CRIME_NO_DATA"

    return CrimeStatsCard(
        total_per_1000=_per_1000(total_count, population),
        burglary_per_1000=_per_1000(burglary_count, population),
        violent_per_1000=_per_1000(violent_count, population),
        yearly_period=latest_year,
        monthly_total_per_1000=_per_1000(monthly_count, population),
        monthly_period=latest_month,
        source_date=latest_year,
        message=message,
    )


async def get_tier_b_data(
    *,
    vbo_id: str,
    buurt_code: str | None,
    postcode: str | None,
    house_number: str | None,
    house_letter: str | None,
    addition: str | None,
) -> TierBResponse:
    energy_task = _get_energy_label(postcode, house_number, house_letter, addition)
    crime_task = _get_crime_stats(buurt_code)
    energy, crime = await asyncio.gather(energy_task, crime_task)
    return TierBResponse(address_id=vbo_id, energy_label=energy, crime=crime)
