
import asyncio
import logging
import sys
import time
import traceback

from app.services.three_d_bag import get_neighborhood_3d

# Configure logging
logging.basicConfig(level=logging.INFO)


async def verify_integration():
    # Amsterdam Center coordinates (Keizersgracht)
    rd_x = 121000.0
    rd_y = 487000.0
    lat = 52.3676
    lng = 4.8846
    pand_id = "0363100012253924" # Valid ID

    print(f"Testing get_neighborhood_3d for {pand_id} at ({rd_x}, {rd_y})...")

    start = time.perf_counter()
    try:
        # Uses default radius (85.0)
        result = await get_neighborhood_3d(
            pand_id=pand_id,
            rd_x=rd_x,
            rd_y=rd_y,
            lat=lat,
            lng=lng,
        )
        buildings = result.buildings
        duration = time.perf_counter() - start

        print("\n--- Result ---")
        print(f"Time taken: {duration:.2f}s")
        print(f"Buildings found: {len(buildings)}")
        print(f"Target found: {result.target_pand_id is not None}")
        if result.message:
            print(f"Message: {result.message}")

        # Validation
        if len(buildings) > 20:
            print("PASS: Count > 20")
        else:
            print(f"WARN: Count = {len(buildings)} (area might be sparse or timeout)")

        if duration < 10.0:
            print("PASS: Duration < 10s")
        else:
            print(f"WARN: Duration {duration:.2f}s >= 10s")

    except Exception as exc:
        print(f"FAILED with error: {exc}")
        traceback.print_exc()


if __name__ == "__main__":
    # Ensure event loop is clean
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(verify_integration())
