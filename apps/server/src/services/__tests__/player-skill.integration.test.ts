import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV23A } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { BattleReportDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { RoundService } from '../round.service.js';
import { CombatRecoveryService } from '../combat-recovery.service.js';
import { PlayerSkillService } from '../player-skill.service.js';
import { caseCoolingByPlayer } from '../law.service.js';

describe.runIf(process.env.STREET_SKILLS_INTEGRATION === '1')('street skills with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId: string;
  let cityId: string;
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgV23A;
  const skills = rules.streetSkills!;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Street skills integration fixture', slug: `skills-test-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);
    // The fixture starts in the past, so a seeded current round would otherwise supersede and close it.
    vi.spyOn(RoundService, 'closeSupersededActive').mockResolvedValue([]);
    for (let i = 0; i < 2; i++) {
      const name = `skill_${randomUUID().slice(0, 8)}`;
      const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { birthDate: '1990-01-01', ageConfirmed: true, username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      expect(response.statusCode).toBe(201);
      accounts.push(response.json().account.id);
      cookies.push(response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[i]!, cityId, displayName: name, publicPimpId: 2000 + i } });
      players.push(player.id);
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) {
      await app.prisma.legacyEntry.deleteMany({ where: { sourceRoundId: roundId } });
      await app.prisma.round.delete({ where: { id: roundId } });
    }
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.round.update({ where: { id: roundId }, data: { status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000) } });
    await app.prisma.playerSkillAward.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerSkill.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.combatInjury.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.raidBattle.deleteMany({ where: { attackerId: { in: players } } });
    for (let i = 0; i < players.length; i++) {
      // Joined a week ago, so no late-joiner catch-up multiplies the XP.
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        thugs: i === 1 ? 20 : 40, woundedThugs: 0, pistols: i === 1 ? 20 : 40, beer: 100,
        cashCents: i === 1 ? 4_100_000n : 2_000_000n, cityId,
        createdAt: new Date(Date.now() - 7 * 86_400_000), lastActiveAt: new Date(),
        lastTurnCalculationAt: new Date(), lastAwayBonusAt: null,
        raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null, dailyRankSnapshotAt: null,
      };
      await app.prisma.roundPlayer.update({ where: { id: players[i]! }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
  });

  const skillRow = (who: number, skill: string) => app.prisma.playerSkill.findUnique({ where: { roundPlayerId_skill: { roundPlayerId: players[who]!, skill } } });

  it('pays Muscle XP to both sides of a raid, half to the loser', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/game/combat/raid', headers: { cookie: cookies[0]! },
      payload: { roundId, targetPublicPimpId: 2001, attackingThugs: 40, actionId: randomUUID() },
    });
    expect(response.statusCode, response.body).toBe(200);
    const won = response.json<BattleReportDto>().won;
    const muscle = skills.sources.find((source) => source.skill === 'MUSCLE')!;
    const winnerXp = muscle.baseXp;
    const loserXp = muscle.baseXp * muscle.lossMultiplier!;
    expect((await skillRow(0, 'MUSCLE'))?.xp).toBe(won ? winnerXp : loserXp);
    expect((await skillRow(1, 'MUSCLE'))?.xp).toBe(won ? loserXp : winnerXp);
  });

  it('stops a skill at the room the shared total cap leaves', async () => {
    const huge = 1_000_000;
    for (const skill of ['HUSTLE', 'MUSCLE']) {
      await app.prisma.playerSkill.create({ data: { roundPlayerId: players[0]!, skill, xp: huge, points: 40 } });
    }
    await app.prisma.playerSkill.create({ data: { roundPlayerId: players[0]!, skill: 'FIXER', xp: huge, points: 0 } });
    const player = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[0]! } });
    await app.prisma.$transaction((tx) => PlayerSkillService.award(tx, {
      roundPlayerId: players[0]!, player, rules: skills, award: { skill: 'FIXER', amount: 10 }, sourceKey: `cap:${randomUUID()}`, now: new Date(),
    }));
    expect((await skillRow(0, 'FIXER'))?.points).toBe(skills.totalPointCap - 80);
  });

  it('lets a player choose a live perk, refuses one waiting on an unbuilt system, and applies Field Medic', async () => {
    await app.prisma.playerSkill.create({ data: { roundPlayerId: players[0]!, skill: 'MUSCLE', xp: 82_000, points: 25 } });
    await app.prisma.playerSkill.create({ data: { roundPlayerId: players[0]!, skill: 'FIXER', xp: 82_000, points: 40 } });
    const choose = (skill: string, threshold: number, choice: string) => app.inject({
      method: 'POST', url: `/api/game/skills/${skill}/choice`, headers: { cookie: cookies[0]! }, payload: { threshold, choice },
    });
    expect((await choose('FIXER', 40, 'GHOST')).statusCode).toBe(409);
    const picked = await choose('MUSCLE', 25, 'FIELD_MEDIC');
    expect(picked.statusCode, picked.body).toBe(200);

    const view = (await app.inject({ method: 'GET', url: '/api/game/skills', headers: { cookie: cookies[0]! } })).json();
    const fixer = view.skills.find((entry: { skill: string }) => entry.skill === 'FIXER');
    expect(fixer.milestones.find((milestone: { threshold: number }) => milestone.threshold === 40).choices.every((choice: { requires: string | null }) => choice.requires)).toBe(true);

    const now = new Date();
    const due = new Date(now.getTime() + 60 * 60_000);
    await CombatRecoveryService.add(app.prisma, players[0]!, null, 3, due, now);
    const injury = await app.prisma.combatInjury.findFirstOrThrow({ where: { roundPlayerId: players[0]! } });
    expect(injury.recoverAt.getTime()).toBe(now.getTime() + 45 * 60_000);
  });

  it('pays Hustle on a store sale and puts it on the action receipt', async () => {
    const [storeKey, store] = Object.entries(rules.stores).find(([, candidate]) => Object.values(candidate.items).some((item) => item.field === 'pistols' && item.sellCents !== null))!;
    const [itemKey, item] = Object.entries(store.items).find(([, candidate]) => candidate.field === 'pistols')!;
    const sell = () => app.inject({
      method: 'POST', url: '/api/game/stores/trade', headers: { cookie: cookies[0]! },
      payload: { store: storeKey, item: itemKey, direction: 'sell', quantity: 1, actionId: randomUUID() },
    });
    const plain = await sell();
    expect(plain.statusCode, plain.body).toBe(200);
    const plainCash = BigInt(plain.json().after.cashCents) - BigInt(plain.json().before.cashCents);
    expect(plain.json().modifiers).toBeUndefined();

    // The first sale already earned Hustle XP for the action.
    expect((await skillRow(0, 'HUSTLE'))?.xp).toBe(skills.sources.find((source) => source.skill === 'HUSTLE')!.baseXp);
    await app.prisma.playerSkill.update({ where: { roundPlayerId_skill: { roundPlayerId: players[0]!, skill: 'HUSTLE' } }, data: { xp: 82_000, points: 40 } });
    const skilled = await sell();
    expect(skilled.statusCode, skilled.body).toBe(200);
    const skilledCash = BigInt(skilled.json().after.cashCents) - BigInt(skilled.json().before.cashCents);
    expect(skilledCash).toBe(BigInt(Math.min(item.buyCents - 1, Math.floor(Number(plainCash) * 1.06))));
    expect(skilled.json().modifiers.map((line: { effectId: string }) => line.effectId)).toEqual(['STORE_SELL_PRICE']);
  });

  it('reads Paper Trail for a whole round at once for the admin law report', async () => {
    await app.prisma.playerSkill.create({ data: { roundPlayerId: players[0]!, skill: 'FIXER', xp: 30_000, points: 25, choices: { 25: 'PAPER_TRAIL' } } });
    const cooling = await caseCoolingByPlayer(app.prisma, roundId, rules);
    expect(cooling(players[0]!)).toBe(1.2);
    expect(cooling(players[1]!)).toBe(1);
  });
});
