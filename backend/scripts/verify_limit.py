import asyncio
import time

import httpx


async def verify_limit():
    # Amsterdam Center coordinates (approx)
    # RD New: x=121200, y=487250
    center_x = 121200
    center_y = 487250
    radius = 150

    x0, y0 = center_x - radius, center_y - radius
    x1, y1 = center_x + radius, center_y + radius
    bbox = f"{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}"

    url = "https://api.3dbag.nl/collections/pand/items"
    params = {
        "bbox": bbox,
        "limit": 50,
    }

    print(f"Requesting: {url} with params {params}")

    async with httpx.AsyncClient() as client:
        start = time.monotonic()
        try:
            resp = await client.get(url, params=params, timeout=30.0)
            resp.raise_for_status()
            data = resp.json()
            duration = time.monotonic() - start

            features = data.get("features", [])
            count = len(features)

            # check next link to see if there is more
            links = data.get("links", [])
            next_link = next((link for link in links if link["rel"] == "next"), None)

            number_matched = data.get("numberMatched", "unknown")
            number_returned = data.get("numberReturned", "unknown")

            print(f"Status: {resp.status_code}")
            print(f"Duration: {duration:.2f}s")
            print(f"Returned features: {count}")
            print(f"Number Matched: {number_matched}")
            print(f"Number Returned: {number_returned}")

            with open("verification_result.txt", "w") as f:
                f.write(f"Status: {resp.status_code}\n")
                f.write(f"Duration: {duration:.2f}s\n")
                f.write(f"Returned features: {count}\n")
                f.write(f"Number Matched: {number_matched}\n")
                f.write(f"Number Returned: {number_returned}\n")
                if next_link:
                    f.write(f"Next link: {next_link['href']}\n")

            if count > 50:
                print("SUCCESS: API returned more than 50 items. Limit parameter is improved.")
            else:
                print(
                    "WARNING: API returned 50 or fewer items. "
                    "Might be sparse area or limit ignored."
                )

            if next_link:
                print(f"Next link present: {next_link['href']}")
            else:
                print("No next link (all data returned in one page?)")

        except Exception as exc:
            print(f"FAILED: {exc}")
            with open("verification_result.txt", "w") as f:
                f.write(f"FAILED: {exc}")


if __name__ == "__main__":
    asyncio.run(verify_limit())
