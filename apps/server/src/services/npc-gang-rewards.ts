import type { Prisma, PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type { NpcGangRewardRules, NpcGangTier } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { storedDormancy } from './npc-gang-momentum.js';
import { npcIdentity, npcPersonality } from './npc-gang-personality.js';
import { npcRules } from './npc-gang-rules.js';

/**
 * Phase N. What beating an NPC gang is worth, city relief after one goes to ground,
 * and when a beaten or broken crew breaks up for the round.
 */

export const NPC_BOUNTY_SOURCE = 'NPC_BOUNTY';

export type NpcBountyBlock = 'DISABLED' | 'NOT_WANTED' | 'PLAYER_DAILY_CAP' | 'CREW_COOLDOWN' | 'CREW_DAILY_CAP';

/** The bounty for one win, before caps: the crew's tier price, scaled down for a defense. */
export function npcBountyCents(tier: string, role: 'ATTACKER' | 'DEFENDER', rules: NpcGangRewardRules): number {
  const base = rules.bountyCents[tier as NpcGangTier] ?? rules.bountyCents.SCRUB;
  return Math.max(0, Math.round(role === 'ATTACKER' ? base : base * rules.defenseShare));
}

/** Why a win pays nothing, or null when it pays. Checked in this order. */
export function npcBountyBlock(input: {
  rules: NpcGangRewardRules;
  wanted: boolean;
  playerToday: number;
  playerCrewRecent: number;
  crewToday: number;
}): NpcBountyBlock | null {
  const { rules } = input;
  if (!rules.enabled) return 'DISABLED';
  if (!input.wanted) return 'NOT_WANTED';
  if (input.playerToday >= rules.maxPerPlayerPerDay) return 'PLAYER_DAILY_CAP';
  if (input.playerCrewRecent > 0) return 'CREW_COOLDOWN';
  if (input.crewToday >= rules.maxPerCrewPerDay) return 'CREW_DAILY_CAP';
  return null;
}

export interface NpcBattleOutcome {
  /** True when that side of the battle is a server-run crew. */
  attackerNpc: boolean;
  defenderNpc: boolean;
  bounty: { playerId: string; cents: number; crew: string } | null;
}

/** Whether a crew has hit a human inside the window: only those crews carry a bounty. */
export async function npcWanted(db: Db | PrismaClient, gangPlayerId: string, rules: NpcGangRewardRules, now: Date): Promise<boolean> {
  const hit = await db.raidBattle.findFirst({
    where: {
      attackerId: gangPlayerId,
      createdAt: { gte: new Date(now.getTime() - Math.max(1, rules.wantedHours) * 3_600_000) },
      voidedAt: null,
      defender: { npcGang: { is: null } },
    },
    select: { id: true },
  });
  return Boolean(hit);
}

/**
 * Phase N. Called inside a combat transaction after both players are written. Marks
 * which sides are NPC crews (for reports, activity and contracts), and pays a capped
 * bounty when a human beats a wanted crew. The bounty is house money, logged in the
 * economy ledger with the battle and crew, so the caps are read back from it.
 */
export async function npcBattleOutcome(tx: Db, input: {
  battleId: string;
  attackerId: string;
  defenderId: string;
  attackerWon: boolean;
  kind: string;
  ruleset: Ruleset;
  now: Date;
}): Promise<NpcBattleOutcome> {
  const gangs = await tx.npcGang.findMany({
    where: { roundPlayerId: { in: [input.attackerId, input.defenderId] } },
    select: { id: true, roundPlayerId: true, tier: true, archetype: true, memory: true },
  });
  const attackerGang = gangs.find((gang) => gang.roundPlayerId === input.attackerId);
  const defenderGang = gangs.find((gang) => gang.roundPlayerId === input.defenderId);
  const outcome: NpcBattleOutcome = { attackerNpc: Boolean(attackerGang), defenderNpc: Boolean(defenderGang), bounty: null };
  const gang = attackerGang ?? defenderGang;
  if (!gang || (attackerGang && defenderGang)) return outcome;

  const humanIsAttacker = !attackerGang;
  const humanWon = humanIsAttacker ? input.attackerWon : !input.attackerWon;
  if (!humanWon) return outcome;
  const humanId = humanIsAttacker ? input.attackerId : input.defenderId;
  const gangRules = npcRules(input.ruleset);
  const rules = gangRules.rewards;
  if (!rules.enabled) return outcome;

  const day = new Date(input.now.getTime() - 24 * 3_600_000);
  const crewSince = new Date(input.now.getTime() - Math.max(1, rules.perCrewCooldownHours) * 3_600_000);
  const byCrew = { path: ['npcGangId'], equals: gang.id } satisfies Prisma.JsonNullableFilter;
  const [wanted, playerToday, playerCrewRecent, crewToday] = await Promise.all([
    // A crew that just hit this human is wanted for that very hit, which is not saved yet.
    humanIsAttacker ? npcWanted(tx, gang.roundPlayerId, rules, input.now) : Promise.resolve(true),
    tx.economyLedgerEntry.count({ where: { roundPlayerId: humanId, source: NPC_BOUNTY_SOURCE, createdAt: { gte: day } } }),
    tx.economyLedgerEntry.count({ where: { roundPlayerId: humanId, source: NPC_BOUNTY_SOURCE, createdAt: { gte: crewSince }, metadata: byCrew } }),
    tx.economyLedgerEntry.count({ where: { source: NPC_BOUNTY_SOURCE, createdAt: { gte: day }, metadata: byCrew } }),
  ]);
  if (npcBountyBlock({ rules, wanted, playerToday, playerCrewRecent, crewToday })) return outcome;

  const cents = npcBountyCents(gang.tier, humanIsAttacker ? 'ATTACKER' : 'DEFENDER', rules);
  if (cents <= 0) return outcome;
  const crew = npcIdentity(npcPersonality(gangRules, gang.archetype), gang.id, gang.memory).name;

  // Net worth carries cash at the ruleset's cash weight; the next settle recomputes it exactly.
  const worth = (BigInt(cents) * BigInt(input.ruleset.economy.netWorth.cashWeightPercent)) / 100n;
  await tx.roundPlayer.update({ where: { id: humanId }, data: { cashCents: { increment: BigInt(cents) }, netWorthCents: { increment: worth } } });
  await EconomyLedgerService.record(tx, humanId, [{
    source: NPC_BOUNTY_SOURCE,
    label: `Bounty · ${crew}`,
    amountCents: cents,
    metadata: { battleId: input.battleId, npcGangId: gang.id, crew, kind: input.kind, role: humanIsAttacker ? 'ATTACKER' : 'DEFENDER' },
  }], input.now);
  outcome.bounty = { playerId: humanId, cents, crew };
  return outcome;
}

/** What a player's own report and activity say about the NPC side of a battle. */
export function npcBattleNotes(outcome: NpcBattleOutcome, playerId: string, isAttacker: boolean) {
  const opponentNpc = isAttacker ? outcome.defenderNpc : outcome.attackerNpc;
  const bounty = outcome.bounty && outcome.bounty.playerId === playerId ? outcome.bounty : null;
  return {
    ...(opponentNpc ? { opponentNpc: true } : {}),
    ...(bounty ? { npcBounty: { cents: bounty.cents, crew: bounty.crew } } : {}),
  };
}

/**
 * Relief: a crew humans sent to ground inside `reliefHours` keeps the rest of its city
 * standing down. Returns that crew's id and when relief ends, or null.
 */
export async function npcCityRelief(db: Db | PrismaClient, input: { roundId: string; cityId: string; excludeGangId?: string; ruleset: Ruleset; now: Date }): Promise<{ gangId: string; archetype: string; memory: Prisma.JsonValue; until: Date } | null> {
  const rules = npcRules(input.ruleset).rewards;
  if (!rules.enabled || rules.reliefHours <= 0) return null;
  const grounded = await db.npcGang.findMany({
    where: {
      dormantUntil: { gt: input.now },
      roundPlayer: { roundId: input.roundId, cityId: input.cityId },
      ...(input.excludeGangId ? { id: { not: input.excludeGangId } } : {}),
    },
    select: { id: true, archetype: true, memory: true },
  });
  let best: { gangId: string; archetype: string; memory: Prisma.JsonValue; until: Date } | null = null;
  for (const gang of grounded) {
    // A crew that went to ground or broke up most recently sets the clock.
    const since = Math.max(Date.parse(storedDormancy(gang.memory)?.since ?? '') || 0, Date.parse(storedRetirement(gang.memory)?.at ?? '') || 0);
    if (!since) continue;
    const until = new Date(since + rules.reliefHours * 3_600_000);
    if (until <= input.now) continue;
    if (!best || until > best.until) best = { gangId: gang.id, archetype: gang.archetype, memory: gang.memory, until };
  }
  return best;
}

export function storedRetirement(memory: Prisma.JsonValue): { reason: string; at: string } | null {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return null;
  const row = memory.retired;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  return typeof row.reason === 'string' && typeof row.at === 'string' ? { reason: row.reason, at: row.at } : null;
}

/** Whether a crew is finished for the round: gone to ground too often, or woke up broken. */
export function npcRetireReason(input: { dormancies: number; woke: boolean; thugs: number; rules: NpcGangRewardRules }): 'GROUNDED_TOO_OFTEN' | 'BROKEN' | null {
  if (!input.rules.enabled) return null;
  if (input.dormancies >= input.rules.retireAfterDormancies) return 'GROUNDED_TOO_OFTEN';
  if (input.woke && input.thugs < input.rules.retireBelowThugs) return 'BROKEN';
  return null;
}
