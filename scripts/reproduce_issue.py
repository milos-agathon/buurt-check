import asyncio
import sys
import logging
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.append(str(backend_path))

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("reproduce")

# Coordinates from test_bag.py (Amsterdam area)
RD_X = 121286.0
RD_Y = 487296.0
PAND_ID = "0363100012253924"
LAT = 52.372
LNG = 4.892

async def main():
    from app.services.three_d_bag import get_neighborhood_3d

    print(f"--- Testing 3D Fetch for PAND {PAND_ID} at ({RD_X}, {RD_Y}) ---")
    
    # Test 1: Old Radius (225m)
    print("\n[1] Fetching with radius=225.0...")
    try:
        res_225 = await get_neighborhood_3d(PAND_ID, RD_X, RD_Y, LAT, LNG, radius=225.0)
        count_225 = len(res_225.buildings)
        print(f"-> Radius 225.0 returned {count_225} buildings")
        
        if count_225 > 0:
            # footprint is relative to center.
            # BuildingBlock doesn't store absolute coords directly, but footprint is relative to center.
            xs = [p[0] for b in res_225.buildings for p in b.footprint]
            ys = [p[1] for b in res_225.buildings for p in b.footprint]
            print(f"   Extent: X[{min(xs):.1f}, {max(xs):.1f}], Y[{min(ys):.1f}, {max(ys):.1f}]")

    except Exception as e:
        print(f"!!! Error fetching 225m: {e}")
        return

    # Test 2: New Radius (375m)
    print("\n[2] Fetching with radius=375.0...")
    try:
        res_375 = await get_neighborhood_3d(PAND_ID, RD_X, RD_Y, LAT, LNG, radius=375.0)
        count_375 = len(res_375.buildings)
        print(f"-> Radius 375.0 returned {count_375} buildings")
        
        if count_375 > 0:
            xs = [p[0] for b in res_375.buildings for p in b.footprint]
            ys = [p[1] for b in res_375.buildings for p in b.footprint]
            print(f"   Extent: X[{min(xs):.1f}, {max(xs):.1f}], Y[{min(ys):.1f}, {max(ys):.1f}]")

    except Exception as e:
        print(f"!!! Error fetching 375m: {e}")

    print("\n--- Summary ---")
    if count_375 > count_225:
        print("SUCCESS: 375m radius fetched MORE buildings.")
        print(f"Increase: +{count_375 - count_225} buildings")
    elif count_375 == count_225:
        print("FAILURE: 375m radius fetched SAME number of buildings.")
        print("Possible causes: Tiling limits, API limits, or max fetch depth.")
    else:
        print("weird: fetched fewer?")

if __name__ == "__main__":
    asyncio.run(main())
