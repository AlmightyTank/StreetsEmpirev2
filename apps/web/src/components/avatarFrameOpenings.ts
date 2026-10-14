import type { CSSProperties } from 'react';

/**
 * Portrait cutouts measured against the SVG frame artwork's 128x128 viewBox.
 * Percentage positions are relative to the complete frame, not the face.
 * Street Pass reward IDs and equipped profile keys resolve to the same geometry.
 */
export type AvatarFrameOpening = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
  shape: 'circle' | 'square' | 'rectangle';
}>;

export type AvatarFrameSpec = Readonly<{
  profileKey: string;
  rewardKey?: string;
  artUrl: string;
  opening: AvatarFrameOpening;
}>;

export const AVATAR_FRAME_SPECS: readonly AvatarFrameSpec[] = [
  // Square opening at x=28..100, y=24..96.
  { profileKey: 'street-pass-s1-frame', rewardKey: 'street-pass-s1-frame', artUrl: '/items/street-pass-s1-frame.svg',
    opening: { left: 24.5, top: 21.5, width: 51, height: 51, shape: 'square' } },
  { profileKey: 'chrome-serpent-frame', rewardKey: 'street-pass-s1-chrome-serpent-frame', artUrl: '/items/street-pass-s1-chrome-serpent-frame.svg',
    opening: { left: 31, top: 31, width: 38, height: 38, shape: 'circle' } },
  // Convoy's circle is centered at y=70, not the image midpoint.
  { profileKey: 'phantom-convoy-frame', rewardKey: 'street-pass-s1-phantom-convoy-frame', artUrl: '/items/street-pass-s1-phantom-convoy-frame.svg',
    opening: { left: 30.5, top: 35.2, width: 39, height: 39, shape: 'circle' } },
  // Lanterns' circle is centered at y=56, above the image midpoint.
  { profileKey: 'lantern-district-frame', rewardKey: 'street-pass-s1-lantern-district-frame', artUrl: '/items/street-pass-s1-lantern-district-frame.svg',
    opening: { left: 30, top: 24, width: 40, height: 40, shape: 'circle' } },
  { profileKey: 'siren-breaker-frame', rewardKey: 'street-pass-s1-siren-breaker-frame', artUrl: '/items/street-pass-s1-siren-breaker-frame.svg',
    opening: { left: 29, top: 30.5, width: 42, height: 42, shape: 'circle' } },
  { profileKey: 'block-sovereign-frame', rewardKey: 'street-pass-s1-block-sovereign-frame', artUrl: '/items/street-pass-s1-block-sovereign-frame.svg',
    opening: { left: 30, top: 30, width: 40, height: 40, shape: 'circle' } },
  { profileKey: 'gilded-house-frame', rewardKey: 'street-pass-s1-gilded-house-frame', artUrl: '/items/street-pass-s1-gilded-house-frame.svg',
    opening: { left: 29, top: 32.1, width: 42, height: 42, shape: 'circle' } },
  // Rectangular wanted-poster portrait opening at x=38..90, y=36..86.
  { profileKey: 'dead-or-alive-frame', rewardKey: 'street-pass-s1-dead-or-alive-frame', artUrl: '/items/street-pass-s1-dead-or-alive-frame.svg',
    opening: { left: 31, top: 29, width: 38, height: 36, shape: 'rectangle' } },
  { profileKey: 'laurel-ascendant-frame', rewardKey: 'street-pass-s1-laurel-ascendant-frame', artUrl: '/items/street-pass-s1-laurel-ascendant-frame.svg',
    opening: { left: 29.5, top: 26.5, width: 41, height: 41, shape: 'circle' } },
  { profileKey: 'snowstorm-drake', rewardKey: 'street-pass-s1-snowstorm-frame', artUrl: '/items/street-pass-s1-snowstorm-frame.svg',
    opening: { left: 28, top: 28, width: 44, height: 44, shape: 'circle' } },
  { profileKey: 'inferno-drake', rewardKey: 'street-pass-s1-inferno-frame', artUrl: '/items/street-pass-s1-inferno-frame.svg',
    opening: { left: 28, top: 28, width: 44, height: 44, shape: 'circle' } },
  // Supporter frame is not on the Street Pass: preserve its existing crop.
  { profileKey: 'midnight-chrome-frame', artUrl: '/profile-frames/midnight-chrome-avatar.webp',
    opening: { left: 28, top: 28, width: 44, height: 44, shape: 'circle' } },
];

export function avatarFrameSpec(key: string | null | undefined): AvatarFrameSpec | undefined {
  if (!key) return undefined;
  return AVATAR_FRAME_SPECS.find((spec) => spec.profileKey === key || spec.rewardKey === key);
}

export function avatarFrameOpeningStyle(key: string | null | undefined): CSSProperties | undefined {
  const opening = avatarFrameSpec(key)?.opening;
  if (!opening) return undefined;
  return {
    '--se-avatar-opening-left': opening.left + '%',
    '--se-avatar-opening-top': opening.top + '%',
    '--se-avatar-opening-width': opening.width + '%',
    '--se-avatar-opening-height': opening.height + '%',
    '--se-avatar-opening-radius': opening.shape === 'circle' ? '50%' : '2px',
  } as CSSProperties;
}
