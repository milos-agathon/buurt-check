import { describe, it, expect } from 'vitest';
import { SPRING_EXPAND, SPRING_TAB } from './springs';

describe('Spring configurations', () => {
  it('exports named spring configs used in production', () => {
    expect(SPRING_EXPAND).toBeDefined();
    expect(SPRING_TAB).toBeDefined();
  });

  it('all springs have type, stiffness, and damping', () => {
    for (const spring of [SPRING_EXPAND, SPRING_TAB]) {
      expect(spring.type).toBe('spring');
      expect(spring.stiffness).toBeGreaterThan(0);
      expect(spring.damping).toBeGreaterThan(0);
    }
  });

  it('SPRING_TAB is snappiest (highest stiffness)', () => {
    expect(SPRING_TAB.stiffness).toBeGreaterThanOrEqual(SPRING_EXPAND.stiffness);
  });
});
