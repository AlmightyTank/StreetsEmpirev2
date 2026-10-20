/** Street skill catalog. Slice B adds passive effects; choices remain deferred. */
export const STREET_SKILL_KEYS = ['HUSTLE', 'MUSCLE', 'WHEELS', 'FIXER', 'CONNECTIONS', 'LUCK'] as const;
export type StreetSkillKey = (typeof STREET_SKILL_KEYS)[number];

export type StreetSkillModifierCategory = 'ECONOMY' | 'COMBAT' | 'COST' | 'HEAT' | 'RECOVERY' | 'VEHICLE' | 'LUCK';

export interface StreetSkillPassive {
  readonly effectId: string;
  readonly category: StreetSkillModifierCategory;
  readonly label: string;
  readonly maxPercent: number;
}

export interface StreetSkillMilestoneChoice {
  readonly key: string;
  readonly label: string;
  readonly description: string;
}

export interface StreetSkillMilestone {
  readonly threshold: 10 | 25 | 40;
  readonly choices: readonly [StreetSkillMilestoneChoice, StreetSkillMilestoneChoice];
}

export interface StreetSkillSource {
  readonly key: string;
  readonly skill: StreetSkillKey;
  readonly label: string;
  readonly baseXp: number;
  readonly actionPrefixes: readonly string[];
  readonly lossMultiplier?: number;
}

export interface StreetSkillsRules {
  readonly enabled: true;
  readonly totalPointCap: 100;
  readonly skillPointCap: 40;
  /** Cumulative XP cost for each point: point * xpPerPoint. */
  readonly xpPerPoint: number;
  readonly dailyFullXp: number;
  readonly dailyHalfXp: number;
  readonly catchUp: {
    readonly fullMultiplier: 2;
    readonly fullDays: 3;
    readonly reducedMultiplier: 1.5;
    readonly reducedDays: 3;
  };
  readonly modifierCaps: readonly { readonly category: StreetSkillModifierCategory; readonly maxPercent: number }[];
  readonly passives: readonly StreetSkillPassive[];
  readonly milestones: Readonly<Partial<Record<StreetSkillKey, readonly StreetSkillMilestone[]>>>;
  readonly respec: { readonly baseCostCents: number; readonly cooldownHours: number };
  readonly sources: readonly StreetSkillSource[];
}

export const STREET_SKILLS_V1: StreetSkillsRules = {
  enabled: true,
  totalPointCap: 100,
  skillPointCap: 40,
  xpPerPoint: 100,
  dailyFullXp: 1_000,
  dailyHalfXp: 2_000,
  catchUp: { fullMultiplier: 2, fullDays: 3, reducedMultiplier: 1.5, reducedDays: 3 },
  modifierCaps: [
    { category: 'ECONOMY', maxPercent: 12 },
    { category: 'COMBAT', maxPercent: 8 },
    { category: 'COST', maxPercent: 25 },
    { category: 'HEAT', maxPercent: 15 },
    { category: 'RECOVERY', maxPercent: 25 },
    { category: 'VEHICLE', maxPercent: 15 },
    { category: 'LUCK', maxPercent: 10 },
  ],
  passives: [
    { effectId: 'HUSTLE_INCOME', category: 'ECONOMY', label: 'Hustle · crew and store income', maxPercent: 6 },
    { effectId: 'MUSCLE_RECOVERY', category: 'RECOVERY', label: 'Muscle · wounded-thug recovery', maxPercent: -15 },
    { effectId: 'MUSCLE_FIGHT_COST', category: 'COST', label: 'Muscle · fight rounds', maxPercent: -10 },
    { effectId: 'WHEELS_RUN_FEES', category: 'COST', label: 'Wheels · run fees', maxPercent: -15 },
    { effectId: 'WHEELS_VEHICLE_DAMAGE', category: 'VEHICLE', label: 'Wheels · vehicle damage chance', maxPercent: -10 },
    { effectId: 'FIXER_HEAT_GAIN', category: 'HEAT', label: 'Fixer · heat gained', maxPercent: -15 },
    { effectId: 'FIXER_HEAT_COOLING', category: 'HEAT', label: 'Fixer · heat cooling', maxPercent: 15 },
    { effectId: 'CONNECTIONS_TOLLS', category: 'COST', label: 'Connections · territory tolls', maxPercent: -20 },
    { effectId: 'CONNECTIONS_SUPPLY', category: 'COST', label: 'Connections · supply orders', maxPercent: -10 },
    { effectId: 'LUCK_OUTCOMES', category: 'LUCK', label: 'Luck · favorable random outcomes', maxPercent: 10 },
  ],
  milestones: {
    HUSTLE: [
      { threshold: 10, choices: [{ key: 'SWEET_TALKER', label: 'Sweet Talker', description: 'Crew happiness falls slower.' }, { key: 'BULK_SELLER', label: 'Bulk Seller', description: 'Better price on large product sales.' }] },
      { threshold: 25, choices: [{ key: 'FRONT_MAN', label: 'Front Man', description: 'Increase business income.' }, { key: 'STREET_CREDIT', label: 'Street Credit', description: 'Improve loan terms.' }] },
      { threshold: 40, choices: [{ key: 'KINGPINS_CUT', label: "Kingpin's Cut", description: 'Increase cash from territory caches.' }, { key: 'UNTAXED', label: 'Untaxed', description: 'Halve store sell-back losses.' }] },
    ],
    MUSCLE: [
      { threshold: 10, choices: [{ key: 'HOLD_THE_LINE', label: 'Hold the Line', description: 'Increase defense strength.' }, { key: 'HIT_FIRST', label: 'Hit First', description: 'Increase attack strength.' }] },
      { threshold: 25, choices: [{ key: 'STEADY_HANDS', label: 'Steady Hands', description: 'Reduce gun jams and wear.' }, { key: 'FIELD_MEDIC', label: 'Field Medic', description: 'Recover wounded thugs faster.' }] },
      { threshold: 40, choices: [{ key: 'COLLECTOR', label: 'Collector', description: 'Increase loot share.' }, { key: 'NOBODY_HOME', label: 'Nobody Home', description: 'Reduce loot taken when you lose.' }] },
    ],
    WHEELS: [
      { threshold: 10, choices: [{ key: 'LIGHT_FOOT', label: 'Light Foot', description: 'Reduce travel time.' }, { key: 'PACKED_TIGHT', label: 'Packed Tight', description: 'Increase cargo capacity.' }] },
      { threshold: 25, choices: [{ key: 'GREASE_MONKEY', label: 'Grease Monkey', description: 'Repairs use fewer parts.' }, { key: 'LOW_PROFILE', label: 'Low Profile', description: 'Reduce police stops.' }] },
      { threshold: 40, choices: [{ key: 'WHEELMAN', label: 'Wheelman', description: 'Protect run vehicles from encounter gangs.' }, { key: 'CONVOY_BOSS', label: 'Convoy Boss', description: 'Improve escort guns on runs.' }] },
    ],
    FIXER: [
      { threshold: 10, choices: [{ key: 'CLEAN_HANDS', label: 'Clean Hands', description: 'Reduce heat from fights.' }, { key: 'LAWYERED_UP', label: 'Lawyered Up', description: 'Make lawyers cheaper.' }] },
      { threshold: 25, choices: [{ key: 'QUIET_STREETS', label: 'Quiet Streets', description: 'Reduce evidence gain.' }, { key: 'PAPER_TRAIL', label: 'Paper Trail', description: 'Close cases faster.' }] },
      { threshold: 40, choices: [{ key: 'GHOST', label: 'Ghost', description: 'Shorten the hot window on taken items.' }, { key: 'TRIPWIRE', label: 'Tripwire', description: 'Extend the recovery window on stolen items.' }] },
    ],
    CONNECTIONS: [
      { threshold: 10, choices: [{ key: 'REGULAR', label: 'Regular', description: 'Trader standing grows faster.' }, { key: 'PLUGGED_IN', label: 'Plugged In', description: 'Gain one extra job offer per day.' }] },
      { threshold: 25, choices: [{ key: 'TOLL_BOOTH', label: 'Toll Booth', description: 'Increase tolls collected.' }, { key: 'FAST_PASS', label: 'Fast Pass', description: 'Halve non-holder access waits.' }] },
      { threshold: 40, choices: [{ key: 'SUPPLIERS_FRIEND', label: "Supplier's Friend", description: 'Increase supply restock.' }, { key: 'INSIDE_LINE', label: 'Inside Line', description: 'Reveal locked-place ownership and tolls.' }] },
    ],
    LUCK: [
      { threshold: 10, choices: [{ key: 'LUCKY_BREAK', label: 'Lucky Break', description: 'Improve favorable encounter outcomes.' }, { key: 'RARE_FIND', label: 'Rare Find', description: 'Improve rare-loot discovery.' }] },
      { threshold: 25, choices: [{ key: 'FORTUNES_FAVOR', label: "Fortune's Favor", description: 'Reduce the severity of a bad random outcome.' }, { key: 'SECOND_CHANCE', label: 'Second Chance', description: 'Gain a small retry window on eligible events.' }] },
      { threshold: 40, choices: [{ key: 'SERENDIPITY', label: 'Serendipity', description: 'Improve exceptional non-casino rewards.' }, { key: 'RABBITS_FOOT', label: "Rabbit's Foot", description: 'Reduce eligible random mishaps.' }] },
    ],
  },
  respec: { baseCostCents: 2_500_000, cooldownHours: 24 },
  sources: [
    { key: 'HUSTLE_EARN', skill: 'HUSTLE', label: 'Earning and selling', baseXp: 10, actionPrefixes: ['BUSINESS_', 'STORE_SELL', 'DEALER_', 'SALES_'] },
    { key: 'MUSCLE_FIGHT', skill: 'MUSCLE', label: 'Combat action', baseXp: 10, lossMultiplier: 0.5, actionPrefixes: ['COMBAT_', 'RAID_', 'TURF_', 'BLOCK_WAR_', 'CONVOY_'] },
    { key: 'WHEELS_RUN', skill: 'WHEELS', label: 'Run or vehicle action', baseXp: 10, actionPrefixes: ['RUN_', 'BOSS_TRIP_', 'VEHICLE_', 'GARAGE_', 'TRAVEL_'] },
    { key: 'FIXER_LAW', skill: 'FIXER', label: 'Law and heat action', baseXp: 10, actionPrefixes: ['LAW_', 'CASE_', 'HEAT_', 'WARRANT_'] },
    { key: 'CONNECTIONS_JOB', skill: 'CONNECTIONS', label: 'Job, supply, or toll action', baseXp: 10, actionPrefixes: ['QUEST_', 'JOB_', 'CONTACT_', 'SUPPLY_', 'TOLL_', 'REPUTATION_'] },
    { key: 'LUCK_EVENT', skill: 'LUCK', label: 'Random event or loot action', baseXp: 10, actionPrefixes: ['ENCOUNTER_', 'RANDOM_', 'LOOT_', 'DROP_'] },
  ],
};

/** Build the boss contribution(s) for one skill, scaling linearly to 40. */
export function streetSkillPassiveModifiers(
  skill: StreetSkillKey,
  points: number,
  rules: Pick<StreetSkillsRules, 'passives'> = STREET_SKILLS_V1,
): readonly StreetSkillPassive[] {
  const factor = Math.max(0, Math.min(40, Math.floor(points))) / 40;
  const effectPrefix = `${skill}_`;
  return rules.passives
    .filter((passive) => passive.effectId.startsWith(effectPrefix))
    .map((passive) => ({ ...passive, maxPercent: passive.maxPercent * factor }));
}

export function streetSkillSourceForAction(rules: StreetSkillsRules, action: string): StreetSkillSource | null {
  return rules.sources.find((source) => source.actionPrefixes.some((prefix) => action.startsWith(prefix))) ?? null;
}

/** Rising curve: the nth point costs n * xpPerPoint XP. */
export function streetSkillXpForPoints(points: number, rules: Pick<StreetSkillsRules, 'xpPerPoint'> = STREET_SKILLS_V1): number {
  const safe = Math.max(0, Math.floor(points));
  return safe * (safe + 1) * rules.xpPerPoint / 2;
}

export function streetSkillPointsForXp(xp: number, rules: Pick<StreetSkillsRules, 'xpPerPoint' | 'skillPointCap'> = STREET_SKILLS_V1): number {
  const safe = Math.max(0, Math.floor(xp));
  let points = 0;
  while (points < rules.skillPointCap && streetSkillXpForPoints(points + 1, rules) <= safe) points += 1;
  return points;
}

/** XP multiplier for a round joiner. Day zero through day two are full catch-up days. */
export function streetSkillCatchUpMultiplier(joinedAt: Date, now: Date, rules: Pick<StreetSkillsRules, 'catchUp'> = STREET_SKILLS_V1): number {
  const days = Math.max(0, (now.getTime() - joinedAt.getTime()) / 86_400_000);
  if (days < rules.catchUp.fullDays) return rules.catchUp.fullMultiplier;
  if (days < rules.catchUp.fullDays + rules.catchUp.reducedDays) return rules.catchUp.reducedMultiplier;
  return 1;
}

export function streetSkillTaperMultiplier(xpInWindow: number, rules: Pick<StreetSkillsRules, 'dailyFullXp' | 'dailyHalfXp'> = STREET_SKILLS_V1): number {
  if (xpInWindow < rules.dailyFullXp) return 1;
  if (xpInWindow < rules.dailyHalfXp) return 0.5;
  return 0.25;
}

/** Applies the taper by tranche, so one large settled action cannot skip the full-rate band. */
export function streetSkillTaperedXp(baseXp: number, xpInWindow: number, rules: Pick<StreetSkillsRules, 'dailyFullXp' | 'dailyHalfXp'> = STREET_SKILLS_V1): number {
  let remaining = Math.max(0, Math.floor(baseXp));
  let cursor = Math.max(0, Math.floor(xpInWindow));
  let earned = 0;
  const full = Math.max(0, rules.dailyFullXp - cursor);
  const fullAmount = Math.min(remaining, full);
  earned += fullAmount;
  remaining -= fullAmount;
  cursor += fullAmount;
  const half = Math.max(0, rules.dailyHalfXp - cursor);
  const halfAmount = Math.min(remaining, half);
  earned += Math.floor(halfAmount / 2);
  remaining -= halfAmount;
  earned += Math.floor(remaining / 4);
  return earned;
}

export interface StreetSkillSimulationEvent {
  readonly skill: StreetSkillKey;
  readonly sourceKey: string;
  readonly baseXp: number;
  readonly settledAt: Date;
  readonly joinedAt: Date;
}

/**
 * Pure Slice E season audit helper. It mirrors the durable award policy without
 * touching a database: ordered settlements, per-skill windows, catch-up, and
 * source-key deduplication are all explicit so abuse scenarios stay testable.
 */
export function simulateStreetSkillSeason(
  events: readonly StreetSkillSimulationEvent[],
  rules: StreetSkillsRules = STREET_SKILLS_V1,
): { readonly xp: Readonly<Record<StreetSkillKey, number>>; readonly points: Readonly<Record<StreetSkillKey, number>>; readonly awardedEvents: number; readonly ignoredDuplicateEvents: number } {
  const xp = Object.fromEntries(STREET_SKILL_KEYS.map((skill) => [skill, 0])) as Record<StreetSkillKey, number>;
  const points = Object.fromEntries(STREET_SKILL_KEYS.map((skill) => [skill, 0])) as Record<StreetSkillKey, number>;
  const windows = new Map<StreetSkillKey, { startsAt: Date; xp: number }>();
  const receipts = new Set<string>();
  let awardedEvents = 0;
  let ignoredDuplicateEvents = 0;
  for (const event of [...events].sort((a, b) => a.settledAt.getTime() - b.settledAt.getTime())) {
    if (receipts.has(event.sourceKey)) {
      ignoredDuplicateEvents += 1;
      continue;
    }
    receipts.add(event.sourceKey);
    const base = Math.max(0, Math.floor(event.baseXp));
    if (!base) continue;
    const window = windows.get(event.skill);
    const sameWindow = Boolean(window && event.settledAt.getTime() - window.startsAt.getTime() < 86_400_000);
    const windowXp = sameWindow ? window!.xp : 0;
    const earned = Math.max(1, Math.floor(streetSkillTaperedXp(base, windowXp, rules) * streetSkillCatchUpMultiplier(event.joinedAt, event.settledAt, rules)));
    xp[event.skill] += earned;
    points[event.skill] = streetSkillPointsForXp(xp[event.skill], rules);
    windows.set(event.skill, { startsAt: sameWindow ? window!.startsAt : event.settledAt, xp: windowXp + earned });
    awardedEvents += 1;
  }
  return { xp, points, awardedEvents, ignoredDuplicateEvents };
}
