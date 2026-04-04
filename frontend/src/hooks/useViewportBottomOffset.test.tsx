import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import {
  calculateViewportBottomOffset,
  useViewportBottomOffset,
  VIEWPORT_BOTTOM_OFFSET_CSS_VAR,
} from './useViewportBottomOffset';

class MockVisualViewport extends EventTarget {
  height: number;
  offsetTop: number;

  constructor(height: number, offsetTop: number = 0) {
    super();
    this.height = height;
    this.offsetTop = offsetTop;
  }

  setMetrics(height: number, offsetTop: number = this.offsetTop) {
    this.height = height;
    this.offsetTop = offsetTop;
  }
}

function HookHarness() {
  useViewportBottomOffset();
  return <div>viewport offset</div>;
}

describe('useViewportBottomOffset', () => {
  const originalInnerHeight = window.innerHeight;
  const originalVisualViewport = window.visualViewport;

  beforeEach(() => {
    document.documentElement.style.removeProperty(VIEWPORT_BOTTOM_OFFSET_CSS_VAR);
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 844,
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    });
    document.documentElement.style.removeProperty(VIEWPORT_BOTTOM_OFFSET_CSS_VAR);
    vi.restoreAllMocks();
  });

  it('calculates the bottom offset from layout and visual viewport metrics', () => {
    expect(calculateViewportBottomOffset(844, 744, 0)).toBe(100);
    expect(calculateViewportBottomOffset(844, 744, 20)).toBe(80);
    expect(calculateViewportBottomOffset(744, 844, 0)).toBe(0);
  });

  it('writes 0px when visualViewport is unavailable', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });

    render(<HookHarness />);

    expect(
      document.documentElement.style.getPropertyValue(VIEWPORT_BOTTOM_OFFSET_CSS_VAR),
    ).toBe('0px');
  });

  it('updates the CSS variable when the visual viewport shrinks', async () => {
    const visualViewport = new MockVisualViewport(844, 0);
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    });

    render(<HookHarness />);

    expect(
      document.documentElement.style.getPropertyValue(VIEWPORT_BOTTOM_OFFSET_CSS_VAR),
    ).toBe('0px');

    visualViewport.setMetrics(744, 0);
    visualViewport.dispatchEvent(new Event('resize'));

    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue(VIEWPORT_BOTTOM_OFFSET_CSS_VAR),
      ).toBe('100px');
    });
  });

  it('includes visual viewport offsetTop when calculating the visible bottom edge', async () => {
    const visualViewport = new MockVisualViewport(844, 0);
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    });

    render(<HookHarness />);

    visualViewport.setMetrics(764, 20);
    visualViewport.dispatchEvent(new Event('scroll'));

    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue(VIEWPORT_BOTTOM_OFFSET_CSS_VAR),
      ).toBe('60px');
    });
  });

  it('resets the CSS variable on unmount', () => {
    const visualViewport = new MockVisualViewport(744, 0);
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    });

    const { unmount } = render(<HookHarness />);

    expect(
      document.documentElement.style.getPropertyValue(VIEWPORT_BOTTOM_OFFSET_CSS_VAR),
    ).toBe('100px');

    unmount();

    expect(
      document.documentElement.style.getPropertyValue(VIEWPORT_BOTTOM_OFFSET_CSS_VAR),
    ).toBe('0px');
  });
});
