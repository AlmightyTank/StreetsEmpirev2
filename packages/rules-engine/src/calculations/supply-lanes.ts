import type { SupplyLaneRouteRules, SupplyLanesRules, Ruleset } from '@streets/rulesets';
import type { Rng } from '../rng.js';

/**
 * 1.6.0-H. International lanes, as pure numbers: what a shipment costs on a route card, its
 * odds on arrival at an entry city, and what an arrival comes to. The server rolls with a
 * seed per shipment, so the same shipment always lands the same way.
 */

export function laneRules(ruleset: Ruleset): SupplyLanesRules | undefined {
  return ruleset.supplyNetwork?.enabled ? ruleset.supplyNetwork.lanes : undefined;
}

export interface LaneQuote {
  goodsCents: number;
  feeCents: number;
  totalCents: number;
  transitHours: number;
}

export function laneQuote(route: SupplyLaneRouteRules, unitCostCents: number, quantity: number): LaneQuote {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new RangeError('quantity must be a positive safe integer.');
  const goodsCents = unitCostCents * quantity;
  const feeCents = route.baseFeeCents + route.feeCentsPerUnit * quantity;
  return { goodsCents, feeCents, totalCents: goodsCents + feeCents, transitHours: route.transitHours };
}

export interface LaneOdds {
  seizeChance: number;
  partialChance: number;
  cleanChance: number;
}

/** The card's odds, scaled by the entry city's police pressure and capped so a load can always get through. */
export function laneOdds(route: SupplyLaneRouteRules, pressure: number): LaneOdds {
  const scale = Math.max(0, pressure);
  const seizeChance = Math.min(0.5, route.risk.seizeChance * scale);
  const partialChance = Math.min(0.9 - seizeChance, route.risk.partialChance * scale);
  return { seizeChance, partialChance, cleanChance: 1 - seizeChance - partialChance };
}

export type LaneRiskWord = 'LOW' | 'MODERATE' | 'HIGH';

/** The chance of losing anything, in words. Never a number on the page. */
export function laneRiskWord(odds: LaneOdds): LaneRiskWord {
  const trouble = odds.seizeChance + odds.partialChance;
  if (trouble >= 0.3) return 'HIGH';
  if (trouble >= 0.15) return 'MODERATE';
  return 'LOW';
}

/** Expected share of a load lost on this card into this city: what a planner can compare. */
export function laneExpectedLoss(route: SupplyLaneRouteRules, odds: LaneOdds): number {
  const partial = (route.risk.partialShare.min + route.risk.partialShare.max) / 2;
  return odds.seizeChance + odds.partialChance * partial;
}

export type LaneOutcome = 'CLEAN' | 'PARTIAL' | 'SEIZED';

export interface LaneArrival {
  outcome: LaneOutcome;
  delivered: number;
  lost: number;
  /** Case evidence it leaves in the entry city. */
  casePoints: number;
}

/** One arrival: clean, partly searched, or seized whole. */
export function resolveLaneArrival(input: { route: SupplyLaneRouteRules; quantity: number; pressure: number; rng: Rng }): LaneArrival {
  const odds = laneOdds(input.route, input.pressure);
  const roll = input.rng();
  if (roll < odds.seizeChance) return { outcome: 'SEIZED', delivered: 0, lost: input.quantity, casePoints: input.route.risk.casePoints };
  if (roll < odds.seizeChance + odds.partialChance) {
    const { min, max } = input.route.risk.partialShare;
    const share = min + (max - min) * input.rng();
    const lost = Math.min(input.quantity, Math.max(1, Math.round(input.quantity * share)));
    return { outcome: 'PARTIAL', delivered: input.quantity - lost, lost, casePoints: Math.max(1, Math.round(input.route.risk.casePoints / 2)) };
  }
  return { outcome: 'CLEAN', delivered: input.quantity, lost: 0, casePoints: 0 };
}
