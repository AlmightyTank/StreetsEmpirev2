import type { Prisma } from '@prisma/client';
import { hashParts, loadRulesetForRound } from '@streets/rules-engine';
import type { DistrictKey, EncounterGangRules, RandomEncounterEntryRules, RandomEncounterTrigger, Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import type { PlayerState } from './action.service.js';

const DISTRICTS: readonly DistrictKey[] = ['WINO_SLUMS', 'LOW_RENT', 'URBAN_GHETTO', 'NIGHTCLUB', 'CASINO'];
const ATTACKS = new Set(['CASH_RAID', 'DRIVE_BY', 'STEAL_RIDE', 'DRUG_HOES', 'LURE_CREW', 'REVENGE', 'TURF_PUSH']);

function root(value: Prisma.JsonValue | unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function positiveHash(...parts: string[]): number {
  return Math.abs(hashParts(...parts));
}

export function encounterGangTierAfter(actions: number): 'SCRUB' | 'STREET' | 'VETERAN' | 'KINGPIN' {
  return actions >= 40 ? 'KINGPIN' : actions >= 20 ? 'VETERAN' : actions >= 8 ? 'STREET' : 'SCRUB';
}

async function ensureRoundState(tx: Db, roundId: string, ruleset: Ruleset, rules: EncounterGangRules, now: Date): Promise<void> {
  const existing = await tx.encounterGang.count({ where: { roundId } });
  if (existing > 0) return;
  const [humans, cities] = await Promise.all([
    tx.roundPlayer.count({ where: { roundId, account: { isActive: true } } }),
    tx.city.findMany({ where: { isEnabled: true, slug: { in: Object.keys(ruleset.cities ?? {}) } }, select: { id: true, slug: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  if (!cities.length) return;
  const wanted = Math.max(rules.minCrews, Math.ceil(humans / Math.max(1, rules.humansPerCrew)));
  const roster = rules.roster.slice(0, Math.min(rules.maxCrews, wanted, rules.roster.length));
  for (const entry of roster) {
    const city = cities[positiveHash(roundId, entry.slug, 'city') % cities.length]!;
    const personality = rules.personalities[entry.personality] ?? Object.values(rules.personalities)[0]!;
    const gang = await tx.encounterGang.upsert({
      where: { roundId_slug: { roundId, slug: entry.slug } },
      update: {},
      create: {
        roundId,
        slug: entry.slug,
        bossName: entry.bossName,
        crewName: entry.crewName,
        crewTag: entry.crewTag,
        personality: entry.personality,
        targeting: personality.targeting,
        homeCityId: city.id,
        cityId: city.id,
        aggression: entry.aggression,
        ambition: entry.ambition,
        discipline: entry.discipline,
        memory: { actions: 0, seededAt: now.toISOString() },
      },
    });
    const ownsTurf = (positiveHash(roundId, entry.slug, 'turf-roll') % 10_000) / 10_000 < rules.startingTurfChance;
    if (!ownsTurf) continue;
    const district = DISTRICTS[positiveHash(roundId, entry.slug, 'district') % DISTRICTS.length]!;
    await tx.encounterGangTurf.createMany({
      data: [{ gangId: gang.id, roundId, cityId: city.id, district, strength: 1 + Math.floor(entry.ambition / 35), claimedAt: now }],
      skipDuplicates: true,
    });
  }
}

export function encounterGangTargetFits(targeting: string, state: PlayerState): boolean {
  const fit = Math.max(0, state.thugs - state.woundedThugs - state.busyThugs - state.postedThugs - state.businessThugs - state.dealerThugs);
  if (targeting === 'RIDES') return state.lowRiders > 0;
  if (targeting === 'PRODUCT') return state.crack > 0;
  if (targeting === 'DISTRACTED') return state.woundedThugs > 0 || fit < 5;
  if (targeting === 'WEAKEST') return fit < 12;
  if (targeting === 'RICHEST') return state.cashCents >= 25_000n;
  return true;
}

export function encounterGangMoveFor(trigger: RandomEncounterTrigger, favorite: string, revenge: boolean, lowRep: boolean): string {
  if (revenge) return 'REVENGE';
  if (trigger === 'TURF' && lowRep) return 'TURF_PUSH';
  if (trigger === 'TRAVEL') return favorite === 'STEAL_RIDE' || favorite === 'DRIVE_BY' ? favorite : 'CASH_RAID';
  if (trigger === 'PRODUCE') return favorite === 'DRUG_HOES' ? favorite : 'CASH_RAID';
  if (trigger === 'COMBAT') return favorite;
  if (trigger === 'SCOUT') return favorite;
  return 'CASH_RAID';
}

function encounterText(gang: { crewName: string; bossName: string }, move: string): { title: string; text: string } {
  if (move === 'DRIVE_BY') return { title: `${gang.crewName} rolling through`, text: `${gang.bossName}'s shooters swing past the block. Fight from cover, lose them in the alleys, or pay to cool it down.` };
  if (move === 'STEAL_RIDE') return { title: `${gang.crewName} eyeing your ride`, text: `${gang.crewName} has hands on one of your Low-Riders. Move now or watch it disappear into a chop shop.` };
  if (move === 'DRUG_HOES') return { title: `${gang.crewName} working your corner`, text: `${gang.crewName} is passing bad product around your workers to spoil the shift.` };
  if (move === 'LURE_CREW') return { title: `${gang.crewName} sets an ambush`, text: `${gang.crewName} uses a fake score to pull your crew into a narrow alley.` };
  if (move === 'REVENGE') return { title: `${gang.crewName} comes for payback`, text: `${gang.bossName} remembers what happened last time. Their crew found you before the grudge cooled.` };
  if (move === 'TURF_PUSH') return { title: `${gang.crewName} pushes the block`, text: `${gang.crewName} thinks your street reputation is too thin to hold this corner and starts leaning on your people.` };
  return { title: `${gang.crewName} cash raid`, text: `${gang.crewName} spots your take and moves in before the street clears.` };
}

function choices(gang: { slug: string; tier: string; wantedUntil: Date | null }, move: string, rules: EncounterGangRules, now: Date, bountyAvailable: boolean): RandomEncounterEntryRules['choices'] {
  const wanted = bountyAvailable && Boolean(gang.wantedUntil && gang.wantedUntil > now);
  const bounty = wanted ? rules.bountyCents[gang.tier as keyof typeof rules.bountyCents] ?? rules.bountyCents.SCRUB : 0;
  const fightEffects = move === 'STEAL_RIDE'
    ? { woundedThugs: { min: 0, max: 1 }, cash: bounty ? { minCents: bounty, maxCents: bounty } : undefined }
    : { woundedThugs: { min: 1, max: 3 }, cash: bounty ? { minCents: bounty, maxCents: bounty } : undefined };
  const comply = move === 'STEAL_RIDE'
    ? { lowRiders: { min: -1, max: -1 } }
    : move === 'DRUG_HOES'
      ? { supplies: { crack: { min: -20, max: -5 } } }
      : move === 'LURE_CREW'
        ? { thugs: { min: -2, max: -1 } }
        : { cash: { minCents: -50_000, maxCents: -10_000 } };
  return [
    { key: 'fight-back', label: bounty ? `Fight back · bounty $${(bounty / 100).toLocaleString('en-US')}` : 'Fight back', text: bounty ? 'Stand your ground and collect the posted bounty if you send them off.' : 'Stand your ground and make the crew remember you.', ...fightEffects },
    { key: 'give-ground', label: move === 'TURF_PUSH' ? 'Give up the corner' : 'Give them what they want', text: 'Protect the rest of the crew by giving ground.', ...comply },
    { key: 'slip-away', label: 'Slip away', text: 'Spend time and draw attention getting clear.', turns: { min: -3, max: -1 }, heat: { min: 1, max: 3 } },
  ];
}

async function maybeMigrate(tx: Db, gang: { id: string; roundId: string; cityId: string; tier: string; migratedAt: Date | null; lastActionAt: Date | null }, playerCityId: string, rules: EncounterGangRules, now: Date, rng: () => number): Promise<boolean> {
  if (!['VETERAN', 'KINGPIN'].includes(gang.tier) || gang.cityId === playerCityId || rng() >= 0.15) return false;
  const last = gang.migratedAt ?? gang.lastActionAt;
  if (last && now.getTime() - last.getTime() < rules.migrateAfterHours * 3_600_000) return false;
  await tx.encounterGang.update({ where: { id: gang.id }, data: { cityId: playerCityId, migratedAt: now, memory: { ...root((gang as { memory?: Prisma.JsonValue }).memory), migration: { arrivedAt: now.toISOString(), reason: 'RICHER_STREETS' } } } });
  await tx.encounterGangTurf.updateMany({ where: { gangId: gang.id, status: 'HELD' }, data: { status: 'ABANDONED', abandonedAt: now } });
  return true;
}

export const EncounterGangService = {
  async ensureRound(tx: Db, roundId: string, ruleset: Ruleset, now = new Date()): Promise<void> {
    const rules = ruleset.randomEncounters?.gangs;
    if (rules?.enabled) await ensureRoundState(tx, roundId, ruleset, rules, now);
  },

  async candidate(input: { tx: Db; roundPlayerId: string; ruleset: Ruleset; trigger: RandomEncounterTrigger; district?: DistrictKey; state: PlayerState; now: Date; rng?: () => number }): Promise<RandomEncounterEntryRules | null> {
    const rules = input.ruleset.randomEncounters?.gangs;
    if (!rules?.enabled) return null;
    const player = await input.tx.roundPlayer.findUnique({ where: { id: input.roundPlayerId }, select: { roundId: true, cityId: true } });
    if (!player) return null;
    await ensureRoundState(input.tx, player.roundId, input.ruleset, rules, input.now);
    await input.tx.encounterGang.updateMany({ where: { roundId: player.roundId, status: 'DORMANT', dormantUntil: { lte: input.now } }, data: { status: 'ACTIVE', dormantUntil: null, momentum: 0 } });
    const rng = input.rng ?? Math.random;
    let gangs = await input.tx.encounterGang.findMany({
      where: { roundId: player.roundId, cityId: player.cityId, status: 'ACTIVE', OR: [{ dormantUntil: null }, { dormantUntil: { lte: input.now } }] },
      include: { turf: { where: { status: 'HELD' } }, grudges: { where: { roundPlayerId: input.roundPlayerId, expiresAt: { gt: input.now } } } },
    });
    if (!gangs.length) {
      const travelers = await input.tx.encounterGang.findMany({ where: { roundId: player.roundId, status: 'ACTIVE', tier: { in: ['VETERAN', 'KINGPIN'] } }, orderBy: { lastActionAt: 'asc' }, take: 4 });
      for (const gang of travelers) if (await maybeMigrate(input.tx, gang, player.cityId, rules, input.now, rng)) break;
      gangs = await input.tx.encounterGang.findMany({
        where: { roundId: player.roundId, cityId: player.cityId, status: 'ACTIVE' },
        include: { turf: { where: { status: 'HELD' } }, grudges: { where: { roundPlayerId: input.roundPlayerId, expiresAt: { gt: input.now } } } },
      });
    }
    if (!gangs.length) return null;
    const reputation = await input.tx.playerReputation.aggregate({ where: { roundPlayerId: input.roundPlayerId }, _sum: { points: true } });
    const totalRep = reputation._sum.points ?? 0;
    const ranked = gangs
      .map((gang) => ({ gang, score: (gang.grudges.some((grudge) => !grudge.settledAt) ? 100 : 0) + gang.momentum + gang.aggression + (encounterGangTargetFits(gang.targeting, input.state) ? 30 : 0) + rng() * 25 }))
      .sort((a, b) => b.score - a.score);
    const gang = ranked[0]!.gang;
    const personality = rules.personalities[gang.personality] ?? Object.values(rules.personalities)[0]!;
    const onTurf = Boolean(input.district && gang.turf.some((turf) => turf.cityId === player.cityId && turf.district === input.district));
    const lowRep = totalRep < rules.pushBelowReputation && (onTurf || input.trigger === 'TURF');
    const revenge = gang.grudges.some((grudge) => !grudge.settledAt);
    const bountyAvailable = !gang.grudges.some((grudge) => grudge.bountyClaimedAt);
    const move = encounterGangMoveFor(input.trigger, personality.favoriteMove, revenge, lowRep);
    if (input.trigger === 'TURF' && !lowRep && !onTurf) return null;
    if (!encounterGangTargetFits(gang.targeting, input.state) && !revenge && rng() > 0.25) return null;
    const nextActions = Number(root(gang.memory).actions ?? 0) + 1;
    const tier = encounterGangTierAfter(nextActions);
    const attack = ATTACKS.has(move);
    const wantedUntil = attack ? new Date(input.now.getTime() + rules.wantedHours * 3_600_000) : gang.wantedUntil;
    await input.tx.encounterGang.update({
      where: { id: gang.id },
      data: { lastActionAt: input.now, momentum: Math.min(50, gang.momentum + (attack ? 3 : 1)), tier, ...(wantedUntil ? { wantedUntil } : {}), memory: { ...root(gang.memory), actions: nextActions, lastMove: move, lastTarget: input.roundPlayerId, lastAt: input.now.toISOString() } },
    });
    if (attack) {
      await input.tx.encounterGangGrudge.upsert({
        where: { gangId_roundPlayerId: { gangId: gang.id, roundPlayerId: input.roundPlayerId } },
        create: { gangId: gang.id, roundPlayerId: input.roundPlayerId, expiresAt: new Date(input.now.getTime() + rules.retaliationHours * 3_600_000), lastEncounterAt: input.now },
        update: { hits: { increment: 1 }, expiresAt: new Date(input.now.getTime() + rules.retaliationHours * 3_600_000), settledAt: null, lastEncounterAt: input.now },
      });
    }
    const copy = encounterText(gang, move);
    return {
      key: `street-gang:${gang.slug}:${move.toLowerCase()}`,
      title: copy.title,
      text: `${copy.text} ${personality.style}`,
      tone: 'bad',
      weight: 5 + Math.floor(gang.aggression / 15) + (revenge ? 10 : 0),
      choices: choices({ ...gang, tier, wantedUntil }, move, rules, input.now, bountyAvailable),
      ...(input.district ? { districts: [input.district] } : {}),
    };
  },

  async recordChoice(tx: Db, roundPlayerId: string, encounterKey: string, choice: string, now: Date): Promise<void> {
    const match = /^street-gang:([^:]+):([^:]+)$/.exec(encounterKey);
    if (!match) return;
    const gang = await tx.encounterGang.findFirst({ where: { slug: match[1], round: { players: { some: { id: roundPlayerId } } } }, include: { round: true, turf: { where: { status: 'HELD' } } } });
    if (!gang) return;
    if (choice === 'fight-back') {
      const momentum = gang.momentum - 10;
      const gangRules = loadRulesetForRound(gang.round).randomEncounters?.gangs;
      await tx.encounterGang.update({ where: { id: gang.id }, data: { momentum, memory: { ...root(gang.memory), lastLossAt: now.toISOString(), lastLossTo: roundPlayerId } } });
      await tx.encounterGangGrudge.updateMany({
        where: { gangId: gang.id, roundPlayerId },
        data: { settledAt: null, bountyClaimedAt: now, expiresAt: new Date(now.getTime() + (gangRules?.retaliationHours ?? 24) * 3_600_000), lastEncounterAt: now },
      });
      if (momentum <= (gangRules?.dormantBelowMomentum ?? -20)) {
        await tx.encounterGang.update({ where: { id: gang.id }, data: { status: 'DORMANT', dormantUntil: new Date(now.getTime() + (gangRules?.dormantHours ?? 12) * 3_600_000) } });
        await tx.encounterGangTurf.updateMany({ where: { gangId: gang.id, status: 'HELD' }, data: { status: 'ABANDONED', abandonedAt: now } });
      } else if (gang.turf.some((turf) => turf.strength <= 1)) {
        await tx.encounterGangTurf.updateMany({ where: { gangId: gang.id, status: 'HELD', strength: { lte: 1 } }, data: { status: 'ABANDONED', abandonedAt: now } });
      } else if (gang.turf.length) {
        await tx.encounterGangTurf.updateMany({ where: { gangId: gang.id, status: 'HELD' }, data: { strength: { decrement: 1 } } });
      }
    } else if (choice === 'give-ground') {
      await tx.encounterGang.update({ where: { id: gang.id }, data: { momentum: Math.min(50, gang.momentum + 4), memory: { ...root(gang.memory), lastWinAt: now.toISOString() } } });
      if (match[2] === 'revenge') await tx.encounterGangGrudge.updateMany({ where: { gangId: gang.id, roundPlayerId }, data: { settledAt: now } });
      if (gang.turf.length) await tx.encounterGangTurf.updateMany({ where: { gangId: gang.id, status: 'HELD' }, data: { strength: { increment: 1 } } });
    }
  },
};
