import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV08H, STREET_PASS_S1, STREET_PASS_S1_COSMETICS, type QuestRewardDefinition, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { toState } from '../action.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ReputationService } from '../reputation.service.js';
import { grantRewards, rewardLabel } from '../reward-grant.service.js';

/**
 * Street Pass step 1, live: the shared reward grant pays every Season 1 tier,
 * including the new hoe, thug and product rewards, the way a claim will.
 * Opt in with STREET_PASS_INTEGRATION=1.
 */
describe.runIf(process.env.STREET_PASS_INTEGRATION === '1')('reward grants with PostgreSQL', () => {
  const rules: Ruleset = {
    ...classicOgV08H,
    cosmetics: { ...classicOgV08H.cosmetics, ...STREET_PASS_S1_COSMETICS },
    streetPass: STREET_PASS_S1,
  };
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = `pass_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    const round = await app.prisma.round.create({ data: {
      name: 'Street Pass fixture', slug: `street-pass-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
      roundId, accountId, cityId, displayName: name, publicPimpId: 7300,
      reputation: { create: ReputationService.seedFor(rules) } } });
    playerId = player.id;
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.deleteMany({ where: { id: accountId } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerFavor.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.accountCosmeticUnlock.deleteMany({ where: { accountId } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { ...rules.round.startingPlayer, ...startingStock(rules) } });
  });

  /** Grant rewards and write the player's columns back, the way an action does. */
  async function grant(rewards: readonly QuestRewardDefinition[], sourceKey: string) {
    await app.prisma.$transaction(async (tx) => {
      const next = toState(await tx.roundPlayer.findUniqueOrThrow({ where: { id: playerId } }));
      await grantRewards({ tx, roundPlayerId: playerId, accountId, ruleset: rules, now: new Date(), sourceKey }, next, rewards);
      await tx.roundPlayer.update({ where: { id: playerId }, data: {
        cashCents: next.cashCents, turns: next.turns, whores: next.whores, thugs: next.thugs,
        condoms: next.condoms, medicine: next.medicine, crack: next.crack, beer: next.beer,
        pistols: next.pistols, shotguns: next.shotguns, tek9s: next.tek9s, ak47s: next.ak47s, lowRiders: next.lowRiders,
        shotgunUnlocked: next.shotgunUnlocked, tek9Unlocked: next.tek9Unlocked, ak47Unlocked: next.ak47Unlocked,
      } });
    });
  }

  it('pays every Season 1 tier: cash, turns, crew, guns, products, favors and the season cosmetics', async () => {
    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    for (const tier of STREET_PASS_S1.tiers) await grant(tier.rewards, `${STREET_PASS_S1.key}:${tier.tier}`);
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });

    expect(after.cashCents - before.cashCents).toBe(52_000_000n);
    expect(after.turns - before.turns).toBe(225);
    expect(after.whores - before.whores).toBe(28);
    expect(after.thugs - before.thugs).toBe(30);
    expect(after.condoms - before.condoms).toBe(1_000);
    expect(after.beer - before.beer).toBe(500);
    expect(after.medicine - before.medicine).toBe(50);
    expect(after.pistols - before.pistols).toBe(25);
    expect(after.shotguns - before.shotguns).toBe(3);
    expect(after.tek9s - before.tek9s).toBe(2);
    expect(after.ak47s - before.ak47s).toBe(2);
    expect(after.lowRiders - before.lowRiders).toBe(2);
    // The gun itself, never buying access.
    expect([after.shotgunUnlocked, after.tek9Unlocked, after.ak47Unlocked]).toEqual([before.shotgunUnlocked, before.tek9Unlocked, before.ak47Unlocked]);

    const products = await ProductInventoryService.read(app.prisma, playerId, rules);
    expect(products).toMatchObject({ WEED: 250, ECSTASY: 150, METH: 200, COCAINE: 150, HEROIN: 200 });
    expect(products.CRACK).toBe(before.crack);

    const favors = await app.prisma.playerFavor.findMany({ where: { roundPlayerId: playerId } });
    expect(Object.fromEntries(favors.map((row) => [row.key, row.quantity]))).toEqual({
      STREET_FRENZY: 1, TOMMY_VOUCHER: 1, COOKHOUSE_RUSH: 1, BURNER_PHONE: 2, DOCTOR_FAVOR: 1,
    });
    expect(favors.find((row) => row.key === 'BURNER_PHONE')?.lastSourceQuestKey).toBe('street-pass-s1:23');

    const cosmetics = await app.prisma.accountCosmeticUnlock.findMany({ where: { accountId }, orderBy: { key: 'asc' } });
    expect(cosmetics.map((row) => [row.key, row.kind, row.rarity, row.sourceQuestKey])).toEqual([
      ['street-pass-s1-badge', 'TITLE_BADGE', 'legendary', 'street-pass-s1:30'],
      ['street-pass-s1-frame', 'PROFILE_FRAME', 'legendary', 'street-pass-s1:30'],
      ['street-pass-s1-fresh-face', 'TITLE_BADGE', 'rare', 'street-pass-s1:10'],
      ['street-pass-s1-kingpin', 'TITLE_BADGE', 'legendary', 'street-pass-s1:30'],
      ['street-pass-s1-made-man', 'TITLE_BADGE', 'epic', 'street-pass-s1:20'],
    ]);
  });

  it('adds a crack product reward to the crack column without losing it on write-back', async () => {
    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    await grant([{ kind: 'PRODUCT', key: 'CRACK', amount: 40 }, { kind: 'PRODUCT', key: 'WEED', amount: 10 }, { kind: 'PRODUCT', key: 'WEED', amount: 5 }], 'test');
    const products = await ProductInventoryService.read(app.prisma, playerId, rules);
    expect(products.CRACK).toBe(before.crack + 40);
    expect(products.WEED).toBe(15);
  });

  it('refuses a product the round does not sell and writes nothing', async () => {
    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    await expect(grant([{ kind: 'CASH', amount: 500 }, { kind: 'PRODUCT', key: 'KRATOM', amount: 5 }], 'test')).rejects.toThrow();
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(after.cashCents).toBe(before.cashCents);
  });

  it('labels the new rewards in the game’s words', () => {
    expect(rewardLabel({ kind: 'ITEM', key: 'whores', amount: 3 }, rules)).toBe('3 hoes');
    expect(rewardLabel({ kind: 'ITEM', key: 'thugs', amount: 5 }, rules)).toBe('5 thugs');
    expect(rewardLabel({ kind: 'PRODUCT', key: 'WEED', amount: 250 }, rules)).toBe('250 weed');
    expect(rewardLabel({ kind: 'ITEM', key: 'condoms', amount: 25 }, rules)).toBe('25 condoms');
  });
});
