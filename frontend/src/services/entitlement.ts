function entitlementStorageKey(vboId: string): string {
  return `buurt-check:entitlement:${vboId}`;
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

