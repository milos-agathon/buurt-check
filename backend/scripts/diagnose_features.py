import asyncio
import logging

import httpx

# Configure logging to print to stdout
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def diagnose_features():
    # Amsterdam Center coordinates (approx) - same as test
    center_x = 121200
    center_y = 487250
    radius = 150

    x0, y0 = center_x - radius, center_y - radius
    x1, y1 = center_x + radius, center_y + radius
    bbox = f"{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}"

    url = "https://api.3dbag.nl/collections/pand/items"
    params = {"bbox": bbox, "limit": 1000}

    print(f"Fetching from {url} with params {params}")

    rejected_reasons = {}
    accepted_count = 0
    total_fetched = 0

    next_url = f"{url}?bbox={bbox}&limit=1000"
    page = 0

    async with httpx.AsyncClient() as client:
        while next_url and page < 5:
            print(f"Fetching page {page}...")
            resp = await client.get(next_url, timeout=30.0)
            resp.raise_for_status()
            data = resp.json()

            features = data.get("features", [])
            print(f"  Page {page} received {len(features)} features")
            total_fetched += len(features)

            if not features:
                break

            for feat in features:
                city_objects = feat.get("CityObjects", {})
                if not city_objects:
                    continue

                for co_id, co_data in city_objects.items():
                    if co_data.get("type") != "Building":
                        continue

                    ident = co_data.get("attributes", {}).get("identificatie", co_id)

                    # 1. Check Attributes
                    attrs = co_data.get("attributes", {})
                    h_maaiveld = attrs.get("b3_h_maaiveld")
                    h_dak_max = attrs.get("b3_h_dak_max")

                    if h_maaiveld is None or h_dak_max is None:
                        reason = f"Missing Height (h_m={h_maaiveld}, h_d={h_dak_max})"
                        rejected_reasons[reason] = rejected_reasons.get(reason, 0) + 1
                        if rejected_reasons[reason] <= 5:
                            print(f"REJECTED {ident}: {reason}")
                        continue

                    if (h_dak_max - h_maaiveld) <= 0:
                        reason = "Invalid Height (<=0)"
                        rejected_reasons[reason] = rejected_reasons.get(reason, 0) + 1
                        continue

                    # 2. Check Geometry LoD 0
                    lod0_geom = None
                    for geom in co_data.get("geometry", []):
                        if geom.get("lod") == "0" and geom.get("type") == "MultiSurface":
                            lod0_geom = geom
                            break

                    if lod0_geom is None:
                        reason = "Missing LoD 0 MultiSurface"
                        rejected_reasons[reason] = rejected_reasons.get(reason, 0) + 1
                        continue

                    # 3. Check Footprint
                    boundaries = lod0_geom.get("boundaries", [])
                    if not boundaries or not boundaries[0]:
                        reason = "Empty Boundaries"
                        rejected_reasons[reason] = rejected_reasons.get(reason, 0) + 1
                        continue

                    accepted_count += 1

            # Next link
            next_url = None
            for link in data.get("links", []):
                if link.get("rel") == "next":
                    next_url = link.get("href")
                    if "limit=" not in next_url:
                        next_url += "&limit=1000"
                    break
            page += 1

    print(f"\nTotal Fetched: {total_fetched}")
    print(f"Total Accepted: {accepted_count}")
    print("\nSummary of Rejections:")
    for reason, count in rejected_reasons.items():
        print(f"  {reason}: {count}")

if __name__ == "__main__":
    asyncio.run(diagnose_features())
