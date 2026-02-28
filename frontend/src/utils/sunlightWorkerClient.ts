import type { SunlightResult } from '../types/api';
import type {
  SunlightWorkerIncomingMessage,
  SunlightWorkerOutgoingMessage,
  SunlightWorkerPayload,
} from './sunlightWorkerProtocol';

function createRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

export function canRunSunlightInWorker(): boolean {
  return typeof Worker !== 'undefined';
}

export async function analyzeSunlightInWorker(
  payload: SunlightWorkerPayload,
  abortSignal?: AbortSignal,
): Promise<SunlightResult | null> {
  if (!canRunSunlightInWorker()) {
    return null;
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL('../workers/sunlight.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    return null;
  }
  const requestId = createRequestId();

  return new Promise<SunlightResult | null>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      if (abortSignal) {
        abortSignal.removeEventListener('abort', handleAbort);
      }
      worker.terminate();
    };

    const finishResolve = (result: SunlightResult | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handleAbort = () => {
      if (settled) return;
      const message: SunlightWorkerIncomingMessage = { type: 'cancel', requestId };
      worker.postMessage(message);
      finishReject(abortError());
    };

    const handleError = () => {
      finishResolve(null);
    };

    const handleMessage = (event: MessageEvent<SunlightWorkerOutgoingMessage>) => {
      const message = event.data;
      if (!message || message.requestId !== requestId) return;
      if (message.type === 'error') {
        finishResolve(null);
        return;
      }
      finishResolve(message.result);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    if (abortSignal) {
      if (abortSignal.aborted) {
        handleAbort();
        return;
      }
      abortSignal.addEventListener('abort', handleAbort, { once: true });
    }

    const message: SunlightWorkerIncomingMessage = { type: 'analyze', requestId, payload };
    worker.postMessage(message);
  });
}
