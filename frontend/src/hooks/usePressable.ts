import { useState, useCallback, useRef } from 'react';

interface UsePressableOptions {
  onPress?: () => void;
  disabled?: boolean;
}

export function usePressable({ onPress, disabled }: UsePressableOptions = {}) {
  const [isPressed, setIsPressed] = useState(false);
  const wasPressed = useRef(false);

  const handlePointerDown = useCallback((_e: React.PointerEvent) => {
    if (disabled) return;
    setIsPressed(true);
    wasPressed.current = true;
  }, [disabled]);

  const handlePointerUp = useCallback((_e: React.PointerEvent) => {
    if (wasPressed.current && !disabled) {
      onPress?.();
    }
    setIsPressed(false);
    wasPressed.current = false;
  }, [onPress, disabled]);

  const handlePointerLeave = useCallback((_e: React.PointerEvent) => {
    setIsPressed(false);
    wasPressed.current = false;
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPress?.();
    }
  }, [onPress, disabled]);

  return {
    isPressed,
    pressableProps: {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerLeave,
      onKeyDown: handleKeyDown,
    },
  };
}
