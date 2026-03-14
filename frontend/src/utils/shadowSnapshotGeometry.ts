export interface FootprintCentroid {
  x: number;
  y: number;
}

function normalizeOrientationDeg(orientationDeg: number): number {
  return ((orientationDeg % 180) + 180) % 180;
}

export function centroidOfFootprint(footprint: number[][]): FootprintCentroid {
  if (footprint.length === 0) {
    return { x: 0, y: 0 };
  }
  const centroid = footprint.reduce(
    (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
    { x: 0, y: 0 },
  );
  return {
    x: centroid.x / footprint.length,
    y: centroid.y / footprint.length,
  };
}

export function frontSnapshotBearingDeg(
  footprint: number[][],
  orientationDegRaw: number | null | undefined,
): number {
  const orientationDeg = typeof orientationDegRaw === 'number' && Number.isFinite(orientationDegRaw)
    ? normalizeOrientationDeg(orientationDegRaw)
    : 0;

  if (footprint.length < 3) {
    return orientationDeg;
  }

  const { x: cx, y: cy } = centroidOfFootprint(footprint);
  const orientRad = (orientationDeg * Math.PI) / 180;
  const alongX = Math.sin(orientRad);
  const alongY = Math.cos(orientRad);
  const perpX = Math.cos(orientRad);
  const perpY = -Math.sin(orientRad);

  let minAlong = Infinity;
  let maxAlong = -Infinity;
  let minPerp = Infinity;
  let maxPerp = -Infinity;

  for (const [fx, fy] of footprint) {
    const dx = fx - cx;
    const dy = fy - cy;
    const along = dx * alongX + dy * alongY;
    const perp = dx * perpX + dy * perpY;
    if (along < minAlong) minAlong = along;
    if (along > maxAlong) maxAlong = along;
    if (perp < minPerp) minPerp = perp;
    if (perp > maxPerp) maxPerp = perp;
  }

  const addrAlong = (-cx) * alongX + (-cy) * alongY;
  const addrPerp = (-cx) * perpX + (-cy) * perpY;

  const faceCandidates = [
    { bearing: orientationDeg, dist: maxAlong - addrAlong },
    { bearing: (orientationDeg + 180) % 360, dist: addrAlong - minAlong },
    { bearing: (orientationDeg + 90) % 360, dist: maxPerp - addrPerp },
    { bearing: (orientationDeg + 270) % 360, dist: addrPerp - minPerp },
  ];

  faceCandidates.sort((a, b) => a.dist - b.dist);
  return faceCandidates[0].bearing;
}

export function snapshotCameraScenePosition(
  centroid: FootprintCentroid,
  bearingDeg: number,
  planarDistance: number,
): { x: number; z: number } {
  const bearingRad = (bearingDeg * Math.PI) / 180;
  return {
    x: centroid.x + Math.sin(bearingRad) * planarDistance,
    z: -(centroid.y + Math.cos(bearingRad) * planarDistance),
  };
}

export function snapshotTargetSceneZ(centroidY: number): number {
  return -centroidY;
}

export function northOverlayRotationRad(bearingDeg: number): number {
  return Math.PI - ((bearingDeg * Math.PI) / 180);
}
