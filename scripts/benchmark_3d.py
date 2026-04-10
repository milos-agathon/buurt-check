
import asyncio
import time
from app.services.three_d_bag import get_neighborhood_3d

# Test coordinates (same as in tests)
PAND_ID = "0537100000015479"
VBO_ID = "0537010000024135"
RD_X = 89221.0
RD_Y = 466389.0
LAT = 52.18171429
LNG = 4.42541098

async def run_benchmark():
    print(f"Benchmarking 3D fetch for pand_id={PAND_ID}...")
    start = time.perf_counter()
    
    try:
        result = await get_neighborhood_3d(
            pand_id=PAND_ID,
            rd_x=RD_X,
            rd_y=RD_Y,
            lat=LAT,
            lng=LNG,
            vbo_id=VBO_ID,
            # radius will use default (now 80.0)
        )
        duration = time.perf_counter() - start
        
        print(f"\n✅ Fetch completed in {duration:.2f} seconds")
        print(f"Buildings found: {len(result.buildings)}")
        print(f"Message: {result.message}")
        
    except Exception as e:
        print(f"\n❌ Failed: {e}")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
