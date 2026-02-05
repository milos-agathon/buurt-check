"""Download RIVM noise and air quality GeoTIFF files for offline use.

Run::

    python -m scripts.ingest_rivm

Schedule: monthly or after new RIVM dataset releases.

Downloads:
- Noise: RIVM Geluid Lden wegverkeer raster from data.rivm.nl
- Air quality: GCN PM2.5 and NO2 concentration rasters

Files are saved to ``backend/data/{noise,air}/`` for offline_store to pick up.
"""

import asyncio
import logging
import sys
from pathlib import Path

import httpx

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Known RIVM download URLs for raster data.
# These may change -- check data.overheid.nl for current links.
# Format: (filename, download_url)
NOISE_DOWNLOADS: list[tuple[str, str]] = [
    # The RIVM provides Lden road traffic noise as WCS/WMS; direct raster
    # downloads are available from data.overheid.nl.  Add URLs here when
    # specific datasets are identified for ingestion.
    # Example:
    # ("rivm_20250101_Geluid_lden_wegverkeer_2022.tif",
    #  "https://data.overheid.nl/..."),
]

AIR_DOWNLOADS: list[tuple[str, str]] = [
    # GCN concentration rasters.  Available from RIVM open data portal.
    # Example:
    # ("conc_PM25_2024.tif", "https://data.rivm.nl/..."),
    # ("conc_NO2_2024.tif", "https://data.rivm.nl/..."),
]


async def download_file(url: str, dest: Path) -> bool:
    """Download a file with progress logging."""
    if dest.exists():
        logger.info("Already exists: %s", dest.name)
        return True

    logger.info("Downloading %s ...", dest.name)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=10.0)) as client:
            async with client.stream("GET", url) as resp:
                resp.raise_for_status()
                dest.parent.mkdir(parents=True, exist_ok=True)
                with open(dest, "wb") as f:
                    async for chunk in resp.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
        logger.info("Saved: %s", dest.name)
        return True
    except Exception as exc:
        logger.error("Failed to download %s: %s", dest.name, exc)
        if dest.exists():
            dest.unlink()
        return False


async def main() -> None:
    """Run the ingestion pipeline."""
    logger.info("RIVM Data Ingestion Script")
    logger.info("Data directory: %s", DATA_DIR)

    # Ensure directories exist
    (DATA_DIR / "noise").mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "air").mkdir(parents=True, exist_ok=True)

    if not NOISE_DOWNLOADS and not AIR_DOWNLOADS:
        logger.warning(
            "No download URLs configured. Add URLs to NOISE_DOWNLOADS "
            "and AIR_DOWNLOADS in this script when datasets are identified."
        )
        logger.info("Created data directories: %s", DATA_DIR)
        sys.exit(0)

    tasks = []
    for filename, url in NOISE_DOWNLOADS:
        tasks.append(download_file(url, DATA_DIR / "noise" / filename))
    for filename, url in AIR_DOWNLOADS:
        tasks.append(download_file(url, DATA_DIR / "air" / filename))

    results = await asyncio.gather(*tasks)
    failed = sum(1 for r in results if not r)

    if failed:
        logger.error("%d/%d downloads failed", failed, len(results))
        sys.exit(1)
    else:
        logger.info("All %d downloads completed successfully", len(results))
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
