import { BufferAttribute, BufferGeometry, Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { SerializedBuilding } from './sunlightWorkerTypes';

/**
 * Serialize Three.js meshes into transferable structs for Worker execution.
 * Matrix transforms are baked into output vertices so geometry is world-space.
 */
export function serializeBuildings(objects: Object3D[]): SerializedBuilding[] {
  const result: SerializedBuilding[] = [];

  for (const obj of objects) {
    if (!(obj instanceof Mesh)) continue;

    const geometry = obj.geometry;
    if (!(geometry instanceof BufferGeometry)) continue;

    const posAttr = geometry.getAttribute('position');
    if (!posAttr) continue;

    obj.updateMatrixWorld(true);

    const positions = new Float32Array(posAttr.count * 3);
    const vertex = new Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      vertex.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      vertex.applyMatrix4(obj.matrixWorld);
      positions[(i * 3)] = vertex.x;
      positions[(i * 3) + 1] = vertex.y;
      positions[(i * 3) + 2] = vertex.z;
    }

    const indices = geometry.index
      ? Uint32Array.from(geometry.index.array as Iterable<number>)
      : undefined;

    result.push({
      positions,
      indices,
      pandId: typeof obj.userData.pandId === 'string' ? obj.userData.pandId : '',
      isGround: Boolean(obj.userData.isGround),
    });
  }

  return result;
}

/** Extract transferable ArrayBuffers for zero-copy postMessage. */
export function getTransferables(buildings: SerializedBuilding[]): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const building of buildings) {
    buffers.push(building.positions.buffer as ArrayBuffer);
    if (building.indices) {
      buffers.push(building.indices.buffer as ArrayBuffer);
    }
  }
  return buffers;
}

/** Reconstruct lightweight Meshes from serialized geometry in a Worker. */
export function deserializeBuildings(serialized: SerializedBuilding[]): Mesh[] {
  const meshes: Mesh[] = [];

  for (const building of serialized) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(building.positions, 3));
    if (building.indices && building.indices.length > 0) {
      geometry.setIndex(new BufferAttribute(building.indices, 1));
    }
    geometry.computeBoundingSphere();

    const mesh = new Mesh(geometry);
    mesh.userData = { pandId: building.pandId, isGround: building.isGround };
    meshes.push(mesh);
  }

  return meshes;
}
