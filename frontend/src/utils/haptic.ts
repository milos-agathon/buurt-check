function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

export function hapticTap(): void {
  vibrate(10);
}

export function hapticSuccess(): void {
  vibrate([10, 50, 10]);
}

export function hapticWarning(): void {
  vibrate([30, 50, 30]);
}
