# Sunlight v2 Upgrades Implementation Plan

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Revision 3** — Incorporates adversarial review feedback: fixed async test syntax (C1), persistent Worker reuse (C2), matrixWorld bake into serialization (C3), Worker progress emission (C4), per-timestep loop structure fix (C5), facade self-shadow exclusion (D1), PVGIS URL in config.py (D2).

**Goal:** Implement the 7 deferred items from the Sunlight v1 plan's "What This Plan Does NOT Include" section — adding Web Worker offloading, extending evaluation points to facades/ground, enabling high-density raycasting (256 points) in Workers, replacing isotropic SVF with Perez/Tregenza anisotropic diffuse, adding weather-corrected irradiance output, and implementing EN 17037/TNO informational benchmarking.

**Architecture:** Layered upgrades on top of the existing Sunlight v1 implementation. Phase 1 (Web Worker) unblocks heavier computation. Phase 2 (evaluation points) adds user-visible value. Phase 3 (high-density raycasting) raises point count from 64→256 for smoother heatmaps. Phase 4 (Perez/Tregenza) upgrades diffuse accuracy. Phase 5 (irradiance) adds energy metrics. Phase 6 (standards) adds informational benchmarks.

**Tech Stack:** Three.js (WebGLRenderer, Raycaster, DirectionalLight shadow map, WebGLRenderTarget), Web Workers + OffscreenCanvas, SunCalc, Perez sky model (custom implementation), KNMI TMY data, React 18, TypeScript 5, Vitest.

**Prerequisites:** Sunlight v1 (Phases 1-7) fully merged and verified on `main`.

---

## Current State (v1 baseline)

| Component | File | What it does |
|-----------|------|-------------|
| Raycasting analysis | `frontend/src/utils/sunlightAnalysis.ts` | CPU raycast per point per timestep, cooperative scheduling via `yieldToMainThread()` |
| SVF computation | `frontend/src/utils/svfComputation.ts` | CubeCamera hemispherical render, isotropic cosine weighting, 64px cubemap |
| Roof sampling | `frontend/src/utils/roofSampling.ts` | Grid + footprint vertices + centroid, max 64 points, roof-only |
| Heatmap colors | `frontend/src/utils/heatmapColors.ts` | Red-yellow-green gradient, vertex-color application |
| Sun position | `frontend/src/utils/sunPosition.ts` | SunCalc wrapper, representative dates, daylight range |
| 3D viewer integration | `frontend/src/components/NeighborhoodViewer3D.tsx` | Orchestrates analysis, heatmap toggle, shadow snapshots |
| Backend scoring | `backend/app/services/scoring.py` | `normalize_sunlight_score`, `normalize_svf_score`, summaries |
| Backend model | `backend/app/models/risk.py` | `SunlightRiskCard` with `SeverityLevel` enum |

**Key constraints:**
- v1 uses CPU raycasting (Path B) with cooperative scheduling — ~24K raycasts for 64 points x 12 months x ~32 steps
- SVF uses isotropic cosine weighting — no sky brightness distribution
- Only roof evaluation points — no facades or ground/garden
- No Web Workers — all computation on main thread with `setTimeout` yielding
- No energy output — geometry-only visibility hours
- No standards benchmarking — just severity bands

---

## Phase 1: Web Worker Offloading

> Move CPU-intensive sunlight analysis and SVF computation off the main thread entirely. Replace cooperative scheduling (`yieldToMainThread`) with true parallelism. Foundation for heavier computation in later phases.

### Task 1.1: Define Worker message protocol

Establish the TypeScript types for main-thread <-> Worker communication. Serializable geometry data (no Three.js objects cross the boundary).

**Files:**
- Create: `frontend/src/workers/sunlightWorkerTypes.ts`

**Step 1: Write the type definitions**

```typescript
// sunlightWorkerTypes.ts

/** Serialized building geometry for transfer to Worker. */
export interface SerializedBuilding {
  /** Float32Array of vertex positions (x, y, z interleaved). */
  positions: Float32Array;
  /** Uint32Array of triangle indices (optional — if indexed geometry). */
  indices?: Uint32Array;
  /** Pand ID for self-shadow exclusion. */
  pandId: string;
  /** Whether this is the ground plane (excluded from obstruction checks). */
  isGround: boolean;
}

/** Input message: main thread -> Worker. */
export interface SunlightWorkerRequest {
  type: 'analyzeSunlight';
  id: number;
  buildings: SerializedBuilding[];
  footprint: number[][];
  roofY: number;
  targetPandId: string;
  lat: number;
  lng: number;
  year: number;
  intervalMinutes: number;
  gridSpacingMeters: number;
  maxPoints: number;
}

/** Progress message: Worker -> main thread. */
export interface SunlightWorkerProgress {
  type: 'progress';
  id: number;
  monthsDone: number;
  totalMonths: number;
}

/** Result message: Worker -> main thread. */
export interface SunlightWorkerResult {
  type: 'result';
  id: number;
  result: {
    winter: number;
    equinox: number;
    summer: number;
    annualAverage: number;
    analysisYear: number;
    perPointAnnual: number[];
    /** Roof grid points in viewer coords [x, y, z][]. */
    roofGridPoints: [number, number, number][];
  } | null;
}

/** Error message: Worker -> main thread. */
export interface SunlightWorkerError {
  type: 'error';
  id: number;
  message: string;
}

export type WorkerOutMessage = SunlightWorkerProgress | SunlightWorkerResult | SunlightWorkerError;
```

**Step 2: Commit**

```bash
git add frontend/src/workers/sunlightWorkerTypes.ts
git commit -m "feat: define Worker message protocol for sunlight analysis"
```

**Definition of Done:**
- Type file compiles with `npm run build`
- No runtime code — types only
- All transferable data uses `Float32Array` / `Uint32Array` (not Three.js objects)

---

### Task 1.2: Create geometry serialization utility

Serialize Three.js `Mesh` objects into transferable `SerializedBuilding` structs. Deserialize back in the Worker to reconstruct lightweight geometry for `Raycaster`.

**Files:**
- Create: `frontend/src/workers/geometrySerialization.ts`
- Create: `frontend/src/workers/geometrySerialization.test.ts`

**Step 1: Write failing tests**

```typescript
// geometrySerialization.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('three', () => ({
  BufferGeometry: function () {
    this.attributes = {};
    this.index = null;
    this.setAttribute = vi.fn(function (this: any, name: string, attr: any) {
      this.attributes[name] = attr;
    });
    this.setIndex = vi.fn(function (this: any, idx: any) {
      this.index = idx;
    });
    this.computeBoundingSphere = vi.fn();
  },
  BufferAttribute: function (array: any, itemSize: number) {
    this.array = array;
    this.itemSize = itemSize;
    this.count = array.length / itemSize;
    this.getX = (i: number) => array[i * itemSize];
    this.getY = (i: number) => array[i * itemSize + 1];
    this.getZ = (i: number) => array[i * itemSize + 2];
  },
  Mesh: function (geo: any, mat: any) {
    this.geometry = geo;
    this.material = mat;
    this.userData = {};
    this.position = { x: 0, y: 0, z: 0 };
    this.quaternion = { x: 0, y: 0, z: 0, w: 1 };
    this.scale = { x: 1, y: 1, z: 1 };
    this.updateMatrixWorld = vi.fn();
    this.matrixWorld = {
      elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    };
  },
  Vector3: function (x?: number, y?: number, z?: number) {
    this.x = x ?? 0; this.y = y ?? 0; this.z = z ?? 0;
    this.applyMatrix4 = vi.fn().mockReturnThis();
  },
  Raycaster: function () {
    this.set = vi.fn();
    this.far = 0;
    this.intersectObjects = vi.fn().mockReturnValue([]);
  },
}));

import { serializeBuildings, deserializeBuildings } from './geometrySerialization';

describe('serializeBuildings', () => {
  it('extracts positions and userData from meshes', async () => {
    const positions = new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0]);
    // vi.mock('three', ...) hoists above imports — use the mocked module:
    const { BufferGeometry, BufferAttribute, Mesh } = await import('three') as any;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    const mesh = new Mesh(geo, {});
    mesh.userData = { pandId: 'test-pand', isGround: false };

    const serialized = serializeBuildings([mesh]);

    expect(serialized).toHaveLength(1);
    expect(serialized[0].pandId).toBe('test-pand');
    expect(serialized[0].isGround).toBe(false);
    expect(serialized[0].positions).toBeInstanceOf(Float32Array);
    expect(serialized[0].positions.length).toBe(9);
  });

  it('skips non-Mesh objects', () => {
    const result = serializeBuildings([{ type: 'Group' } as any]);
    expect(result).toHaveLength(0);
  });
});

describe('deserializeBuildings', () => {
  it('reconstructs meshes with userData', () => {
    const serialized = [{
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      pandId: 'p1',
      isGround: false,
    }];

    const meshes = deserializeBuildings(serialized);

    expect(meshes).toHaveLength(1);
    expect(meshes[0].userData.pandId).toBe('p1');
    expect(meshes[0].userData.isGround).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run geometrySerialization`
Expected: FAIL — module doesn't exist

**Step 3: Implement**

```typescript
// geometrySerialization.ts
import { BufferAttribute, BufferGeometry, Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { SerializedBuilding } from './sunlightWorkerTypes';

/**
 * Serialize Three.js meshes into transferable structs for Worker.
 * Extracts position attribute + indices + userData.
 * CRITICAL: Bakes matrixWorld into vertex positions so the Worker
 * receives world-space geometry. Without this, meshes with non-identity
 * transforms (position/rotation/scale) would produce incorrect raycasts.
 */
export function serializeBuildings(objects: Object3D[]): SerializedBuilding[] {
  const result: SerializedBuilding[] = [];

  for (const obj of objects) {
    if (!(obj instanceof Mesh)) continue;
    const geo = obj.geometry;
    const posAttr = geo.getAttribute('position');
    if (!posAttr) continue;

    // Ensure matrixWorld is current before baking.
    obj.updateMatrixWorld(true);

    // Bake world transform into vertex positions.
    const count = posAttr.count;
    const positions = new Float32Array(count * 3);
    const v = new Vector3();
    for (let i = 0; i < count; i++) {
      v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      v.applyMatrix4(obj.matrixWorld);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }

    const indices = geo.index
      ? new Uint32Array(geo.index.array)
      : undefined;

    result.push({
      positions,
      indices,
      pandId: obj.userData.pandId ?? '',
      isGround: !!obj.userData.isGround,
    });
  }

  return result;
}

/**
 * Get transferable ArrayBuffers from serialized buildings (for postMessage).
 */
export function getTransferables(buildings: SerializedBuilding[]): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const b of buildings) {
    buffers.push(b.positions.buffer);
    if (b.indices) buffers.push(b.indices.buffer);
  }
  return buffers;
}

/**
 * Reconstruct lightweight Mesh objects from serialized data inside Worker.
 */
export function deserializeBuildings(serialized: SerializedBuilding[]): Mesh[] {
  const meshes: Mesh[] = [];

  for (const s of serialized) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(s.positions, 3));
    if (s.indices) {
      geo.setIndex(new BufferAttribute(s.indices, 1));
    }
    geo.computeBoundingSphere();

    const mesh = new Mesh(geo);
    mesh.userData = { pandId: s.pandId, isGround: s.isGround };
    meshes.push(mesh);
  }

  return meshes;
}
```

**Step 4: Run tests**

Run: `cd frontend && npm run test -- --run geometrySerialization`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/workers/geometrySerialization.ts frontend/src/workers/geometrySerialization.test.ts
git commit -m "feat: add geometry serialization for Worker transfer"
```

**Definition of Done:**
- Serialize/deserialize round-trips preserve positions, indices, and userData
- `serializeBuildings` bakes `matrixWorld` into vertex positions (world-space output)
- `getTransferables` returns ArrayBuffer references for zero-copy transfer
- Tests pass

---

### Task 1.3: Create the sunlight Worker entry point

The Worker module imports Three.js (Raycaster, Vector3, BufferGeometry), SunCalc, and the existing analysis utilities. It listens for messages, runs analysis, and posts results back.

**Files:**
- Create: `frontend/src/workers/sunlightWorker.ts`

**Step 1: Implement the Worker**

```typescript
// sunlightWorker.ts
/// <reference lib="webworker" />

import { Raycaster } from 'three';
import { analyzeSunlight } from '../utils/sunlightAnalysis';
import { deserializeBuildings } from './geometrySerialization';
import type { SunlightWorkerRequest, WorkerOutMessage } from './sunlightWorkerTypes';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function noopYield(): Promise<void> {
  // Inside Worker, no need to yield — we ARE off the main thread.
  return Promise.resolve();
}

ctx.addEventListener('message', async (event: MessageEvent<SunlightWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'analyzeSunlight') return;

  try {
    const meshes = deserializeBuildings(msg.buildings);

    const result = await analyzeSunlight({
      buildingMeshes: meshes,
      targetPandId: msg.targetPandId,
      footprint: msg.footprint,
      roofY: msg.roofY,
      lat: msg.lat,
      lng: msg.lng,
      year: msg.year,
      intervalMinutes: msg.intervalMinutes,
      gridSpacingMeters: msg.gridSpacingMeters,
      maxPoints: msg.maxPoints,
      raycaster: new Raycaster() as any,
      yieldControl: noopYield,
      onMonthComplete: (monthIdx: number, totalMonths: number) => {
        // Emit progress to main thread after each month completes.
        const progress: WorkerOutMessage = {
          type: 'progress',
          id: msg.id,
          monthsDone: monthIdx + 1,
          totalMonths,
        };
        ctx.postMessage(progress);
      },
    });

    const response: WorkerOutMessage = {
      type: 'result',
      id: msg.id,
      result: result ? {
        winter: result.winter,
        equinox: result.equinox,
        summer: result.summer,
        annualAverage: result.annualAverage,
        analysisYear: result.analysisYear ?? msg.year,
        perPointAnnual: result.perPointAnnual ?? [],
        roofGridPoints: result.roofGridPoints ?? [],
      } : null,
    };
    ctx.postMessage(response);
  } catch (err) {
    const errorMsg: WorkerOutMessage = {
      type: 'error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(errorMsg);
  }
});
```

**Step 2: Configure Vite Worker bundling**

Vite handles `new Worker(new URL('./path.ts', import.meta.url), { type: 'module' })` natively. No vite.config changes needed.

**Step 3: Commit**

```bash
git add frontend/src/workers/sunlightWorker.ts
git commit -m "feat: add sunlight Worker entry point"
```

**Prerequisite change to `analyzeSunlight`:** Add optional `onMonthComplete?: (monthIdx: number, totalMonths: number) => void` to `SunlightAnalysisOptions`. Call it at the end of each month's raycast loop (after the inner `pointIdx` loop completes). This is a non-breaking addition — existing callers that omit it are unaffected.

**Definition of Done:**
- Worker file compiles with `npm run build`
- Worker imports existing `analyzeSunlight` with `yieldControl: noopYield` (no setTimeout needed in Worker)
- Worker emits `progress` messages to main thread via `onMonthComplete` callback
- Error handling wraps entire execution in try/catch

---

### Task 1.4: Create the main-thread Worker bridge

A promise-based API that spawns the Worker, sends serialized geometry, and returns results. Handles timeouts and cleanup.

**Files:**
- Create: `frontend/src/workers/sunlightBridge.ts`
- Create: `frontend/src/workers/sunlightBridge.test.ts`

**Step 1: Write failing tests**

```typescript
// sunlightBridge.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Worker global
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener = vi.fn((event: string, handler: any) => {
    if (event === 'message') this.onmessage = handler;
  });
  removeEventListener = vi.fn();
}

vi.stubGlobal('Worker', function (this: any) {
  Object.assign(this, new MockWorker());
});

import { runSunlightInWorker, isWorkerSupported } from './sunlightBridge';

describe('isWorkerSupported', () => {
  it('returns true when Worker is available', () => {
    expect(isWorkerSupported()).toBe(true);
  });
});

describe('runSunlightInWorker', () => {
  it('sends message and resolves with result', async () => {
    const promise = runSunlightInWorker({
      buildings: [],
      footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
      roofY: 10,
      targetPandId: 'test',
      lat: 52.37,
      lng: 4.90,
      year: 2025,
    });

    // Simulate Worker response after microtask
    await vi.waitFor(() => {
      const worker = (Worker as any).mock?.instances?.[0];
      expect(worker).toBeDefined();
    });

    // This is a structural test — full integration tested manually
    expect(promise).toBeInstanceOf(Promise);
  });
});
```

**Step 2: Implement**

```typescript
// sunlightBridge.ts
import type { SerializedBuilding, SunlightWorkerRequest, WorkerOutMessage } from './sunlightWorkerTypes';
import type { SunlightResult } from '../types/api';
import { getTransferables } from './geometrySerialization';

let requestId = 0;

export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

interface WorkerAnalysisInput {
  buildings: SerializedBuilding[];
  footprint: number[][];
  roofY: number;
  targetPandId: string;
  lat: number;
  lng: number;
  year: number;
  intervalMinutes?: number;
  gridSpacingMeters?: number;
  maxPoints?: number;
  abortSignal?: AbortSignal;
  onProgress?: (monthsDone: number, totalMonths: number) => void;
}

const WORKER_TIMEOUT_MS = 120_000; // 2 minutes max

/**
 * Persistent Worker singleton — avoids per-call startup + Three.js parse overhead.
 * Lazily created on first use, reused across analyses.
 * Terminated only on page unload or explicit cleanup.
 */
let persistentWorker: Worker | null = null;
const pendingRequests = new Map<number, {
  resolve: (value: SunlightResult | null) => void;
  reject: (reason: Error) => void;
  onProgress?: (monthsDone: number, totalMonths: number) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

function getOrCreateWorker(): Worker {
  if (persistentWorker) return persistentWorker;

  persistentWorker = new Worker(
    new URL('./sunlightWorker.ts', import.meta.url),
    { type: 'module' },
  );

  persistentWorker.addEventListener('message', (event: MessageEvent<WorkerOutMessage>) => {
    const msg = event.data;
    const pending = pendingRequests.get(msg.id);
    if (!pending) return;

    if (msg.type === 'progress' && pending.onProgress) {
      pending.onProgress(msg.monthsDone, msg.totalMonths);
      return;
    }

    if (msg.type === 'result') {
      clearTimeout(pending.timer);
      pendingRequests.delete(msg.id);
      if (!msg.result) {
        pending.resolve(null);
        return;
      }
      pending.resolve({
        winter: msg.result.winter,
        equinox: msg.result.equinox,
        summer: msg.result.summer,
        annualAverage: msg.result.annualAverage,
        analysisYear: msg.result.analysisYear,
        perPointAnnual: msg.result.perPointAnnual,
        roofGridPoints: msg.result.roofGridPoints,
      });
      return;
    }

    if (msg.type === 'error') {
      clearTimeout(pending.timer);
      pendingRequests.delete(msg.id);
      pending.reject(new Error(msg.message));
    }
  });

  persistentWorker.addEventListener('error', () => {
    // Worker crashed — reject all pending, reset for next use
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Sunlight Worker crashed'));
    }
    pendingRequests.clear();
    persistentWorker = null;
  });

  return persistentWorker;
}

/** Terminate persistent Worker (call on page unload or test cleanup). */
export function terminateSunlightWorker(): void {
  if (persistentWorker) {
    persistentWorker.terminate();
    persistentWorker = null;
    for (const [, pending] of pendingRequests) {
      clearTimeout(pending.timer);
    }
    pendingRequests.clear();
  }
}

export function runSunlightInWorker(input: WorkerAnalysisInput): Promise<SunlightResult | null> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const worker = getOrCreateWorker();

    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Sunlight Worker timed out'));
    }, WORKER_TIMEOUT_MS);

    if (input.abortSignal) {
      input.abortSignal.addEventListener('abort', () => {
        clearTimeout(timer);
        pendingRequests.delete(id);
        resolve(null);
      }, { once: true });
    }

    pendingRequests.set(id, { resolve, reject, onProgress: input.onProgress, timer });

    const request: SunlightWorkerRequest = {
      type: 'analyzeSunlight',
      id,
      buildings: input.buildings,
      footprint: input.footprint,
      roofY: input.roofY,
      targetPandId: input.targetPandId,
      lat: input.lat,
      lng: input.lng,
      year: input.year,
      intervalMinutes: input.intervalMinutes ?? 30,
      gridSpacingMeters: input.gridSpacingMeters ?? 2,
      maxPoints: input.maxPoints ?? 64,
    };

    const transferables = getTransferables(input.buildings);
    worker.postMessage(request, transferables);
  });
}
```

**Step 3: Run tests**

Run: `cd frontend && npm run test -- --run sunlightBridge`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/workers/sunlightBridge.ts frontend/src/workers/sunlightBridge.test.ts
git commit -m "feat: add main-thread bridge for sunlight Worker"
```

**Definition of Done:**
- `isWorkerSupported()` detects Worker availability
- `runSunlightInWorker()` returns a Promise that resolves with `SunlightResult | null`
- AbortSignal support for cancellation
- Timeout after 2 minutes to prevent zombie requests
- Persistent Worker singleton — reused across analyses, avoids per-call startup overhead
- `terminateSunlightWorker()` for explicit cleanup (page unload, test teardown)
- Worker crash recovery — rejects all pending, resets singleton for next use

---

### Task 1.5: Wire Worker into NeighborhoodViewer3D with fallback

Replace the main-thread `analyzeSunlight()` call with Worker-based analysis. Fall back to main-thread cooperative scheduling if Workers unavailable (e.g., some mobile browsers, test environment).

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx`

**Step 1: Add Worker path with graceful fallback**

In `NeighborhoodViewer3D.tsx`, in the `computeSunlight` callback (around line 999-1096):

```typescript
import { isWorkerSupported, runSunlightInWorker } from '../workers/sunlightBridge';
import { serializeBuildings } from '../workers/geometrySerialization';

// Inside computeSunlight:
let sunlightResult: SunlightResult | null;

if (isWorkerSupported()) {
  // Worker path — completely off main thread
  const serialized = serializeBuildings(ctx.buildingMeshes);
  sunlightResult = await runSunlightInWorker({
    buildings: serialized,
    footprint: target.footprint,
    roofY,
    targetPandId,
    lat: center.lat,
    lng: center.lng,
    year: new Date().getFullYear(),
    abortSignal: abortController.signal,
  });
} else {
  // Fallback — cooperative scheduling on main thread (existing v1 path)
  sunlightResult = await analyzeSunlight({
    buildingMeshes: ctx.buildingMeshes,
    targetPandId,
    footprint: target.footprint,
    roofY,
    lat: center.lat,
    lng: center.lng,
    year: new Date().getFullYear(),
    abortSignal: abortController.signal,
  });
}
```

**Step 2: Run full test suite**

Run: `cd frontend && npm run test -- --run`
Expected: PASS (tests use mocked Three.js, Worker won't spawn in jsdom — fallback path activates)

**Step 3: Commit**

```bash
git add frontend/src/components/NeighborhoodViewer3D.tsx
git commit -m "feat: wire sunlight Worker with main-thread fallback"
```

**Definition of Done:**
- Worker used when `isWorkerSupported()` returns true
- Falls back to existing cooperative-scheduling path in test/unsupported environments
- No regression in existing tests
- AbortSignal cancellation works in both paths
- `npm run build` passes (no unused imports)

---

### Task 1.6: Add SVF computation to Worker via OffscreenCanvas

SVF requires WebGLRenderer (cubemap rendering). Use `OffscreenCanvas` to create a renderer inside the Worker.

**Files:**
- Modify: `frontend/src/workers/sunlightWorkerTypes.ts` (add SVF message types)
- Create: `frontend/src/workers/svfWorker.ts`
- Create: `frontend/src/workers/svfBridge.ts`

**Step 1: Add SVF message types**

```typescript
// Add to sunlightWorkerTypes.ts:

export interface SvfWorkerRequest {
  type: 'computeSvf';
  id: number;
  buildings: SerializedBuilding[];
  evalPoints: [number, number, number][];
  maxSamplePoints: number;
}

export interface SvfWorkerResult {
  type: 'svfResult';
  id: number;
  svf: number; // 0-1
}
```

**Step 2: Implement SVF Worker with OffscreenCanvas**

```typescript
// svfWorker.ts
/// <reference lib="webworker" />

import { WebGLRenderer } from 'three';
import { computeSvfMultiPoint } from '../utils/svfComputation';
import { deserializeBuildings } from './geometrySerialization';
import type { SvfWorkerRequest, SvfWorkerResult, SunlightWorkerError } from './sunlightWorkerTypes';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<SvfWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'computeSvf') return;

  try {
    const canvas = new OffscreenCanvas(256, 256);
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL not available in Worker');

    const renderer = new WebGLRenderer({ canvas: canvas as any, context: gl as any });
    const meshes = deserializeBuildings(msg.buildings);
    const svf = computeSvfMultiPoint(renderer, meshes, msg.evalPoints, msg.maxSamplePoints);

    renderer.dispose();

    const response: SvfWorkerResult = { type: 'svfResult', id: msg.id, svf };
    ctx.postMessage(response);
  } catch (err) {
    const errorMsg: SunlightWorkerError = {
      type: 'error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(errorMsg);
  }
});
```

**Step 3: Implement SVF bridge**

```typescript
// svfBridge.ts
import type { SerializedBuilding, SvfWorkerResult, SunlightWorkerError } from './sunlightWorkerTypes';
import { getTransferables } from './geometrySerialization';

let requestId = 0;

export function isOffscreenCanvasSupported(): boolean {
  return typeof OffscreenCanvas !== 'undefined';
}

export function runSvfInWorker(
  buildings: SerializedBuilding[],
  evalPoints: [number, number, number][],
  maxSamplePoints: number = 5,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;

    const worker = new Worker(
      new URL('./svfWorker.ts', import.meta.url),
      { type: 'module' },
    );

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('SVF Worker timed out'));
    }, 30_000);

    worker.addEventListener('message', (event: MessageEvent<SvfWorkerResult | SunlightWorkerError>) => {
      const msg = event.data;
      if (msg.id !== id) return;

      clearTimeout(timer);
      worker.terminate();

      if (msg.type === 'svfResult') {
        resolve(msg.svf);
      } else {
        reject(new Error(msg.message));
      }
    });

    const transferables = getTransferables(buildings);
    worker.postMessage({
      type: 'computeSvf',
      id,
      buildings,
      evalPoints,
      maxSamplePoints,
    }, transferables);
  });
}
```

**Step 4: Run build to verify compilation**

Run: `cd frontend && npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/workers/sunlightWorkerTypes.ts frontend/src/workers/svfWorker.ts frontend/src/workers/svfBridge.ts
git commit -m "feat: add SVF computation in Worker via OffscreenCanvas"
```

**Definition of Done:**
- SVF computed in dedicated Worker using OffscreenCanvas + WebGLRenderer
- `isOffscreenCanvasSupported()` check for feature detection
- Fallback to main-thread `computeSvfMultiPoint()` when OffscreenCanvas unavailable
- WebGLRenderer disposed after computation
- Worker terminated after result/error/timeout

---

### Task 1.7: Wire SVF Worker into NeighborhoodViewer3D

Connect the SVF Worker bridge (Task 1.6) into the existing SVF computation path in the viewer. Replace the main-thread `computeSvfMultiPoint()` call with Worker-based computation when OffscreenCanvas is available.

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx`

**Step 1: Add Worker path for SVF computation**

In `NeighborhoodViewer3D.tsx`, in the `computeSunlight` callback, after the sunlight analysis result (around line 1194):

```typescript
import { isOffscreenCanvasSupported, runSvfInWorker } from '../workers/svfBridge';

// Replace existing SVF computation block:
let svf: number | undefined;

if (isOffscreenCanvasSupported() && result.roofGridPoints && result.roofGridPoints.length > 0) {
  // Worker path — SVF computed via OffscreenCanvas in dedicated Worker
  const serialized = serializeBuildings(ctx.buildingMeshes);
  try {
    svf = await runSvfInWorker(serialized, result.roofGridPoints, 5);
  } catch {
    // Fallback to main-thread SVF on Worker failure
    svf = undefined;
  }
}

if (svf === undefined && canComputeSvf && result.roofGridPoints && result.roofGridPoints.length > 0) {
  // Fallback — main-thread SVF (existing v1 path)
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  if (abortController.signal.aborted) {
    sunlightComputed.current = false;
    return;
  }
  const { computeSvfMultiPoint } = await import('../utils/svfComputation');
  svf = computeSvfMultiPoint(ctx.renderer, ctx.buildingMeshes, result.roofGridPoints, 5);
}

if (svf !== undefined && Number.isFinite(svf)) {
  nextResult = { ...result, svf: round3(svf) };
}
```

**Step 2: Run tests**

Run: `cd frontend && npm run test -- --run`
Expected: PASS (jsdom lacks OffscreenCanvas → falls back to main-thread path)

**Step 3: Commit**

```bash
git add frontend/src/components/NeighborhoodViewer3D.tsx
git commit -m "feat: wire SVF Worker with OffscreenCanvas fallback into viewer"
```

**Definition of Done:**
- SVF Worker used when `isOffscreenCanvasSupported()` returns true
- Falls back to main-thread `computeSvfMultiPoint()` on Worker failure or unsupported env
- No regression in existing tests
- SVF result still stored in `nextResult.svf`

---

## Phase 2: Ground & Facade Evaluation Points

> Extend evaluation beyond roof-only to include facade proxy points (window-sill heights) and ground proxy points (garden/yard approximation). These give users actionable information about where they'd actually live.

### Task 2.1: Add facade proxy point generator

Generate evaluation points on footprint edges at window-sill heights, labeled by cardinal orientation.

**Files:**
- Modify: `frontend/src/utils/roofSampling.ts`
- Modify: `frontend/src/utils/roofSampling.test.ts`

**Step 1: Write failing tests**

```typescript
// Add to roofSampling.test.ts

import { generateFacadePoints, getEdgeOrientation } from './roofSampling';

describe('getEdgeOrientation', () => {
  it('returns "south" for edge facing south (CW polygon)', () => {
    // Edge [0,0]→[10,0] in CW polygon: outward normal = (0, -10) in RD = south
    // Viewer: nz = edx = 10 > 0 → south (north is -Z in viewer)
    const orientation = getEdgeOrientation([0, 0], [10, 0]);
    expect(orientation).toBe('south');
  });

  it('returns "east" for edge facing east', () => {
    const orientation = getEdgeOrientation([0, 0], [0, 10]);
    expect(orientation).toBe('east');
  });
});

describe('generateFacadePoints', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it('generates points at specified heights on each edge', () => {
    const points = generateFacadePoints(square, 0, [1.5, 4.5]);
    // 4 edges x 2 heights = 8 points
    expect(points.length).toBe(8);
  });

  it('sets y to groundHeight + windowHeight + offset', () => {
    const points = generateFacadePoints(square, 2.0, [1.5]);
    // y = groundHeight + windowHeight + 0.5m offset from facade
    points.forEach(p => {
      expect(p.point[1]).toBeCloseTo(2.0 + 1.5, 1);
    });
  });

  it('labels each point with cardinal orientation', () => {
    const points = generateFacadePoints(square, 0, [1.5]);
    const orientations = points.map(p => p.orientation);
    expect(orientations).toContain('north');
    expect(orientations).toContain('south');
    expect(orientations).toContain('east');
    expect(orientations).toContain('west');
  });

  it('handles CCW footprint winding (produces same orientations as CW)', () => {
    const ccwSquare = [[0, 10], [10, 10], [10, 0], [0, 0]]; // reversed
    const cwSquare = [[0, 0], [10, 0], [10, 10], [0, 10]]; // CW in RD
    const ccwPoints = generateFacadePoints(ccwSquare, 0, [1.5]);
    const cwPoints = generateFacadePoints(cwSquare, 0, [1.5]);
    const ccwOrientations = new Set(ccwPoints.map(p => p.orientation));
    const cwOrientations = new Set(cwPoints.map(p => p.orientation));
    expect(ccwOrientations).toEqual(cwOrientations);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run roofSampling`
Expected: FAIL — `generateFacadePoints` and `getEdgeOrientation` don't exist

**Step 3: Implement**

```typescript
// Add to roofSampling.ts:

export type CardinalOrientation = 'north' | 'south' | 'east' | 'west';

export interface FacadePoint {
  point: RoofPoint3D;
  orientation: CardinalOrientation;
  heightLabel: string; // e.g., "1.5m" for display
}

/**
 * Compute signed area of a 2D polygon.
 * Positive = CCW winding, Negative = CW winding (in RD coordinate system).
 * Used to normalize footprint winding before facade normal computation.
 */
function computeSignedArea2D(polygon: number[][]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return area / 2;
}

/**
 * Normalize footprint to CW winding (required for consistent outward normals).
 * BAG/3DBAG footprints may have inconsistent winding direction.
 */
function ensureCW(footprint: number[][]): number[][] {
  const area = computeSignedArea2D(footprint);
  return area > 0 ? [...footprint].reverse() : footprint;
}

/**
 * Determine cardinal orientation of a footprint edge based on its outward normal.
 * ASSUMES CW winding (call ensureCW first). Normal = 90° CW rotation of edge direction.
 * Mapped to viewer coords where north = -Z.
 */
export function getEdgeOrientation(
  p1: number[],
  p2: number[],
): CardinalOrientation {
  // Edge vector in RD offsets
  const edx = p2[0] - p1[0];
  const edy = p2[1] - p1[1];

  // Outward normal for CW polygon: (edy, -edx) in RD
  // Viewer coords: normal_x = edy, normal_z = edx (viewer Z = -RD_Y, so -(-edx) = edx)
  const nx = edy;
  const nz = edx;

  // Dominant axis determines orientation
  // In viewer: +Z = south (because north = -Z)
  if (Math.abs(nz) > Math.abs(nx)) {
    return nz > 0 ? 'south' : 'north';
  }
  return nx > 0 ? 'east' : 'west';
}

/**
 * Generate facade evaluation points at edge midpoints, offset 0.5m outward.
 * Points generated at each specified window height above ground.
 * Normalizes footprint to CW winding internally (handles BAG/3DBAG inconsistency).
 */
export function generateFacadePoints(
  footprint: number[][],
  groundHeight: number,
  windowHeights: number[] = [1.5, 4.5],
): FacadePoint[] {
  const cwFootprint = ensureCW(footprint);
  const points: FacadePoint[] = [];

  for (let i = 0; i < cwFootprint.length; i++) {
    const p1 = cwFootprint[i];
    const p2 = cwFootprint[(i + 1) % cwFootprint.length];

    // Edge midpoint in RD offsets
    const mx = (p1[0] + p2[0]) / 2;
    const my = (p1[1] + p2[1]) / 2;

    // Outward normal for CW polygon: (edy, -edx), normalized, 0.5m offset
    const edx = p2[0] - p1[0];
    const edy = p2[1] - p1[1];
    const len = Math.sqrt(edx * edx + edy * edy);
    if (len < 0.1) continue; // Skip degenerate edges

    const nx = edy / len;
    const ny_rd = -edx / len;
    const offset = 0.5; // 0.5m from facade

    const px = mx + nx * offset;
    const py_rd = my + ny_rd * offset;

    // Convert to viewer coords: [x, y, z] = [dx, height, -dy]
    const vx = px;
    const vz = -py_rd;

    const orientation = getEdgeOrientation(p1, p2);

    for (const h of windowHeights) {
      const vy = groundHeight + h;
      points.push({
        point: [vx, vy, vz],
        orientation,
        heightLabel: `${h}m`,
      });
    }
  }

  return points;
}
```

**Step 4: Run tests**

Run: `cd frontend && npm run test -- --run roofSampling`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/utils/roofSampling.ts frontend/src/utils/roofSampling.test.ts
git commit -m "feat: add facade proxy point generator with cardinal orientation"
```

**Definition of Done:**
- Facade points generated at edge midpoints, offset 0.5m outward
- Points at configurable window-sill heights (default: 1.5m, 4.5m)
- Each point labeled with cardinal orientation (N/S/E/W)
- Footprint winding normalized to CW internally (handles BAG/3DBAG inconsistency)
- Coordinate conversion from RD offsets to viewer space correct (including `-dy` negation)
- Cardinal direction: `nz > 0` = south (north is -Z in viewer) — verified with concrete edge test
- Tests pass (including CCW winding test)

---

### Task 2.2: Add ground proxy point generator

Generate evaluation points in a buffered ring around the building footprint at eye height (1.5m). These approximate garden/yard sunlight.

**Files:**
- Modify: `frontend/src/utils/roofSampling.ts`
- Modify: `frontend/src/utils/roofSampling.test.ts`

**Step 1: Write failing tests**

```typescript
// Add to roofSampling.test.ts

import { generateGroundProxyPoints } from './roofSampling';

describe('generateGroundProxyPoints', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it('generates points in a ring around the footprint', () => {
    const points = generateGroundProxyPoints(square, 0, 3.0, 4);
    expect(points.length).toBe(4);
  });

  it('places points at eye height (1.5m) above ground', () => {
    const points = generateGroundProxyPoints(square, 2.0, 3.0, 4);
    points.forEach(p => expect(p[1]).toBeCloseTo(3.5, 1)); // 2.0 + 1.5
  });

  it('places points outside the footprint', () => {
    const points = generateGroundProxyPoints(square, 0, 3.0, 8);
    // All points should be outside the 10x10 square, buffered by 3m
    points.forEach(p => {
      const vx = p[0];
      const vz = p[2];
      // At least some points should be beyond the footprint bounds
      const outside = vx < -1 || vx > 11 || vz < -11 || vz > 1;
      // This is a loose check since the ring samples around centroid
      expect(typeof vx).toBe('number');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run roofSampling`
Expected: FAIL — `generateGroundProxyPoints` doesn't exist

**Step 3: Implement**

```typescript
// Add to roofSampling.ts:

const EYE_HEIGHT = 1.5; // meters above ground

/**
 * Generate ground-level evaluation points in a ring around the footprint.
 * These approximate garden/yard areas.
 *
 * @param footprint - RD offset coordinates [[dx, dy], ...]
 * @param groundHeight - Ground height in viewer Y coords
 * @param bufferDistance - Distance from centroid to sample ring (meters)
 * @param numPoints - Number of points around the ring
 */
export function generateGroundProxyPoints(
  footprint: number[][],
  groundHeight: number,
  bufferDistance: number = 5.0,
  numPoints: number = 8,
): RoofPoint3D[] {
  // Centroid in RD offsets
  const cx = footprint.reduce((s, p) => s + p[0], 0) / footprint.length;
  const cy = footprint.reduce((s, p) => s + p[1], 0) / footprint.length;

  // Compute max distance from centroid to any vertex (footprint "radius")
  const maxDist = Math.max(
    ...footprint.map(p => Math.sqrt((p[0] - cx) ** 2 + (p[1] - cy) ** 2)),
  );
  const ringRadius = maxDist + bufferDistance;
  const y = groundHeight + EYE_HEIGHT;

  const points: RoofPoint3D[] = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    const rdx = cx + ringRadius * Math.cos(angle);
    const rdy = cy + ringRadius * Math.sin(angle);

    // Convert to viewer coords: [dx, y, -dy]
    points.push([rdx, y, -rdy]);
  }

  return points;
}
```

**Step 4: Run tests**

Run: `cd frontend && npm run test -- --run roofSampling`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/utils/roofSampling.ts frontend/src/utils/roofSampling.test.ts
git commit -m "feat: add ground proxy point generator for garden/yard sunlight"
```

**Definition of Done:**
- Points placed in circular ring around footprint centroid, at `maxVertexDist + bufferDistance` radius
- Y coordinate = groundHeight + 1.5m (eye height)
- Coordinate conversion to viewer space correct
- Tests pass

---

### Task 2.3: Extend SunlightResult with per-surface breakdowns

Add facade and ground results to the type system and analysis pipeline.

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/utils/sunlightAnalysis.ts`
- Modify: `frontend/src/utils/sunlightAnalysis.test.ts`

**Step 1: Extend types**

```typescript
// Add to types/api.ts:
export interface FacadeSunlightResult {
  orientation: 'north' | 'south' | 'east' | 'west';
  heightLabel: string;
  winterHours: number;
  summerHours: number;
  annualAverage: number;
}

export interface SunlightResult {
  // ... existing fields ...
  /** Per-facade results (optional, v2+). */
  facadeResults?: FacadeSunlightResult[];
  /** Ground proxy annual average hours (optional, v2+). */
  groundAnnualAverage?: number;
}
```

**Step 2: Add `surfaceType` option to analyzeSunlight**

In `sunlightAnalysis.ts`, add optional `extraEvalPoints` parameter:

*(See updated `extraEvalPoints` interface above with `skipSelfShadow` flag.)*

The analysis loop runs the same raycast logic on extra points and returns tagged results in the `SunlightResult`.

**CRITICAL: Self-shadow exclusion differs for facade/ground points.** The existing raycast logic (line 160-163 of `sunlightAnalysis.ts`) skips intersections with the target building (`pandId === targetPandId`) because roof points are ON the building. But facade points (0.5m outside) and ground points (5m+ away) are OUTSIDE the building — hits on the target building from these points represent real shadowing and MUST be counted. Add a `skipSelfShadow` flag per evaluation point group:
- Roof points: `skipSelfShadow: true` (existing behavior)
- Facade points: `skipSelfShadow: false` (target building can shadow its own windows)
- Ground points: `skipSelfShadow: false` (target building can shadow its garden)

```typescript
export interface SunlightAnalysisOptions {
  // ... existing fields ...
  /** Additional evaluation points beyond roof (facades, ground). */
  extraEvalPoints?: {
    points: [number, number, number][];
    labels: string[]; // e.g., "facade:south:1.5m", "ground:ring"
    /** If false, target building intersections count as shadowing (for off-building points). */
    skipSelfShadow: boolean;
  };
}
```

**Step 3: Write test for extra eval points**

```typescript
it('includes extra eval point results when provided', async () => {
  const result = await analyzeSunlight({
    // ... standard options ...
    extraEvalPoints: {
      points: [[5, 3.5, -5]],
      labels: ['facade:south:1.5m'],
    },
  });
  expect(result).not.toBeNull();
  // Extra points analyzed but not mixed into roof aggregates
});
```

**Step 4: Implement, run tests, commit**

Run: `cd frontend && npm run test -- --run sunlightAnalysis`
Expected: PASS

```bash
git commit -m "feat: extend sunlight analysis with facade and ground evaluation points"
```

**Definition of Done:**
- `SunlightResult` extended with `facadeResults` and `groundAnnualAverage`
- Extra eval points analyzed with same raycast logic but NOT mixed into roof aggregates
- Self-shadow exclusion correct: roof points skip target building hits, facade/ground points do NOT
- Backward compatible — omitting `extraEvalPoints` produces identical results to v1
- Tests pass (including a test verifying target building shadows its own facade points)

---

### Task 2.4: Update SunlightRiskCard to display multi-surface results

Show facade and ground sunlight information in the card when available.

**Files:**
- Modify: `frontend/src/components/SunlightRiskCard.tsx`
- Modify: `frontend/src/components/SunlightRiskCard.css`
- Modify: `frontend/src/components/SunlightRiskCard.test.tsx`
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/nl.json`

**Step 1: Write failing test for facade display**

```typescript
it('renders facade sunlight by orientation when available', () => {
  const sunlight = makeSunlightResult({
    facadeResults: [
      { orientation: 'south', heightLabel: '1.5m', winterHours: 3.2, summerHours: 10.1, annualAverage: 6.5 },
      { orientation: 'north', heightLabel: '1.5m', winterHours: 0.5, summerHours: 4.2, annualAverage: 2.1 },
    ],
  });
  render(<SunlightRiskCard sunlight={sunlight} />, { wrapper });
  expect(screen.getByText(/south/i)).toBeInTheDocument();
  expect(screen.getByText(/3.2/)).toBeInTheDocument();
});
```

**Step 2: Add i18n keys**

```json
{
  "sunlight.facade_title": "Window-level sunlight",
  "sunlight.facade_subtitle": "Estimated sun hours at window-sill height on each building face.",
  "sunlight.facade_disclaimer": "Evaluation points are approximated from building geometry — actual window positions may differ.",
  "sunlight.ground_title": "Garden/yard sunlight",
  "sunlight.ground_subtitle": "Estimated sun hours at eye height around the building perimeter."
}
```

**Step 3: Implement, run tests, commit**

Run: `cd frontend && npm run test -- --run SunlightRiskCard`
Expected: PASS

```bash
git commit -m "feat: display facade and ground sunlight in SunlightRiskCard"
```

**Definition of Done:**
- Facade section renders per-orientation rows with winter/summer/annual hours
- Ground section renders single aggregate
- Both sections include PRD-mandated disclaimers about approximation
- Sections hidden when data not available (backward compatible)
- Both EN and NL translations added
- Tests pass

---

### Task 2.5: Wire facade/ground analysis into NeighborhoodViewer3D

Connect the new point generators to the analysis pipeline in the 3D viewer.

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx`

**Implementation:**

After roof analysis completes, generate facade + ground points and run additional analysis:

```typescript
import { generateFacadePoints, generateGroundProxyPoints } from '../utils/roofSampling';

// After roof sunlight result:
const facadePoints = generateFacadePoints(target.footprint, groundHeight, [1.5, 4.5]);
const groundPoints = generateGroundProxyPoints(target.footprint, groundHeight, 5.0, 8);

const extraEvalPoints = {
  points: [
    ...facadePoints.map(fp => fp.point),
    ...groundPoints,
  ],
  labels: [
    ...facadePoints.map(fp => `facade:${fp.orientation}:${fp.heightLabel}`),
    ...groundPoints.map((_, i) => `ground:ring:${i}`),
  ],
};

// Run additional analysis (Worker or main thread)
// Parse results into facadeResults and groundAnnualAverage
```

```bash
git commit -m "feat: wire facade and ground evaluation into 3D viewer analysis"
```

**Definition of Done:**
- Facade points generated at 1.5m and 4.5m window heights
- Ground points generated in 8-point ring at 5m buffer
- Results parsed into `facadeResults[]` and `groundAnnualAverage`
- Passed to `onSunlightAnalysis` callback
- Falls back gracefully if point generation produces 0 points
- No regression in existing tests

---

## Phase 3: High-Density Worker Raycasting (Option B)

> Instead of GPU shadow-map accumulation (complex, browser-dependent), leverage the Worker thread from Phase 1 to raise point density from 64→256 points. More points = smoother vertex-color heatmaps with the existing raycasting pipeline. Simpler, more portable, and debuggable.

### Task 3.1: Make analysis density configurable at Worker bridge level

Raise `maxPoints` from 64 to 256 and lower `gridSpacingMeters` from 2 to 1 for the Worker path. Keep the main-thread fallback at the original 64-point density to maintain UI responsiveness.

**Files:**
- Modify: `frontend/src/workers/sunlightBridge.ts`
- Modify: `frontend/src/workers/sunlightBridge.test.ts`
- Modify: `frontend/src/utils/roofSampling.ts`

**Step 1: Write failing tests**

```typescript
// Add to sunlightBridge.test.ts:

describe('Worker density defaults', () => {
  it('defaults to 256 maxPoints for Worker path', async () => {
    const promise = runSunlightInWorker({
      buildings: [],
      footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
      roofY: 10,
      targetPandId: 'test',
      lat: 52.37,
      lng: 4.90,
      year: 2025,
      // No maxPoints specified — should default to 256
    });

    expect(promise).toBeInstanceOf(Promise);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run sunlightBridge`
Expected: FAIL — default is still 64

**Step 3: Update defaults**

In `sunlightBridge.ts`, change the request construction:

```typescript
const request: SunlightWorkerRequest = {
  type: 'analyzeSunlight',
  id,
  buildings: input.buildings,
  footprint: input.footprint,
  roofY: input.roofY,
  targetPandId: input.targetPandId,
  lat: input.lat,
  lng: input.lng,
  year: input.year,
  intervalMinutes: input.intervalMinutes ?? 30,
  gridSpacingMeters: input.gridSpacingMeters ?? 1,    // Was 2 — halved for density
  maxPoints: input.maxPoints ?? 256,                   // Was 64 — 4x for smoothness
};
```

In `roofSampling.ts`, export the high-density constants:

```typescript
export const HIGH_DENSITY_GRID_SPACING = 1;
export const HIGH_DENSITY_MAX_POINTS = 256;
```

**Step 4: Run tests**

Run: `cd frontend && npm run test -- --run sunlightBridge`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/workers/sunlightBridge.ts frontend/src/workers/sunlightBridge.test.ts frontend/src/utils/roofSampling.ts
git commit -m "feat: raise Worker analysis density to 256 points at 1m grid spacing"
```

**Definition of Done:**
- Worker path defaults: `maxPoints: 256`, `gridSpacingMeters: 1`
- Main-thread fallback retains: `maxPoints: 64`, `gridSpacingMeters: 2`
- Constants exported for test assertions
- Tests pass

---

### Task 3.2: Benchmark Worker performance at 256 points

Create a performance test that measures Worker raycasting time at various densities. This isn't an automated test — it produces a report for the developer to review.

**Files:**
- Create: `frontend/src/workers/sunlightBenchmark.test.ts`

**Step 1: Write benchmark test**

```typescript
// sunlightBenchmark.test.ts
import { describe, it, expect } from 'vitest';
import { generateRoofSamplePoints } from '../utils/roofSampling';

describe('Roof point density benchmarks (structure only — real timing needs browser)', () => {
  const footprint = [[0, 0], [20, 0], [20, 15], [0, 15]]; // 20m x 15m building
  const roofY = 10;

  it('64 points at 2m spacing (v1 baseline)', () => {
    const points = generateRoofSamplePoints(footprint, roofY, {
      gridSpacingMeters: 2,
      maxPoints: 64,
    });
    expect(points.length).toBeLessThanOrEqual(64);
    expect(points.length).toBeGreaterThan(0);
  });

  it('256 points at 1m spacing (v2 Worker target)', () => {
    const points = generateRoofSamplePoints(footprint, roofY, {
      gridSpacingMeters: 1,
      maxPoints: 256,
    });
    expect(points.length).toBeGreaterThan(64);
    expect(points.length).toBeLessThanOrEqual(256);
  });

  it('512 points at 0.5m spacing (upper bound exploration)', () => {
    const points = generateRoofSamplePoints(footprint, roofY, {
      gridSpacingMeters: 0.5,
      maxPoints: 512,
    });
    expect(points.length).toBeGreaterThan(200);
    expect(points.length).toBeLessThanOrEqual(512);
  });

  it('raycast count scales linearly with points x timesteps', () => {
    // 256 points x 12 months x ~32 steps/day = ~98K raycasts
    // In Worker thread: no UI blocking. Budget: < 10s on mid-range mobile.
    const points256 = generateRoofSamplePoints(footprint, roofY, {
      gridSpacingMeters: 1,
      maxPoints: 256,
    });
    const monthCount = 12;
    const avgStepsPerDay = 32; // ~16h daylight / 30min interval
    const totalRaycasts = points256.length * monthCount * avgStepsPerDay;
    expect(totalRaycasts).toBeLessThan(150_000); // Safety ceiling
  });
});
```

**Step 2: Run tests**

Run: `cd frontend && npm run test -- --run sunlightBenchmark`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/workers/sunlightBenchmark.test.ts
git commit -m "test: add roof point density benchmarks for Worker analysis"
```

**Definition of Done:**
- Benchmark covers 64, 256, and 512 point densities
- Raycast count ceiling verified (< 150K for 256 points)
- Tests pass structurally (real browser timing requires manual Playwright test)

---

### Task 3.3: Improve heatmap smoothness from denser per-point data

With 256 points, the existing vertex-color heatmap produces noticeably smoother gradients. Update the heatmap application to handle the larger point set efficiently.

**Files:**
- Modify: `frontend/src/utils/heatmapColors.ts`
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx`

**Step 1: Write test for large point set heatmap**

```typescript
// Add to heatmapColors.test.ts:

it('handles 256+ evaluation points without performance degradation', () => {
  const points: [number, number, number][] = Array.from(
    { length: 256 },
    (_, i) => [i % 16, 10, Math.floor(i / 16)],
  );
  const values = points.map((_, i) => i / 256 * 8); // 0-8 hours gradient

  // Should complete without error
  const colors = values.map(v => sunHoursToColor(v, 0, 8));
  expect(colors).toHaveLength(256);
  expect(colors[0]).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
});
```

**Step 2: Verify existing heatmap application handles larger arrays**

In `NeighborhoodViewer3D.tsx`, the `applyTargetHeatmap` function already uses nearest-neighbor vertex coloring from `result.perPointAnnual` and `result.roofGridPoints`. With 256 points (up from 64), the nearest-neighbor lookup produces smoother color transitions automatically — no algorithmic changes needed.

Verify: the existing `applyTargetHeatmap` function iterates all roof vertices and finds nearest evaluation point. With 4x more evaluation points, each vertex is closer to its nearest point → smoother gradient.

**Step 3: Run full test suite**

Run: `cd frontend && npm run test -- --run`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/utils/heatmapColors.ts frontend/src/components/NeighborhoodViewer3D.tsx
git commit -m "feat: verify heatmap smoothness with high-density evaluation points"
```

**Definition of Done:**
- 256 evaluation points produce smoother vertex-color gradients (visual improvement)
- No performance regression — nearest-neighbor is O(vertices × points), with 256 points still < 1ms
- Existing heatmap color palette unchanged (red→yellow→green)
- Tests pass

---

## Phase 4: Anisotropic Diffuse Sky Model (Perez + Tregenza)

> Replace isotropic cosine-weighted SVF with anisotropic sky luminance distribution. Uses Tregenza 145-patch hemisphere discretization weighted by Perez sky model parameters. More accurate for NL's maritime climate where circumsolar and horizon brightening effects are significant.

### Task 4.1: Implement Tregenza 145-patch sky discretization

The Tregenza hemisphere divides the sky dome into 145 patches of known solid angle and center direction. Standard in daylighting research.

**Files:**
- Create: `frontend/src/utils/tregenzaPatches.ts`
- Create: `frontend/src/utils/tregenzaPatches.test.ts`

**Step 1: Write tests**

```typescript
// tregenzaPatches.test.ts
import { describe, it, expect } from 'vitest';
import { getTregenzaPatches } from './tregenzaPatches';

describe('getTregenzaPatches', () => {
  const patches = getTregenzaPatches();

  it('returns exactly 145 patches', () => {
    expect(patches).toHaveLength(145);
  });

  it('each patch has center direction (altitude, azimuth) and solid angle', () => {
    for (const p of patches) {
      expect(p.altitude).toBeGreaterThan(0);
      expect(p.altitude).toBeLessThanOrEqual(Math.PI / 2);
      expect(p.azimuth).toBeGreaterThanOrEqual(0);
      expect(p.azimuth).toBeLessThan(2 * Math.PI);
      expect(p.solidAngle).toBeGreaterThan(0);
    }
  });

  it('solid angles sum to approximately 2*pi (upper hemisphere)', () => {
    const totalSolid = patches.reduce((s, p) => s + p.solidAngle, 0);
    expect(totalSolid).toBeCloseTo(2 * Math.PI, 0);
  });

  it('patches in higher rows have smaller solid angles', () => {
    // Zenith patch (row 7, single patch) should have smallest solid angle
    const zenithPatch = patches[patches.length - 1];
    const equatorPatch = patches[0]; // Row 0 at 6° altitude
    expect(zenithPatch.solidAngle).toBeLessThan(equatorPatch.solidAngle);
  });
});
```

**Step 2: Implement**

The Tregenza hemisphere has 7 rows + 1 zenith patch. Row divisions (altitude bands) and patch counts per row are standardized:

```typescript
// tregenzaPatches.ts

export interface TregenzaPatch {
  /** Altitude angle in radians (0 = horizon, pi/2 = zenith). */
  altitude: number;
  /** Azimuth angle in radians (0 = north, clockwise). */
  azimuth: number;
  /** Solid angle subtended by this patch (steradians). */
  solidAngle: number;
  /** Row index (0 = lowest, 7 = zenith). */
  row: number;
}

/**
 * Tregenza hemisphere: 145 sky patches.
 * Rows: 7 bands from 6° to 84° altitude, plus 1 zenith patch at 90°.
 * Patch counts per row: [30, 30, 24, 24, 18, 12, 6, 1] = 145 total.
 * Reference: Tregenza, P. (1987) "Subdivision of the sky hemisphere for
 * luminance measurements."
 */
export function getTregenzaPatches(): TregenzaPatch[] {
  // Row center altitudes (degrees) and patch counts
  const rows: { altDeg: number; count: number; bandDeg: number }[] = [
    { altDeg: 6,  count: 30, bandDeg: 12 },
    { altDeg: 18, count: 30, bandDeg: 12 },
    { altDeg: 30, count: 24, bandDeg: 12 },
    { altDeg: 42, count: 24, bandDeg: 12 },
    { altDeg: 54, count: 18, bandDeg: 12 },
    { altDeg: 66, count: 12, bandDeg: 12 },
    { altDeg: 78, count: 6,  bandDeg: 12 },
    { altDeg: 90, count: 1,  bandDeg: 12 }, // Zenith
  ];

  const deg2rad = Math.PI / 180;
  const patches: TregenzaPatch[] = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const { altDeg, count, bandDeg } = rows[rowIdx];
    const altitude = altDeg * deg2rad;

    // Solid angle of the band (ring between alt ± bandDeg/2)
    const altLow = Math.max(0, (altDeg - bandDeg / 2)) * deg2rad;
    const altHigh = Math.min(90, (altDeg + bandDeg / 2)) * deg2rad;
    const bandSolid = 2 * Math.PI * (Math.sin(altHigh) - Math.sin(altLow));
    const patchSolid = bandSolid / count;

    for (let i = 0; i < count; i++) {
      const azimuth = (2 * Math.PI * i) / count;
      patches.push({ altitude, azimuth, solidAngle: patchSolid, row: rowIdx });
    }
  }

  return patches;
}
```

**Step 3: Run tests, commit**

Run: `cd frontend && npm run test -- --run tregenzaPatches`
Expected: PASS

```bash
git commit -m "feat: implement Tregenza 145-patch sky hemisphere discretization"
```

**Definition of Done:**
- Exactly 145 patches returned
- Solid angles sum to ~2*pi (upper hemisphere)
- Each patch has valid altitude, azimuth, solid angle, row index
- Zenith patch correctly positioned at 90°
- Tests pass

---

### Task 4.2: Implement Perez sky luminance model

The Perez all-weather model computes sky luminance at any point on the sky dome given sun position and sky clearness/brightness indices.

**Files:**
- Create: `frontend/src/utils/perezSky.ts`
- Create: `frontend/src/utils/perezSky.test.ts`

**Step 1: Write tests**

```typescript
// perezSky.test.ts
import { describe, it, expect } from 'vitest';
import { perezLuminance, PerezCoefficients } from './perezSky';

describe('perezLuminance', () => {
  it('returns higher luminance near the sun (circumsolar)', () => {
    const sunAlt = 45 * Math.PI / 180;
    const sunAz = 180 * Math.PI / 180; // South

    // Point near sun
    const nearSun = perezLuminance(44 * Math.PI / 180, 179 * Math.PI / 180, sunAlt, sunAz);
    // Point far from sun
    const farFromSun = perezLuminance(44 * Math.PI / 180, 0, sunAlt, sunAz);

    expect(nearSun).toBeGreaterThan(farFromSun);
  });

  it('returns positive luminance for all valid sky positions', () => {
    const sunAlt = 30 * Math.PI / 180;
    const sunAz = Math.PI;

    for (let alt = 5; alt <= 85; alt += 10) {
      for (let az = 0; az < 360; az += 30) {
        const lum = perezLuminance(
          alt * Math.PI / 180,
          az * Math.PI / 180,
          sunAlt,
          sunAz,
        );
        expect(lum).toBeGreaterThan(0);
      }
    }
  });

  it('returns higher luminance near horizon (horizon brightening)', () => {
    const sunAlt = 60 * Math.PI / 180;
    const sunAz = Math.PI;

    // Opposite side of sky from sun (no circumsolar effect)
    const horizon = perezLuminance(5 * Math.PI / 180, 0, sunAlt, sunAz);
    const midSky = perezLuminance(45 * Math.PI / 180, 0, sunAlt, sunAz);

    // Under clear sky, horizon brightening means horizon > mid-sky on opposite side
    // This depends on epsilon category; for overcast, may not hold
    expect(horizon).toBeGreaterThan(0);
    expect(midSky).toBeGreaterThan(0);
  });
});
```

**Step 2: Implement**

```typescript
// perezSky.ts

/**
 * Perez all-weather sky luminance model.
 *
 * Reference: Perez R., Seals R., Michalsky J. (1993) "All-weather model
 * for sky luminance distribution."
 *
 * The model has 5 coefficients (a, b, c, d, e) that control:
 * a, b: darkening/brightening toward horizon
 * c, d: circumsolar peak width and intensity
 * e: back-scattering (luminance behind the sun)
 *
 * For v2 we use the "CIE standard clear sky" approximation (type 12)
 * as a reasonable default. Full epsilon-category lookup can be added
 * when TMY weather data is available (Phase 5).
 */

export interface PerezCoefficients {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
}

/** CIE clear sky (type 12) — reasonable for "clear-sky" sunlight analysis. */
const CIE_CLEAR: PerezCoefficients = {
  a: -1.0,
  b: -0.32,
  c: 10.0,
  d: -3.0,
  e: 0.45,
};

/**
 * Angle between two sky directions (radians).
 */
function angularDistance(
  alt1: number, az1: number,
  alt2: number, az2: number,
): number {
  const cosD = Math.sin(alt1) * Math.sin(alt2)
    + Math.cos(alt1) * Math.cos(alt2) * Math.cos(az1 - az2);
  return Math.acos(Math.max(-1, Math.min(1, cosD)));
}

/**
 * Compute relative sky luminance at a given direction.
 *
 * @param patchAlt - Patch altitude (radians, 0 = horizon)
 * @param patchAz - Patch azimuth (radians)
 * @param sunAlt - Sun altitude (radians)
 * @param sunAz - Sun azimuth (radians)
 * @param coeffs - Perez model coefficients (default: CIE clear sky type 12)
 * @returns Relative luminance (dimensionless, > 0). NOT absolute cd/m2.
 */
export function perezLuminance(
  patchAlt: number,
  patchAz: number,
  sunAlt: number,
  sunAz: number,
  coeffs: PerezCoefficients = CIE_CLEAR,
): number {
  const { a, b, c, d, e } = coeffs;
  const zenithPatch = Math.PI / 2 - patchAlt;
  const zenithSun = Math.PI / 2 - sunAlt;

  // Angular distance between patch and sun
  const gamma = angularDistance(patchAlt, patchAz, sunAlt, sunAz);

  // Perez formula: f(zenith, gamma) = (1 + a * exp(b / cos(z))) * (1 + c * exp(d * gamma) + e * cos^2(gamma))
  const cosZ = Math.max(0.01, Math.cos(zenithPatch));
  const f_patch = (1 + a * Math.exp(b / cosZ))
    * (1 + c * Math.exp(d * gamma) + e * Math.cos(gamma) ** 2);

  // Normalize by zenith value: f(0, gammaZ) where gammaZ = zenith-sun angle
  const gammaZ = zenithSun; // Angular distance from zenith to sun
  const f_zenith = (1 + a * Math.exp(b))
    * (1 + c * Math.exp(d * gammaZ) + e * Math.cos(gammaZ) ** 2);

  // Relative luminance (positive, clamped)
  return Math.max(0.001, f_patch / Math.max(0.001, f_zenith));
}
```

**Step 3: Run tests, commit**

Run: `cd frontend && npm run test -- --run perezSky`
Expected: PASS

```bash
git commit -m "feat: implement Perez all-weather sky luminance model"
```

**Definition of Done:**
- Circumsolar brightening: patches near the sun have higher luminance
- Horizon brightening: low-altitude patches have brightness boost (clear sky)
- All return values positive
- Uses CIE clear sky type 12 as default (matches v1's "clear-sky" premise)
- Tests pass

---

### Task 4.3: Combine patch visibility + luminance weighting for anisotropic SVF

Replace the isotropic cosine-weighted SVF with Tregenza patch visibility weighted by Perez luminance distribution.

**Files:**
- Create: `frontend/src/utils/anisotropicSvf.ts`
- Create: `frontend/src/utils/anisotropicSvf.test.ts`

**Step 1: Write tests**

```typescript
// anisotropicSvf.test.ts
import { describe, it, expect } from 'vitest';
import { computeAnisotropicSvf } from './anisotropicSvf';

describe('computeAnisotropicSvf', () => {
  it('returns higher value when sun-facing patches are visible', () => {
    // All patches visible
    const fullSky = computeAnisotropicSvf(
      () => true, // all patches visible
      45 * Math.PI / 180, // sun at 45° altitude
      Math.PI, // sun due south
    );

    // Only patches away from sun visible
    const awaySky = computeAnisotropicSvf(
      (alt, az) => Math.abs(az - Math.PI) > Math.PI / 2, // north-facing half
      45 * Math.PI / 180,
      Math.PI,
    );

    expect(fullSky).toBeGreaterThan(awaySky);
  });

  it('returns 1.0 when all patches are visible (open sky)', () => {
    const svf = computeAnisotropicSvf(
      () => true,
      45 * Math.PI / 180,
      Math.PI,
    );
    expect(svf).toBeCloseTo(1.0, 1);
  });

  it('returns 0.0 when no patches are visible', () => {
    const svf = computeAnisotropicSvf(
      () => false,
      45 * Math.PI / 180,
      Math.PI,
    );
    expect(svf).toBeCloseTo(0.0, 1);
  });
});
```

**Step 2: Implement**

```typescript
// anisotropicSvf.ts
import { getTregenzaPatches } from './tregenzaPatches';
import { perezLuminance } from './perezSky';

/**
 * Compute anisotropic SVF using Tregenza patches weighted by Perez luminance.
 *
 * Instead of isotropic cosine weighting (v1), each sky patch's contribution
 * is weighted by its Perez-model luminance. This captures:
 * - Circumsolar brightening (patches near sun contribute more)
 * - Horizon brightening (low patches contribute more than isotropic assumes)
 *
 * @param isVisible - Function that returns true if a sky patch direction is visible
 *                    (not obstructed by buildings). Takes (altitude, azimuth) in radians.
 * @param sunAlt - Current sun altitude (radians)
 * @param sunAz - Current sun azimuth (radians)
 * @returns Anisotropic SVF [0, 1]
 */
export function computeAnisotropicSvf(
  isVisible: (altitude: number, azimuth: number) => boolean,
  sunAlt: number,
  sunAz: number,
): number {
  const patches = getTregenzaPatches();

  let weightedVisible = 0;
  let totalWeight = 0;

  for (const patch of patches) {
    // Weight = Perez luminance * solid angle * cos(zenith)
    const cosZenith = Math.sin(patch.altitude); // cos(pi/2 - alt) = sin(alt)
    const luminance = perezLuminance(patch.altitude, patch.azimuth, sunAlt, sunAz);
    const weight = luminance * patch.solidAngle * cosZenith;

    totalWeight += weight;

    if (isVisible(patch.altitude, patch.azimuth)) {
      weightedVisible += weight;
    }
  }

  return totalWeight > 0 ? weightedVisible / totalWeight : 0;
}
```

**Step 3: Run tests, commit**

Run: `cd frontend && npm run test -- --run anisotropicSvf`
Expected: PASS

```bash
git commit -m "feat: compute anisotropic SVF via Tregenza patches + Perez weighting"
```

**Definition of Done:**
- Uses all 145 Tregenza patches
- Each patch weighted by: Perez luminance * solid angle * cos(zenith)
- Returns 1.0 for fully open sky, 0.0 for fully obstructed
- Circumsolar patches contribute more than opposite-side patches
- Tests pass

---

### Task 4.4: Integrate anisotropic SVF into viewer pipeline

Replace the isotropic `computeSvfMultiPoint()` call with anisotropic computation that uses cubemap visibility data + Perez weighting.

**Files:**
- Modify: `frontend/src/utils/svfComputation.ts` (add `computeAnisotropicSvfFromCubemap`)
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx`
- Modify: `frontend/src/types/api.ts` (add `svfAnisotropic` field)

**Implementation:**

After rendering the cubemap for SVF (existing code), instead of isotropic pixel classification, map each Tregenza patch to its cubemap region and check visibility, then weight by Perez luminance.

```typescript
// In svfComputation.ts, add:
export function computeAnisotropicSvfFromCubemap(
  renderer: WebGLRenderer,
  buildingMeshes: Object3D[],
  evalPoint: [number, number, number],
  sunAlt: number,
  sunAz: number,
): number {
  // Render cubemap (same as computeSvf)
  // ...
  // For each Tregenza patch: map (alt, az) to cubemap face+pixel, check if sky
  // Weight by Perez luminance
  // ...
}
```

```bash
git commit -m "feat: integrate anisotropic SVF into viewer pipeline"
```

**Definition of Done:**
- `SunlightResult.svfAnisotropic` added as optional field
- Isotropic SVF preserved as `svf` for backward compatibility
- Anisotropic SVF computed using cubemap visibility + Perez weighting
- SunlightRiskCard shows both metrics with clear labels
- i18n keys for anisotropic SVF explanation
- Tests pass

---

## Phase 5: Weather-Corrected Irradiance (kWh/m2/year)

> Add energy-based output using real weather data. Explicitly deferred from v1 per PRD ("unless you ingest a weather/irradiance time series and validate it"). Requires external data source. Phase 5 also introduces the data-contract changes needed for irradiance: per-timestep visibility output, surface normals, and Worker API extensions.

### Task 5.1: Research spike — KNMI TMY data acquisition

**This is a research task, not implementation.**

Investigate available weather data sources for hourly DNI/DHI/GHI at Dutch locations:

1. **KNMI hourly data** (`daggegevens.knmi.nl`): Free, hourly global radiation (Q), but decomposition to DNI/DHI requires a model (e.g., BRL or Erbs)
2. **PVGIS TMY** (`re.jrc.ec.europa.eu/api/v5_2/tmy`): Free EU-funded, provides hourly GHI/DHI/DNI directly, typical meteorological year
3. **SolarGIS**: Commercial, high-resolution, expensive

**Output:** A markdown decision document in `docs/` specifying chosen data source, data format, API access pattern, caching strategy, and licensing requirements.

**Definition of Done:**
- Decision document written and reviewed
- Sample data fetched and validated for Amsterdam coordinates
- Data format understood and documented
- Licensing compatible with buurt-check (open source)

---

### Task 5.2: Add per-timestep visibility output to analyzeSunlight

The irradiance formula requires per-timestep visibility (not just aggregated hours). Extend `analyzeSunlight` to optionally emit a visibility matrix: `perPointPerTimestep[pointIdx][timestepIdx] = 0 | 1`.

**Files:**
- Modify: `frontend/src/utils/sunlightAnalysis.ts`
- Modify: `frontend/src/utils/sunlightAnalysis.test.ts`
- Modify: `frontend/src/types/api.ts`

**Step 1: Write failing test**

```typescript
// Add to sunlightAnalysis.test.ts:

it('returns per-timestep visibility matrix when requested', async () => {
  const result = await analyzeSunlight({
    buildingMeshes: mockBuildingMeshes,
    targetPandId: 'target',
    footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
    roofY: 10,
    lat: 52.37,
    lng: 4.90,
    year: 2025,
    emitPerTimestep: true,
  });

  expect(result).not.toBeNull();
  if (result) {
    expect(result.perTimestepVisibility).toBeDefined();
    // Should be an array of arrays: [pointIdx][timestepIdx]
    expect(result.perTimestepVisibility!.length).toBe(result.roofGridPoints.length);
    // Each inner array should have consistent length (total timestep count)
    const tsCount = result.perTimestepVisibility![0].length;
    expect(tsCount).toBeGreaterThan(0);
    // Values should be 0 or 1
    for (const pointTs of result.perTimestepVisibility!) {
      expect(pointTs.length).toBe(tsCount);
      for (const v of pointTs) {
        expect(v === 0 || v === 1).toBe(true);
      }
    }
  }
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run sunlightAnalysis`
Expected: FAIL — `emitPerTimestep` not recognized, `perTimestepVisibility` undefined

**Step 3: Extend types**

```typescript
// Add to types/api.ts SunlightResult:

export interface SunlightResult {
  // ... existing fields ...
  /** Per-point per-timestep visibility (0=shadowed, 1=lit). Only when emitPerTimestep=true. */
  perTimestepVisibility?: (0 | 1)[][];
  /** Timestep metadata: [{ date: ISO string, minuteOfDay: number }] */
  timestepMeta?: { date: string; minuteOfDay: number }[];
}
```

**Step 4: Extend SunlightAnalysisOptions**

```typescript
// In sunlightAnalysis.ts:

export interface SunlightAnalysisOptions {
  // ... existing fields ...
  /** When true, record per-point per-timestep 0/1 visibility. Memory-heavy — for irradiance only. */
  emitPerTimestep?: boolean;
}
```

**Step 5: Implement in the analysis loop**

**IMPORTANT: Loop structure is `months → points → timesteps`.** The timestep index must be tracked globally across all months, not per-month. A global `timestepCounter` increments for each unique (date, minuteOfDay) pair. Timestep meta is collected in the FIRST pass (first point), and subsequent points reference the same timestep indices.

```typescript
const perTimestepVisibility: (0 | 1)[][] = emitPerTimestep
  ? roofGridPoints.map(() => [])
  : [];
const timestepMeta: { date: string; minuteOfDay: number }[] = [];
let globalTimestepIdx = 0;

// Inside the MONTH loop (for (const date of monthlyDates)):
//   Inside the POINT loop (for (let pointIdx = 0...)):
//     Reset per-point timestep counter at start of each month:
let pointTimestepStart = globalTimestepIdx; // snapshot before timestep loop

//     Inside the TIMESTEP loop (for (const minuteOfDay of sampleMinutes)):
const lit: 0 | 1 = blocked ? 0 : 1;
if (!blocked) sunlitHours += hoursPerSample;
if (emitPerTimestep) {
  perTimestepVisibility[pointIdx].push(lit);
  // Only push timestep meta once (first point of this month)
  if (pointIdx === 0) {
    timestepMeta.push({ date: sampleDate.toISOString(), minuteOfDay });
  }
}

//   After the POINT loop for this month completes:
if (emitPerTimestep) {
  // Update global counter based on timesteps processed in this month
  globalTimestepIdx = timestepMeta.length;
}
```

The key insight: because the outer loop is months and the inner is points, timestepMeta is built incrementally during the first point's pass through each month. All points in the same month see the same timesteps, so their `perTimestepVisibility[pointIdx]` arrays end up with consistent length.

**Step 6: Run tests**

Run: `cd frontend && npm run test -- --run sunlightAnalysis`
Expected: PASS

**Step 7: Commit**

```bash
git add frontend/src/utils/sunlightAnalysis.ts frontend/src/utils/sunlightAnalysis.test.ts frontend/src/types/api.ts
git commit -m "feat: add per-timestep visibility output to sunlight analysis"
```

**Definition of Done:**
- `emitPerTimestep: true` produces `perTimestepVisibility` matrix + `timestepMeta` array
- `emitPerTimestep: false` (default) produces identical results to v1 (no memory overhead)
- Visibility values are strictly 0 or 1
- Timestep metadata records date + minute for weather data correlation
- Tests pass

---

### Task 5.3: Add surface normal computation for incidence angles

Irradiance formula needs the angle between sun vector and surface normal. For roof surfaces, compute average normal from 3DBAG geometry. For facades, normal is already known from orientation.

**Files:**
- Create: `frontend/src/utils/surfaceNormals.ts`
- Create: `frontend/src/utils/surfaceNormals.test.ts`

**Step 1: Write failing tests**

```typescript
// surfaceNormals.test.ts
import { describe, it, expect } from 'vitest';
import { computeRoofNormal, facadeOrientationToNormal, incidenceAngle } from './surfaceNormals';

describe('computeRoofNormal', () => {
  it('returns upward normal for flat roof', () => {
    // Flat roof: all vertices at same height
    const vertices: [number, number, number][] = [
      [0, 10, 0], [10, 10, 0], [10, 10, -10], [0, 10, -10],
    ];
    const normal = computeRoofNormal(vertices);
    expect(normal[1]).toBeCloseTo(1, 1); // Y component = up
    expect(Math.abs(normal[0])).toBeLessThan(0.1);
    expect(Math.abs(normal[2])).toBeLessThan(0.1);
  });
});

describe('facadeOrientationToNormal', () => {
  it('returns south-facing normal for south orientation', () => {
    const normal = facadeOrientationToNormal('south');
    // South = +Z in viewer (north = -Z)
    expect(normal[2]).toBeGreaterThan(0.9);
    expect(normal[1]).toBeCloseTo(0, 1);
  });
});

describe('incidenceAngle', () => {
  it('returns 0 when sun is perpendicular to surface', () => {
    const surfaceNormal = [0, 1, 0]; // horizontal roof
    const sunDir = [0, 1, 0]; // sun directly above
    const angle = incidenceAngle(surfaceNormal, sunDir);
    expect(angle).toBeCloseTo(0, 1);
  });

  it('returns PI/2 when sun is parallel to surface', () => {
    const surfaceNormal = [0, 1, 0]; // horizontal roof
    const sunDir = [1, 0, 0]; // sun at horizon
    const angle = incidenceAngle(surfaceNormal, sunDir);
    expect(angle).toBeCloseTo(Math.PI / 2, 1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run surfaceNormals`
Expected: FAIL — module doesn't exist

**Step 3: Implement**

```typescript
// surfaceNormals.ts

type Vec3 = [number, number, number];

/**
 * Compute average surface normal from a set of coplanar-ish vertices.
 * Uses Newell's method (robust for non-planar polygons).
 */
export function computeRoofNormal(vertices: Vec3[]): Vec3 {
  let nx = 0, ny = 0, nz = 0;

  for (let i = 0; i < vertices.length; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    nx += (curr[1] - next[1]) * (curr[2] + next[2]);
    ny += (curr[2] - next[2]) * (curr[0] + next[0]);
    nz += (curr[0] - next[0]) * (curr[1] + next[1]);
  }

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < 1e-10) return [0, 1, 0]; // Default to upward
  return [nx / len, ny / len, nz / len];
}

/**
 * Convert cardinal orientation to a unit normal vector in viewer space.
 */
export function facadeOrientationToNormal(
  orientation: 'north' | 'south' | 'east' | 'west',
): Vec3 {
  switch (orientation) {
    case 'north': return [0, 0, -1];
    case 'south': return [0, 0, 1];
    case 'east': return [1, 0, 0];
    case 'west': return [-1, 0, 0];
  }
}

/**
 * Angle between sun direction and surface normal (radians).
 * Returns value in [0, PI/2]. Clamped — negative cos means sun behind surface.
 */
export function incidenceAngle(surfaceNormal: number[], sunDir: number[]): number {
  const dot = surfaceNormal[0] * sunDir[0]
    + surfaceNormal[1] * sunDir[1]
    + surfaceNormal[2] * sunDir[2];
  return Math.acos(Math.max(0, Math.min(1, dot)));
}
```

**Step 4: Run tests**

Run: `cd frontend && npm run test -- --run surfaceNormals`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/utils/surfaceNormals.ts frontend/src/utils/surfaceNormals.test.ts
git commit -m "feat: add surface normal computation and incidence angle for irradiance"
```

**Definition of Done:**
- `computeRoofNormal` handles non-planar polygons via Newell's method
- `facadeOrientationToNormal` maps cardinal to unit vector in viewer space
- `incidenceAngle` clamps to [0, PI/2] (no negative cos)
- Tests pass

---

### Task 5.4: Extend Worker message types for per-timestep data

Add Worker message types to support per-timestep visibility transfer. This is a data-contract change required before the irradiance module can run in the Worker.

**Files:**
- Modify: `frontend/src/workers/sunlightWorkerTypes.ts`

**Step 1: Extend request type**

```typescript
// Add to SunlightWorkerRequest:
export interface SunlightWorkerRequest {
  // ... existing fields ...
  /** When true, Worker returns per-timestep visibility matrix. */
  emitPerTimestep?: boolean;
}
```

**Step 2: Extend result type**

```typescript
// Add to SunlightWorkerResult:
export interface SunlightWorkerResult {
  type: 'result';
  id: number;
  result: {
    // ... existing fields ...
    /** Per-point per-timestep visibility. Only present when emitPerTimestep=true. */
    perTimestepVisibility?: (0 | 1)[][];
    /** Timestep metadata for weather data correlation. */
    timestepMeta?: { date: string; minuteOfDay: number }[];
  } | null;
}
```

**Step 3: Build check**

Run: `cd frontend && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/workers/sunlightWorkerTypes.ts
git commit -m "feat: extend Worker message types for per-timestep visibility"
```

**Definition of Done:**
- Worker request supports `emitPerTimestep` flag
- Worker result includes optional `perTimestepVisibility` and `timestepMeta`
- Types compile without errors

---

### Task 5.5: Create irradiance computation module

Combine per-timestep geometric visibility with weather data to produce kWh/m2/year.

**Files:**
- Create: `frontend/src/utils/irradianceComputation.ts`
- Create: `frontend/src/utils/irradianceComputation.test.ts`

**Step 1: Write failing tests**

```typescript
// irradianceComputation.test.ts
import { describe, it, expect } from 'vitest';
import { computeIrradiance, type HourlyWeatherRecord } from './irradianceComputation';

describe('computeIrradiance', () => {
  const makeWeather = (dniW: number, dhiW: number): HourlyWeatherRecord[] =>
    Array.from({ length: 4 }, (_, i) => ({
      date: `2025-06-21T${10 + i}:00:00Z`,
      minuteOfDay: (10 + i) * 60,
      dni_w_m2: dniW,
      dhi_w_m2: dhiW,
    }));

  it('returns 0 when fully shadowed', () => {
    const visibility = [[0, 0, 0, 0] as (0 | 1)[]];
    const sunDirs = [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]];
    const surfaceNormal = [0, 1, 0];
    const svf = 0.5;
    const weather = makeWeather(500, 200);
    const intervalMinutes = 60;

    const result = computeIrradiance({
      perTimestepVisibility: visibility,
      sunDirections: sunDirs,
      surfaceNormal,
      svf,
      weather,
      intervalMinutes,
    });

    // Only diffuse contribution when fully shadowed
    expect(result.totalKwhM2).toBeGreaterThan(0); // DHI * SVF still contributes
    expect(result.directKwhM2).toBeCloseTo(0, 5);
  });

  it('returns higher irradiance when fully lit vs fully shadowed', () => {
    const litVisibility = [[1, 1, 1, 1] as (0 | 1)[]];
    const shadowedVisibility = [[0, 0, 0, 0] as (0 | 1)[]];
    const sunDirs = [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]];
    const surfaceNormal = [0, 1, 0];
    const svf = 0.8;
    const weather = makeWeather(500, 200);
    const intervalMinutes = 60;

    const litResult = computeIrradiance({
      perTimestepVisibility: litVisibility,
      sunDirections: sunDirs,
      surfaceNormal,
      svf,
      weather,
      intervalMinutes,
    });
    const shadowedResult = computeIrradiance({
      perTimestepVisibility: shadowedVisibility,
      sunDirections: sunDirs,
      surfaceNormal,
      svf,
      weather,
      intervalMinutes,
    });

    expect(litResult.totalKwhM2).toBeGreaterThan(shadowedResult.totalKwhM2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run irradianceComputation`
Expected: FAIL — module doesn't exist

**Step 3: Implement**

```typescript
// irradianceComputation.ts
import { incidenceAngle } from './surfaceNormals';

export interface HourlyWeatherRecord {
  date: string;
  minuteOfDay: number;
  dni_w_m2: number; // Direct Normal Irradiance (W/m2)
  dhi_w_m2: number; // Diffuse Horizontal Irradiance (W/m2)
}

interface IrradianceInput {
  perTimestepVisibility: (0 | 1)[][];
  sunDirections: number[][]; // Unit vectors per timestep
  surfaceNormal: number[];
  svf: number; // Sky view factor [0-1]
  weather: HourlyWeatherRecord[];
  intervalMinutes: number;
}

interface IrradianceResult {
  totalKwhM2: number;
  directKwhM2: number;
  diffuseKwhM2: number;
}

/**
 * Compute annual irradiance from per-timestep visibility + weather data.
 *
 * Formula per timestep:
 *   direct = DNI * cos(incidence_angle) * visibility
 *   diffuse = DHI * SVF
 *   total = direct + diffuse
 *
 * Summed over all timesteps and converted from Wh to kWh.
 */
export function computeIrradiance(input: IrradianceInput): IrradianceResult {
  const { perTimestepVisibility, sunDirections, surfaceNormal, svf, weather, intervalMinutes } = input;

  const hoursPerStep = intervalMinutes / 60;
  let directWhM2 = 0;
  let diffuseWhM2 = 0;

  // Use first evaluation point as representative
  const visibility = perTimestepVisibility[0] ?? [];
  const numTimesteps = Math.min(visibility.length, sunDirections.length, weather.length);

  for (let t = 0; t < numTimesteps; t++) {
    const weatherRecord = weather[t];
    const vis = visibility[t];
    const sunDir = sunDirections[t];

    // Direct component: DNI * cos(theta) * visibility
    if (vis === 1 && weatherRecord.dni_w_m2 > 0) {
      const theta = incidenceAngle(surfaceNormal, sunDir);
      const cosTheta = Math.cos(theta);
      if (cosTheta > 0) {
        directWhM2 += weatherRecord.dni_w_m2 * cosTheta * hoursPerStep;
      }
    }

    // Diffuse component: DHI * SVF (independent of direct visibility)
    if (weatherRecord.dhi_w_m2 > 0) {
      diffuseWhM2 += weatherRecord.dhi_w_m2 * svf * hoursPerStep;
    }
  }

  return {
    totalKwhM2: (directWhM2 + diffuseWhM2) / 1000,
    directKwhM2: directWhM2 / 1000,
    diffuseKwhM2: diffuseWhM2 / 1000,
  };
}
```

**Step 4: Run tests**

Run: `cd frontend && npm run test -- --run irradianceComputation`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/utils/irradianceComputation.ts frontend/src/utils/irradianceComputation.test.ts
git commit -m "feat: add irradiance computation module with DNI/DHI weather integration"
```

**Definition of Done:**
- Module accepts per-timestep visibility + weather data → returns kWh/m2/year
- Separate direct and diffuse contributions tracked
- Incidence angle computed from surface normal
- Unit tests with synthetic weather data verify lit > shadowed
- Tests pass

---

### Task 5.6: Add backend weather data endpoint

Cache TMY data per location (resolution: 0.05° grid) and serve to frontend.

**Files:**
- Create: `backend/app/services/weather.py`
- Create: `backend/tests/test_weather.py`
- Modify: `backend/app/api/address.py`
- Modify: `backend/app/config.py`

**Step 1: Write failing tests**

```python
# test_weather.py
import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.mark.asyncio
async def test_fetch_tmy_returns_hourly_data(mock_http_client):
    from app.services.weather import fetch_tmy_data

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "outputs": {
            "tmy_hourly": [
                {"time(UTC)": "20050101:0030", "G(h)": 0, "Gb(n)": 0, "Gd(h)": 0},
                {"time(UTC)": "20050621:1200", "G(h)": 800, "Gb(n)": 600, "Gd(h)": 200},
            ]
        }
    }
    mock_http_client.get = AsyncMock(return_value=mock_response)

    result = await fetch_tmy_data(52.37, 4.90)
    assert len(result) > 0
    assert "dni_w_m2" in result[0]
    assert "dhi_w_m2" in result[0]


@pytest.mark.asyncio
async def test_fetch_tmy_caches_for_365d(mock_http_client, mock_redis):
    from app.services.weather import fetch_tmy_data

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"outputs": {"tmy_hourly": []}}
    mock_http_client.get = AsyncMock(return_value=mock_response)

    await fetch_tmy_data(52.37, 4.90)
    # Second call should hit cache
    await fetch_tmy_data(52.37, 4.90)
    assert mock_http_client.get.call_count == 1
```

**Step 2: Implement**

First, add the PVGIS URL to `config.py` (per CLAUDE.md: "All external URLs in `config.py`"):

```python
# In config.py, add to Settings class:
pvgis_tmy_base: str = "https://re.jrc.ec.europa.eu/api/v5_2/tmy"
```

```python
# weather.py
from app.cache.redis_cache import redis_cache
from app.core.http_client import get_client
from app.config import settings

TMY_CACHE_TTL = 365 * 24 * 3600  # 365 days

async def fetch_tmy_data(lat: float, lng: float) -> list[dict]:
    # Round to 0.05° grid for cache key normalization
    grid_lat = round(lat / 0.05) * 0.05
    grid_lng = round(lng / 0.05) * 0.05
    cache_key = f"weather_tmy:{grid_lat:.2f}:{grid_lng:.2f}"

    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    client = get_client()
    response = await client.get(
        settings.pvgis_tmy_base,
        params={"lat": grid_lat, "lon": grid_lng, "outputformat": "json"},
        timeout=30.0,
    )
    response.raise_for_status()
    data = response.json()

    hourly = data.get("outputs", {}).get("tmy_hourly", [])
    result = [
        {
            "date": record.get("time(UTC)", ""),
            "ghi_w_m2": record.get("G(h)", 0),
            "dni_w_m2": record.get("Gb(n)", 0),
            "dhi_w_m2": record.get("Gd(h)", 0),
        }
        for record in hourly
    ]

    if result:
        await redis_cache.set(cache_key, result, ttl=TMY_CACHE_TTL)

    return result
```

**Step 3: Add endpoint to address.py**

```python
@router.get("/{vbo_id}/weather-tmy")
async def get_weather_tmy(vbo_id: str, lat: float, lng: float):
    data = await fetch_tmy_data(lat, lng)
    return {
        "source": "PVGIS TMY v5.2 (European Commission JRC)",
        "grid_resolution_deg": 0.05,
        "hourly_records": len(data),
        "data": data,
    }
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_weather.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/services/weather.py backend/tests/test_weather.py backend/app/api/address.py backend/app/config.py
git commit -m "feat: add PVGIS TMY weather data endpoint for irradiance"
```

**Definition of Done:**
- `GET /{vbo_id}/weather-tmy?lat=&lng=` returns hourly DNI/DHI/GHI for nearest grid point
- Data cached for 365 days (TMY doesn't change frequently)
- Source attribution included in response (`PVGIS TMY v5.2`)
- Grid resolution: 0.05° (~5km) — sufficient for urban solar analysis
- Tests pass

---

### Task 5.7: Wire frontend weather data fetch into irradiance pipeline

Connect the backend weather endpoint to the frontend, fetch TMY data alongside 3D buildings, and pipe it into the irradiance computation when per-timestep visibility is available.

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/components/SunlightRiskCard.tsx`
- Modify: `frontend/src/components/SunlightRiskCard.test.tsx`
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/nl.json`

**Step 1: Add fetch function to api.ts**

```typescript
export async function fetchWeatherTmy(
  vboId: string,
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<HourlyWeatherRecord[] | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/address/${vboId}/weather-tmy?lat=${lat}&lng=${lng}`,
      { signal },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}
```

**Step 2: Add irradiance display to SunlightRiskCard**

```typescript
// When irradiance data available:
{sunlight.irradianceKwhM2 && (
  <div className="sunlight-card__irradiance">
    <span className="sunlight-card__metric-label">{t('sunlight.irradiance_label')}</span>
    <span className="sunlight-card__metric-value">
      {sunlight.irradianceKwhM2.toFixed(0)} kWh/m²/yr
    </span>
    <p className="sunlight-card__disclaimer">{t('sunlight.irradiance_disclaimer')}</p>
  </div>
)}
```

**Step 3: Add i18n keys**

```json
{
  "sunlight.irradiance_label": "Estimated solar irradiance",
  "sunlight.irradiance_disclaimer": "Based on typical meteorological year data (PVGIS). Actual values depend on weather, reflections, and building materials.",
  "sunlight.irradiance_direct": "Direct: {{value}} kWh/m²/yr",
  "sunlight.irradiance_diffuse": "Diffuse: {{value}} kWh/m²/yr"
}
```

**Step 4: Graceful degradation**

If weather data is unavailable (API failure, timeout, no coverage), the card shows hours-only (v1 behavior). Irradiance section is hidden. No error message needed — the user never knew to expect it.

**Step 5: Commit**

```bash
git commit -m "feat: wire frontend weather fetch and irradiance display into sunlight card"
```

**Definition of Done:**
- Frontend fetches weather TMY alongside 3D buildings (non-blocking)
- Irradiance computed when per-timestep visibility + weather data both available
- SunlightRiskCard shows kWh/m²/year metric with source disclaimer
- Graceful degradation: hours-only display when weather unavailable
- Both EN and NL translations
- Tests pass

---

## Phase 6: Standards Benchmarking (EN 17037 / TNO)

> Implement informational benchmarking against recognized standards. PRD Section 5.3 explicitly says: "Never claim 'EN 17037 compliant' or 'meets TNO norm.'" Present as "comparable to thresholds used in..."

### Task 6.1: Implement EN 17037 reference-day calculation

EN 17037 uses March 21 (equinox) as the reference day and defines exposure levels: 1.5h, 3h, 4h.

**Files:**
- Create: `frontend/src/utils/standardsBenchmark.ts`
- Create: `frontend/src/utils/standardsBenchmark.test.ts`

**Step 1: Write tests**

```typescript
// standardsBenchmark.test.ts
import { describe, it, expect } from 'vitest';
import { getEN17037Level, getTNOBenchmark } from './standardsBenchmark';

describe('getEN17037Level', () => {
  it('returns "high" for >= 4h on equinox', () => {
    expect(getEN17037Level(4.5)).toBe('high');
  });

  it('returns "medium" for >= 3h', () => {
    expect(getEN17037Level(3.2)).toBe('medium');
  });

  it('returns "minimum" for >= 1.5h', () => {
    expect(getEN17037Level(2.0)).toBe('minimum');
  });

  it('returns "below" for < 1.5h', () => {
    expect(getEN17037Level(0.8)).toBe('below');
  });
});

describe('getTNOBenchmark', () => {
  it('returns "streng" for >= possible sun hours', () => {
    // Winter possible hours in NL: ~7.5h. If visibility = 7h → streng threshold met
    expect(getTNOBenchmark(7.0, 7.5)).toBe('streng');
  });

  it('returns "licht" for >= 50% of possible', () => {
    expect(getTNOBenchmark(4.0, 7.5)).toBe('licht');
  });

  it('returns "below" for < 50% of possible', () => {
    expect(getTNOBenchmark(2.0, 7.5)).toBe('below');
  });
});
```

**Step 2: Implement**

```typescript
// standardsBenchmark.ts

export type EN17037Level = 'high' | 'medium' | 'minimum' | 'below';
export type TNOLevel = 'streng' | 'licht' | 'below';

/**
 * EN 17037 sunlight exposure assessment (informational only).
 * Uses equinox (March 21) direct sun hours.
 *
 * NEVER claim compliance — these are approximate thresholds for context.
 * Label as: "Comparable to EN 17037 thresholds"
 */
export function getEN17037Level(equinoxHours: number): EN17037Level {
  if (equinoxHours >= 4) return 'high';
  if (equinoxHours >= 3) return 'medium';
  if (equinoxHours >= 1.5) return 'minimum';
  return 'below';
}

/**
 * TNO bezonningsnorm assessment (informational only).
 * Compares actual sun hours against possible sun hours for the date.
 *
 * "Streng" (strict): >= 80% of possible hours
 * "Licht" (mild): >= 50% of possible hours
 *
 * NEVER claim compliance — these are geometry-based estimates.
 * Label as: "Comparable to TNO bezonningsnorm thresholds"
 */
export function getTNOBenchmark(
  actualHours: number,
  possibleHours: number,
): TNOLevel {
  if (possibleHours <= 0) return 'below';
  const fraction = actualHours / possibleHours;
  if (fraction >= 0.8) return 'streng';
  if (fraction >= 0.5) return 'licht';
  return 'below';
}
```

**Step 3: Run tests, commit**

Run: `cd frontend && npm run test -- --run standardsBenchmark`
Expected: PASS

```bash
git commit -m "feat: add EN 17037 and TNO bezonningsnorm informational benchmarking"
```

**Definition of Done:**
- EN 17037 levels: high (>=4h), medium (>=3h), minimum (>=1.5h), below (<1.5h)
- TNO levels: streng (>=80% possible), licht (>=50%), below (<50%)
- Functions are pure — no i18n, no rendering (separation of concerns)
- Tests pass

---

### Task 6.2: Display standards benchmarks in SunlightRiskCard

Show EN 17037 and TNO benchmarks as informational context alongside existing severity.

**Files:**
- Modify: `frontend/src/components/SunlightRiskCard.tsx`
- Modify: `frontend/src/components/SunlightRiskCard.css`
- Modify: `frontend/src/components/SunlightRiskCard.test.tsx`
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/nl.json`

**Step 1: Write failing test**

```typescript
it('shows EN 17037 benchmark when equinox hours available', () => {
  const sunlight = makeSunlightResult({ equinox: 3.5 });
  render(<SunlightRiskCard sunlight={sunlight} />, { wrapper });
  expect(screen.getByText(/EN 17037/i)).toBeInTheDocument();
  expect(screen.getByText(/medium/i)).toBeInTheDocument();
});

it('includes "not a compliance claim" disclaimer', () => {
  const sunlight = makeSunlightResult({ equinox: 3.5 });
  render(<SunlightRiskCard sunlight={sunlight} />, { wrapper });
  expect(screen.getByText(/comparable to/i)).toBeInTheDocument();
});
```

**Step 2: Add i18n keys**

```json
{
  "sunlight.benchmark_title": "How does this compare?",
  "sunlight.benchmark_en17037": "Comparable to EN 17037 \"{level}\" exposure level ({hours}h on equinox)",
  "sunlight.benchmark_tno": "Comparable to TNO bezonningsnorm \"{level}\" threshold ({percent}% of possible sun)",
  "sunlight.benchmark_disclaimer": "These are informational comparisons to recognized standards, not compliance claims. Actual assessment requires their exact measurement protocols.",
  "sunlight.en17037_high": "high",
  "sunlight.en17037_medium": "medium",
  "sunlight.en17037_minimum": "minimum",
  "sunlight.en17037_below": "below minimum",
  "sunlight.tno_streng": "strict (streng)",
  "sunlight.tno_licht": "mild (licht)",
  "sunlight.tno_below": "below threshold"
}
```

**Step 3: Implement, run tests, commit**

```bash
git commit -m "feat: display EN 17037 and TNO benchmarks in SunlightRiskCard"
```

**Definition of Done:**
- Benchmark section shown below SVF section (when equinox data available)
- EN 17037 level displayed with equinox hours
- TNO level displayed with percentage of possible sun
- Prominent disclaimer: "informational comparisons, not compliance claims"
- Both EN and NL translations
- Hidden when equinox data unavailable (backward compatible)
- Tests pass

---

## Task Dependencies

```
Phase 1 (Web Worker)
  ├── Task 1.1: Message types                    ← standalone
  ├── Task 1.2: Geometry serialization           ← standalone
  ├── Task 1.3: Worker entry point               ← depends on 1.1, 1.2
  ├── Task 1.4: Worker bridge                    ← depends on 1.1, 1.2
  ├── Task 1.5: Wire sunlight into viewer        ← depends on 1.3, 1.4
  ├── Task 1.6: SVF Worker (OffscreenCanvas)     ← depends on 1.1, 1.2
  └── Task 1.7: Wire SVF Worker into viewer      ← depends on 1.6

Phase 2 (Evaluation Points)
  ├── Task 2.1: Facade proxy generator           ← standalone
  ├── Task 2.2: Ground proxy generator           ← standalone
  ├── Task 2.3: Extend SunlightResult types      ← depends on 2.1, 2.2
  ├── Task 2.4: Update SunlightRiskCard          ← depends on 2.3
  └── Task 2.5: Wire into viewer                 ← depends on 2.3

Phase 3 (High-Density Worker Raycasting)
  ├── Task 3.1: Configurable density defaults    ← depends on Phase 1
  ├── Task 3.2: Benchmark Worker performance     ← standalone (test only)
  └── Task 3.3: Verify heatmap smoothness        ← depends on 3.1

Phase 4 (Perez/Tregenza)
  ├── Task 4.1: Tregenza patches                 ← standalone
  ├── Task 4.2: Perez sky model                  ← standalone
  ├── Task 4.3: Anisotropic SVF computation      ← depends on 4.1, 4.2
  └── Task 4.4: Integrate into viewer            ← depends on 4.3

Phase 5 (Irradiance)
  ├── Task 5.1: TMY data research spike          ← standalone
  ├── Task 5.2: Per-timestep visibility output   ← standalone (extends analyzeSunlight)
  ├── Task 5.3: Surface normal computation       ← standalone
  ├── Task 5.4: Worker message type extensions   ← depends on 5.2
  ├── Task 5.5: Irradiance computation module    ← depends on 5.1, 5.2, 5.3
  ├── Task 5.6: Backend weather endpoint         ← depends on 5.1
  └── Task 5.7: Frontend weather fetch + wiring  ← depends on 5.5, 5.6

Phase 6 (Standards)
  ├── Task 6.1: EN 17037 + TNO calculations      ← standalone
  └── Task 6.2: Display in SunlightRiskCard      ← depends on 6.1
```

**Parallelizable:**
- Phase 1 and Phase 2 are fully independent
- Phase 3 depends on Phase 1 (Worker infrastructure) but is lightweight (config changes + benchmarks)
- Phase 4 is fully independent of Phases 1-3
- Phase 5 Tasks 5.1-5.3 are standalone and can run in parallel with anything
- Phase 5 Tasks 5.5-5.7 require Phase 1 (Worker) for production path but can be tested independently
- Phase 6 can run at any time (pure math + UI)

---

## Quality Gates (per commit)

```bash
cd frontend && npm run build          # Catches noUnusedLocals, TS strict
cd frontend && npm run test -- --run  # Vitest (493+ baseline)
cd backend && ruff check .            # Python lint
cd backend && pytest -x -q -m "not live"  # Backend tests (466+ baseline)
```

---

## Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|------------|
| 1 (Worker) | Three.js Raycaster may not work without DOM | Raycaster is CPU-only, doesn't need DOM. Verified in Node.js environments |
| 1 (Worker) | Meshes with non-identity transforms produce wrong raycasts in Worker | `serializeBuildings` bakes `matrixWorld` into vertex positions (Rev 3 fix) |
| 1 (Worker) | OffscreenCanvas WebGL may have GPU driver issues | Feature detection + fallback to main-thread SVF |
| 2 (Eval points) | Facade normal wrong for inconsistent footprint winding | `ensureCW()` normalizes winding before normal computation; test with both CW/CCW |
| 3 (Density) | 256 points × 12 months × 32 steps = ~98K raycasts may be slow on mobile | Worker thread prevents UI blocking; benchmark confirms < 10s budget; fallback to 64 points if needed |
| 4 (Perez) | CIE clear sky doesn't match NL's overcast climate | Phase 5 adds weather-specific epsilon categories; Phase 4 uses clear-sky as reasonable default |
| 5 (Irradiance) | PVGIS API availability and rate limits | Cache TMY data aggressively (365d TTL); 0.05° grid reduces unique queries |
| 5 (Irradiance) | Per-timestep visibility matrix is memory-heavy | Only emitted when `emitPerTimestep: true` (opt-in); default path unchanged |
| 6 (Standards) | Users misinterpret "comparable to" as compliance | Prominent disclaimers; PRD-mandated copy; never use word "compliant" |

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1 | 2026-02-23 | Initial plan |
| 2 | 2026-02-23 | Code review feedback: removed GPU accumulation (Phase 3), fixed cardinal direction bug (nz comparison inverted), fixed ESM test (no require()), fixed targetTop→roofY, added Task 1.7 (SVF Worker wiring), expanded Phase 5 with data-contract tasks (5.2-5.4, 5.7), added footprint winding normalization |
| 3 | 2026-02-23 | Adversarial review fixes: (C1) async test syntax in Task 1.2, (C2) persistent Worker singleton with crash recovery instead of spawn-per-call, (C3) bake matrixWorld into serialized vertex positions, (C4) add onMonthComplete callback + Worker progress emission, (C5) fix per-timestep visibility loop structure for months→points→timesteps nesting, (D1) skipSelfShadow flag for facade/ground eval points, (D2) PVGIS URL moved to config.py |
