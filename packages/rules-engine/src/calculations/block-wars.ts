import type { BlockWarRules, Ruleset } from '@streets/rulesets';
import { businessRules, siegeControlPerHour } from './business.js';

/**
 * 1.1.0-D. Block wars in play: the pure parts the server settles with. A war is declared,
 * opens with a fight, and if the attacker wins it besieges the block: Control climbs each
 * hour (faster with the attacker's ally in the siege) until it reaches 100, unless the
 * holder breaks the siege, concedes, or the time limit runs out.
 */

export type BlockWarGoal = 'TAKE' | 'SACK';
export type BlockWarSide = 'ATTACKER' | 'DEFENDER';

/** Block wars replace the 0.6.0-C push on player-held blocks in this round. */
export function blockWarsOn(ruleset: Ruleset): boolean {
  return Boolean(ruleset.turf && ruleset.business?.building && ruleset.business.wars.enabled);
}

export function blockWarRules(ruleset: Ruleset): BlockWarRules | undefined {
  return blockWarsOn(ruleset) ? ruleset.business!.wars : undefined;
}

/**
 * Control after `hours` of siege. The allied share is the attacker's ally thugs in the
 * siege against the declarer's, capped at 1 (the ally cap).
 */
export function siegeControlAfter(ruleset: Ruleset, control: number, hours: number, alliedShare = 0): number {
  if (hours <= 0) return Math.min(100, Math.max(0, control));
  return Math.min(100, Math.max(0, control + siegeControlPerHour(ruleset, alliedShare) * hours));
}

/** Hours of siege from `control` until it reaches 100. */
export function hoursToFullControl(ruleset: Ruleset, control: number, alliedShare = 0): number {
  const rate = siegeControlPerHour(ruleset, alliedShare);
  return rate > 0 ? Math.max(0, 100 - control) / rate : Number.POSITIVE_INFINITY;
}

/** Control left after the holder breaks the siege. */
export function controlAfterBreak(ruleset: Ruleset, control: number): number {
  const wars = businessRules(ruleset)?.wars;
  return Math.max(0, control - (wars?.breakSiegeControlLoss ?? 0));
}

/** The attacker's ally share of the siege: ally thugs over the declarer's, at most 1. */
export function alliedShare(declarerThugs: number, allyThugs: number): number {
  if (declarerThugs <= 0 || allyThugs <= 0) return 0;
  return Math.min(1, allyThugs / declarerThugs);
}

/** What a Sack takes from the block's registers: a share, capped. */
export function sackLootCents(ruleset: Ruleset, registersCents: number): number {
  const wars = blockWarRules(ruleset);
  if (!wars || registersCents <= 0) return 0;
  return Math.min(wars.sackLootCapCents ?? 0, Math.floor(registersCents * (wars.sackLootShare ?? 0)));
}

/** Truce hours after a war, by how it ended. */
export function warTruceHours(ruleset: Ruleset, outcome: 'TAKE' | 'SACK' | 'DEFENDED'): number {
  const wars = businessRules(ruleset)?.wars;
  if (!wars) return 0;
  return outcome === 'SACK' ? wars.sackTruceHours : wars.truceHours;
}

/** When a war declared at `declaredAt` runs out of time. */
export function warEndsBy(ruleset: Ruleset, declaredAt: Date): Date {
  const wars = businessRules(ruleset)?.wars;
  return new Date(declaredAt.getTime() + (wars?.maxWarHours ?? 0) * 3_600_000);
}

/** The steps a caller can promise an ally: 0, 10%, ... up to the cap. */
export function allyCutSteps(ruleset: Ruleset): number[] {
  const allies = businessRules(ruleset)?.allies;
  if (!allies || allies.cutStep <= 0) return [0];
  const steps: number[] = [];
  for (let step = 0; step <= Math.round(allies.maxCutShare / allies.cutStep); step++) {
    steps.push(Math.round(step * allies.cutStep * 1000) / 1000);
  }
  return steps;
}

/** What the D settings must hold to. */
export function blockWarRulesetProblems(ruleset: Ruleset): string[] {
  const wars = ruleset.business?.wars;
  if (!wars?.enabled) return [];
  const problems: string[] = [];
  if (!ruleset.business?.building) problems.push('Block wars need businesses to be built first.');
  if (!ruleset.turf?.wars) problems.push('Block wars replace the turf push, so turf wars must be on.');
  if ((wars.sackLootShare ?? 0) <= 0 || (wars.sackLootShare ?? 0) > 1) problems.push('A Sack must take a share of the registers, and no more than all of them.');
  if ((wars.sackLootCapCents ?? 0) <= 0) problems.push('A Sack needs a loot cap.');
  const outpostCap = ruleset.turf?.outposts?.lootCashCapCents;
  if (outpostCap && (wars.sackLootCapCents ?? 0) > outpostCap) problems.push('Sack loot must stay inside the 0.6.0-D loot caps.');
  if ((wars.sackHeat ?? 0) <= 0) problems.push('A Sack must draw Heat.');
  if ((wars.torchHeat ?? 0) <= 0) problems.push('Torching a business must draw Heat.');
  if (wars.warningMinutes * 60 >= wars.maxWarHours * 3600) problems.push('The opening fight must land well inside the war\'s time limit.');
  if (wars.siegeHours >= wars.maxWarHours) problems.push('A siege must be able to finish inside the war\'s time limit.');
  if (wars.breakMusterMinutes <= 0) problems.push('A break attempt needs a muster window so an ally can answer.');
  return problems;
}
