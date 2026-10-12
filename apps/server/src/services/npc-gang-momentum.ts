import type { Prisma, PrismaClient } from '@prisma/client';
import type { NpcGangEscalationRules } from '@streets/rulesets';

/**
 * Phase L. How a gang's own fights heat it up or cool it down. Momentum is rebuilt
 * from raid battles each tick, so it never drifts from what actually happened.
 */

export interface NpcFight {
  /** True when the gang threw the hit. */
  attacker: boolean;
  /** From the gang's side. */
  won: boolean;
  /** Cash the gang took, when it was the attacker. */
  cashCents: number;
  /** The other side is a human crew. */
  human: boolean;
  /** Phase M. Who was on the other side, and what kind of hit it was. */
  opponent: string;
  kind: string;
  at: Date;
}

export type NpcMood = 'HOT' | 'STEADY' | 'COOLED';
export type NpcDormancyReason = 'BEATEN' | 'OVER_TARGETED';

function fade(at: Date, now: Date, halfLifeHours: number): number {
  const hours = Math.max(0, now.getTime() - at.getTime()) / 3_600_000;
  return Math.pow(0.5, hours / Math.max(0.1, halfLifeHours));
}

export function npcMomentum(fights: readonly NpcFight[], blockedStreak: number, rules: NpcGangEscalationRules, now: Date): number {
  if (!rules.enabled) return 0;
  let score = 0;
  for (const fight of fights) {
    const base = fight.attacker
      ? (fight.won ? rules.attackWin + (fight.cashCents > 0 ? rules.profitBonus : 0) : -rules.attackLoss)
      : (fight.won ? rules.defendWin : -rules.defendLoss);
    score += base * fade(fight.at, now, rules.halfLifeHours);
  }
  score -= Math.max(0, blockedStreak) * rules.blockedPenalty;
  const max = Math.max(1, rules.maxMomentum);
  return Math.round(Math.max(-max, Math.min(max, score)) * 10) / 10;
}

export function npcMood(momentum: number, rules: NpcGangEscalationRules): NpcMood {
  if (momentum >= rules.hotAt) return 'HOT';
  if (momentum <= rules.coolAt) return 'COOLED';
  return 'STEADY';
}

/** Aggression a gang gains (hot) or loses (cooled) on top of its trait. */
export function momentumAggression(momentum: number, rules: NpcGangEscalationRules): number {
  const shift = Math.round(momentum * rules.aggressionPerPoint);
  return Math.max(-rules.maxAggressionShift, Math.min(rules.maxAggressionShift, shift));
}

/** Multiplies the wait before the next move: below 1 when hot, above 1 when cooled. */
export function momentumPace(momentum: number, rules: NpcGangEscalationRules): number {
  if (!rules.enabled) return 1;
  return 1 - (momentum / Math.max(1, rules.maxMomentum)) * rules.maxPaceShift;
}

/**
 * Whether the gang should go to ground, and for how long. Being hit by too many humans
 * sends it down for the longest stretch; otherwise the deeper the hole, the longer.
 */
export function dormancyCall(input: { momentum: number; humanHits: number; rules: NpcGangEscalationRules }): { reason: NpcDormancyReason; hours: number } | null {
  const { rules } = input;
  if (!rules.enabled) return null;
  if (input.humanHits >= rules.overTargetedHits) return { reason: 'OVER_TARGETED', hours: rules.dormantMaxHours };
  if (input.momentum > rules.dormantBelow) return null;
  const span = Math.max(1, rules.maxMomentum + rules.dormantBelow);
  const depth = Math.max(0, Math.min(1, (rules.dormantBelow - input.momentum) / span));
  return { reason: 'BEATEN', hours: Math.round((rules.dormantMinHours + (rules.dormantMaxHours - rules.dormantMinHours) * depth) * 10) / 10 };
}

function wonFromReport(report: Prisma.JsonValue): { won: boolean; cashCents: number } | null {
  if (!report || typeof report !== 'object' || Array.isArray(report) || typeof report.won !== 'boolean') return null;
  return { won: report.won, cashCents: typeof report.cashChangeCents === 'number' ? report.cashChangeCents : 0 };
}

function reportKind(report: Prisma.JsonValue): string | null {
  return report && typeof report === 'object' && !Array.isArray(report) && typeof report.kind === 'string' ? report.kind : null;
}

/** The gang's fights since `since`, from its own side. */
export async function loadNpcFights(prisma: PrismaClient, roundPlayerId: string, since: Date): Promise<NpcFight[]> {
  const rows = await prisma.raidBattle.findMany({
    where: { OR: [{ attackerId: roundPlayerId }, { defenderId: roundPlayerId }], createdAt: { gte: since }, voidedAt: null },
    select: {
      attackerId: true,
      attackerReport: true,
      kind: true,
      createdAt: true,
      attacker: { select: { displayName: true, npcGang: { select: { id: true } } } },
      defender: { select: { displayName: true, npcGang: { select: { id: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.flatMap((row): NpcFight[] => {
    const result = wonFromReport(row.attackerReport);
    if (!result) return [];
    const attacker = row.attackerId === roundPlayerId;
    return [{
      attacker,
      won: attacker ? result.won : !result.won,
      cashCents: attacker ? Math.max(0, result.cashCents) : 0,
      human: attacker ? !row.defender.npcGang : !row.attacker.npcGang,
      opponent: attacker ? row.defender.displayName : row.attacker.displayName,
      kind: reportKind(row.attackerReport) ?? row.kind,
      at: row.createdAt,
    }];
  });
}

/** Phase L memory: the last dormancy, kept so a waking gang starts on a clean slate. */
export interface NpcDormancy {
  reason: NpcDormancyReason;
  since: string;
  until: string;
  momentum: number;
  wokeAt: string | null;
}

export function storedDormancy(memory: Prisma.JsonValue): NpcDormancy | null {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return null;
  const row = memory.dormancy;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const { reason, since, until, momentum, wokeAt } = row;
  if ((reason !== 'BEATEN' && reason !== 'OVER_TARGETED') || typeof since !== 'string' || typeof until !== 'string') return null;
  return { reason, since, until, momentum: typeof momentum === 'number' ? momentum : 0, wokeAt: typeof wokeAt === 'string' ? wokeAt : null };
}

export function storedMomentum(memory: Prisma.JsonValue): number {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return 0;
  return typeof memory.momentum === 'number' && Number.isFinite(memory.momentum) ? memory.momentum : 0;
}
