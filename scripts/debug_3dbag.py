import asyncio
import time
import httpx
import logging
from pprint import pprint

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Settings mock
class Settings:
    three_d_bag_base = "https://api.3dbag.nl"
    enable_lod22_roofs = True

settings = Settings()

async def fetch_building(pand_id):
    url = f"{settings.three_d_bag_base}/collections/pand/items/NL.IMBAG.Pand.{pand_id}"
    print(f"Fetching {url}...")
    async with httpx.AsyncClient() as client:
        start = time.time()
        resp = await client.get(url)
        print(f"Fetch took {time.time() - start:.2f}s")
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            # print keys
            print("Keys:", data.keys())
            
            feature = data.get("feature", data)
            city_objects = feature.get("CityObjects", {})
            print(f"CityObjects count: {len(city_objects)}")
            
            for obj_id, obj in city_objects.items():
                print(f"Object {obj_id} type: {obj.get('type')}")
                if obj.get("type") == "Building":
                    # Check children
                    children = obj.get("children", [])
                    print(f"  Children: {len(children)}")
                    for child_id in children:
                        child = city_objects.get(child_id)
                        if child:
                            print(f"    Child {child_id} type: {child.get('type')}")
                            for geom in child.get("geometry", []):
                                print(f"      Geom LoD: {geom.get('lod')} Type: {geom.get('type')}")
                                if geom.get("lod") == "2.2":
                                    print("      FOUND LoD 2.2!")
                                    boundaries = geom.get("boundaries", [])
                                    print(f"      Boundaries length: {len(boundaries)}")

async def fetch_bbox():
    # Use Keizersgracht 100 coordinates approx (RD: 121307, 487194)
    # With 150m radius
    x, y = 121307, 487194
    r = 150
    bbox = f"{x-r},{y-r},{x+r},{y+r}"
    url = f"{settings.three_d_bag_base}/collections/pand/items?bbox={bbox}&limit=50"
    print(f"Fetching bbox {url}...")
    
    async with httpx.AsyncClient() as client:
        start = time.time()
        resp = await client.get(url, timeout=30)
        print(f"Fetch took {time.time() - start:.2f}s")
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            features = data.get("features", [])
            print(f"Found {len(features)} features")
            
            lod22_count = 0
            for i, feature in enumerate(features):
                city_objects = feature.get("CityObjects", {})
                has_lod22 = False
                for obj in city_objects.values():
                    if obj.get("type") == "Building":
                        children = obj.get("children", [])
                        for child_id in children:
                            child = city_objects.get(child_id)
                            if child and child.get("type") == "BuildingPart":
                                for geom in child.get("geometry", []):
                                    if geom.get("lod") == "2.2":
                                        has_lod22 = True
                                        break
                            if has_lod22: break
                    if has_lod22: break
                
                if has_lod22:
                    lod22_count += 1
                    if lod22_count == 1:
                        print(f"First LoD 2.2 found in feature index {i}")
            
            print(f"Total buildings with LoD 2.2: {lod22_count} / {len(features)}")

async def main():
    await fetch_bbox()

if __name__ == "__main__":
    asyncio.run(main())
