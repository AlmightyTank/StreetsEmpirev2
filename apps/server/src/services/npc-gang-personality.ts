import type { Prisma } from '@prisma/client';
import { hashParts } from '@streets/rules-engine';
import type { NpcGangPersonality, NpcGangRules, NpcGangTargeting } from '@streets/rulesets';

/**
 * Phase M. Who a gang is on the street: its personality (from the archetype), its crew
 * name and tag, and a short history the scheduler keeps so players can read its
 * reputation. Reputation is phrased in bands, never exact stats.
 */

export interface NpcGangPersonalityView {
  key: string;
  personality: NpcGangPersonality;
}

/** Exact key, then exact alias, then alias substring; otherwise the ruleset default. */
export function npcPersonality(rules: Pick<NpcGangRules, 'personalities' | 'defaultPersonality'>, archetype: string): NpcGangPersonalityView {
  const wanted = archetype.toLowerCase();
  const entries = Object.entries(rules.personalities);
  const found = entries.find(([key]) => key === wanted)
    ?? entries.find(([, personality]) => personality.aliases.includes(wanted))
    ?? entries.find(([, personality]) => personality.aliases.some((alias) => wanted.includes(alias)));
  if (found) return { key: found[0], personality: found[1] };
  const fallback = rules.personalities[rules.defaultPersonality] ?? entries[0]?.[1];
  if (!fallback) throw new Error('No NPC gang personalities are configured.');
  return { key: rules.personalities[rules.defaultPersonality] ? rules.defaultPersonality : entries[0]![0], personality: fallback };
}

function memoryRoot(memory: Prisma.JsonValue): Prisma.JsonObject {
  return memory && typeof memory === 'object' && !Array.isArray(memory) ? memory as Prisma.JsonObject : {};
}

/** A seeded name wins; otherwise the gang id picks one of the personality's names, stable for life. */
export function npcIdentity(view: NpcGangPersonalityView, gangId: string, memory: Prisma.JsonValue): { name: string; tag: string } {
  const identity = memoryRoot(memoryRoot(memory).identity as Prisma.JsonValue);
  if (typeof identity.name === 'string' && identity.name && typeof identity.tag === 'string' && identity.tag) {
    return { name: identity.name, tag: identity.tag };
  }
  const names = view.personality.names;
  if (!names.length) return { name: view.personality.label, tag: view.key.slice(0, 4).toUpperCase() };
  const pick = names[Math.abs(hashParts(gangId, 'crew-name')) % names.length]!;
  return { name: pick.name, tag: pick.tag };
}

export interface NpcTargetTraits {
  id: string;
  thugs: number;
  woundedThugs: number;
  postedThugs: number;
  businessThugs: number;
  lowRiders: number;
  crack: number;
  whoreHappiness: number;
  thugHappiness: number;
  lastRaidedAt: Date | null;
}

/**
 * Orders ordinary targets by the crew's habit. The list arrives richest first, so
 * RICHEST keeps it; every other style is a stable re-sort on top of that.
 */
export function orderByTargeting<T extends NpcTargetTraits>(targets: readonly T[], targeting: NpcGangTargeting): T[] {
  const ranked = targets.map((target, index) => ({ target, index }));
  const score = (target: T): number => {
    if (targeting === 'WEAKEST') return -(target.thugs - target.woundedThugs - target.postedThugs - target.businessThugs);
    if (targeting === 'RIDES') return target.lowRiders;
    if (targeting === 'PRODUCT') return target.crack;
    if (targeting === 'DISTRACTED') {
      const wounded = target.thugs > 0 ? target.woundedThugs / target.thugs : 0;
      const unhappy = (200 - target.whoreHappiness - target.thugHappiness) / 200;
      const recentlyHit = target.lastRaidedAt ? 1 : 0;
      return wounded * 2 + unhappy + recentlyHit;
    }
    return 0;
  };
  if (targeting === 'RICHEST') return [...targets];
  return ranked
    .sort((left, right) => score(right.target) - score(left.target) || left.index - right.index)
    .map((row) => row.target);
}

/** What the scheduler remembers about a gang's record. */
export interface NpcHistory {
  wins: number;
  losses: number;
  /** Times each move landed, keyed RAID, DRIVE_BY, STEAL_RIDE, DRUG_HOES, LURE_CREW, CLAIM. */
  moves: Record<string, number>;
  biggestHit: { cents: number; target: string; at: string } | null;
  lastLoss: { opponent: string; kind: string; at: string } | null;
}

export const EMPTY_HISTORY: NpcHistory = { wins: 0, losses: 0, moves: {}, biggestHit: null, lastLoss: null };

export function storedHistory(memory: Prisma.JsonValue): NpcHistory {
  const root = memoryRoot(memoryRoot(memory).history as Prisma.JsonValue);
  const moves = memoryRoot(root.moves as Prisma.JsonValue);
  const big = memoryRoot(root.biggestHit as Prisma.JsonValue);
  const loss = memoryRoot(root.lastLoss as Prisma.JsonValue);
  return {
    wins: typeof root.wins === 'number' ? root.wins : 0,
    losses: typeof root.losses === 'number' ? root.losses : 0,
    moves: Object.fromEntries(Object.entries(moves).filter((entry): entry is [string, number] => typeof entry[1] === 'number')),
    biggestHit: typeof big.cents === 'number' && typeof big.target === 'string' && typeof big.at === 'string'
      ? { cents: big.cents, target: big.target, at: big.at }
      : null,
    lastLoss: typeof loss.opponent === 'string' && typeof loss.kind === 'string' && typeof loss.at === 'string'
      ? { opponent: loss.opponent, kind: loss.kind, at: loss.at }
      : null,
  };
}

/** One of the gang's own hits, from its side. */
export interface NpcHitEvent {
  kind: string;
  won: boolean;
  cashCents: number;
  target: string;
  at: string;
}

export function withHit(history: NpcHistory, hit: NpcHitEvent): NpcHistory {
  const moves = hit.won ? { ...history.moves, [hit.kind]: (history.moves[hit.kind] ?? 0) + 1 } : history.moves;
  const bigger = hit.won && hit.cashCents > 0 && (!history.biggestHit || hit.cashCents > history.biggestHit.cents);
  return {
    wins: history.wins + (hit.won ? 1 : 0),
    losses: history.losses + (hit.won ? 0 : 1),
    moves,
    biggestHit: bigger ? { cents: hit.cashCents, target: hit.target, at: hit.at } : history.biggestHit,
    lastLoss: hit.won ? history.lastLoss : { opponent: hit.target, kind: hit.kind, at: hit.at },
  };
}

/** Keeps the newer of the stored last loss and one seen in the gang's fights. */
export function withLoss(history: NpcHistory, loss: NpcHistory['lastLoss']): NpcHistory {
  if (!loss) return history;
  if (history.lastLoss && Date.parse(history.lastLoss.at) >= Date.parse(loss.at)) return history;
  return { ...history, lastLoss: loss };
}

export function favoriteMove(history: NpcHistory): string | null {
  const best = Object.entries(history.moves).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  return best && best[1] >= 2 ? best[0] : null;
}

const MOVE_WORDS: Record<string, string> = {
  RAID: 'cash raids',
  DRIVE_BY: 'drive-bys',
  STEAL_RIDE: 'stealing rides',
  DRUG_HOES: 'drugging hoes',
  LURE_CREW: 'luring crews away',
  CLAIM: 'taking corners',
};

function scoreBand(cents: number): string {
  if (cents >= 10_000_000) return 'a six-figure score';
  if (cents >= 1_000_000) return 'a five-figure score';
  if (cents >= 100_000) return 'a decent score';
  return 'a small score';
}

/**
 * Up to three public lines on how a crew has been running. Bands and names only;
 * no counts, no exact money.
 */
export function npcReputation(history: NpcHistory, now: Date): string[] {
  const lines: string[] = [];
  const favorite = favoriteMove(history);
  if (favorite) lines.push(`Known for ${MOVE_WORDS[favorite] ?? favorite.toLowerCase().replace(/_/g, ' ')}.`);
  if (history.biggestHit && now.getTime() - Date.parse(history.biggestHit.at) < 7 * 24 * 3_600_000) {
    lines.push(`Took ${scoreBand(history.biggestHit.cents)} off ${history.biggestHit.target} this week.`);
  }
  if (history.lastLoss && now.getTime() - Date.parse(history.lastLoss.at) < 48 * 3_600_000) {
    lines.push(`Got sent home by ${history.lastLoss.opponent} lately.`);
  }
  const fights = history.wins + history.losses;
  if (lines.length < 3 && fights >= 5) {
    const share = history.wins / fights;
    lines.push(share >= 0.65 ? 'Wins far more than it loses.' : share <= 0.35 ? 'Loses more fights than it wins.' : 'Trades wins and losses.');
  }
  return lines.slice(0, 3);
}

export function historyJson(history: NpcHistory): Prisma.InputJsonObject {
  return {
    wins: history.wins,
    losses: history.losses,
    moves: { ...history.moves },
    biggestHit: history.biggestHit ? { ...history.biggestHit } : null,
    lastLoss: history.lastLoss ? { ...history.lastLoss } : null,
  };
}
