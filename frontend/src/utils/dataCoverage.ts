export type SourceFetchStatus = 'idle' | 'loading' | 'success' | 'error';

export function resolveSourceFetchStatus(
  enabled: boolean,
  hasData: boolean,
  loading: boolean,
  error: boolean | string | null,
): SourceFetchStatus {
  if (!enabled) return 'idle';
  if (hasData) return 'success';
  if (loading) return 'loading';
  if (error) return 'error';
  return 'loading';
}
