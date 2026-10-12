import { describe, expect, it } from 'vitest';
import { updateAccountProfileSettingsSchema } from '../schemas/auth.js';
import { AVATAR_PART_OPTIONS, DEFAULT_AVATAR_PARTS, avatarPartsSchema, readAvatarParts } from '../avatar-builder.js';

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
