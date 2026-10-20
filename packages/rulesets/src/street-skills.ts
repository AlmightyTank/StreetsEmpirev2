/** Street skill catalog: XP sources, passives, milestone perks and caps. */
export const STREET_SKILL_KEYS = ['HUSTLE', 'MUSCLE', 'WHEELS', 'FIXER', 'CONNECTIONS', 'LUCK'] as const;
export type StreetSkillKey = (typeof STREET_SKILL_KEYS)[number];

export type StreetSkillModifierCategory = 'ECONOMY' | 'COMBAT' | 'COST' | 'HEAT' | 'RECOVERY' | 'VEHICLE' | 'LUCK';

/**
 * What a passive or perk changes. Caps apply per effect, so two different
 * costs (or heat gained and heat cooling) never eat into each other's cap.
 */
export type StreetSkillEffectId =
  | 'CREW_INCOME' | 'STORE_SELL_PRICE' | 'CREW_WORK_HAPPINESS' | 'BULK_SALE_PRICE' | 'BUSINESS_INCOME' | 'LOAN_FEE'
  | 'FIGHT_WOUNDS' | 'AMMO_PER_FIGHT' | 'DEFENSE_STRENGTH' | 'ATTACK_STRENGTH' | 'WOUND_RECOVERY_TIME' | 'LOOT_TAKEN' | 'LOOT_LOST'
  | 'RUN_FEES' | 'VEHICLE_DAMAGE' | 'TRAVEL_TIME' | 'CARGO' | 'REPAIR_COST' | 'POLICE_STOPS' | 'ESCORT_STRENGTH'
  | 'HEAT_GAIN' | 'HEAT_COOLING' | 'FIGHT_HEAT' | 'LAWYER_FEE' | 'EVIDENCE_GAIN' | 'CASE_COOLING'
  | 'TOLLS' | 'SUPPLY_ORDER_PRICE' | 'STANDING_GAIN' | 'JOB_CASH'
  | 'ENCOUNTER_GAINS' | 'GOOD_ENCOUNTER_WEIGHT' | 'RARE_ENCOUNTER_WEIGHT' | 'ENCOUNTER_LOSSES' | 'GOOD_ENCOUNTER_GAINS' | 'BAD_ENCOUNTER_WEIGHT';

export interface StreetSkillEffect {
  readonly effectId: StreetSkillEffectId;
  readonly category: StreetSkillModifierCategory;
  /** Percentage points. Reductions are negative. */
  readonly percent: number;
}

export interface StreetSkillPassive {
  readonly skill: StreetSkillKey;
  readonly effectId: StreetSkillEffectId;
  readonly category: StreetSkillModifierCategory;
  readonly label: string;
  /** Percent at the skill point cap; scales linearly from zero. */
  readonly maxPercent: number;
  /** A system this passive needs that is not in the game yet. Until then it applies nothing. */
  readonly requires?: string;
}

export interface StreetSkillMilestoneChoice {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  /** A capped percent effect. Perks without one are rule changes read with `has`. */
  readonly effect?: StreetSkillEffect;
  /** Offensive perks stop working against targets much smaller than you. */
  readonly offensive?: true;
  /** A system this perk needs that is not in the game yet. It cannot be chosen until then. */
  readonly requires?: string;
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
  /** Share of the XP a lost fight still pays. */
  readonly lossMultiplier?: number;
  /**
   * Actions that send a squad into a fight that resolves later. They pay nothing at launch;
   * every side is paid when the fight resolves, the loser at the loss share.
   */
  readonly settledActions?: readonly string[];
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
  /** Per-effect cap, by the effect's category. */
  readonly modifierCaps: readonly { readonly category: StreetSkillModifierCategory; readonly maxPercent: number }[];
  /** Offensive perks apply only against a target worth at least this share of your net worth. */
  readonly offensiveTargetNetWorthRatio: number;
  /** Bulk Seller applies to product sales of at least this many units. */
  readonly bulkSaleUnits: number;
  /** Second Chance: the chance a bad encounter is rerolled once. */
  readonly secondChancePercent: number;
  readonly passives: readonly StreetSkillPassive[];
  readonly milestones: Readonly<Partial<Record<StreetSkillKey, readonly StreetSkillMilestone[]>>>;
  readonly respec: { readonly baseCostCents: number; readonly cooldownHours: number };
  readonly sources: readonly StreetSkillSource[];
}

const AMMO = 'Ammo & Parts';
const RUN_FEES = 'Ammo & Parts run fees';
const TERRITORY = 'Territory Rewards';
const ARMORY = 'Armory & Garage';

export const STREET_SKILLS_V1: StreetSkillsRules = {
  enabled: true,
  totalPointCap: 100,
  skillPointCap: 40,
  // 40 points cost 24,600 XP: about 25 days at the full-rate band, inside a 28-day round.
  xpPerPoint: 30,
  dailyFullXp: 1_000,
  dailyHalfXp: 2_000,
  catchUp: { fullMultiplier: 2, fullDays: 3, reducedMultiplier: 1.5, reducedDays: 3 },
  modifierCaps: [
    { category: 'ECONOMY', maxPercent: 12 },
    { category: 'COMBAT', maxPercent: 8 },
    { category: 'COST', maxPercent: 25 },
    { category: 'HEAT', maxPercent: 25 },
    { category: 'RECOVERY', maxPercent: 25 },
    { category: 'VEHICLE', maxPercent: 15 },
    { category: 'LUCK', maxPercent: 25 },
  ],
  offensiveTargetNetWorthRatio: 0.5,
  bulkSaleUnits: 100,
  secondChancePercent: 50,
  passives: [
    { skill: 'HUSTLE', effectId: 'CREW_INCOME', category: 'ECONOMY', label: 'Hustle · crew income', maxPercent: 6 },
    { skill: 'HUSTLE', effectId: 'STORE_SELL_PRICE', category: 'ECONOMY', label: 'Hustle · sale prices', maxPercent: 6 },
    { skill: 'MUSCLE', effectId: 'FIGHT_WOUNDS', category: 'RECOVERY', label: 'Muscle · wounded thugs after fights', maxPercent: -15 },
    { skill: 'MUSCLE', effectId: 'AMMO_PER_FIGHT', category: 'COST', label: 'Muscle · rounds per fight', maxPercent: -10, requires: AMMO },
    { skill: 'WHEELS', effectId: 'RUN_FEES', category: 'COST', label: 'Wheels · run fees', maxPercent: -15, requires: RUN_FEES },
    { skill: 'WHEELS', effectId: 'VEHICLE_DAMAGE', category: 'VEHICLE', label: 'Wheels · vehicle damage', maxPercent: -10 },
    { skill: 'FIXER', effectId: 'HEAT_GAIN', category: 'HEAT', label: 'Fixer · heat gained', maxPercent: -15 },
    { skill: 'FIXER', effectId: 'HEAT_COOLING', category: 'HEAT', label: 'Fixer · heat cooling', maxPercent: 15 },
    { skill: 'CONNECTIONS', effectId: 'TOLLS', category: 'COST', label: 'Connections · territory tolls', maxPercent: -20, requires: TERRITORY },
    { skill: 'CONNECTIONS', effectId: 'SUPPLY_ORDER_PRICE', category: 'COST', label: 'Connections · supply orders', maxPercent: -10 },
    { skill: 'LUCK', effectId: 'ENCOUNTER_GAINS', category: 'LUCK', label: 'Luck · encounter windfalls', maxPercent: 10 },
  ],
  milestones: {
    HUSTLE: [
      { threshold: 10, choices: [
        { key: 'SWEET_TALKER', label: 'Sweet Talker', description: 'Your crew works as if 10 points happier.', effect: { effectId: 'CREW_WORK_HAPPINESS', category: 'ECONOMY', percent: 10 } },
        { key: 'BULK_SELLER', label: 'Bulk Seller', description: 'Product sales of 100+ units pay 5% more.', effect: { effectId: 'BULK_SALE_PRICE', category: 'ECONOMY', percent: 5 } },
      ] },
      { threshold: 25, choices: [
        { key: 'FRONT_MAN', label: 'Front Man', description: 'Businesses earn 5% more.', effect: { effectId: 'BUSINESS_INCOME', category: 'ECONOMY', percent: 5 } },
        { key: 'STREET_CREDIT', label: 'Street Credit', description: 'Loan contract fees are 10% lower.', effect: { effectId: 'LOAN_FEE', category: 'COST', percent: -10 } },
      ] },
      { threshold: 40, choices: [
        { key: 'KINGPINS_CUT', label: "Kingpin's Cut", description: 'More cash from territory caches you collect.', requires: TERRITORY },
        { key: 'UNTAXED', label: 'Untaxed', description: 'Selling back to a store loses half as much.' },
      ] },
    ],
    MUSCLE: [
      { threshold: 10, choices: [
        { key: 'HOLD_THE_LINE', label: 'Hold the Line', description: 'Defend at 4% more strength.', effect: { effectId: 'DEFENSE_STRENGTH', category: 'COMBAT', percent: 4 } },
        { key: 'HIT_FIRST', label: 'Hit First', description: 'Attack at 4% more strength, against targets at least half your net worth.', offensive: true, effect: { effectId: 'ATTACK_STRENGTH', category: 'COMBAT', percent: 4 } },
      ] },
      { threshold: 25, choices: [
        { key: 'STEADY_HANDS', label: 'Steady Hands', description: 'Fewer gun jams and slower gun wear.', requires: ARMORY },
        { key: 'FIELD_MEDIC', label: 'Field Medic', description: 'Wounded thugs recover 25% faster.', effect: { effectId: 'WOUND_RECOVERY_TIME', category: 'RECOVERY', percent: -25 } },
      ] },
      { threshold: 40, choices: [
        { key: 'COLLECTOR', label: 'Collector', description: 'Take 10% more loot from raids you win, against targets at least half your net worth.', offensive: true, effect: { effectId: 'LOOT_TAKEN', category: 'ECONOMY', percent: 10 } },
        { key: 'NOBODY_HOME', label: 'Nobody Home', description: 'Lose 10% less loot when you are raided.', effect: { effectId: 'LOOT_LOST', category: 'ECONOMY', percent: -10 } },
      ] },
    ],
    WHEELS: [
      { threshold: 10, choices: [
        { key: 'LIGHT_FOOT', label: 'Light Foot', description: 'Runs drive 10% faster.', effect: { effectId: 'TRAVEL_TIME', category: 'VEHICLE', percent: -10 } },
        { key: 'PACKED_TIGHT', label: 'Packed Tight', description: 'Runs carry 10% more cargo.', effect: { effectId: 'CARGO', category: 'VEHICLE', percent: 10 } },
      ] },
      { threshold: 25, choices: [
        { key: 'GREASE_MONKEY', label: 'Grease Monkey', description: 'Garage repairs and recoveries cost 20% less.', effect: { effectId: 'REPAIR_COST', category: 'COST', percent: -20 } },
        { key: 'LOW_PROFILE', label: 'Low Profile', description: '10% fewer police stops on the road.', effect: { effectId: 'POLICE_STOPS', category: 'VEHICLE', percent: -10 } },
      ] },
      { threshold: 40, choices: [
        { key: 'WHEELMAN', label: 'Wheelman', description: 'Street gangs never try to steal your ride.' },
        { key: 'CONVOY_BOSS', label: 'Convoy Boss', description: 'Run escorts defend at 8% more strength.', effect: { effectId: 'ESCORT_STRENGTH', category: 'COMBAT', percent: 8 } },
      ] },
    ],
    FIXER: [
      { threshold: 10, choices: [
        { key: 'CLEAN_HANDS', label: 'Clean Hands', description: 'Fights draw 15% less heat.', effect: { effectId: 'FIGHT_HEAT', category: 'HEAT', percent: -15 } },
        { key: 'LAWYERED_UP', label: 'Lawyered Up', description: 'Lawyers and retainers cost 15% less.', effect: { effectId: 'LAWYER_FEE', category: 'COST', percent: -15 } },
      ] },
      { threshold: 25, choices: [
        { key: 'QUIET_STREETS', label: 'Quiet Streets', description: 'Evidence against you builds 15% slower.', effect: { effectId: 'EVIDENCE_GAIN', category: 'HEAT', percent: -15 } },
        { key: 'PAPER_TRAIL', label: 'Paper Trail', description: 'Cases cool 20% faster.', effect: { effectId: 'CASE_COOLING', category: 'HEAT', percent: 20 } },
      ] },
      { threshold: 40, choices: [
        { key: 'GHOST', label: 'Ghost', description: 'Taken items you hold stay hot 12h instead of 24h.', requires: ARMORY },
        { key: 'TRIPWIRE', label: 'Tripwire', description: 'Your stolen items stay hot 36h, giving you longer to recover them.', requires: ARMORY },
      ] },
    ],
    CONNECTIONS: [
      { threshold: 10, choices: [
        { key: 'REGULAR', label: 'Regular', description: 'Trader and faction standing grows 25% faster.', effect: { effectId: 'STANDING_GAIN', category: 'ECONOMY', percent: 25 } },
        { key: 'PLUGGED_IN', label: 'Plugged In', description: 'Jobs pay 10% more cash.', effect: { effectId: 'JOB_CASH', category: 'ECONOMY', percent: 10 } },
      ] },
      { threshold: 25, choices: [
        { key: 'TOLL_BOOTH', label: 'Toll Booth', description: 'Collect more tolls on your alliance territory.', requires: TERRITORY },
        { key: 'FAST_PASS', label: 'Fast Pass', description: 'Halve non-holder access waits.', requires: TERRITORY },
      ] },
      { threshold: 40, choices: [
        { key: 'SUPPLIERS_FRIEND', label: "Supplier's Friend", description: 'Two more supply orders can wait for pickup at once.' },
        { key: 'INSIDE_LINE', label: 'Inside Line', description: 'See who holds each locked place, and their toll, from any city.', requires: TERRITORY },
      ] },
    ],
    LUCK: [
      { threshold: 10, choices: [
        { key: 'LUCKY_BREAK', label: 'Lucky Break', description: 'Good encounters come up 25% more often.', effect: { effectId: 'GOOD_ENCOUNTER_WEIGHT', category: 'LUCK', percent: 25 } },
        { key: 'RARE_FIND', label: 'Rare Find', description: 'Rare encounters come up 25% more often.', effect: { effectId: 'RARE_ENCOUNTER_WEIGHT', category: 'LUCK', percent: 25 } },
      ] },
      { threshold: 25, choices: [
        { key: 'FORTUNES_FAVOR', label: "Fortune's Favor", description: 'Encounters take 25% less from you.', effect: { effectId: 'ENCOUNTER_LOSSES', category: 'LUCK', percent: -25 } },
        { key: 'SECOND_CHANCE', label: 'Second Chance', description: 'A bad encounter has a 50% chance to be rerolled once.' },
      ] },
      { threshold: 40, choices: [
        { key: 'SERENDIPITY', label: 'Serendipity', description: 'Good encounters pay 15% more.', effect: { effectId: 'GOOD_ENCOUNTER_GAINS', category: 'LUCK', percent: 15 } },
        { key: 'RABBITS_FOOT', label: "Rabbit's Foot", description: 'Bad encounters come up 25% less often.', effect: { effectId: 'BAD_ENCOUNTER_WEIGHT', category: 'LUCK', percent: -25 } },
      ] },
    ],
  },
  respec: { baseCostCents: 2_500_000, cooldownHours: 24 },
  sources: [
    { key: 'HUSTLE_EARN', skill: 'HUSTLE', label: 'Earning and selling', baseXp: 10, actionPrefixes: ['BUSINESS_', 'STORE_SELL', 'DEALER_', 'SALES_', 'PRODUCE_'] },
    {
      key: 'MUSCLE_FIGHT', skill: 'MUSCLE', label: 'Combat action', baseXp: 10, lossMultiplier: 0.5,
      actionPrefixes: ['COMBAT_', 'RAID', 'DRIVE_BY', 'SPECIAL_RAID', 'BOSS_HIT', 'TURF_', 'BLOCK_WAR_', 'CONVOY_'],
      settledActions: ['TURF_PUSH', 'TURF_PUSH_BACKUP', 'BLOCK_WAR_ASSAULT', 'BLOCK_WAR_DEFEND', 'BLOCK_WAR_BREAK', 'BLOCK_WAR_ANSWER', 'BOSS_HIT', 'BOSS_HIT_BACKUP', 'CONVOY_TAIL', 'CONVOY_BACKUP'],
    },
    { key: 'WHEELS_RUN', skill: 'WHEELS', label: 'Run or vehicle action', baseXp: 10, actionPrefixes: ['RUN_', 'TRIP_', 'BOSS_TRIP_', 'VEHICLE_', 'GARAGE_', 'TRAVEL_'] },
    { key: 'FIXER_LAW', skill: 'FIXER', label: 'Law and heat action', baseXp: 10, actionPrefixes: ['LAW_', 'LAWYER_', 'CASE_', 'HEAT_', 'WARRANT_', 'OFFICIAL_', 'INFORMANT_'] },
    { key: 'CONNECTIONS_JOB', skill: 'CONNECTIONS', label: 'Job, supply, or toll action', baseXp: 10, actionPrefixes: ['QUEST_', 'JOB_', 'CONTACT_', 'SUPPLY_', 'TOLL_', 'REPUTATION_'] },
    { key: 'LUCK_EVENT', skill: 'LUCK', label: 'Scouting, random event or loot action', baseXp: 10, actionPrefixes: ['SCOUT', 'ENCOUNTER_', 'RANDOM_', 'LOOT_', 'DROP_'] },
  ],
};

/** Every perk choice in the catalog, by key. */
export function streetSkillPerk(rules: Pick<StreetSkillsRules, 'milestones'>, key: string): StreetSkillMilestoneChoice | null {
  for (const milestones of Object.values(rules.milestones)) {
    for (const milestone of milestones ?? []) {
      const found = milestone.choices.find((choice) => choice.key === key);
      if (found) return found;
    }
  }
  return null;
}

/** Build the boss contribution(s) for one skill, scaling linearly to 40. */
export function streetSkillPassiveModifiers(
  skill: StreetSkillKey,
  points: number,
  rules: Pick<StreetSkillsRules, 'passives'> = STREET_SKILLS_V1,
): readonly StreetSkillPassive[] {
  const factor = Math.max(0, Math.min(STREET_SKILLS_V1.skillPointCap, Math.floor(points))) / STREET_SKILLS_V1.skillPointCap;
  return rules.passives
    .filter((passive) => passive.skill === skill && !passive.requires)
    .map((passive) => ({ ...passive, maxPercent: passive.maxPercent * factor }));
}

export function streetSkillSourceForAction(rules: StreetSkillsRules, action: string): StreetSkillSource | null {
  return rules.sources.find((source) => source.actionPrefixes.some((prefix) => action.startsWith(prefix))) ?? null;
}

/** Whether an action pays its skill XP when it settles, rather than when its fight resolves. */
export function streetSkillPaysAtLaunch(rules: StreetSkillsRules, action: string): boolean {
  return !rules.sources.some((source) => source.settledActions?.includes(action));
}

/** Rising curve: the nth point costs n * xpPerPoint XP. */
export function streetSkillXpForPoints(points: number, rules: Pick<StreetSkillsRules, 'xpPerPoint'> = STREET_SKILLS_V1): number {
  const safe = Math.max(0, Math.floor(points));
  return safe * (safe + 1) * rules.xpPerPoint / 2;
}

/**
 * Points a skill's XP buys, within the per-skill cap and whatever room the
 * shared total cap leaves after the player's other skills. Points are never
 * taken back once earned, so a full total cap freezes every skill.
 */
export function streetSkillPointsForXp(
  xp: number,
  rules: Pick<StreetSkillsRules, 'xpPerPoint' | 'skillPointCap'> & Partial<Pick<StreetSkillsRules, 'totalPointCap'>> = STREET_SKILLS_V1,
  otherSkillPoints = 0,
): number {
  const safe = Math.max(0, Math.floor(xp));
  const cap = Math.min(rules.skillPointCap, Math.max(0, (rules.totalPointCap ?? Number.POSITIVE_INFINITY) - Math.max(0, otherSkillPoints)));
  let points = 0;
  while (points < cap && streetSkillXpForPoints(points + 1, rules) <= safe) points += 1;
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
    const others = STREET_SKILL_KEYS.reduce((sum, skill) => sum + (skill === event.skill ? 0 : points[skill]), 0);
    points[event.skill] = Math.max(points[event.skill], streetSkillPointsForXp(xp[event.skill], rules, others));
    windows.set(event.skill, { startsAt: sameWindow ? window!.startsAt : event.settledAt, xp: windowXp + earned });
    awardedEvents += 1;
  }
  return { xp, points, awardedEvents, ignoredDuplicateEvents };
}
