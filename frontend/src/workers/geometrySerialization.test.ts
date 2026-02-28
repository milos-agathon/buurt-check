import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { deserializeBuildings, getTransferables, serializeBuildings } from './geometrySerialization';

describe('serializeBuildings', () => {
  it('extracts world-space positions and userData from meshes', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]), 3),
    );
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.position.set(10, 2, -4);
    mesh.userData = { pandId: 'test-pand', isGround: false };

    const serialized = serializeBuildings([mesh]);

    expect(serialized).toHaveLength(1);
    expect(serialized[0].pandId).toBe('test-pand');
    expect(serialized[0].isGround).toBe(false);
    expect(Array.from(serialized[0].positions)).toEqual([
      10, 2, -4,
      11, 2, -4,
      10, 3, -4,
    ]);
  });

  it('skips non-Mesh objects', () => {
    const group = new Object3D();
    const serialized = serializeBuildings([group]);
    expect(serialized).toHaveLength(0);
  });

  it('returns position and index buffers as transferables', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]), 3),
    );
    geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2]), 1));
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.userData = { pandId: 'p1', isGround: false };

    const serialized = serializeBuildings([mesh]);
    const transferables = getTransferables(serialized);

    expect(transferables).toHaveLength(2);
    expect(transferables[0]).toBe(serialized[0].positions.buffer);
    expect(transferables[1]).toBe(serialized[0].indices?.buffer);
  });
});

describe('deserializeBuildings', () => {
  it('reconstructs meshes with positions, indices, and userData', () => {
    const meshes = deserializeBuildings([{
      positions: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]),
      indices: new Uint32Array([0, 1, 2]),
      pandId: 'p1',
      isGround: true,
    }]);

    expect(meshes).toHaveLength(1);
    expect(meshes[0].userData.pandId).toBe('p1');
    expect(meshes[0].userData.isGround).toBe(true);

    const geometry = meshes[0].geometry as BufferGeometry;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();

    expect(position?.count).toBe(3);
    expect(Array.from(index?.array as ArrayLike<number>)).toEqual([0, 1, 2]);
  });
});
