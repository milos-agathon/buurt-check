interface StoredEntitlement {
  reportId: string;
  entitled: boolean;
}

function entitlementStorageKey(vboId: string): string {
  return `buurt-check:entitlement:${vboId}`;
}

export function getStoredEntitlement(vboId: string): StoredEntitlement | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(entitlementStorageKey(vboId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object'
      || parsed === null
      || !('reportId' in parsed)
      || !('entitled' in parsed)
    ) {
      return null;
    }
    const reportId = (parsed as { reportId: unknown }).reportId;
    const entitled = (parsed as { entitled: unknown }).entitled;
    if (typeof reportId !== 'string' || typeof entitled !== 'boolean') {
      return null;
    }
    return { reportId, entitled };
  } catch {
    return null;
  }
}

export function storeEntitlement(vboId: string, reportId: string, entitled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      entitlementStorageKey(vboId),
      JSON.stringify({ reportId, entitled }),
    );
  } catch {
    // Ignore storage quota/private mode errors.
  }
}

export function clearEntitlement(vboId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(entitlementStorageKey(vboId));
  } catch {
    // Ignore storage failures.
  }
}

