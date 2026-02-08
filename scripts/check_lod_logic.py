import httpx
import asyncio
import json

# Mimic the backend function exactly
def _extract_lod22_surfaces(
    city_object: dict,
    city_objects: dict,
    vertices: list[list[int]],
    scale: list[float],
    translate: list[float],
    center_x: float,
    center_y: float,
) -> list[list[list[float]]] | None:
    children_ids = city_object.get("children", [])
    if not children_ids:
        print("No children found.")
        return None

    surfaces = []
    print(f"Checking {len(children_ids)} children...")

    for child_id in children_ids:
        child = city_objects.get(child_id)
        if not child:
            print(f"Child {child_id} not found in city_objects.")
            continue
        
        print(f"Child {child_id} type: {child.get('type')}")
        if child.get("type") != "BuildingPart":
            continue

        for geom in child.get("geometry", []):
            lod = str(geom.get("lod", ""))
            geom_type = geom.get("type")
            print(f"  Geom LoD: '{lod}' Type: '{geom_type}'")
            
            # Backend logic:
            if lod != "2.2" or geom_type != "Solid":
                print("  Skipping (not 2.2 Solid)")
                continue

            boundaries = geom.get("boundaries", [])
            if not boundaries:
                print("  No boundaries")
                continue

            # Outer shell is boundaries[0]
            outer_shell = boundaries[0]
            # Verify shell structure
            print(f"  Shell surfaces: {len(outer_shell)}")
            
            for i, surface in enumerate(outer_shell):
                if not surface:
                    continue
                # First ring is the outer boundary
                # Logic: outer_ring = surface[0] if isinstance(surface[0], list) else surface
                is_list = isinstance(surface[0], list)
                outer_ring = surface[0] if is_list else surface
                # print(f"    Surface {i}: ring length {len(outer_ring)} (nested? {is_list})")

                decoded = []
                for idx in outer_ring:
                    if idx >= len(vertices):
                        continue
                    v = vertices[idx]
                    # Simulate transform
                    real_x = v[0] * scale[0] + translate[0]
                    real_y = v[1] * scale[1] + translate[1]
                    real_z = v[2] * scale[2] + translate[2]
                    dx = round(real_x - center_x, 2)
                    dy = round(real_y - center_y, 2)
                    decoded.append([dx, dy, round(real_z, 2)])

                if len(decoded) >= 3:
                    surfaces.append(decoded)

    print(f"Extracted {len(surfaces)} surfaces.")
    return surfaces if surfaces else None

async def main():
    # Use Keizersgracht 100 bbox query again
    url = "https://api.3dbag.nl/collections/pand/items"
    bbox = "121307,487194,121357,487244"
    params = {"bbox": bbox, "limit": 1} # Get just one
    
    async with httpx.AsyncClient() as client:
        print(f"Fetching {url}...")
        resp = await client.get(url, params=params)
        if resp.status_code != 200:
            print(f"Error: {resp.status_code}")
            return
            
        data = resp.json()
        features = data.get("features", [])
        if not features:
            print("No features found.")
            return

        feature = features[0]
        # print("Feature keys:", feature.keys())
        
        # Setup for extraction
        city_objects = feature.get("CityObjects", {})
        vertices = feature.get("vertices", [])
        # Transform check
        transform = feature.get("metadata", {}).get("transform", {}) # Might be in root
        if not transform:
            transform = data.get("metadata", {}).get("transform", {}) # Fallback to root
            
        scale = transform.get("scale", [0.001, 0.001, 0.001])
        translate = transform.get("translate", [0.0, 0.0, 0.0])
        
        center_x = 0
        center_y = 0 # Offset doesn't matter for logic check
        
        # Find a building
        for obj_id, obj in city_objects.items():
            if obj.get("type") == "Building":
                print(f"Testing Building {obj_id}...")
                surfaces = _extract_lod22_surfaces(
                    obj, city_objects, vertices, scale, translate, center_x, center_y
                )
                if surfaces:
                    print("SUCCESS! Extraction worked.")
                else:
                    print("FAILURE! No surfaces extracted.")

if __name__ == "__main__":
    asyncio.run(main())
