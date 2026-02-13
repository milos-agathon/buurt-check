import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePressable } from './usePressable';

describe('usePressable', () => {
  it('returns pressable props object', () => {
    const { result } = renderHook(() => usePressable());
    expect(result.current.pressableProps).toBeDefined();
    expect(result.current.isPressed).toBe(false);
  });

  it('sets isPressed true on pointerdown', () => {
    const { result } = renderHook(() => usePressable());
    act(() => {
      result.current.pressableProps.onPointerDown({} as React.PointerEvent);
    });
    expect(result.current.isPressed).toBe(true);
  });

  it('sets isPressed false on pointerup', () => {
    const { result } = renderHook(() => usePressable());
    act(() => {
      result.current.pressableProps.onPointerDown({} as React.PointerEvent);
    });
    act(() => {
      result.current.pressableProps.onPointerUp({} as React.PointerEvent);
    });
    expect(result.current.isPressed).toBe(false);
  });

  it('sets isPressed false on pointerleave (finger drift)', () => {
    const { result } = renderHook(() => usePressable());
    act(() => {
      result.current.pressableProps.onPointerDown({} as React.PointerEvent);
    });
    act(() => {
      result.current.pressableProps.onPointerLeave({} as React.PointerEvent);
    });
    expect(result.current.isPressed).toBe(false);
  });

  it('calls onPress callback on pointerup after pointerdown', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => usePressable({ onPress }));
    act(() => {
      result.current.pressableProps.onPointerDown({} as React.PointerEvent);
    });
    act(() => {
      result.current.pressableProps.onPointerUp({} as React.PointerEvent);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress if pointerleave before pointerup', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => usePressable({ onPress }));
    act(() => {
      result.current.pressableProps.onPointerDown({} as React.PointerEvent);
    });
    act(() => {
      result.current.pressableProps.onPointerLeave({} as React.PointerEvent);
    });
    act(() => {
      result.current.pressableProps.onPointerUp({} as React.PointerEvent);
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('handles keyboard Enter/Space for a11y', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => usePressable({ onPress }));
    act(() => {
      result.current.pressableProps.onKeyDown({ key: 'Enter', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.pressableProps.onKeyDown({ key: ' ', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
    });
    expect(onPress).toHaveBeenCalledTimes(2);
  });
});
