import asyncio
import logging
import sys
import time

# Configure logging
logging.basicConfig(level=logging.INFO)

# Mock settings and models to run standalone if needed,
# but better to import from app if possible.
# Let's try importing from app, assuming env is set up.

from app.services.three_d_bag import BBOX_TIMEOUT, MAX_PAGES, _fetch_bbox_buildings


async def verify_integration():
    center_x = 121200
    center_y = 487250
    radius = 225

    print("Testing _fetch_bbox_buildings with 2x2 tiling...")
    print(f"Settings: MAX_PAGES={MAX_PAGES}, BBOX_TIMEOUT={BBOX_TIMEOUT}")

    start = time.monotonic()
    try:
        buildings = await _fetch_bbox_buildings(center_x, center_y, radius)
        duration = time.monotonic() - start

        print("\nSuccess!")
        print(f"Fetched {len(buildings)} buildings in {duration:.2f}s")

        # Validation
        if len(buildings) > 100:
            print("PASS: Count > 100 (tiling effective)")
        else:
            print("FAIL: Count <= 100 (tiling might be broken or area sparse)")

        if duration < 20.0:
            print("PASS: Duration < 20s (parallelism effective)")
        else:
            print(f"WARN: Duration {duration:.2f}s >= 20s (slow)")

    except Exception as e:
        print(f"FAILED with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Ensure event loop is clean
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(verify_integration())
