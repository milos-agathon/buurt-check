import { describe, it, expect } from 'vitest';
import { SPRING_SHEET, SPRING_EXPAND, SPRING_REVEAL, SPRING_TAB } from './springs';

describe('Spring configurations', () => {
  it('exports four named spring configs', () => {
    expect(SPRING_SHEET).toBeDefined();
    expect(SPRING_EXPAND).toBeDefined();
    expect(SPRING_REVEAL).toBeDefined();
    expect(SPRING_TAB).toBeDefined();
  });

  it('all springs have type, stiffness, and damping', () => {
    for (const spring of [SPRING_SHEET, SPRING_EXPAND, SPRING_REVEAL, SPRING_TAB]) {
      expect(spring.type).toBe('spring');
      expect(spring.stiffness).toBeGreaterThan(0);
      expect(spring.damping).toBeGreaterThan(0);
    }
  });

  it('SPRING_SHEET is heaviest (highest damping)', () => {
    expect(SPRING_SHEET.damping).toBeGreaterThanOrEqual(SPRING_EXPAND.damping);
  });

  it('SPRING_TAB is snappiest (highest stiffness)', () => {
    expect(SPRING_TAB.stiffness).toBeGreaterThanOrEqual(SPRING_SHEET.stiffness);
    expect(SPRING_TAB.stiffness).toBeGreaterThanOrEqual(SPRING_EXPAND.stiffness);
  });
});
