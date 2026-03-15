import type { TFunction } from 'i18next';

export function localizeViewer3DMessage(
  message: string | null | undefined,
  t: TFunction,
): string | null {
  if (!message) {
    return null;
  }

  const parts: string[] = [];

  if (message.includes('No 3D building data available for this area')) {
    parts.push(t('viewer3d.message.noBuildings'));
  }
  if (message.includes('Partial neighborhood data')) {
    parts.push(t('viewer3d.message.partial'));
  }
  if (message.includes('Target building not found in 3D data')) {
    parts.push(t('viewer3d.message.targetMissing'));
  }

  if (parts.length === 0) {
    return message;
  }

  return parts.join(' ');
}
