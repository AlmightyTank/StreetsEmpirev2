import { z } from 'zod';

/**
 * Built avatars: a chest-up portrait assembled from face pieces, for players
 * who would rather not use a picture. Pure cosmetic; every part is free.
 *
 * The catalog only names parts and colors. The web client draws them.
 */
export const AVATAR_PART_OPTIONS = {
  base: [
    { key: 'boy', label: 'Boy' },
    { key: 'girl', label: 'Girl' },
  ],
  skin: [
    { key: 'porcelain', label: 'Porcelain', color: '#f6d9c6' },
    { key: 'fair', label: 'Fair', color: '#ecc39f' },
    { key: 'tan', label: 'Tan', color: '#d39d71' },
    { key: 'olive', label: 'Olive', color: '#b9875a' },
    { key: 'brown', label: 'Brown', color: '#8e5b3a' },
    { key: 'deep', label: 'Deep', color: '#5e3b27' },
  ],
  hair: [
    { key: 'bald', label: 'Bald' },
    { key: 'buzz', label: 'Buzz cut' },
    { key: 'fade', label: 'Fade' },
    { key: 'waves', label: 'Waves' },
    { key: 'curls', label: 'Short curls' },
    { key: 'twists', label: 'Twists' },
    { key: 'high-top', label: 'High-top' },
    { key: 'mohawk', label: 'Mohawk' },
    { key: 'afro', label: 'Afro' },
    { key: 'long-straight', label: 'Long straight' },
    { key: 'bob', label: 'Bob' },
    { key: 'ponytail', label: 'Ponytail' },
    { key: 'puffs', label: 'Puffs' },
    { key: 'braids', label: 'Braids' },
    { key: 'bun', label: 'Top bun' },
    { key: 'long-curls', label: 'Long curls' },
  ],
  hairColor: [
    { key: 'black', label: 'Black', color: '#1d1a19' },
    { key: 'dark-brown', label: 'Dark brown', color: '#3f2a1f' },
    { key: 'brown', label: 'Brown', color: '#6d4428' },
    { key: 'auburn', label: 'Auburn', color: '#8c3b1f' },
    { key: 'blonde', label: 'Blonde', color: '#d9b45f' },
    { key: 'platinum', label: 'Platinum', color: '#e9e3d3' },
    { key: 'gray', label: 'Gray', color: '#9a9a9a' },
    { key: 'red', label: 'Red', color: '#c2352b' },
    { key: 'blue', label: 'Blue', color: '#2f63c9' },
    { key: 'pink', label: 'Pink', color: '#e46aa6' },
  ],
  eyes: [
    { key: 'round', label: 'Round' },
    { key: 'almond', label: 'Almond' },
    { key: 'wide', label: 'Wide' },
    { key: 'narrow', label: 'Narrow' },
    { key: 'sleepy', label: 'Sleepy' },
    { key: 'happy', label: 'Happy' },
  ],
  eyeColor: [
    { key: 'brown', label: 'Brown', color: '#4a2d1b' },
    { key: 'hazel', label: 'Hazel', color: '#7a5a2a' },
    { key: 'green', label: 'Green', color: '#3f7a4a' },
    { key: 'blue', label: 'Blue', color: '#3a6fb0' },
    { key: 'gray', label: 'Gray', color: '#6c7682' },
  ],
  brows: [
    { key: 'soft', label: 'Soft' },
    { key: 'straight', label: 'Straight' },
    { key: 'arched', label: 'Arched' },
    { key: 'thick', label: 'Thick' },
    { key: 'angry', label: 'Mean mug' },
  ],
  nose: [
    { key: 'button', label: 'Button' },
    { key: 'round', label: 'Round' },
    { key: 'wide', label: 'Wide' },
    { key: 'pointed', label: 'Pointed' },
    { key: 'small', label: 'Small' },
  ],
  mouth: [
    { key: 'smile', label: 'Smile' },
    { key: 'grin', label: 'Grin' },
    { key: 'smirk', label: 'Smirk' },
    { key: 'neutral', label: 'Straight face' },
    { key: 'laugh', label: 'Laugh' },
    { key: 'serious', label: 'Serious' },
  ],
  facialHair: [
    { key: 'none', label: 'None' },
    { key: 'stubble', label: 'Stubble' },
    { key: 'mustache', label: 'Mustache' },
    { key: 'goatee', label: 'Goatee' },
    { key: 'beard', label: 'Full beard' },
  ],
  shirt: [
    { key: 'tee', label: 'T-shirt' },
    { key: 'hoodie', label: 'Hoodie' },
    { key: 'collar', label: 'Collared shirt' },
    { key: 'tank', label: 'Tank top' },
    { key: 'jacket', label: 'Jacket' },
    { key: 'jersey', label: 'Jersey' },
  ],
  shirtColor: [
    { key: 'black', label: 'Black', color: '#1f2228' },
    { key: 'white', label: 'White', color: '#eceff2' },
    { key: 'gray', label: 'Gray', color: '#7b8490' },
    { key: 'red', label: 'Red', color: '#b8312f' },
    { key: 'royal', label: 'Royal blue', color: '#2a55b5' },
    { key: 'green', label: 'Green', color: '#1f8a4c' },
    { key: 'gold', label: 'Gold', color: '#d0a22c' },
    { key: 'purple', label: 'Purple', color: '#6b3fa0' },
  ],
  accessory: [
    { key: 'none', label: 'None' },
    { key: 'chain', label: 'Gold chain' },
    { key: 'shades', label: 'Shades' },
    { key: 'glasses', label: 'Glasses' },
    { key: 'studs', label: 'Stud earrings' },
    { key: 'hoops', label: 'Hoop earrings' },
  ],
  background: [
    { key: 'teal', label: 'Teal', color: '#1f6f6a' },
    { key: 'charcoal', label: 'Charcoal', color: '#2a2f36' },
    { key: 'crimson', label: 'Crimson', color: '#7d1f2c' },
    { key: 'gold', label: 'Gold', color: '#b8892a' },
    { key: 'violet', label: 'Violet', color: '#4b3a87' },
    { key: 'sky', label: 'Sky', color: '#3d7eb8' },
    { key: 'concrete', label: 'Concrete', color: '#8c8f94' },
  ],
} as const;

type PartOptions = typeof AVATAR_PART_OPTIONS;
export type AvatarPartKey = keyof PartOptions;
export type AvatarParts = { [K in AvatarPartKey]: PartOptions[K][number]['key'] };
export type AvatarBase = AvatarParts['base'];

export const DEFAULT_AVATAR_PARTS: Record<AvatarBase, AvatarParts> = {
  boy: {
    base: 'boy',
    skin: 'tan',
    hair: 'fade',
    hairColor: 'black',
    eyes: 'round',
    eyeColor: 'brown',
    brows: 'straight',
    nose: 'button',
    mouth: 'smirk',
    facialHair: 'none',
    shirt: 'hoodie',
    shirtColor: 'black',
    accessory: 'chain',
    background: 'teal',
  },
  girl: {
    base: 'girl',
    skin: 'tan',
    hair: 'long-straight',
    hairColor: 'dark-brown',
    eyes: 'almond',
    eyeColor: 'brown',
    brows: 'arched',
    nose: 'small',
    mouth: 'smile',
    facialHair: 'none',
    shirt: 'jacket',
    shirtColor: 'red',
    accessory: 'hoops',
    background: 'violet',
  },
};

function partEnum<K extends AvatarPartKey>(key: K) {
  const keys = AVATAR_PART_OPTIONS[key].map((option) => option.key) as [AvatarParts[K], ...AvatarParts[K][]];
  return z.enum(keys as [string, ...string[]]) as unknown as z.ZodType<AvatarParts[K]>;
}

export const avatarPartsSchema = z.object({
  base: partEnum('base'),
  skin: partEnum('skin'),
  hair: partEnum('hair'),
  hairColor: partEnum('hairColor'),
  eyes: partEnum('eyes'),
  eyeColor: partEnum('eyeColor'),
  brows: partEnum('brows'),
  nose: partEnum('nose'),
  mouth: partEnum('mouth'),
  facialHair: partEnum('facialHair'),
  shirt: partEnum('shirt'),
  shirtColor: partEnum('shirtColor'),
  accessory: partEnum('accessory'),
  background: partEnum('background'),
}).strict();

/**
 * Reads a stored avatar. A part that was retired, or added after it was saved,
 * falls back to the base's default so an old avatar keeps drawing.
 */
export function readAvatarParts(value: unknown): AvatarParts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const base: AvatarBase = raw.base === 'girl' ? 'girl' : 'boy';
  const parts = { ...DEFAULT_AVATAR_PARTS[base] } as Record<AvatarPartKey, string>;
  for (const key of Object.keys(AVATAR_PART_OPTIONS) as AvatarPartKey[]) {
    const candidate = raw[key];
    if (AVATAR_PART_OPTIONS[key].some((option) => option.key === candidate)) parts[key] = candidate as string;
  }
  return parts as AvatarParts;
}

/** Hex color for a colored part, e.g. `avatarColor('skin', 'tan')`. */
export function avatarColor(
  part: 'skin' | 'hairColor' | 'eyeColor' | 'shirtColor' | 'background',
  key: string,
): string {
  const options: readonly { key: string; color: string }[] = AVATAR_PART_OPTIONS[part];
  return (options.find((option) => option.key === key) ?? options[0]!).color;
}
