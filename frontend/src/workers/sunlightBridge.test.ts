import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isWorkerSupported,
  runSunlightInWorker,
  terminateSunlightWorker,
} from './sunlightBridge';

type Listener = (event: MessageEvent | ErrorEvent) => void;

class MockWorker {
  static instances: MockWorker[] = [];

  private listeners: Record<string, Set<Listener>> = {
    message: new Set<Listener>(),
    error: new Set<Listener>(),
    messageerror: new Set<Listener>(),
  };

  postMessage = vi.fn();

  terminate = vi.fn();

  constructor() {
    MockWorker.instances.push(this);
  }

  addEventListener = vi.fn((type: string, listener: Listener) => {
    this.listeners[type]?.add(listener);
  });

  removeEventListener = vi.fn((type: string, listener: Listener) => {
    this.listeners[type]?.delete(listener);
  });

  emit(type: string, data: unknown) {
    const event = { data } as MessageEvent;
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}

vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker);

function makeInput() {
  return {
    buildings: [{
      positions: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]),
      pandId: 'test-pand',
      isGround: false,
    }],
    footprint: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    roofY: 10,
    targetPandId: 'test-pand',
    lat: 52.37,
    lng: 4.9,
    year: 2026,
  };
}

describe('isWorkerSupported', () => {
  it('returns true when Worker is available', () => {
    expect(isWorkerSupported()).toBe(true);
  });

  it('returns false when Worker is unavailable', () => {
    const originalWorker = globalThis.Worker;
    (globalThis as { Worker?: typeof Worker }).Worker = undefined;
    try {
      expect(isWorkerSupported()).toBe(false);
    } finally {
      vi.stubGlobal('Worker', originalWorker);
    }
  });
});

describe('runSunlightInWorker', () => {
  beforeEach(() => {
    MockWorker.instances = [];
  });

  afterEach(() => {
    terminateSunlightWorker();
    vi.clearAllMocks();
  });

  it('sends a request and resolves with worker result', async () => {
    const promise = runSunlightInWorker(makeInput());

    expect(MockWorker.instances).toHaveLength(1);
    const worker = MockWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    const request = worker.postMessage.mock.calls[0][0] as { id: number };
    worker.emit('message', {
      type: 'result',
      id: request.id,
      result: {
        winter: 2.1,
        equinox: 6.3,
        summer: 9.4,
        annualAverage: 5.9,
        analysisYear: 2026,
        perPointAnnual: [5.9],
        roofGridPoints: [[0, 10, 0]],
        perTimestepVisibility: [[1, 0, 1]],
        timestepMeta: [
          { date: '2026-01-21T08:00:00.000Z', minuteOfDay: 480 },
          { date: '2026-01-21T08:30:00.000Z', minuteOfDay: 510 },
          { date: '2026-01-21T09:00:00.000Z', minuteOfDay: 540 },
        ],
        facadeResults: [{
          orientation: 'south',
          heightLabel: '1.5m',
          winterHours: 2.1,
          summerHours: 9.4,
          annualAverage: 5.9,
        }],
        groundAnnualAverage: 4.2,
      },
    });

    await expect(promise).resolves.toMatchObject({
      winter: 2.1,
      annualAverage: 5.9,
      groundAnnualAverage: 4.2,
      perTimestepVisibility: [[1, 0, 1]],
      analysisMethod: 'cpu-raycast-worker',
    });
  });

  it('forwards progress messages to onProgress callback', async () => {
    const onProgress = vi.fn();
    const promise = runSunlightInWorker({
      ...makeInput(),
      onProgress,
    });

    const worker = MockWorker.instances[0];
    const request = worker.postMessage.mock.calls[0][0] as { id: number };

    worker.emit('message', {
      type: 'progress',
      id: request.id,
      monthsDone: 3,
      totalMonths: 12,
    });
    worker.emit('message', {
      type: 'result',
      id: request.id,
      result: {
        winter: 2,
        equinox: 5,
        summer: 9,
        annualAverage: 5.3,
        analysisYear: 2026,
        perPointAnnual: [5.3],
        roofGridPoints: [[0, 10, 0]],
      },
    });

    await promise;
    expect(onProgress).toHaveBeenCalledWith(3, 12);
  });

  it('reuses a persistent worker across multiple calls', async () => {
    const first = runSunlightInWorker(makeInput());
    let worker = MockWorker.instances[0];
    let request = worker.postMessage.mock.calls[0][0] as { id: number };
    worker.emit('message', {
      type: 'result',
      id: request.id,
      result: {
        winter: 1,
        equinox: 4,
        summer: 8,
        annualAverage: 4.3,
        analysisYear: 2026,
        perPointAnnual: [4.3],
        roofGridPoints: [[0, 10, 0]],
      },
    });
    await first;

    const second = runSunlightInWorker(makeInput());
    worker = MockWorker.instances[0];
    request = worker.postMessage.mock.calls[1][0] as { id: number };
    worker.emit('message', {
      type: 'result',
      id: request.id,
      result: {
        winter: 2,
        equinox: 5,
        summer: 9,
        annualAverage: 5.3,
        analysisYear: 2026,
        perPointAnnual: [5.3],
        roofGridPoints: [[0, 10, 0]],
      },
    });
    await second;

    expect(MockWorker.instances).toHaveLength(1);
  });

  it('defaults to 256-point high-density analysis at 1m grid spacing', async () => {
    const promise = runSunlightInWorker(makeInput());
    const worker = MockWorker.instances[0];
    const request = worker.postMessage.mock.calls[0][0] as {
      id: number;
      gridSpacingMeters: number;
      maxPoints: number;
    };

    expect(request.gridSpacingMeters).toBe(1);
    expect(request.maxPoints).toBe(256);

    worker.emit('message', {
      type: 'result',
      id: request.id,
      result: {
        winter: 2,
        equinox: 5,
        summer: 9,
        annualAverage: 5.3,
        analysisYear: 2026,
        perPointAnnual: [5.3],
        roofGridPoints: [[0, 10, 0]],
      },
    });
    await promise;
  });

  it('allows callers to override density defaults', async () => {
    const promise = runSunlightInWorker({
      ...makeInput(),
      gridSpacingMeters: 2,
      maxPoints: 64,
    });
    const worker = MockWorker.instances[0];
    const request = worker.postMessage.mock.calls[0][0] as {
      id: number;
      gridSpacingMeters: number;
      maxPoints: number;
    };

    expect(request.gridSpacingMeters).toBe(2);
    expect(request.maxPoints).toBe(64);

    worker.emit('message', {
      type: 'result',
      id: request.id,
      result: {
        winter: 2,
        equinox: 5,
        summer: 9,
        annualAverage: 5.3,
        analysisYear: 2026,
        perPointAnnual: [5.3],
        roofGridPoints: [[0, 10, 0]],
      },
    });
    await promise;
  });

  it('rejects pending requests when the worker is explicitly terminated', async () => {
    const promise = runSunlightInWorker(makeInput());
    expect(MockWorker.instances).toHaveLength(1);

    terminateSunlightWorker();

    await expect(promise).rejects.toThrow('terminated');
    expect(MockWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
  });
});
