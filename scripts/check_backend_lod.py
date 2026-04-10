import httpx
import asyncio

# Keizersgracht 100 details (from docs/conftest.py)
# But we need a valid VBO ID and PAND ID.
# VBO: 0363010000742183 (example, might not match K100 perfectly but good for test)
# Pand: 0363100012253924 (from previous debug script)
# RD: 121307, 487194
# Lat/Lng: 52.374, 4.889 (approx)

VBO_ID = "0363010000742183"
PAND_ID = "0363100012253924"
RD_X = 121308
RD_Y = 487194
LAT = 52.374
LNG = 4.889

URL = f"http://localhost:8000/api/address/{VBO_ID}/neighborhood3d"
PARAMS = {
    "pand_id": PAND_ID,
    "rd_x": RD_X,
    "rd_y": RD_Y,
    "lat": LAT,
    "lng": LNG
}

async def inspect_routes():
    async with httpx.AsyncClient() as client:
        # 1. Check health
        try:
            resp = await client.get("http://localhost:8000/health")
            print(f"Health: {resp.status_code} {resp.text}")
        except Exception as e:
            print(f"Health failed: {e}")
            return

        # 2. Check OpenAPI
        try:
            resp = await client.get("http://localhost:8000/openapi.json")
            if resp.status_code == 200:
                schema = resp.json()
                paths = schema.get("paths", {})
                print(f"Found {len(paths)} paths.")
                for path in paths:
                    if "neighborhood3d" in path:
                        print(f"Route found: {path}")
            else:
                print(f"OpenAPI failed: {resp.status_code}")
        except Exception as e:
            print(f"OpenAPI failed: {e}")

        # 3. Retry the call if route confirmed
        print(f"Retrying call to {URL}...")
        import time
        start_t = time.time()
        resp = await client.get(URL, params=PARAMS, timeout=60.0)
        end_t = time.time()
        print(f"Time taken: {end_t - start_t:.2f} seconds")
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
             data = resp.json()
             print("Success! Buildings:", len(data.get("buildings", [])))
             # check roofs...
             buildings = data.get("buildings", [])
             lod22 = 0
             for b in buildings:
                 if b.get("roof_surfaces"):
                     lod22 += 1
             print(f"Buildings with LoD 2.2: {lod22}")

    if buildings:
        heights = [b.get('ground_height', 0) for b in buildings]
        print(f"Ground Heights: Min={min(heights)}, Max={max(heights)}")
        print(f"Anomalies (< -10 or > 100): {[h for h in heights if h < -10 or h > 100]}")
        
        b = buildings[0]
        if b.get('footprint'):
            print(f"  Footprint[0]: {b['footprint'][0]}")
        if b.get('roof_surfaces'):
            surf = b['roof_surfaces'][0]
            print(f"  Roof[0][0]: {surf[0]}")

if __name__ == "__main__":
    asyncio.run(inspect_routes())
