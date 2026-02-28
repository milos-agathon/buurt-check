import type { SunlightResult } from '../types/api';
import {
  HIGH_DENSITY_GRID_SPACING,
  HIGH_DENSITY_MAX_POINTS,
} from '../utils/roofSampling';
import type {
  SerializedBuilding,
  SunlightWorkerRequest,
  WorkerOutMessage,
} from './sunlightWorkerTypes';

let requestId = 0;

export interface WorkerAnalysisInput {
  buildings: SerializedBuilding[];
  footprint: number[][];
  roofY: number;
  targetPandId: string;
  lat: number;
  lng: number;
  year: number;
  intervalMinutes?: number;
  chunkRaycasts?: number;
  gridSpacingMeters?: number;
  maxPoints?: number;
  groundY?: number;
  includeFacadePoints?: boolean;
  includeGroundPoints?: boolean;
  facadePointCount?: number;
  groundPointCount?: number;
  facadeOffsetMeters?: number;
  groundOffsetMeters?: number;
  facadeHeightMeters?: number;
  groundHeightOffsetMeters?: number;
  extraEvalPoints?: {
    points: [number, number, number][];
    labels: string[];
    skipSelfShadow: boolean;
  };
  abortSignal?: AbortSignal;
  onProgress?: (monthsDone: number, totalMonths: number) => void;
}

interface PendingRequest {
  resolve: (value: SunlightResult | null) => void;
  reject: (reason?: unknown) => void;
  onProgress?: (monthsDone: number, totalMonths: number) => void;
  timer: ReturnType<typeof setTimeout>;
  abortSignal?: AbortSignal;
  abortHandler?: () => void;
}

const WORKER_TIMEOUT_MS = 120_000;

let persistentWorker: Worker | null = null;
const pendingRequests = new Map<number, PendingRequest>();

export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

function cleanupPending(pending: PendingRequest): void {
  clearTimeout(pending.timer);
  if (pending.abortSignal && pending.abortHandler) {
    pending.abortSignal.removeEventListener('abort', pending.abortHandler);
  }
}

function settleRequest(
  id: number,
  settle: (pending: PendingRequest) => void,
): void {
  const pending = pendingRequests.get(id);
  if (!pending) return;
  pendingRequests.delete(id);
  cleanupPending(pending);
  settle(pending);
}

function rejectAllPending(reason: Error): void {
  for (const [id, pending] of pendingRequests) {
    pendingRequests.delete(id);
    cleanupPending(pending);
    pending.reject(reason);
  }
}

function handleWorkerMessage(event: MessageEvent<WorkerOutMessage>): void {
  const msg = event.data;
  const pending = pendingRequests.get(msg.id);
  if (!pending) return;

  if (msg.type === 'progress') {
    pending.onProgress?.(msg.monthsDone, msg.totalMonths);
    return;
  }

  if (msg.type === 'result') {
    settleRequest(msg.id, (current) => {
      if (!msg.result) {
        current.resolve(null);
        return;
      }
      current.resolve({
        winter: msg.result.winter,
        equinox: msg.result.equinox,
        summer: msg.result.summer,
        annualAverage: msg.result.annualAverage,
        analysisYear: msg.result.analysisYear,
        perPointAnnual: msg.result.perPointAnnual,
        roofGridPoints: msg.result.roofGridPoints,
        facadeProxyPoints: msg.result.facadeProxyPoints,
        groundProxyPoints: msg.result.groundProxyPoints,
        perFacadeAnnual: msg.result.perFacadeAnnual,
        perGroundAnnual: msg.result.perGroundAnnual,
        facadeResults: msg.result.facadeResults,
        groundAnnualAverage: msg.result.groundAnnualAverage,
        samplingBreakdown: msg.result.samplingBreakdown,
        analysisMethod: 'cpu-raycast-worker',
      });
    });
    return;
  }

  settleRequest(msg.id, (current) => {
    current.reject(new Error(msg.message));
  });
}

function handleWorkerCrash(): void {
  rejectAllPending(new Error('Sunlight Worker crashed'));
  if (!persistentWorker) return;
  persistentWorker.removeEventListener('message', handleWorkerMessage);
  persistentWorker.removeEventListener('error', handleWorkerCrash);
  persistentWorker.removeEventListener('messageerror', handleWorkerCrash);
  persistentWorker.terminate();
  persistentWorker = null;
}

function getOrCreateWorker(): Worker {
  if (persistentWorker) return persistentWorker;

  persistentWorker = new Worker(
    new URL('./sunlightWorker.ts', import.meta.url),
    { type: 'module' },
  );
  persistentWorker.addEventListener('message', handleWorkerMessage);
  persistentWorker.addEventListener('error', handleWorkerCrash);
  persistentWorker.addEventListener('messageerror', handleWorkerCrash);
  return persistentWorker;
}

export function terminateSunlightWorker(): void {
  rejectAllPending(new Error('Sunlight Worker terminated'));
  if (!persistentWorker) return;

  persistentWorker.removeEventListener('message', handleWorkerMessage);
  persistentWorker.removeEventListener('error', handleWorkerCrash);
  persistentWorker.removeEventListener('messageerror', handleWorkerCrash);
  persistentWorker.terminate();
  persistentWorker = null;
}

export function runSunlightInWorker(
  input: WorkerAnalysisInput,
): Promise<SunlightResult | null> {
  if (!isWorkerSupported()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const id = ++requestId;
    let worker: Worker;

    try {
      worker = getOrCreateWorker();
    } catch {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      settleRequest(id, (current) => {
        current.reject(new Error('Sunlight Worker timed out'));
      });
    }, WORKER_TIMEOUT_MS);

    const pending: PendingRequest = {
      resolve,
      reject,
      onProgress: input.onProgress,
      timer,
    };

    if (input.abortSignal) {
      if (input.abortSignal.aborted) {
        clearTimeout(timer);
        resolve(null);
        return;
      }
      const onAbort = () => {
        settleRequest(id, (current) => {
          current.resolve(null);
        });
      };
      input.abortSignal.addEventListener('abort', onAbort, { once: true });
      pending.abortSignal = input.abortSignal;
      pending.abortHandler = onAbort;
    }

    pendingRequests.set(id, pending);

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
      chunkRaycasts: input.chunkRaycasts,
      gridSpacingMeters: input.gridSpacingMeters ?? HIGH_DENSITY_GRID_SPACING,
      maxPoints: input.maxPoints ?? HIGH_DENSITY_MAX_POINTS,
      groundY: input.groundY,
      includeFacadePoints: input.includeFacadePoints,
      includeGroundPoints: input.includeGroundPoints,
      facadePointCount: input.facadePointCount,
      groundPointCount: input.groundPointCount,
      facadeOffsetMeters: input.facadeOffsetMeters,
      groundOffsetMeters: input.groundOffsetMeters,
      facadeHeightMeters: input.facadeHeightMeters,
      groundHeightOffsetMeters: input.groundHeightOffsetMeters,
      extraEvalPoints: input.extraEvalPoints,
    };

    try {
      worker.postMessage(request);
    } catch (err) {
      settleRequest(id, (current) => {
        current.reject(err instanceof Error ? err : new Error(String(err)));
      });
    }
  });
}
