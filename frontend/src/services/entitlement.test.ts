import { beforeEach, describe, expect, it } from 'vitest';
import { clearEntitlement, getStoredEntitlement, storeEntitlement } from './entitlement';

describe('entitlement storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns null when no entitlement is stored', () => {
    expect(getStoredEntitlement('0363010012345678')).toBeNull();
  });

  it('stores and retrieves entitlement by vboId', () => {
    storeEntitlement('0363010012345678', 'report-123', true);
    expect(getStoredEntitlement('0363010012345678')).toEqual({
      reportId: 'report-123',
      entitled: true,
    });
  });

  it('clears entitlement', () => {
    storeEntitlement('0363010012345678', 'report-123', true);
    clearEntitlement('0363010012345678');
    expect(getStoredEntitlement('0363010012345678')).toBeNull();
  });
});

