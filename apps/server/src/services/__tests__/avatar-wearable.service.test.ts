import { AVATAR_WEARABLES, DROP_BUNDLES, DROP_ITEMS, STREET_PASS_S1, classicOgStreetPassA } from '@streets/rulesets';
import { AVATAR_LOCKED_OPTIONS, avatarUnlockStyleKey } from '@streets/shared';
import { describe, expect, it } from 'vitest';
import type { Db } from '../../utils/db.js';
import { AvatarWearableService } from '../avatar-wearable.service.js';

function txWith(ownedKeys: string[] = []) {
  const rows: { key: string; kind: string; styleKey: string | null; sourceQuestKey: string }[] = ownedKeys.map((key) => ({ key, kind: 'AVATAR_PART', styleKey: null, sourceQuestKey: 'seed' }));
  const tx = {
    roundPlayer: { findUnique: async () => ({ accountId: 'account-1' }) },
    accountCosmeticUnlock: {
      findUnique: async (args: { where: { accountId_key: { key: string } } }) => rows.find((row) => row.key === args.where.accountId_key.key) ?? null,
      findMany: async () => rows,
      create: async (args: { data: (typeof rows)[number] }) => {
        rows.push(args.data);
        return args.data;
      },
    },
  } as unknown as Db;
  return { tx, rows };
}

describe('avatar wearable catalog', () => {
  it('defines every locked builder piece, with the matching kind and slot:option style key', () => {
    for (const unlockKey of AVATAR_LOCKED_OPTIONS.keys()) {
      const definition = (AVATAR_WEARABLES as Record<string, { kind: string; styleKey?: string }>)[unlockKey] ?? DROP_ITEMS[unlockKey];
      expect(definition, unlockKey).toBeDefined();
      expect(definition!.kind).toBe('AVATAR_PART');
      expect(definition!.styleKey).toBe(avatarUnlockStyleKey(unlockKey));
    }
    for (const key of Object.keys(AVATAR_WEARABLES)) expect(AVATAR_LOCKED_OPTIONS.has(key), key).toBe(true);
  });

  it('previews each Drop wearable as the piece it unlocks', () => {
    const wearables = Object.values(DROP_ITEMS).filter((item) => item.kind === 'AVATAR_PART');
    expect(wearables.map((item) => item.key)).toEqual([
      'drop-kingpin-luxe-crown', 'drop-kingpin-luxe-fur-coat', 'drop-kingpin-luxe-crown-earrings',
      'drop-neon-underworld-visor', 'drop-neon-underworld-glow',
      'drop-winter-heist-parka', 'drop-winter-heist-snowfall',
    ]);
    // Each set's bundle carries its avatar pieces.
    for (const item of wearables) expect(DROP_BUNDLES[`drop-${item.collection}-bundle`]!.itemKeys).toContain(item.key);
    for (const item of wearables) {
      const [part, option] = item.styleKey!.split(':');
      expect(item.preview).toEqual({ type: 'AVATAR', part, option });
    }
  });

  it('pays the snapback on Street Pass Season 1 tier 4 through a pass round', () => {
    const tier = STREET_PASS_S1.tiers.find((candidate) => candidate.tier === 4)!;
    expect(tier.rewards).toContainEqual({ kind: 'COSMETIC_UNLOCK', key: 'street-pass-s1-snapback' });
    expect(classicOgStreetPassA.cosmetics['street-pass-s1-snapback']).toMatchObject({ kind: 'AVATAR_PART', styleKey: 'headwear:snapback' });
  });
});

describe('AvatarWearableService', () => {
  it('grants a wearable once, kept as an account unlock', async () => {
    const { tx, rows } = txWith();
    const at = new Date('2026-10-19T00:00:00Z');

    expect(await AvatarWearableService.grantToRoundPlayer(tx, 'rp-1', 'avatar-prison-jumpsuit', 'ARREST', at)).toBe(true);
    expect(await AvatarWearableService.grantToRoundPlayer(tx, 'rp-1', 'avatar-prison-jumpsuit', 'ARREST', at)).toBe(false);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'avatar-prison-jumpsuit', kind: 'AVATAR_PART', styleKey: 'shirt:prison-jumpsuit', sourceQuestKey: 'ARREST' });
  });

  it('lists the wearables an account holds', async () => {
    const { tx } = txWith(['holiday-road-santa-hat']);
    expect(await AvatarWearableService.ownedKeys(tx, 'account-1')).toEqual(new Set(['holiday-road-santa-hat']));
  });
});
