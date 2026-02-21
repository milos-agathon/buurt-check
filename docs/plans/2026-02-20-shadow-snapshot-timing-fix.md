# Shadow Snapshot Timing Bug Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the bug where shadow snapshots capture an empty scene (only target building visible, all neighbor buildings missing).

**Architecture:** The snapshot capture `useEffect` runs in the same React effect batch as the building-add `useEffect`. Neighbor buildings are added asynchronously via `requestAnimationFrame` chunks, but snapshots are captured immediately — before any neighbors exist in the scene. The fix moves snapshot capture to trigger AFTER all building chunks are processed, using a ref-based signaling pattern.

**Tech Stack:** React 18, Three.js, TypeScript, Vitest

---

## Root Cause Analysis

When Phase 2 3D data arrives from `getNeighborhood3D()`, React batches `setNeighborhood3D(merged3d)` + `setSurroundingLoading(false)` into a single re-render. Two effects fire in declaration order:

1. **Building-add effect** (line 383): Adds target building synchronously (line 446), then schedules neighbor buildings via `requestAnimationFrame(addNeighborChunk)` (line 521).
2. **Snapshot effect** (line 750): Sees `buildings.length > 0` and `onShadowSnapshots` is now available, captures the scene — but only the target building mesh exists. All ~100-200 neighbor meshes are still in the rAF queue.

**Evidence:** Screenshots show near-black images with tiny green specks (target building at Arctic Teal `0x2EC4B6`). Neighbors absent.

**Secondary issue:** `WebGLRenderer` created without `preserveDrawingBuffer: true` (line 236). Some browsers may return blank from `canvas.toDataURL()` without it.

---

### Task 1: Add `preserveDrawingBuffer` to WebGLRenderer

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx:236`

**Step 1: Write the failing test**

Add a test to `frontend/src/components/NeighborhoodViewer3D.test.tsx` that verifies the WebGLRenderer is created with `preserveDrawingBuffer: true`:

```typescript
it('creates WebGLRenderer with preserveDrawingBuffer for snapshot support', () => {
  // Track constructor calls
  const WebGLRenderer = vi.mocked(
    (await import('three')).WebGLRenderer
  );
  renderViewer();
  // The mock doesn't track constructor args by default, so we
  // verify indirectly: the renderer should be able to produce
  // non-blank toDataURL results (already covered by snapshot test).
  // This test is a documentation marker.
  expect(screen.getByTestId('viewer-3d-canvas')).toBeInTheDocument();
});
```

Actually — the Three.js mock in this file replaces WebGLRenderer with a mock constructor that ignores arguments. We can't meaningfully assert `preserveDrawingBuffer` via the mock. Skip this test and just make the code change. The real validation is in Task 3's snapshot test.

**Step 1: Make the code change**

In `NeighborhoodViewer3D.tsx` line 236, change:
```typescript
const renderer = new WebGLRenderer({ antialias: true });
```
to:
```typescript
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
```

**Step 2: Run existing tests to verify no regression**

Run: `cd frontend && npx vitest run src/components/NeighborhoodViewer3D.test.tsx`
Expected: All tests pass (no behavior change, just a constructor option).

**Step 3: Commit**

```bash
git add frontend/src/components/NeighborhoodViewer3D.tsx
git commit -m "fix: add preserveDrawingBuffer for reliable snapshot toDataURL"
```

---

### Task 2: Refactor snapshot capture into a callback + ref-based trigger

This is the core fix. We need to:
1. Track `onShadowSnapshots` via a ref so rAF callbacks can access it
2. Extract snapshot logic into a `useCallback`
3. Remove the standalone snapshot `useEffect`
4. Trigger snapshots from the neighbor chunk completion path
5. Add a fallback effect for when `onShadowSnapshots` arrives after buildings are loaded

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx`

**Step 1: Write a failing test**

Add to `NeighborhoodViewer3D.test.tsx`:

```typescript
it('captures shadow snapshots only after all neighbor chunks are processed', () => {
  // Collect rAF callbacks so we can control when chunks execute
  const rafCallbacks: (() => void)[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallbacks.push(cb as () => void);
    return ++rafId;
  });

  const onSnapshots = vi.fn();
  renderViewer({ onShadowSnapshots: onSnapshots });

  // At this point, the target building is added synchronously.
  // Neighbor chunks are scheduled via rAF but haven't executed.
  // Snapshots should NOT have been captured yet.
  expect(onSnapshots).not.toHaveBeenCalled();

  // Execute all pending rAF callbacks (building chunks + final snapshot trigger)
  let safety = 0;
  while (rafCallbacks.length > 0 && safety < 50) {
    const cb = rafCallbacks.shift()!;
    cb();
    safety++;
  }

  // Now snapshots should have been captured
  expect(onSnapshots).toHaveBeenCalledTimes(1);
  expect(onSnapshots).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ label: 'morning', hour: 9 }),
      expect.objectContaining({ label: 'noon', hour: 12 }),
      expect.objectContaining({ label: 'evening', hour: 17 }),
    ])
  );
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/NeighborhoodViewer3D.test.tsx -t "captures shadow snapshots"`
Expected: FAIL — with current code, `onSnapshots` is called during the initial effect batch (before rAF callbacks execute), so the `not.toHaveBeenCalled()` assertion fails.

**Step 3: Implement the fix**

In `NeighborhoodViewer3D.tsx`, make these changes:

**3a. Add a ref for the `onShadowSnapshots` callback** (after the existing refs around line 157):

```typescript
const onShadowSnapshotsRef = useRef(onShadowSnapshots);
onShadowSnapshotsRef.current = onShadowSnapshots;
const allBuildingsReadyRef = useRef(false);
```

**3b. Extract snapshot capture into a `useCallback`** (after the `computeSunlight` callback, around line 739):

```typescript
const captureSnapshots = useCallback(() => {
  const ctx = sceneRef.current;
  const callback = onShadowSnapshotsRef.current;
  if (!ctx || !callback || snapshotsCaptured.current) return;
  if (!allBuildingsReadyRef.current) return;
  snapshotsCaptured.current = true;

  const savedCameraPos = ctx.camera.position.clone();
  const savedSunPos = ctx.sunLight.position.clone();
  const savedSunIntensity = ctx.sunLight.intensity;

  ctx.camera.position.set(0, 200, 0.1);
  ctx.camera.lookAt(0, 0, 0);
  ctx.camera.updateProjectionMatrix();

  const year = new Date().getFullYear();
  const winterSolstice = new Date(year, 11, 21);
  const snapshotConfigs = [
    { hour: 9, label: 'morning' },
    { hour: 12, label: 'noon' },
    { hour: 17, label: 'evening' },
  ];

  const snapshots: ShadowSnapshot[] = [];

  for (const config of snapshotConfigs) {
    const date = new Date(winterSolstice);
    date.setHours(config.hour, 0, 0, 0);

    const sunPos = SunCalc.getPosition(date, center.lat, center.lng);

    if (sunPos.altitude > 0) {
      const az = sunPos.azimuth;
      const alt = sunPos.altitude;
      const x = -Math.sin(az) * Math.cos(alt) * SUN_DISTANCE;
      const y = Math.sin(alt) * SUN_DISTANCE;
      const z = Math.cos(az) * Math.cos(alt) * SUN_DISTANCE;
      ctx.sunLight.position.set(x, y, z);
      ctx.sunLight.intensity = 0.8;
    } else {
      ctx.sunLight.intensity = 0;
    }

    ctx.renderer.render(ctx.scene, ctx.camera);
    const dataUrl = ctx.renderer.domElement.toDataURL('image/png');

    snapshots.push({ label: config.label, hour: config.hour, dataUrl });
  }

  // Restore camera and sun state
  ctx.camera.position.copy(savedCameraPos);
  ctx.camera.lookAt(0, 0, 0);
  ctx.camera.updateProjectionMatrix();
  ctx.sunLight.position.copy(savedSunPos);
  ctx.sunLight.intensity = savedSunIntensity;
  renderOnce();

  callback(snapshots);
}, [center.lat, center.lng, renderOnce]);
```

**3c. In the building-add effect**, reset `allBuildingsReadyRef` and trigger snapshot capture when chunks complete.

At line 462, after `snapshotsCaptured.current = false;`, add:
```typescript
allBuildingsReadyRef.current = false;
```

In the `addNeighborChunk` function, at line 512-516 (the completion branch), add the snapshot trigger:
```typescript
} else {
  neighborBuildFrameRef.current = null;
  if (!neighborMaterialUsed) {
    disposeNeighborMaterial();
  }
  allBuildingsReadyRef.current = true;
  captureSnapshots();
}
```

Also handle the no-neighbors case at line 522-524:
```typescript
if (deferredNeighbors.length > 0) {
  neighborBuildFrameRef.current = requestAnimationFrame(addNeighborChunk);
} else {
  disposeNeighborMaterial();
  allBuildingsReadyRef.current = true;
  captureSnapshots();
}
```

Add `captureSnapshots` to the effect's dependency array (line 536):
```typescript
}, [buildings, targetPandId, frameCamera, renderOnce, captureSnapshots]);
```

**3d. Replace the standalone snapshot `useEffect`** (lines 749-806) with a fallback effect that handles `onShadowSnapshots` arriving after buildings are ready:

```typescript
// Fallback: capture snapshots when onShadowSnapshots callback arrives after buildings are ready
useEffect(() => {
  if (onShadowSnapshots && allBuildingsReadyRef.current && !snapshotsCaptured.current) {
    captureSnapshots();
  }
}, [onShadowSnapshots, captureSnapshots]);
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/NeighborhoodViewer3D.test.tsx`
Expected: All tests pass, including the new one.

**Step 5: Run full frontend test suite**

Run: `cd frontend && npm run test`
Expected: 448+ tests pass.

**Step 6: Run build to verify TypeScript**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add frontend/src/components/NeighborhoodViewer3D.tsx
git add frontend/src/components/NeighborhoodViewer3D.test.tsx
git commit -m "fix: delay shadow snapshot capture until all neighbor buildings are in scene

The snapshot useEffect was running in the same React effect batch as the
building-add useEffect. Neighbor buildings are added via requestAnimationFrame
chunks, but snapshots fired before any chunks executed — capturing a scene
with only the target building.

Fix: extract snapshot capture into a callback, trigger it from the chunk
completion path, and add a fallback effect for late onShadowSnapshots arrival."
```

---

### Task 3: Manual verification via Puppeteer

**Step 1:** Start backend + frontend dev servers.

**Step 2:** Navigate to `http://localhost:5173` in Puppeteer at iPhone dimensions (390x844).

**Step 3:** Search for an address (e.g., "Damrak 1, Amsterdam") and wait for the dossier to load.

**Step 4:** Scroll down to the shadow snapshots section ("Schaduwbeelden"). Verify that the 3 snapshot images show buildings (not black/empty).

**Step 5:** Take a screenshot and compare with the pre-fix state.

---

## Summary of Changes

| File | Change |
|------|--------|
| `NeighborhoodViewer3D.tsx:236` | Add `preserveDrawingBuffer: true` |
| `NeighborhoodViewer3D.tsx:157` | Add `onShadowSnapshotsRef` + `allBuildingsReadyRef` |
| `NeighborhoodViewer3D.tsx:~740` | New `captureSnapshots` useCallback |
| `NeighborhoodViewer3D.tsx:~512` | Trigger `captureSnapshots()` on chunk completion |
| `NeighborhoodViewer3D.tsx:~522` | Trigger `captureSnapshots()` for no-neighbors case |
| `NeighborhoodViewer3D.tsx:749-806` | Replace standalone snapshot useEffect with fallback |
| `NeighborhoodViewer3D.test.tsx` | Add timing-aware snapshot capture test |
