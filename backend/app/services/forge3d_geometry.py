"""Convert buurt-check BuildingBlock geometry to forge3d Building objects.

Handles both LoD 2.2 roof surfaces (from 3DBAG) and fallback extruded
footprints.  All input coordinates are metre offsets from a centre point
in EPSG:28992 (RD New).  forge3d expects flat numpy arrays with an
explicit index buffer.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from app.models.neighborhood3d import BuildingBlock

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Material constants — "Polar Frost" palette mapped to PBR
# ---------------------------------------------------------------------------

# Stitch Teal (target building) — #0D9488 = (0.05, 0.58, 0.53)
TARGET_MATERIAL = {
    "albedo": (0.05, 0.58, 0.53),
    "roughness": 0.5,
    "metallic": 0.06,
    "emissive": 0.55,
}

# Blue-gray (neighbouring buildings) — darker for clear contrast vs ground
NEIGHBOR_MATERIAL = {
    "albedo": (0.40, 0.46, 0.52),
    "roughness": 0.86,
    "metallic": 0.05,
    "emissive": 0.0,
}

# Ground plane — light gray-blue for maximum shadow visibility
GROUND_MATERIAL = {
    "albedo": (0.88, 0.91, 0.94),
    "roughness": 0.95,
    "metallic": 0.02,
    "emissive": 0.0,
}


def _extrude_footprint(
    footprint: list[list[float]],
    ground_z: float,
    roof_z: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Extrude a 2-D footprint polygon to a 3-D solid.

    Returns (positions, indices, normals) as flat float32/uint32 arrays.
    Positions are (N, 3), indices are triangle indices, normals are per-vertex.
    """
    n = len(footprint)
    if n < 3:
        return (
            np.zeros((0, 3), dtype=np.float32),
            np.zeros(0, dtype=np.uint32),
            np.zeros((0, 3), dtype=np.float32),
        )

    # Vertices: bottom ring + top ring + roof fan centre
    verts: list[list[float]] = []
    norms: list[list[float]] = []
    tris: list[int] = []

    # --- Bottom ring (indices 0..n-1) ---
    for dx, dy in footprint:
        verts.append([dx, ground_z, dy])
        norms.append([0.0, -1.0, 0.0])

    # --- Top ring (indices n..2n-1) ---
    for dx, dy in footprint:
        verts.append([dx, roof_z, dy])
        norms.append([0.0, 1.0, 0.0])

    # --- Roof fan (top ring, triangle fan from vertex n) ---
    for i in range(1, n - 1):
        tris.extend([n, n + i, n + i + 1])

    # --- Bottom fan (reversed winding) ---
    for i in range(1, n - 1):
        tris.extend([0, i + 1, i])

    # --- Side walls (2 tris per edge) ---
    for i in range(n):
        j = (i + 1) % n

        # Compute outward normal for this wall segment
        dx = footprint[j][0] - footprint[i][0]
        dy = footprint[j][1] - footprint[i][1]
        length = max((dx**2 + dy**2) ** 0.5, 1e-9)
        nx, nz = dy / length, -dx / length  # perpendicular in xz plane

        # 4 new vertices for this wall quad (sharp normals)
        base = len(verts)
        verts.append([footprint[i][0], ground_z, footprint[i][1]])
        norms.append([nx, 0.0, nz])
        verts.append([footprint[j][0], ground_z, footprint[j][1]])
        norms.append([nx, 0.0, nz])
        verts.append([footprint[j][0], roof_z, footprint[j][1]])
        norms.append([nx, 0.0, nz])
        verts.append([footprint[i][0], roof_z, footprint[i][1]])
        norms.append([nx, 0.0, nz])

        tris.extend([base, base + 1, base + 2])
        tris.extend([base, base + 2, base + 3])

    positions = np.array(verts, dtype=np.float32)
    indices = np.array(tris, dtype=np.uint32)
    normals = np.array(norms, dtype=np.float32)
    return positions, indices, normals


def _roof_surfaces_to_mesh(
    roof_surfaces: list[list[list[float]]],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Convert LoD 2.2 roof surfaces to a triangle mesh.

    Each surface is a polygon: [[dx, dy, z_nap], ...].
    Uses simple fan triangulation (sufficient for convex 3DBAG polygons).
    Returns (positions, indices, normals).
    """
    all_verts: list[list[float]] = []
    all_indices: list[int] = []
    offset = 0

    for surface in roof_surfaces:
        n = len(surface)
        if n < 3:
            continue

        # Convert to forge3d coordinate order: [x, z_nap, y]
        # (forge3d uses Y-up, same as Three.js convention)
        for dx, dy, z_nap in surface:
            all_verts.append([dx, z_nap, dy])

        # Fan triangulation from first vertex
        for i in range(1, n - 1):
            all_indices.extend([offset, offset + i, offset + i + 1])

        offset += n

    if not all_verts:
        return (
            np.zeros((0, 3), dtype=np.float32),
            np.zeros(0, dtype=np.uint32),
            np.zeros((0, 3), dtype=np.float32),
        )

    positions = np.array(all_verts, dtype=np.float32)
    indices = np.array(all_indices, dtype=np.uint32)

    # Compute per-face normals, expand to per-vertex
    normals = np.zeros_like(positions)
    for i in range(0, len(indices), 3):
        i0, i1, i2 = indices[i], indices[i + 1], indices[i + 2]
        v0, v1, v2 = positions[i0], positions[i1], positions[i2]
        edge1 = v1 - v0
        edge2 = v2 - v0
        normal = np.cross(edge1, edge2)
        length = np.linalg.norm(normal)
        if length > 1e-9:
            normal /= length
        normals[i0] += normal
        normals[i1] += normal
        normals[i2] += normal

    # Normalize accumulated normals
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    lengths = np.maximum(lengths, 1e-9)
    normals /= lengths

    return positions, indices, normals


def building_block_to_mesh(
    block: BuildingBlock,
    *,
    use_lod22: bool = True,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Convert a BuildingBlock to mesh arrays.

    Uses LoD 2.2 roof surfaces when available and *use_lod22* is True,
    otherwise falls back to extruded footprint.

    Returns:
        (positions, indices, normals) — positions shape (N, 3), Y-up.
    """
    if use_lod22 and block.roof_surfaces:
        positions, indices, normals = _roof_surfaces_to_mesh(block.roof_surfaces)
        if positions.size > 0:
            return positions, indices, normals
        # Fall through to extrusion if roof parsing produced nothing
        logger.debug(
            "LoD 2.2 mesh empty for %s, falling back to extrusion",
            block.pand_id,
        )

    return _extrude_footprint(
        block.footprint,
        ground_z=block.ground_height,
        roof_z=block.ground_height + block.building_height,
    )


def building_blocks_to_forge3d_scene(
    target: BuildingBlock,
    neighbors: list[BuildingBlock],
) -> dict:
    """Convert BAG geometry to a forge3d-ready scene description.

    Returns a dict with keys:
        target_mesh: {positions, indices, normals, material}
        neighbor_meshes: [{positions, indices, normals, material}, ...]
        ground: {size, material}
        center_height: float  (camera look-at Y)
        orientation_deg: float | None
    """
    t_pos, t_idx, t_nrm = building_block_to_mesh(target, use_lod22=True)

    neighbor_meshes = []
    for nb in neighbors:
        try:
            n_pos, n_idx, n_nrm = building_block_to_mesh(nb, use_lod22=True)
            if n_pos.size > 0:
                neighbor_meshes.append(
                    {
                        "positions": n_pos,
                        "indices": n_idx,
                        "normals": n_nrm,
                        "material": NEIGHBOR_MATERIAL,
                        "pand_id": nb.pand_id,
                    }
                )
        except Exception:
            logger.debug("Skipping neighbor %s: mesh conversion failed", nb.pand_id)

    center_height = target.ground_height + target.building_height * 0.45

    # Compute footprint centroid offset from scene centre (= address point).
    # This lets the renderer disambiguate the 180° front/rear ambiguity by
    # knowing which side of the building faces the address point (street side).
    footprint_centroid: tuple[float, float] | None = None
    if target.footprint and len(target.footprint) >= 3:
        cx = sum(pt[0] for pt in target.footprint) / len(target.footprint)
        cy = sum(pt[1] for pt in target.footprint) / len(target.footprint)
        footprint_centroid = (cx, cy)

    return {
        "target_mesh": {
            "positions": t_pos,
            "indices": t_idx,
            "normals": t_nrm,
            "material": TARGET_MATERIAL,
            "pand_id": target.pand_id,
        },
        "neighbor_meshes": neighbor_meshes,
        "ground": {
            "size": 200.0,  # metres — enough for shadow casting at close zoom
            "material": GROUND_MATERIAL,
        },
        "center_height": center_height,
        "orientation_deg": target.orientation_deg,
        "building_height": target.building_height,
        "ground_height": target.ground_height,
        "footprint_centroid": footprint_centroid,
    }
