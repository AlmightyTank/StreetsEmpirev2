import type { ProfileTitlePlacement } from './types/api.js';

/** Render any unlocked title consistently on an identity nameplate. */
export function formatProfileName(
  displayName: string,
  title: string | null | undefined,
  placement: ProfileTitlePlacement = 'prefix',
): string {
  const cleanTitle = title?.trim();
  if (!cleanTitle) return displayName;
  if (placement === 'prefix') return `${cleanTitle} ${displayName}`;
  return `${displayName}, ${cleanTitle.replace(/^the\s+/i, '')}`;
}
