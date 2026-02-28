import asyncio
import logging
import re
from typing import Any

import httpx

from app.config import settings
from app.models.tier_b import CrimeStatsCard, TierBResponse
from app.services.http_client import LoopAwareClient
from app.services.scoring import crime_summary, normalize_crime_score, severity_from_score

logger = logging.getLogger(__name__)

_client = LoopAwareClient(timeout=httpx.Timeout(15.0, connect=4.0))

_CRIME_TOTAL_KEY = "0.0.0 "
_CRIME_BURGLARY_KEY = "1.1.1 "
_CRIME_VIOLENT_KEYS = {"1.4.2 ", "1.4.3 ", "1.4.4 ", "1.4.5 ", "1.4.6 ", "1.4.7 "}


_BUURT_CODE_RE = re.compile(r"^BU[0-9]{4}[A-Z0-9]{4}$")


def _clean_buurt_code(value: str | None) -> str | None:
    """Validate and normalise a buurt code.

    Returns the cleaned code if it matches ``^BU[0-9]{4}[A-Z0-9]{4}$``, else ``None``.
    This strict check prevents OData query-manipulation via crafted inputs.
    """
    if not value:
        return None
    cleaned = value.strip().upper()
    return cleaned if _BUURT_CODE_RE.match(cleaned) else None


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
    client = _client.get()
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
    client = _client.get()
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
    client = _client.get()
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


def _buurt_to_gemeente(buurt_code: str) -> str:
    """Extract GM code from buurt code: BU05370606 -> GM0537."""
    digits = buurt_code[2:6]  # 4-digit municipality code
    return f"GM{digits}"


def _odata_escape(value: str) -> str:
    """Escape single quotes for OData string literals (defense in depth)."""
    return value.replace("'", "''")


async def _fetch_crime_rows(
    area_code: str,
    latest_year: str,
    latest_month: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Fetch yearly + monthly crime rows for a given area code."""
    safe_code = _odata_escape(area_code)
    safe_year = _odata_escape(latest_year)
    safe_month = _odata_escape(latest_month)
    yearly_rows = await _fetch_typed_rows(
        settings.cbs_crime_yearly_base,
        filter_expr=(
            f"startswith(WijkenEnBuurten,'{safe_code}') and Perioden eq '{safe_year}'"
        ),
        top=250,
    )
    monthly_rows = await _fetch_typed_rows(
        settings.cbs_crime_monthly_base,
        filter_expr=(
            f"SoortMisdrijf eq '{_CRIME_TOTAL_KEY}' and "
            f"startswith(WijkenEnBuurten,'{safe_code}') and Perioden eq '{safe_month}'"
        ),
        top=5,
    )
    return yearly_rows, monthly_rows


async def _get_crime_stats(buurt_code: str | None) -> CrimeStatsCard:
    cleaned_buurt = _clean_buurt_code(buurt_code)
    if not cleaned_buurt:
        return CrimeStatsCard(message="CRIME_NO_BUURT_CODE")

    # Phase 1: Population + period lookups in parallel.
    # Population failure is non-fatal; period failures are fatal.
    pop_task = asyncio.create_task(_fetch_population(cleaned_buurt))

    try:
        try:
            latest_year, latest_month = await asyncio.gather(
                _fetch_latest_period(settings.cbs_crime_yearly_base),
                _fetch_latest_period(settings.cbs_crime_monthly_base),
            )
            if not latest_year or not latest_month:
                pop_task.cancel()
                return CrimeStatsCard(message="CRIME_PERIOD_LOOKUP_FAILED")
        except Exception:
            pop_task.cancel()
            logger.exception("Crime lookup failed for buurt=%s", cleaned_buurt)
            return CrimeStatsCard(message="CRIME_LOOKUP_FAILED")

        # Collect population (non-fatal)
        try:
            population = await pop_task
        except Exception:
            logger.exception("Population lookup failed for buurt=%s", cleaned_buurt)
            population = None
    finally:
        # Guard against CancelledError (BaseException) leaking pop_task
        if not pop_task.done():
            pop_task.cancel()
            try:
                await pop_task
            except BaseException:
                pass

    # Phase 2: Crime rows (depends on period results)
    try:
        # Try buurt-level first
        yearly_rows, monthly_rows = await _fetch_crime_rows(
            cleaned_buurt, latest_year, latest_month,
        )

        # Fall back to municipality-level if buurt has no data
        used_gemeente_fallback = False
        if not yearly_rows:
            gm_code = _buurt_to_gemeente(cleaned_buurt)
            yearly_rows, monthly_rows = await _fetch_crime_rows(
                gm_code, latest_year, latest_month,
            )
            if yearly_rows:
                used_gemeente_fallback = True
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
    # Distinguish "no violent crime categories in data" (None) from "zero crimes" (0.0)
    violent_entries = [
        value for code, value in code_to_count.items()
        if code in _CRIME_VIOLENT_KEYS
    ]
    violent_count: float | None = (
        sum(v or 0.0 for v in violent_entries) if violent_entries else None
    )
    monthly_count = None
    if monthly_rows:
        monthly_count = _to_float(monthly_rows[0].get("GeregistreerdeMisdrijven_1"))

    message: str | None = None
    if used_gemeente_fallback:
        message = "CRIME_MUNICIPALITY_LEVEL"
    elif population is None:
        message = "CRIME_NO_POPULATION"
    elif total_count is None:
        message = "CRIME_NO_DATA"

    total_rate = _per_1000(total_count, population)
    score = normalize_crime_score(total_rate)
    severity = severity_from_score(score).value if score is not None else None
    meaning_en, meaning_nl = crime_summary(score, total_rate)

    return CrimeStatsCard(
        total_per_1000=total_rate,
        burglary_per_1000=_per_1000(burglary_count, population),
        violent_per_1000=_per_1000(violent_count, population),
        yearly_period=latest_year,
        monthly_total_per_1000=_per_1000(monthly_count, population),
        monthly_period=latest_month,
        total_count=total_count,
        burglary_count=burglary_count,
        violent_count=violent_count,
        monthly_total_count=monthly_count,
        score=score,
        severity=severity,
        meaning_en=meaning_en if score is not None else None,
        meaning_nl=meaning_nl if score is not None else None,
        source_date=latest_year,
        message=message,
    )


async def get_tier_b_data(
    *,
    vbo_id: str,
    buurt_code: str | None,
) -> TierBResponse:
    crime = await _get_crime_stats(buurt_code)
    return TierBResponse(address_id=vbo_id, crime=crime)
