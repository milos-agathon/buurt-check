import {
  centroidOfFootprint,
  frontSnapshotBearingDeg,
  northOverlayRotationRad,
  snapshotCameraScenePosition,
  snapshotTargetSceneZ,
} from './shadowSnapshotGeometry';

describe('shadowSnapshotGeometry', () => {
  it('selects the facade nearest to the address point as the front view', () => {
    const footprint = [
      [5, 15],
      [-5, 15],
      [-5, 5],
      [5, 5],
    ];

    expect(frontSnapshotBearingDeg(footprint, 0)).toBe(180);
  });

  it('converts raw footprint coordinates to scene-space camera coordinates', () => {
    const centroid = centroidOfFootprint([
      [5, 15],
      [-5, 15],
      [-5, 5],
      [5, 5],
    ]);

    expect(centroid).toEqual({ x: 0, y: 10 });
    const camera = snapshotCameraScenePosition(centroid, 180, 12);
    expect(camera.x).toBeCloseTo(0);
    expect(camera.z).toBeCloseTo(2);
    expect(snapshotTargetSceneZ(centroid.y)).toBe(-10);
  });

  it('rotates the compass so north matches the current camera side', () => {
    expect(northOverlayRotationRad(180)).toBeCloseTo(0);
    expect(northOverlayRotationRad(0)).toBeCloseTo(Math.PI);
  });
});
