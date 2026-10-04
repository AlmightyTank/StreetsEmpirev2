import { hideoutV2For, type BusinessKey, type RacketEffect, type RacketKey, type RacketRules, type RacketTypeRules, type Ruleset } from '@streets/rulesets';
import { BUSINESS_KEYS } from './business.js';

/**
 * 1.1.0-C. Rackets: one per business, on top of its front income. A racket's strength is
 * the business level's share of full strength times its staffing share, and every effect
 * scales with it. Two businesses running the same racket don't stack: the crew gets the
 * stronger one. Everything here is pure; the server keeps a crew's live rackets on the
 * player (`racketEffects`, racket → strength) so any system can read them without a query.
 */

export const RACKET_KEYS: readonly RacketKey[] = [
  'ECSTASY_DEMAND', 'INFORMATION_NETWORK',
  'BACK_ROOM_CARDS', 'LOOSE_LIPS',
  'VIP_ROOM', 'PILLOW_TALK',
  'STOLEN_LOW_RIDERS', 'VEHICLE_RECOVERY',
  'FENCING', 'LOAN_SHARKING',
  'RUN_MODS', 'GETAWAY_CARS',
  'BEER_SUPPLY', 'COUNTER_SALES',
  'PRODUCT_STORAGE', 'SHIPMENT_CAPACITY',
  'HOUSE_ALWAYS_WINS', 'CASINO_LAUNDERING',
  'LAUNDERING', 'WASH_AND_FOLD',
];

/** A crew's live rackets: racket → strength (0..1], the strongest business running it. */
export type RacketEffects = Partial<Record<RacketKey, number>>;

export function racketRules(ruleset: Ruleset): RacketRules | undefined {
  return ruleset.turf && ruleset.business?.building ? ruleset.business.rackets : undefined;
}

export function racketType(ruleset: Ruleset, racket: RacketKey): RacketTypeRules | undefined {
  return racketRules(ruleset)?.catalog[racket];
}

/** The rackets a business can run, in catalog order. */
export function racketsFor(ruleset: Ruleset, business: BusinessKey): RacketKey[] {
  const rules = racketRules(ruleset);
  if (!rules) return [];
  return RACKET_KEYS.filter((key) => rules.catalog[key]?.business === business);
}

export function isRacketKey(value: unknown): value is RacketKey {
  return typeof value === 'string' && (RACKET_KEYS as readonly string[]).includes(value);
}

/** Strength of a racket on a business at this level and staffing (0 when closed). */
export function racketStrength(ruleset: Ruleset, input: { level: number; staff: number; requiredStaff: number }): number {
  const rules = racketRules(ruleset);
  if (!rules || input.level <= 0 || input.staff <= 0 || input.requiredStaff <= 0) return 0;
  const byLevel = rules.levelStrength[Math.min(input.level, rules.levelStrength.length) - 1] ?? 0;
  return byLevel * Math.min(1, input.staff / input.requiredStaff);
}

/** Read the stored effects defensively: anything unknown or out of range is dropped. */
export function readRacketEffects(raw: unknown): RacketEffects {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const effects: RacketEffects = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isRacketKey(key) || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    effects[key] = Math.min(1, value);
  }
  return effects;
}

/** Keep the stronger of two businesses running the same racket. */
export function mergeRacketEffect(effects: RacketEffects, racket: RacketKey, strength: number): RacketEffects {
  if (strength <= 0) return effects;
  return { ...effects, [racket]: Math.max(effects[racket] ?? 0, Math.min(1, strength)) };
}

type EffectOf<K extends RacketEffect['kind']> = Extract<RacketEffect, { kind: K }>;

/** Every live racket with this effect kind, with its strength. */
function live<K extends RacketEffect['kind']>(ruleset: Ruleset, effects: RacketEffects, kind: K): Array<{ effect: EffectOf<K>; strength: number }> {
  const rules = racketRules(ruleset);
  if (!rules) return [];
  const found: Array<{ effect: EffectOf<K>; strength: number }> = [];
  for (const [key, strength] of Object.entries(effects) as Array<[RacketKey, number]>) {
    const effect = rules.catalog[key]?.effect;
    if (effect?.kind === kind && strength > 0) found.push({ effect: effect as EffectOf<K>, strength });
  }
  return found;
}

function best<K extends RacketEffect['kind']>(ruleset: Ruleset, effects: RacketEffects, kind: K, value: (effect: EffectOf<K>) => number): number {
  return live(ruleset, effects, kind).reduce((top, entry) => Math.max(top, value(entry.effect) * entry.strength), 0);
}

/** Extra minutes of warning on pushes and convoy tails (Information network). */
export function racketHeadsUpMinutes(ruleset: Ruleset, effects: RacketEffects): number {
  return best(ruleset, effects, 'HEADS_UP', (effect) => effect.minutes);
}

/** Turns off a paid recon (Loose lips). Paid recon always keeps at least one turn. */
export function racketReconDiscount(ruleset: Ruleset, effects: RacketEffects, turnCost: number): number {
  const turns = Math.round(best(ruleset, effects, 'RECON_DISCOUNT', (effect) => effect.turns));
  return Math.max(0, Math.min(turns, turnCost - 1));
}

/** Extra home raid defense percent (Pillow talk). */
export function racketRaidDefensePercent(ruleset: Ruleset, effects: RacketEffects): number {
  return best(ruleset, effects, 'RAID_DEFENSE', (effect) => effect.percent);
}

/** Share of a Low-Rider a convoy hit would take that comes back (Vehicle recovery). */
export function racketVehicleRecovery(ruleset: Ruleset, effects: RacketEffects): number {
  return Math.min(1, best(ruleset, effects, 'VEHICLE_RECOVERY', (effect) => effect.share));
}

/** Share off the chance of a police stop on a run (Run mods). */
export function racketRunStopCut(ruleset: Ruleset, effects: RacketEffects): number {
  return Math.min(1, best(ruleset, effects, 'RUN_STOPS', (effect) => effect.share));
}

/** Share of a beaten push squad's wounds avoided (Getaway cars). */
export function racketGetawayShare(ruleset: Ruleset, effects: RacketEffects): number {
  return Math.min(1, best(ruleset, effects, 'GETAWAY', (effect) => effect.share));
}

/** Extra product units sealed away from raids (Product storage). */
export function racketProductStorage(ruleset: Ruleset, effects: RacketEffects): number {
  return Math.floor(best(ruleset, effects, 'PRODUCT_STORAGE', (effect) => effect.units));
}

/** Extra cargo per Low-Rider on runs, as a share (Shipment capacity). */
export function racketCargoShare(ruleset: Ruleset, effects: RacketEffects): number {
  return best(ruleset, effects, 'CARGO', (effect) => effect.share);
}

/** Share off the Heat the crew's other rackets draw (Wash & fold). */
export function racketHeatShield(ruleset: Ruleset, effects: RacketEffects): number {
  return Math.min(1, best(ruleset, effects, 'HEAT_SHIELD', (effect) => effect.share));
}

/** Whole-percent price edges at one store for one item, from every live racket that hooks it. */
export function racketStorePrice(ruleset: Ruleset, effects: RacketEffects, store: string, item: string): { buyDiscountPercent: number; sellBonusPercent: number } {
  let buyDiscountPercent = 0;
  let sellBonusPercent = 0;
  for (const { effect, strength } of live(ruleset, effects, 'STORE_PRICE')) {
    if (effect.store !== store || !effect.items.includes(item)) continue;
    buyDiscountPercent = Math.max(buyDiscountPercent, Math.round((effect.buyDiscountPercent ?? 0) * strength));
    sellBonusPercent = Math.max(sellBonusPercent, Math.round((effect.sellBonusPercent ?? 0) * strength));
  }
  return { buyDiscountPercent, sellBonusPercent };
}

/** Cash a CASH racket adds each hour, from the business's front income for the same hour. */
export function racketCashPerHour(ruleset: Ruleset, racket: RacketKey | null, frontCentsPerHour: number): number {
  const effect = racket ? racketType(ruleset, racket)?.effect : undefined;
  return effect?.kind === 'CASH' ? Math.floor(frontCentsPerHour * effect.incomeShare) : 0;
}

/** Heat a racket draws each hour at this strength, after any Wash & fold. */
export function racketHeatPerHour(ruleset: Ruleset, racket: RacketKey | null, strength: number, shield = 0): number {
  const type = racket ? racketType(ruleset, racket) : undefined;
  if (!type || strength <= 0) return 0;
  // Wash & fold cleans the other rackets' books, never its own.
  const cut = type.effect.kind === 'HEAT_SHIELD' ? 0 : Math.min(1, Math.max(0, shield));
  return type.heatPerHour * strength * (1 - cut);
}

/** The UTC day a laundering count belongs to. */
export function launderDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Heat the crew may still wash off now, under the daily and round caps. */
export function launderAllowance(ruleset: Ruleset, used: { today: number; round: number }): number {
  const rules = racketRules(ruleset)?.laundering;
  if (!rules) return 0;
  return Math.max(0, Math.min(rules.dailyHeatCap - used.today, rules.roundHeatCap - used.round));
}

/** When a business's racket can next be switched, or null if it can now. */
export function racketSwitchOpensAt(ruleset: Ruleset, racketSince: Date | null, now: Date): Date | null {
  const rules = racketRules(ruleset);
  if (!rules || !racketSince) return null;
  const opens = new Date(racketSince.getTime() + rules.switchCooldownHours * 3_600_000);
  return opens > now ? opens : null;
}

/**
 * The guardrails from the roadmap: no racket beats the system it hooks (it stacks a little on
 * top), laundering is capped, and every business has exactly two rackets.
 */
export function racketRulesetProblems(ruleset: Ruleset): string[] {
  const rules = ruleset.business?.rackets;
  if (!rules) return [];
  const problems: string[] = [];
  const maxLevel = ruleset.business!.levels.maxLevel;

  for (const business of BUSINESS_KEYS) {
    const count = RACKET_KEYS.filter((key) => rules.catalog[key]?.business === business).length;
    if (count !== 2) problems.push(`${business} must have exactly two rackets.`);
  }
  if (rules.levelStrength.length !== maxLevel) problems.push('Racket strength needs one entry per business level.');
  rules.levelStrength.forEach((value, index) => {
    if (value <= 0 || value > 1) problems.push('Racket strength must be above 0 and at most 1.');
    if (index > 0 && value < rules.levelStrength[index - 1]!) problems.push('Racket strength must not fall as a business levels up.');
  });
  if (rules.levelStrength[rules.levelStrength.length - 1] !== 1) problems.push('A top-level business must run its racket at full strength.');
  if (rules.switchCooldownHours < 1) problems.push('Switching a racket needs a cooldown, or it becomes a per-action toggle.');
  if (rules.switchTurnCost < 1) problems.push('Switching a racket must cost turns.');

  const laundering = rules.laundering;
  if (laundering.dailyHeatCap <= 0 || laundering.roundHeatCap < laundering.dailyHeatCap) problems.push('Laundering needs a daily cap and a round cap at least as big.');
  if (laundering.bribePriceShare <= 0 || laundering.bribePriceShare > 1) problems.push('Laundering must cost something, and never more than a bribe.');
  if (ruleset.heat && laundering.dailyHeatCap > ruleset.heat.max) problems.push('A day of laundering must not wash more than a full Heat bar.');

  const lookoutsMax = ruleset.hideout?.rooms.LOOKOUTS.maxLevel ?? 0;
  const headsUpMax = lookoutsMax * (ruleset.travel?.convoys?.headsUpMinutesPerLookouts ?? 0);
  const defenseMax = lookoutsMax * (ruleset.hideout?.buffs.lookoutsDefenseBonusPercentPerLevel ?? 0);
  const safeRoomLevels = hideoutV2For(ruleset)?.assetProtection?.protectedProductUnitsBySafeRoomLevel ?? [];
  const safeRoomMax = safeRoomLevels.length ? Math.max(...safeRoomLevels) : 0;
  const reconTurns = ruleset.combat?.strategy?.intel.turnCost ?? 0;

  for (const key of RACKET_KEYS) {
    const type = rules.catalog[key];
    if (!type) { problems.push(`${key} is missing from the racket catalog.`); continue; }
    if (type.heatPerHour < 0) problems.push(`${type.name} cannot draw negative Heat.`);
    if (ruleset.heat && type.heatPerHour >= ruleset.heat.decayPerInterval * (60 / ruleset.turns.intervalMinutes)) {
      problems.push(`${type.name} alone must not out-heat the hourly cool-down.`);
    }
    const effect = type.effect;
    switch (effect.kind) {
      case 'CASH':
        if (effect.incomeShare <= 0 || effect.incomeShare > 1) problems.push(`${type.name} must pay between nothing and its front again.`);
        if (type.heatPerHour <= 0) problems.push(`${type.name} pays cash, so it must draw Heat.`);
        break;
      case 'STORE_PRICE': {
        const store = ruleset.stores[effect.store as keyof typeof ruleset.stores] as { items: Record<string, unknown> } | undefined;
        const pipProduct = effect.store === 'PIP' && effect.items.every((item) => ruleset.products?.[item]?.economy?.pip);
        if (!store && !pipProduct) problems.push(`${type.name} hooks a store that is not in this ruleset.`);
        else if (!pipProduct && effect.items.some((item) => !store?.items[item])) problems.push(`${type.name} hooks an item the store does not sell.`);
        if ((effect.buyDiscountPercent ?? 0) > 10 || (effect.sellBonusPercent ?? 0) > 10) problems.push(`${type.name} may only shade a store's price a little (10% at most).`);
        if (!effect.buyDiscountPercent && !effect.sellBonusPercent) problems.push(`${type.name} must change a price.`);
        break;
      }
      case 'HEADS_UP':
        if (effect.minutes <= 0 || effect.minutes > headsUpMax / 2) problems.push(`${type.name} must stay under half of what Lookouts give.`);
        break;
      case 'RECON_DISCOUNT':
        if (effect.turns <= 0 || effect.turns >= reconTurns) problems.push(`${type.name} must leave paid recon costing at least a turn.`);
        break;
      case 'RAID_DEFENSE':
        if (effect.percent <= 0 || effect.percent > defenseMax / 2) problems.push(`${type.name} must stay under half of what Lookouts give.`);
        break;
      case 'PRODUCT_STORAGE':
        if (effect.units <= 0 || effect.units > safeRoomMax / 2) problems.push(`${type.name} must stay under half of what the Safe Room seals.`);
        break;
      case 'VEHICLE_RECOVERY':
      case 'RUN_STOPS':
      case 'GETAWAY':
        if (effect.share <= 0 || effect.share > 0.5) problems.push(`${type.name} must help, and by at most half.`);
        break;
      case 'CARGO':
        if (effect.share <= 0 || effect.share > 0.25) problems.push(`${type.name} must stay a small edge on a Low-Rider's load.`);
        break;
      case 'HEAT_SHIELD':
        if (effect.share <= 0 || effect.share >= 1) problems.push(`${type.name} must leave the other rackets some Heat.`);
        break;
      case 'COUNTER_SALES':
        if (effect.unitsPerHour <= 0) problems.push(`${type.name} must sell something.`);
        break;
      case 'LAUNDER':
        if (effect.heatPerHour <= 0 || effect.heatPerHour * 24 < laundering.dailyHeatCap / 4) problems.push(`${type.name} must wash a real share of the daily cap.`);
        break;
    }
  }
  return problems;
}
