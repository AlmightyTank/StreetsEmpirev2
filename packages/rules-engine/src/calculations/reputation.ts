/**
 * Standing with the traders.
 *
 * Reputation is per-trader; the gun ladder reads the total. Everything here is
 * a pure function of a player's four scores and the ruleset - there is no
 * clock and no randomness, so a receipt can always be recomputed.
 */

import type {
  QuestKey,
  QuestRule,
  ReputationTier,
  Ruleset,
  TraderKey,
} from '@streets/rulesets';

/** One trader's standing, as it is stored. */
export interface TraderStanding {
  points: number;
  /** Day the regular-trade credit was last paid, or null. */
  creditedOn: Date | null;
  questDone: boolean;
}

export type Standings = Record<TraderKey, TraderStanding>;

export function traderKeys(ruleset: Ruleset): TraderKey[] {
  return Object.keys(ruleset.stores) as TraderKey[];
}

/** A player who has never traded with anyone. */
export function emptyStandings(ruleset: Ruleset): Standings {
  const out = {} as Standings;
  for (const key of traderKeys(ruleset)) {
    out[key] = { points: 0, creditedOn: null, questDone: false };
  }
  return out;
}

export function totalReputation(standings: Standings): number {
  return Object.values(standings).reduce<number>((sum, s) => sum + s.points, 0);
}

/** The highest tier this many points reaches. */
export function tierFor(points: number, ruleset: Ruleset): ReputationTier {
  const tiers = ruleset.reputation.tiers;
  let found = tiers[0]!;
  for (const tier of tiers) if (points >= tier.at) found = tier;
  return found;
}

/**
 * How much sooner this trader restocks for you.
 *
 * Speed only. Callers must never apply this to a shelf cap - see
 * `reputation.tiers` in the ruleset for why.
 */
export function restockSpeedup(points: number, ruleset: Ruleset): number {
  return tierFor(points, ruleset).restockSpeedup;
}

/** Minutes between deliveries for a player at this standing. */
export function restockIntervalFor(
  intervalMinutes: number,
  points: number,
  ruleset: Ruleset,
): number {
  const shortened = intervalMinutes * (1 - restockSpeedup(points, ruleset));
  // Never below a minute, whatever a variant ruleset does with the tiers.
  return Math.max(1, Math.round(shortened));
}

/** Two dates fall on the same calendar day in UTC. */
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export interface TradeCredit {
  points: number;
  gained: number;
  creditedOn: Date;
  /** False when today's credit was already paid, or the trade cap is reached. */
  credited: boolean;
}

/**
 * Being a regular, paid at most once per trader per day.
 *
 * Capped separately from quest points, so no amount of showing up can reach a
 * gate the favours are meant to guard. The cap is on trade points alone, which
 * is why the quest bonus is tracked as a flag rather than folded into the same
 * running total.
 */
export function creditDailyTrade(
  standing: TraderStanding,
  now: Date,
  ruleset: Ruleset,
): TradeCredit {
  const rules = ruleset.reputation;
  const questPoints = standing.questDone ? rules.questPoints : 0;
  const fromTrade = Math.max(0, standing.points - questPoints);

  const alreadyToday = standing.creditedOn !== null && sameDay(standing.creditedOn, now);
  const room = rules.trade.maxPoints - fromTrade;

  if (alreadyToday || room <= 0) {
    return {
      points: standing.points,
      gained: 0,
      creditedOn: standing.creditedOn ?? now,
      credited: false,
    };
  }

  const gained = Math.min(rules.trade.pointsPerDay, room);
  return {
    points: Math.min(rules.perTraderMax, standing.points + gained),
    gained,
    creditedOn: now,
    credited: true,
  };
}

export class QuestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** What a quest wants, and whether the player is holding it. */
export interface QuestProgress {
  key: QuestKey;
  traderName: string;
  title: string;
  description: string;
  done: boolean;
  /** Progress toward the goal, and what it takes. */
  have: number;
  need: number;
  /** Extra condition that is not the counted goal, e.g. Tommy's crew size. */
  blockedBy: string | null;
  canComplete: boolean;
  reward: number;
}

/** Everything a quest can read off a player. */
export interface QuestPlayer {
  crack: number;
  thugs: number;
  lowRiders: number;
  cleanShiftStreak: number;
  /** Rocks sold to Pip, cumulative for the round. */
  rocksSuppliedToPip: number;
  /** Drive-bys carried out this round, landed or not. */
  driveBys: number;
}

function goalProgress(
  quest: QuestRule,
  player: QuestPlayer,
): { have: number; need: number; blockedBy: string | null } {
  switch (quest.goal.kind) {
    case 'CLEAN_SHIFTS':
      return { have: player.cleanShiftStreak, need: quest.goal.trips, blockedBy: null };
    case 'DELIVER_CRACK':
      return {
        have: player.crack,
        need: quest.goal.crack,
        blockedBy:
          player.thugs >= quest.goal.thugs
            ? null
            : `Tommy wants to see ${quest.goal.thugs} thugs on your crew first.`,
      };
    case 'HAND_OVER_LOW_RIDER':
      return { have: player.lowRiders, need: quest.goal.lowRiders, blockedBy: null };
    case 'SUPPLY_ROCKS':
      return { have: player.rocksSuppliedToPip, need: quest.goal.crackSold, blockedBy: null };
    case 'DRIVE_BY':
      // Charlie wants to see a car used. Win or lose, a run counts. If the
      // run already happened, he does not care whether the car survived it.
      return {
        have: player.driveBys,
        need: quest.goal.driveBys,
        blockedBy: player.driveBys < quest.goal.driveBys && player.lowRiders < 1
          ? 'Charlie wants you to buy a Low-Rider and use it in a drive-by.'
          : null,
      };
  }
}

export function questProgress(
  key: QuestKey,
  player: QuestPlayer,
  standings: Standings,
  ruleset: Ruleset,
): QuestProgress {
  const quest = ruleset.quests[key];
  const done = standings[key]?.questDone ?? false;
  const { have, need, blockedBy } = goalProgress(quest, player);

  return {
    key,
    traderName: ruleset.stores[key].name,
    title: quest.title,
    description: quest.description,
    done,
    have,
    need,
    blockedBy,
    canComplete: !done && have >= need && blockedBy === null,
    reward: ruleset.reputation.questPoints,
  };
}

export interface QuestCompletion {
  key: QuestKey;
  pointsGained: number;
  /** What handing the favour over takes off the player. */
  spend: { crack: number; lowRiders: number };
  /** Reset to zero once the clerk has seen the streak. */
  clearsCleanShiftStreak: boolean;
}

/**
 * Completing a favour. Grants standing and takes the goods; it never grants a
 * weapon directly - the gun ladder reads the resulting total on its own.
 */
export function calculateQuestCompletion(
  key: string,
  player: QuestPlayer,
  standings: Standings,
  ruleset: Ruleset,
): QuestCompletion {
  if (!Object.hasOwn(ruleset.quests, key)) {
    throw new QuestError('UNKNOWN_QUEST', 'Nobody in this city is asking for that.');
  }

  const questKey = key as QuestKey;
  const progress = questProgress(questKey, player, standings, ruleset);

  if (progress.done) {
    throw new QuestError('QUEST_DONE', `${progress.traderName} already owes you for that one.`);
  }
  if (progress.blockedBy) {
    throw new QuestError('QUEST_BLOCKED', progress.blockedBy);
  }
  if (progress.have < progress.need) {
    throw new QuestError(
      'QUEST_INCOMPLETE',
      `${progress.traderName} wants ${progress.need.toLocaleString('en-US')} and you have ${progress.have.toLocaleString('en-US')}.`,
    );
  }

  const goal = ruleset.quests[questKey].goal;

  return {
    key: questKey,
    pointsGained: ruleset.reputation.questPoints,
    spend: {
      crack: goal.kind === 'DELIVER_CRACK' ? goal.crack : 0,
      lowRiders: goal.kind === 'HAND_OVER_LOW_RIDER' ? goal.lowRiders : 0,
    },
    clearsCleanShiftStreak: goal.kind === 'CLEAN_SHIFTS',
  };
}
