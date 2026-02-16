import { renderHook, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useAnimationPerformance } from './useAnimationPerformance';

function setupRafQueue() {
  const queue: FrameRequestCallback[] = [];
  const requestAnimationFrameMock = vi.fn((cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  const cancelAnimationFrameMock = vi.fn();

  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);

  return {
    step(timestamp: number) {
      const callback = queue.shift();
      if (!callback) {
        throw new Error('No queued animation frame callback');
      }
      callback(timestamp);
    },
  };
}

describe('useAnimationPerformance', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not enable fallback when dropped frames are within threshold', () => {
    const raf = setupRafQueue();
    const { result } = renderHook(() => useAnimationPerformance());

    act(() => {
      result.current.startMonitoring();
    });

    act(() => {
      raf.step(0);
      raf.step(40); // 1 dropped frame
      raf.step(80); // 2 dropped frames
      raf.step(120); // 3 dropped frames
      result.current.stopMonitoring();
    });

    expect(result.current.shouldUseFallback()).toBe(false);
  });

  it('enables fallback when more than 3 dropped frames are detected', () => {
    const raf = setupRafQueue();
    const { result } = renderHook(() => useAnimationPerformance());

    act(() => {
      result.current.startMonitoring();
    });

    act(() => {
      raf.step(0);
      raf.step(40); // 1 dropped frame
      raf.step(80); // 2 dropped frames
      raf.step(120); // 3 dropped frames
      raf.step(160); // 4 dropped frames
      result.current.stopMonitoring();
    });

    expect(result.current.shouldUseFallback()).toBe(true);
  });

  it('can reset fallback state for a new monitoring session', () => {
    const raf = setupRafQueue();
    const { result } = renderHook(() => useAnimationPerformance());

    act(() => {
      result.current.startMonitoring();
      raf.step(0);
      raf.step(40);
      raf.step(80);
      raf.step(120);
      raf.step(160);
      result.current.stopMonitoring();
    });

    expect(result.current.shouldUseFallback()).toBe(true);

    act(() => {
      result.current.resetFallback();
    });

    expect(result.current.shouldUseFallback()).toBe(false);
  });
});
