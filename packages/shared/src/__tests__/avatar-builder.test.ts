import { describe, expect, it } from 'vitest';
import { updateAccountProfileSettingsSchema } from '../schemas/auth.js';
import {
  AVATAR_LOCKED_OPTIONS,
  AVATAR_PART_OPTIONS,
  AVATAR_UNLOCKS,
  DEFAULT_AVATAR_PARTS,
  avatarPartsSchema,
  avatarUnlockStyleKey,
  lockedAvatarParts,
  readAvatarParts,
  type AvatarPartOption,
} from '../avatar-builder.js';

describe('avatarPartsSchema', () => {
  it('accepts both starter looks', () => {
    expect(avatarPartsSchema.parse(DEFAULT_AVATAR_PARTS.boy)).toEqual(DEFAULT_AVATAR_PARTS.boy);
    expect(avatarPartsSchema.parse(DEFAULT_AVATAR_PARTS.girl)).toEqual(DEFAULT_AVATAR_PARTS.girl);
  });

  it('refuses unknown pieces, missing pieces and extra keys', () => {
    expect(avatarPartsSchema.safeParse({ ...DEFAULT_AVATAR_PARTS.boy, hair: 'mullet' }).success).toBe(false);
    const { hair: _hair, ...missing } = DEFAULT_AVATAR_PARTS.boy;
    expect(avatarPartsSchema.safeParse(missing).success).toBe(false);
    expect(avatarPartsSchema.safeParse({ ...DEFAULT_AVATAR_PARTS.boy, hat: 'fitted' }).success).toBe(false);
  });

  it('reads an avatar saved before masks as unmasked', () => {
    const { mask: _mask, maskColor: _maskColor, ...beforeMasks } = DEFAULT_AVATAR_PARTS.boy;
    expect(avatarPartsSchema.parse(beforeMasks)).toEqual(DEFAULT_AVATAR_PARTS.boy);
  });

  it('rides along on profile settings and can be cleared', () => {
    const base = {
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
    };
    expect(updateAccountProfileSettingsSchema.parse({ ...base, profileAvatar: DEFAULT_AVATAR_PARTS.girl }).profileAvatar)
      .toEqual(DEFAULT_AVATAR_PARTS.girl);
    expect(updateAccountProfileSettingsSchema.parse({ ...base, profileAvatar: null }).profileAvatar).toBeNull();
    expect(updateAccountProfileSettingsSchema.parse(base).profileAvatar).toBeUndefined();
  });

  it('offers ten boy and ten girl hair styles, any of them on either base', () => {
    const groups = AVATAR_PART_OPTIONS.hair.map((option) => option.group);
    expect(groups.filter((group) => group === 'boy')).toHaveLength(10);
    expect(groups.filter((group) => group === 'girl')).toHaveLength(10);
    const girlStyle = AVATAR_PART_OPTIONS.hair.find((option) => option.group === 'girl')!.key;
    const boyStyle = AVATAR_PART_OPTIONS.hair.find((option) => option.group === 'boy')!.key;
    expect(avatarPartsSchema.safeParse({ ...DEFAULT_AVATAR_PARTS.boy, hair: girlStyle }).success).toBe(true);
    expect(avatarPartsSchema.safeParse({ ...DEFAULT_AVATAR_PARTS.girl, hair: boyStyle }).success).toBe(true);
  });

  it('gives every colored piece a hex color', () => {
    for (const key of ['skin', 'hairColor', 'eyeColor', 'shirtColor', 'maskColor'] as const) {
      for (const option of AVATAR_PART_OPTIONS[key]) expect(option.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('readAvatarParts', () => {
  it('reads nothing as no avatar', () => {
    expect(readAvatarParts(null)).toBeNull();
    expect(readAvatarParts('boy')).toBeNull();
    expect(readAvatarParts([])).toBeNull();
  });

  it('fills retired or missing pieces from the base starter', () => {
    expect(readAvatarParts({ base: 'girl', hair: 'retired-style', mouth: 'grin' })).toEqual({
      ...DEFAULT_AVATAR_PARTS.girl,
      mouth: 'grin',
    });
  });
});

describe('avatar wearables', () => {
  const none = new Set<string>();

  it('reads an avatar saved before hats, grills and the earrings slot as wearing none', () => {
    const { headwear: _h, grill: _g, earrings: _e, ...before } = DEFAULT_AVATAR_PARTS.boy;
    expect(avatarPartsSchema.parse(before)).toEqual(DEFAULT_AVATAR_PARTS.boy);
    expect(readAvatarParts(before)).toEqual(DEFAULT_AVATAR_PARTS.boy);
  });

  it('moves earrings saved as an accessory into the earrings slot', () => {
    const { earrings: _e, ...rest } = DEFAULT_AVATAR_PARTS.girl;
    for (const style of ['studs', 'hoops'] as const) {
      const saved = { ...rest, accessory: style };
      expect(readAvatarParts(saved)).toMatchObject({ accessory: 'none', earrings: style });
      expect(avatarPartsSchema.parse(saved)).toMatchObject({ accessory: 'none', earrings: style });
    }
  });

  it('keeps every starter look free', () => {
    expect(lockedAvatarParts(DEFAULT_AVATAR_PARTS.boy, none)).toEqual([]);
    expect(lockedAvatarParts(DEFAULT_AVATAR_PARTS.girl, none)).toEqual([]);
  });

  it('names the locked slots until the account owns the piece', () => {
    const parts = { ...DEFAULT_AVATAR_PARTS.boy, headwear: 'snapback' as const, shirt: 'prison-jumpsuit' as const };
    expect(lockedAvatarParts(parts, none)).toEqual(['shirt', 'headwear']);
    expect(lockedAvatarParts(parts, new Set([AVATAR_UNLOCKS.snapback]))).toEqual(['shirt']);
    expect(lockedAvatarParts(parts, new Set([AVATAR_UNLOCKS.snapback, AVATAR_UNLOCKS.prisonJumpsuit]))).toEqual([]);
  });

  it('reads a locked piece the account no longer holds as the base default', () => {
    const saved = { ...DEFAULT_AVATAR_PARTS.girl, headwear: 'kingpin-crown', mouth: 'grin' };
    expect(readAvatarParts(saved, none)).toEqual({ ...DEFAULT_AVATAR_PARTS.girl, mouth: 'grin' });
    expect(readAvatarParts(saved, new Set([AVATAR_UNLOCKS.kingpinCrown]))).toEqual(saved);
    // Without an owned set (another player's saved avatar) it is read as saved.
    expect(readAvatarParts(saved)).toEqual(saved);
  });

  it('gives every locked piece its own unlock key, a hint and a slot:option style key', () => {
    const locked = (Object.keys(AVATAR_PART_OPTIONS) as (keyof typeof AVATAR_PART_OPTIONS)[])
      .flatMap((part) => (AVATAR_PART_OPTIONS[part] as readonly AvatarPartOption[]).filter((option) => option.unlock));
    expect(new Set(locked.map((option) => option.unlock)).size).toBe(locked.length);
    expect([...AVATAR_LOCKED_OPTIONS.keys()].sort()).toEqual(Object.values(AVATAR_UNLOCKS).sort());
    for (const option of locked) expect(option.unlockHint).toBeTruthy();
    expect(avatarUnlockStyleKey(AVATAR_UNLOCKS.snapback)).toBe('headwear:snapback');
    expect(avatarUnlockStyleKey('nope')).toBeNull();
  });

  it('only hides pieces that can be unlocked', () => {
    for (const options of Object.values(AVATAR_PART_OPTIONS) as readonly (readonly AvatarPartOption[])[]) {
      for (const option of options) if (option.hidden) expect(option.unlock).toBeTruthy();
    }
  });
});
