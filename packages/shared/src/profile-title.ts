import type { ProfileTitlePlacement } from './types/api.js';

export type ProfileNamePartKind = 'name' | 'title' | 'separator';
export interface ProfileNamePart {
  kind: ProfileNamePartKind;
  text: string;
}

const HONORIFIC_TITLES = new Set(['sir', 'madam', 'don', 'donna']);

/** Split a profile name into the segments used for its title styling. */
export function profileNameParts(displayName: string, title: string | null | undefined): ProfileNamePart[] {
  const cleanTitle = title?.trim();
  if (!cleanTitle) return [{ kind: 'name', text: displayName }];
  if (HONORIFIC_TITLES.has(cleanTitle.toLowerCase())) {
    return [
      { kind: 'title', text: cleanTitle + ' ' },
      { kind: 'name', text: displayName },
    ];
  }
  const epithet = cleanTitle.replace(/^the\s+/i, '');
  return [
    { kind: 'name', text: displayName },
    { kind: 'separator', text: ' · ' },
    { kind: 'title', text: epithet },
  ];
}

/**
 * Render any unlocked title consistently on an identity nameplate.
 * Honorifics are prefixes; earned titles are epithets after the name.
 * The placement argument remains accepted for older callers, but title kind
 * now determines the format.
 */
export function formatProfileName(
  displayName: string,
  title: string | null | undefined,
  _legacyPlacement?: ProfileTitlePlacement,
): string {
  return profileNameParts(displayName, title).map((part) => part.text).join('');
}
