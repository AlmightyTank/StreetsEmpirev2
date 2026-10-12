import { classicOgStreetPassA, STREET_PASS_S1, streetPassCredToReach } from '@streets/rulesets';
import { describe, expect, it } from 'vitest';
import type { Db } from '../../utils/db.js';
import { StreetPassService } from '../street-pass.service.js';

/**
 * Slice D added the item art collections to Season 1 tiers 8, 18 and 28 after
 * the pass shipped. A player who claimed one of those tiers earlier must still
 * end up with the collection, without a second claim of the tier.
 */
function txFor(claimedTiers: number[], ownedKeys: string[], reachedTier: number) {
  const claims = claimedTiers.map((tier) => ({ tier }));
  const awarded: string[] = [];
  const tx = {
    streetPassProgress: {
      findMany: async () => [{ roundPlayerId: 'rp-1', cred: streetPassCredToReach(STREET_PASS_S1, reachedTier), roundPlayer: { accountId: 'account-1' } }],
    },
    streetPassClaim: {
      findUnique: async (args: { where: { roundPlayerId_passKey_tier: { tier: number } } }) =>
        claims.some((claim) => claim.tier === args.where.roundPlayerId_passKey_tier.tier) ? { id: 'claim' } : null,
      create: async (args: { data: { tier: number } }) => {
        claims.push({ tier: args.data.tier });
        return args.data;
      },
      findMany: async () => claims,
    },
    accountCosmeticUnlock: {
      findMany: async (args: { where: { key: { in: string[] } } }) =>
        [...ownedKeys, ...awarded].filter((key) => args.where.key.in.includes(key)).map((key) => ({ key })),
      upsert: async (args: { create: { key: string } }) => {
        awarded.push(args.create.key);
        return args.create;
      },
    },
  } as unknown as Db;
  return { tx, claims, awarded };
}

describe('Street Pass cosmetic top-up at round close', () => {
  it('awards a collection on a tier the player claimed before the collection existed', async () => {
    const { tx, awarded } = txFor([8, 10], ['street-pass-s1-fresh-face'], 10);

    const autoClaimed = await StreetPassService.grantUnclaimedCosmetics(tx, 'round-1', classicOgStreetPassA, new Date());

    expect(autoClaimed).toBe(0);
    expect(awarded).toEqual([
      'street-pass-s1-urban-ghost', 'street-pass-s1-chrome-serpent-theme', 'street-pass-s1-chrome-serpent-frame',
      'street-pass-s1-phantom-convoy-theme', 'street-pass-s1-phantom-convoy-frame',
    ]);
  });

  it('does not award a cosmetic the account already owns', async () => {
    const { tx, awarded } = txFor([8, 10], [
      'street-pass-s1-urban-ghost', 'street-pass-s1-fresh-face', 'street-pass-s1-chrome-serpent-theme',
      'street-pass-s1-chrome-serpent-frame', 'street-pass-s1-phantom-convoy-theme', 'street-pass-s1-phantom-convoy-frame',
    ], 10);

    await StreetPassService.grantUnclaimedCosmetics(tx, 'round-1', classicOgStreetPassA, new Date());

    expect(awarded).toEqual([]);
  });

  it('auto-claims reached collection tiers the player never claimed', async () => {
    const { tx, claims, awarded } = txFor([], [], 18);

    const autoClaimed = await StreetPassService.grantUnclaimedCosmetics(tx, 'round-1', classicOgStreetPassA, new Date());

    expect(autoClaimed).toBe(5);
    expect(claims.map((claim) => claim.tier)).toEqual([8, 10, 12, 15, 18]);
    expect(awarded).toEqual([
      'street-pass-s1-urban-ghost', 'street-pass-s1-chrome-serpent-theme', 'street-pass-s1-chrome-serpent-frame',
      'street-pass-s1-fresh-face', 'street-pass-s1-phantom-convoy-theme', 'street-pass-s1-phantom-convoy-frame',
      'street-pass-s1-lantern-district-theme', 'street-pass-s1-lantern-district-frame',
      'street-pass-s1-ice-dragon-theme', 'street-pass-s1-snowstorm-frame',
      'street-pass-s1-siren-breaker-theme', 'street-pass-s1-siren-breaker-frame',
      'street-pass-s1-midnight-ops', 'street-pass-s1-block-sovereign-theme', 'street-pass-s1-block-sovereign-frame',
    ]);
  });
});
