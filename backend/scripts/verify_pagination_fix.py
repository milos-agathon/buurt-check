import asyncio
import time

import httpx

MAX_PAGES = 20
BBOX_TIMEOUT = 45.0
PER_PAGE_TIMEOUT = 20.0

async def verify_pagination():
    # Amsterdam Center coordinates (approx)
    center_x = 121200
    center_y = 487250
    radius = 150

    x0, y0 = center_x - radius, center_y - radius
    x1, y1 = center_x + radius, center_y + radius
    bbox = f"{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}"

    url = "https://api.3dbag.nl/collections/pand/items"

    # Matches production code
    next_url = f"{url}?bbox={bbox}&limit=1000"

    print(f"Starting fetch with limit=1000, max_pages={MAX_PAGES}, timeout={BBOX_TIMEOUT}s")

    total_features = 0
    page = 0
    start = time.monotonic()

    async with httpx.AsyncClient() as client:
        while next_url and page < MAX_PAGES:
            remaining = BBOX_TIMEOUT - (time.monotonic() - start)
            if remaining < 1.0:
                print(f"Time budget exhausted after {page} pages")
                break

            print(f"Fetching page {page+1}...")
            page_start = time.monotonic()
            try:
                resp = await client.get(
                    next_url,
                    timeout=httpx.Timeout(min(PER_PAGE_TIMEOUT, remaining), connect=3.0),
                )
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                print(f"Page {page+1} failed: {exc}")
                break

            features = data.get("features", [])
            count = len(features)
            total_features += count

            duration = time.monotonic() - page_start
            print(f"  Received {count} features in {duration:.2f}s")

            # Follow pagination
            next_url = None
            links = data.get("links", [])
            next_link = next((link for link in links if link["rel"] == "next"), None)
            if next_link:
                next_url = next_link["href"]
                # fix for limit parameter if API drops it in next link
                if "limit=" not in next_url:
                    next_url += "&limit=1000"

            page += 1

    total_duration = time.monotonic() - start
    print(f"\nTotal: {total_features} features in {page} pages")
    print(f"Total time: {total_duration:.2f}s")

    with open("pagination_result.txt", "w") as f:
        f.write(f"Total: {total_features}\n")
        f.write(f"Pages: {page}\n")
        f.write(f"Time: {total_duration:.2f}s\n")


if __name__ == "__main__":
    asyncio.run(verify_pagination())
