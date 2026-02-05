"""Monthly calibration check for F3 risk card data sources.

Run: python -m scripts.calibration_check
Schedule: monthly (e.g., first day of month via cron)

Checks:
1. RIVM ALO WMS: noise layers available + sample value at reference point
2. RIVM GCN WMS: PM2.5/NO2 layers available + sample values
3. Klimaateffectatlas: curated climate layers available + sample values
4. Threshold sanity: sampled values fall within expected ranges
"""

import asyncio
import sys

from app.config import settings
from app.services.risk_cards import (
    _CLIMATE_HEAT_LAYERS,
    _CLIMATE_WATER_LAYERS,
    _extract_numeric,
    _fetch_wms_layer_names,
    _get_climate_layer_names,
    _sample_wms_properties,
    _select_air_layer,
    _select_noise_layer,
)

# Reference point: Amsterdam center (Rijksdriehoek coordinates)
REF_RD_X = 121000.0
REF_RD_Y = 487000.0

# Expected value ranges (if values fall outside, thresholds may need recalibration)
EXPECTED_RANGES = {
    "noise_lden_db": (30.0, 85.0),
    "pm25_ug_m3": (1.0, 30.0),
    "no2_ug_m3": (1.0, 50.0),
}


async def check_noise() -> dict:
    """Check RIVM ALO noise layers and sample reference point."""
    result: dict = {"service": "RIVM ALO WMS", "status": "OK", "issues": []}
    try:
        layers = await _fetch_wms_layer_names(settings.rivm_alo_wms_base)
        noise_layer = _select_noise_layer(layers)
        if noise_layer is None:
            result["status"] = "FAIL"
            result["issues"].append("No noise layer found matching pattern")
            return result
        result["layer"] = noise_layer

        noise_candidates = [name for name in layers if "geluid_lden_wegverkeer" in name.lower()]
        result["candidate_count"] = len(noise_candidates)

        props = await _sample_wms_properties(
            settings.rivm_alo_wms_base, noise_layer, REF_RD_X, REF_RD_Y
        )
        if not props or "GRAY_INDEX" not in props:
            result["status"] = "WARN"
            result["issues"].append("No GRAY_INDEX in sample response")
            return result

        value = float(props["GRAY_INDEX"])
        result["sampled_value"] = value
        lo, hi = EXPECTED_RANGES["noise_lden_db"]
        if not lo <= value <= hi:
            result["status"] = "WARN"
            result["issues"].append(f"Value {value} outside expected range [{lo}, {hi}]")
    except Exception as exc:
        result["status"] = "FAIL"
        result["issues"].append(str(exc))
    return result


async def check_air() -> dict:
    """Check RIVM GCN air quality layers and sample reference point."""
    result: dict = {"service": "RIVM GCN WMS", "status": "OK", "issues": []}
    try:
        layers = await _fetch_wms_layer_names(settings.rivm_gcn_wms_base)

        for pollutant in ("PM25", "NO2"):
            layer = _select_air_layer(layers, pollutant)
            if layer is None:
                result["status"] = "WARN"
                result["issues"].append(f"No {pollutant} layer found")
                continue
            result[f"{pollutant.lower()}_layer"] = layer

            props = await _sample_wms_properties(
                settings.rivm_gcn_wms_base, layer, REF_RD_X, REF_RD_Y
            )
            if not props:
                result["status"] = "WARN"
                result["issues"].append(f"No data returned for {pollutant}")
                continue

            value = None
            if isinstance(props.get(layer), (int, float)):
                value = float(props[layer])
            else:
                value, _ = _extract_numeric(props)

            if value is not None:
                key = f"{pollutant.lower()}_ug_m3"
                result[f"{pollutant.lower()}_value"] = value
                lo, hi = EXPECTED_RANGES[key]
                if not lo <= value <= hi:
                    result["status"] = "WARN"
                    result["issues"].append(
                        f"{pollutant} value {value} outside expected range [{lo}, {hi}]"
                    )
            else:
                result["status"] = "WARN"
                result["issues"].append(f"Could not extract numeric value for {pollutant}")
    except Exception as exc:
        result["status"] = "FAIL"
        result["issues"].append(str(exc))
    return result


async def check_climate() -> dict:
    """Check Klimaateffectatlas layer availability."""
    result: dict = {"service": "Klimaateffectatlas", "status": "OK", "issues": []}
    try:
        available = await _get_climate_layer_names()
        result["total_available"] = len(available)

        for label, layer_list in [
            ("heat", _CLIMATE_HEAT_LAYERS),
            ("water", _CLIMATE_WATER_LAYERS),
        ]:
            found = [name for name, _ in layer_list if name in available]
            missing = [name for name, _ in layer_list if name not in available]
            result[f"{label}_found"] = len(found)
            result[f"{label}_total"] = len(layer_list)
            if missing:
                result["status"] = "WARN"
                result["issues"].append(f"Missing {label} layers: {missing}")
    except Exception as exc:
        result["status"] = "FAIL"
        result["issues"].append(str(exc))
    return result


async def main():
    print("=" * 60)
    print("F3 Risk Cards -- Monthly Calibration Check")
    print("=" * 60)
    print(f"Reference point: RD ({REF_RD_X}, {REF_RD_Y})")
    print()

    checks = await asyncio.gather(
        check_noise(),
        check_air(),
        check_climate(),
    )

    has_failures = False
    for check in checks:
        status = check["status"]
        service = check["service"]
        icon = "+" if status == "OK" else "?" if status == "WARN" else "X"
        print(f"  {icon} {service}: {status}")
        for key, value in check.items():
            if key not in ("service", "status", "issues"):
                print(f"    {key}: {value}")
        for issue in check.get("issues", []):
            print(f"    ! {issue}")
        print()
        if status == "FAIL":
            has_failures = True

    if has_failures:
        print("RESULT: FAIL -- one or more services are broken")
        sys.exit(1)
    else:
        print("RESULT: OK -- all services operational")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
