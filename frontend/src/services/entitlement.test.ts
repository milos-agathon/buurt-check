import { beforeEach, describe, expect, it } from 'vitest';
import { clearEntitlement, storeEntitlement } from './entitlement';

const storageKey = 'buurt-check:entitlement:0363010012345678';

describe('entitlement storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('leaves storage empty before an entitlement is stored', () => {
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('stores entitlement by vboId', () => {
    storeEntitlement('0363010012345678', 'report-123', true);
    expect(JSON.parse(sessionStorage.getItem(storageKey) ?? '{}')).toEqual({
      reportId: 'report-123',
      entitled: true,
    });
  });

  it('clears entitlement', () => {
    storeEntitlement('0363010012345678', 'report-123', true);
    clearEntitlement('0363010012345678');
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });
});

