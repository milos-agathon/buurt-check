import asyncio
import time

import httpx


async def fetch_tile(client, bbox):
    url = "https://api.3dbag.nl/collections/pand/items"
    params = {"bbox": bbox, "limit": 1000}
    start = time.monotonic()
    try:
        resp = await client.get(url, params=params, timeout=45.0) # Increased timeout
        resp.raise_for_status()
        data = resp.json()
        count = len(data.get("features", []))
        duration = time.monotonic() - start
        print(f"Tile {bbox}: {count} features in {duration:.2f}s")
        return count, duration
    except Exception as e:
        print(f"Tile {bbox} failed: {e}")
        return 0, time.monotonic() - start

async def verify_tiled():
    center_x = 121200
    center_y = 487250
    radius = 150

    # 2x2 grid = 4 tiles
    # Tile width = 150m
    grid_size = 2
    step = (radius * 2) / grid_size
    x0_base = center_x - radius
    y0_base = center_y - radius

    print(f"Starting {grid_size}x{grid_size} tiled fetch...")

    async with httpx.AsyncClient(limits=httpx.Limits(max_keepalive_connections=20, max_connections=20)) as client:
        start_global = time.monotonic()
        tasks = []
        for i in range(grid_size):
            for j in range(grid_size):
                x0 = x0_base + i * step
                y0 = y0_base + j * step
                x1 = x0 + step
                y1 = y0 + step
                bbox = f"{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}"
                tasks.append(fetch_tile(client, bbox))

        results = await asyncio.gather(*tasks)
        total_time = time.monotonic() - start_global

        total_features = sum(r[0] for r in results)
        max_duration = max(r[1] for r in results) if results else 0

        print(f"Total features: {total_features}")
        print(f"Total time: {total_time:.2f}s")
        print(f"Max individual tile time: {max_duration:.2f}s")

        with open("tiled_result_2x2.txt", "w") as f:
            f.write(f"Total features: {total_features}\n")
            f.write(f"Total time: {total_time:.2f}s\n")
            f.write(f"Max tile time: {max_duration:.2f}s\n")

if __name__ == "__main__":
    asyncio.run(verify_tiled())
