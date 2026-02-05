"""Offline data store for pre-downloaded RIVM raster data.

Provides a fallback data source when live WMS/WFS sampling is slow or
unavailable.  Data is stored as GeoTIFF files, sampled on-the-fly via
coordinate lookup using the ``rasterio`` library (optional dependency).

Directory structure::

    data/
        noise/
            rivm_YYYYMMDD_Geluid_lden_wegverkeer_YYYY.tif
        air/
            conc_PM25_YYYY.tif
            conc_NO2_YYYY.tif

Usage::

    from app.services.offline_store import sample_offline

    value = sample_offline("noise", rd_x, rd_y)
    if value is not None:
        # Use offline value
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Default data directory (configurable via settings in the future)
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

# In-memory flag to avoid repeated import errors if rasterio is missing
_rasterio_available: bool | None = None


def _check_rasterio() -> bool:
    """Check if rasterio is available (optional dependency)."""
    global _rasterio_available  # noqa: PLW0603
    if _rasterio_available is None:
        try:
            import rasterio  # noqa: F401

            _rasterio_available = True
        except ImportError:
            _rasterio_available = False
            logger.info("rasterio not installed — offline data store disabled")
    return _rasterio_available


def _find_latest_tif(subdir: str, prefix: str | None = None) -> Path | None:
    """Find the most recently named .tif file in the given subdirectory.

    Args:
        subdir: Subdirectory name under DATA_DIR (e.g. "noise", "air").
        prefix: Optional filename prefix filter (e.g. "conc_PM25_").

    Returns:
        Path to the latest .tif file, or None if none found.
    """
    directory = DATA_DIR / subdir
    if not directory.exists():
        return None

    pattern = f"{prefix}*.tif" if prefix else "*.tif"
    tifs = sorted(directory.glob(pattern), reverse=True)
    return tifs[0] if tifs else None


# Map category to (subdirectory, filename prefix)
_CATEGORY_MAP: dict[str, tuple[str, str | None]] = {
    "noise": ("noise", None),
    "air_pm25": ("air", "conc_PM25_"),
    "air_no2": ("air", "conc_NO2_"),
}


def sample_offline(
    category: str,
    rd_x: float,
    rd_y: float,
) -> float | None:
    """Sample a value from offline GeoTIFF data.

    Args:
        category: One of "noise", "air_pm25", or "air_no2".
        rd_x: Rijksdriehoek X coordinate.
        rd_y: Rijksdriehoek Y coordinate.

    Returns:
        Sampled raster value, or None if offline data is unavailable.
    """
    if not _check_rasterio():
        return None

    mapping = _CATEGORY_MAP.get(category)
    if mapping is None:
        return None

    subdir, prefix = mapping
    tif_path = _find_latest_tif(subdir, prefix)
    if tif_path is None:
        return None

    try:
        import rasterio

        with rasterio.open(tif_path) as src:
            # Transform RD coordinates to raster row/col
            row, col = src.index(rd_x, rd_y)
            # Read single pixel value
            window = rasterio.windows.Window(col, row, 1, 1)
            data = src.read(1, window=window)
            value = float(data[0, 0])

            # Check for nodata
            if src.nodata is not None and value == src.nodata:
                return None
            # Common nodata sentinels
            if value <= -9990 or value >= 1e30:
                return None

            return value
    except Exception as exc:
        logger.warning("Offline sample failed for %s: %s", category, exc)
        return None
