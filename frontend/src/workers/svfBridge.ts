import { getTransferables } from './geometrySerialization';
import type {
  SerializedBuilding,
  SvfWorkerOutMessage,
  SvfWorkerRequest,
} from './sunlightWorkerTypes';

let requestId = 0;

export function isOffscreenCanvasSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
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
      cleanup();
      reject(new Error('SVF Worker timed out'));
    }, 30_000);

    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('SVF Worker crashed'));
    };

    const handleMessage = (event: MessageEvent<SvfWorkerOutMessage>) => {
      const msg = event.data;
      if (msg.id !== id) return;

      cleanup();
      if (msg.type === 'svfResult') {
        resolve(msg.svf);
        return;
      }
      reject(new Error(msg.message));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    const request: SvfWorkerRequest = {
      type: 'computeSvf',
      id,
      buildings,
      evalPoints,
      maxSamplePoints,
    };

    try {
      worker.postMessage(request, getTransferables(buildings));
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
