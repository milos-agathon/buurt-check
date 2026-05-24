import { describe, it, expect } from 'vitest';
import { resolveSourceFetchStatus } from './dataCoverage';

describe('resolveSourceFetchStatus', () => {
  it('returns idle when not enabled', () => {
    expect(resolveSourceFetchStatus(false, false, false, false)).toBe('idle');
  });

  it('returns success when data exists (even if error also present)', () => {
    expect(resolveSourceFetchStatus(true, true, false, true)).toBe('success');
  });

  it('returns loading when enabled, no data, still loading', () => {
    expect(resolveSourceFetchStatus(true, false, true, false)).toBe('loading');
  });

  it('returns error when enabled, no data, not loading, has error', () => {
    expect(resolveSourceFetchStatus(true, false, false, true)).toBe('error');
  });

  it('returns loading as default when enabled with no other signals', () => {
    expect(resolveSourceFetchStatus(true, false, false, false)).toBe('loading');
  });

  it('hasData takes precedence over loading', () => {
    expect(resolveSourceFetchStatus(true, true, true, false)).toBe('success');
  });

  it('returns error when error is a non-empty string', () => {
    expect(resolveSourceFetchStatus(true, false, false, 'Something went wrong')).toBe('error');
  });

  it('returns loading when error is null', () => {
    expect(resolveSourceFetchStatus(true, false, false, null)).toBe('loading');
  });
});
