import { z } from 'zod';

/**
 * Built avatars: a chest-up portrait assembled from face pieces, for players
 * who would rather not use a picture. Pure cosmetic.
 *
 * Most parts are free. A wearable with `unlock` is worn only once the account
 * holds the AccountCosmeticUnlock with that key (kind AVATAR_PART), earned in
 * play or bought in The Drop; `hidden` ones stay out of the builder until
 * owned. See docs/ROADMAP-AVATAR-COSMETICS.md.
 *
 * The catalog only names parts and colors. The web client draws them.
 */

/** Unlock keys for the locked wearables. Each is an AccountCosmeticUnlock key. */
export const AVATAR_UNLOCKS = {
  kingpinCrown: 'drop-kingpin-luxe-crown',
  snapback: 'street-pass-s1-snapback',
  prisonJumpsuit: 'avatar-prison-jumpsuit',
  santaHat: 'holiday-road-santa-hat',
  kingpinFurCoat: 'drop-kingpin-luxe-fur-coat',
  kingpinCrownEarrings: 'drop-kingpin-luxe-crown-earrings',
  neonVisor: 'drop-neon-underworld-visor',
  neonGlow: 'drop-neon-underworld-glow',
  heistParka: 'drop-winter-heist-parka',
  heistSnowfall: 'drop-winter-heist-snowfall',
} as const;

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
  /** Ten styles cut for boys and ten for girls; every style can be worn on either base. */
  hair: [
    { key: 'bald', label: 'Bald', group: 'boy' },
    { key: 'buzz', label: 'Buzz cut', group: 'boy' },
    { key: 'fade', label: 'Fade', group: 'boy' },
    { key: 'waves', label: 'Waves', group: 'boy' },
    { key: 'curls', label: 'Short curls', group: 'boy' },
    { key: 'twists', label: 'Twists', group: 'boy' },
    { key: 'high-top', label: 'High-top', group: 'boy' },
    { key: 'mohawk', label: 'Mohawk', group: 'boy' },
    { key: 'cornrows', label: 'Cornrows', group: 'boy' },
    { key: 'locs', label: 'Locs', group: 'boy' },
    { key: 'long-straight', label: 'Long straight', group: 'girl' },
    { key: 'long-curls', label: 'Long curls', group: 'girl' },
    { key: 'bob', label: 'Bob', group: 'girl' },
    { key: 'pixie', label: 'Pixie cut', group: 'girl' },
    { key: 'ponytail', label: 'Ponytail', group: 'girl' },
    { key: 'pigtails', label: 'Pigtails', group: 'girl' },
    { key: 'puffs', label: 'Puffs', group: 'girl' },
    { key: 'braids', label: 'Braids', group: 'girl' },
    { key: 'bun', label: 'Top bun', group: 'girl' },
    { key: 'afro', label: 'Afro', group: 'girl' },
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
    // Always County orange; the shirt color does not apply.
    { key: 'prison-jumpsuit', label: 'Prison jumpsuit', unlock: AVATAR_UNLOCKS.prisonJumpsuit, unlockHint: 'Get arrested once.' },
    { key: 'fur-coat', label: 'Fur coat', unlock: AVATAR_UNLOCKS.kingpinFurCoat, unlockHint: 'The Drop: Kingpin Luxe, 400 Crowns.' },
    // Always frost white; the shirt color does not apply.
    { key: 'heist-parka', label: 'Heist parka', unlock: AVATAR_UNLOCKS.heistParka, unlockHint: 'The Drop: Winter Heist, 400 Crowns.' },
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
  mask: [
    { key: 'none', label: 'None' },
    { key: 'ski-mask', label: 'Ski mask' },
    { key: 'bandana', label: 'Bandana' },
    { key: 'skull-bandana', label: 'Skull bandana' },
    { key: 'hockey', label: 'Hockey mask' },
    { key: 'gas-mask', label: 'Gas mask' },
    // Lit violet and teal; the mask color does not apply.
    { key: 'neon-visor', label: 'Neon visor', unlock: AVATAR_UNLOCKS.neonVisor, unlockHint: 'The Drop: Neon Underworld, 300 Crowns.' },
  ],
  maskColor: [
    { key: 'black', label: 'Black', color: '#1d1f24' },
    { key: 'red', label: 'Red', color: '#b8262c' },
    { key: 'blue', label: 'Blue', color: '#2350a8' },
    { key: 'green', label: 'Green', color: '#2f6b38' },
    { key: 'gray', label: 'Gray', color: '#6c7480' },
    { key: 'white', label: 'White', color: '#ecebe4' },
  ],
  accessory: [
    { key: 'none', label: 'None' },
    { key: 'chain', label: 'Gold chain' },
    { key: 'shades', label: 'Shades' },
    { key: 'glasses', label: 'Glasses' },
  ],
  /** Their own slot so they go with a chain or shades. Hidden under long hair over the ears and full masks. */
  earrings: [
    { key: 'none', label: 'None' },
    { key: 'studs', label: 'Stud earrings' },
    { key: 'hoops', label: 'Hoop earrings' },
    { key: 'crown-drop', label: 'Crown drops', unlock: AVATAR_UNLOCKS.kingpinCrownEarrings, unlockHint: 'The Drop: Kingpin Luxe, 250 Crowns.' },
  ],
  /** Drawn over the hair. Tall hair is cut down to fit under a hat. */
  headwear: [
    { key: 'none', label: 'None' },
    { key: 'beanie', label: 'Beanie' },
    { key: 'durag', label: 'Durag' },
    { key: 'snapback', label: 'Snapback', unlock: AVATAR_UNLOCKS.snapback, unlockHint: 'Street Pass Season 1, tier 4.' },
    { key: 'santa-hat', label: 'Santa hat', unlock: AVATAR_UNLOCKS.santaHat, hidden: true, unlockHint: 'A Christmas good deed on the road.' },
    { key: 'kingpin-crown', label: 'Kingpin crown', unlock: AVATAR_UNLOCKS.kingpinCrown, unlockHint: 'The Drop: Kingpin Luxe, 300 Crowns.' },
  ],
  /** Drawn behind the body, over the background. Animated on large portraits; still under reduced motion. */
  aura: [
    { key: 'none', label: 'None' },
    { key: 'neon-glow', label: 'Neon glow', unlock: AVATAR_UNLOCKS.neonGlow, unlockHint: 'The Drop: Neon Underworld, 500 Crowns.' },
    { key: 'snowfall', label: 'Snowfall', unlock: AVATAR_UNLOCKS.heistSnowfall, unlockHint: 'The Drop: Winter Heist, 500 Crowns.' },
  ],
  /** Shows only with a mouth that shows teeth: grin or laugh. */
  grill: [
    { key: 'none', label: 'None' },
    { key: 'gold-tooth', label: 'Gold tooth' },
    { key: 'silver-grill', label: 'Silver grill' },
  ],
  /** Drawn like the item art: lit backdrops and scenes, or clear like the item icons themselves. */
  background: [
    { key: 'none', label: 'Clear' },
    { key: 'teal', label: 'Teal' },
    { key: 'charcoal', label: 'Charcoal' },
    { key: 'crimson', label: 'Crimson' },
    { key: 'gold', label: 'Gold' },
    { key: 'violet', label: 'Violet' },
    { key: 'sky', label: 'Sky' },
    { key: 'concrete', label: 'Concrete' },
    { key: 'brick', label: 'Brick wall' },
    { key: 'city', label: 'City at night' },
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
    eyes: 'almond',
    eyeColor: 'brown',
    brows: 'straight',
    nose: 'button',
    mouth: 'smirk',
    facialHair: 'none',
    shirt: 'hoodie',
    shirtColor: 'black',
    mask: 'none',
    maskColor: 'black',
    accessory: 'chain',
    earrings: 'none',
    headwear: 'none',
    grill: 'none',
    aura: 'none',
    background: 'brick',
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
    mask: 'none',
    maskColor: 'black',
    accessory: 'none',
    earrings: 'hoops',
    headwear: 'none',
    grill: 'none',
    aura: 'none',
    background: 'city',
  },
};

function partEnum<K extends AvatarPartKey>(key: K) {
  const keys = AVATAR_PART_OPTIONS[key].map((option) => option.key) as [AvatarParts[K], ...AvatarParts[K][]];
  return z.enum(keys as [string, ...string[]]) as unknown as z.ZodType<AvatarParts[K]>;
}

/** Earrings used to be accessories; an avatar saved then wears them in the earrings slot. */
function withEarringsSlot(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  if (raw.earrings !== undefined || (raw.accessory !== 'studs' && raw.accessory !== 'hoops')) return value;
  return { ...raw, earrings: raw.accessory, accessory: 'none' };
}

export const avatarPartsSchema = z.preprocess(withEarringsSlot, z.object({
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
  // Added after launch: an avatar saved by an older client simply has no mask.
  mask: partEnum('mask').default('none'),
  maskColor: partEnum('maskColor').default('black'),
  accessory: partEnum('accessory'),
  earrings: partEnum('earrings').default('none'),
  headwear: partEnum('headwear').default('none'),
  grill: partEnum('grill').default('none'),
  aura: partEnum('aura').default('none'),
  background: partEnum('background'),
}).strict()) as unknown as z.ZodType<AvatarParts, z.ZodTypeDef, unknown>;

/** One option in a slot, with the lock fields every option may carry. */
export type AvatarPartOption = {
  readonly key: string;
  readonly label: string;
  readonly color?: string;
  readonly group?: string;
  /** The AccountCosmeticUnlock key that owns it. Absent: free. */
  readonly unlock?: string;
  /** Left out of the builder until owned. */
  readonly hidden?: boolean;
  /** How to get it, shown on the locked option. */
  readonly unlockHint?: string;
};

export function avatarPartOption(part: AvatarPartKey, key: string): AvatarPartOption | undefined {
  const options: readonly AvatarPartOption[] = AVATAR_PART_OPTIONS[part];
  return options.find((option) => option.key === key);
}

/** Whether an account holding `owned` unlock keys may wear this option. */
export function avatarOptionOwned(option: AvatarPartOption, owned: ReadonlySet<string>): boolean {
  return !option.unlock || owned.has(option.unlock);
}

/** Slots wearing a locked option the account does not hold. Empty when the avatar can be saved. */
export function lockedAvatarParts(parts: AvatarParts, owned: ReadonlySet<string>): AvatarPartKey[] {
  return (Object.keys(AVATAR_PART_OPTIONS) as AvatarPartKey[]).filter((part) => {
    const option = avatarPartOption(part, parts[part]);
    return option !== undefined && !avatarOptionOwned(option, owned);
  });
}

/** Every locked wearable, keyed by its unlock key: the slot and option it unlocks. */
export const AVATAR_LOCKED_OPTIONS: ReadonlyMap<string, { part: AvatarPartKey; option: AvatarPartOption }> = new Map(
  (Object.keys(AVATAR_PART_OPTIONS) as AvatarPartKey[]).flatMap((part) => (
    (AVATAR_PART_OPTIONS[part] as readonly AvatarPartOption[])
      .filter((option) => option.unlock)
      .map((option) => [option.unlock!, { part, option }] as const)
  )),
);

/** The style key stored on a wearable's unlock row, e.g. `headwear:snapback`. */
export function avatarUnlockStyleKey(unlockKey: string): string | null {
  const found = AVATAR_LOCKED_OPTIONS.get(unlockKey);
  return found ? `${found.part}:${found.option.key}` : null;
}

/**
 * Reads a stored avatar. A part that was retired, or added after it was saved,
 * falls back to the base's default so an old avatar keeps drawing. Given the
 * account's unlock keys, a locked part it does not hold falls back the same way.
 */
export function readAvatarParts(value: unknown, owned?: ReadonlySet<string>): AvatarParts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = withEarringsSlot(value) as Record<string, unknown>;
  const base: AvatarBase = raw.base === 'girl' ? 'girl' : 'boy';
  const parts = { ...DEFAULT_AVATAR_PARTS[base] } as Record<AvatarPartKey, string>;
  for (const key of Object.keys(AVATAR_PART_OPTIONS) as AvatarPartKey[]) {
    const candidate = raw[key];
    const option = typeof candidate === 'string' ? avatarPartOption(key, candidate) : undefined;
    if (option && (!owned || avatarOptionOwned(option, owned))) parts[key] = option.key;
  }
  return parts as AvatarParts;
}

/** Hex color for a colored part, e.g. `avatarColor('skin', 'tan')`. */
export function avatarColor(
  part: 'skin' | 'hairColor' | 'eyeColor' | 'shirtColor' | 'maskColor',
  key: string,
): string {
  const options: readonly { key: string; color: string }[] = AVATAR_PART_OPTIONS[part];
  return (options.find((option) => option.key === key) ?? options[0]!).color;
}
