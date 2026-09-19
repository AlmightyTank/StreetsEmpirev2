import type { Ruleset, WeaponKey } from '@streets/rulesets';
import { hashParts, seededRng } from '../rng.js';
import { simulateRaid, type CombatCrew } from '../calculations/combat.js';
import { convoyCombatModel, convoyRules, homeBackupThugs } from '../calculations/convoys.js';

/**
 * 0.5.0-E. How often a hijack lands. Each scenario is a tail landing on a run, fought on
 * the raid engine the way the server fights it: the attacker's squad against the escorts
 * plus whatever backup reaches them, every defender armed from the owner's arsenal.
 *
 * The gate asks:
 * - an even fight is a fight: neither side is favoured by much, the defender a little;
 * - a run without much of an escort is prey for a real squad;
 * - a run in its home town is hard to take but not untouchable, because half the crew at
 *   home rides out;
 * - backup the owner sends changes the odds.
 */

export const CONVOY_SAMPLES = 2_000;
const MORALE = 85;

export interface ConvoyScenario {
  readonly name: string;
  readonly attackers: number;
  readonly escorts: number;
  /** Fit thugs the owner has at home, and how far from home the run is as a share of the home zone (0 = in town). Null: far from home. */
  readonly home: { readonly fit: number; readonly zoneShare: number } | null;
  readonly sentBackup: number;
  /** The win rate this scenario must land in. */
  readonly band: { readonly min: number; readonly max: number };
}

export const convoyScenarios: readonly ConvoyScenario[] = [
  { name: 'Rival runs, two cars each', attackers: 12, escorts: 12, home: null, sentBackup: 0, band: { min: 0.25, max: 0.55 } },
  { name: 'A local squad on a full escort, far from home', attackers: 30, escorts: 30, home: null, sentBackup: 0, band: { min: 0.25, max: 0.55 } },
  { name: 'A local squad on a light escort', attackers: 30, escorts: 6, home: null, sentBackup: 0, band: { min: 0.75, max: 1 } },
  { name: 'A local squad on an average escort', attackers: 30, escorts: 12, home: null, sentBackup: 0, band: { min: 0.75, max: 1 } },
  { name: 'The same, with the owner sending 20 from home', attackers: 30, escorts: 12, home: null, sentBackup: 20, band: { min: 0.02, max: 0.5 } },
  { name: 'The same, halfway into its home zone', attackers: 30, escorts: 12, home: { fit: 60, zoneShare: 0.5 }, sentBackup: 0, band: { min: 0.1, max: 0.75 } },
  { name: 'The same, at the edge of its home town', attackers: 30, escorts: 12, home: { fit: 60, zoneShare: 0 }, sentBackup: 0, band: { min: 0.02, max: 0.35 } },
  { name: 'A big squad at the edge of a big crew\'s home town', attackers: 80, escorts: 30, home: { fit: 200, zoneShare: 0 }, sentBackup: 0, band: { min: 0.02, max: 0.35 } },
];

function armed(thugs: number, model: NonNullable<Ruleset['combat']>): CombatCrew {
  const weapons = Object.fromEntries(Object.keys(model.weapons).map((key) => [key, 0])) as Record<WeaponKey, number>;
  weapons.PISTOL = thugs;
  return { thugs, thugHappiness: MORALE, weapons };
}

export interface ConvoyScenarioResult {
  readonly scenario: ConvoyScenario;
  readonly defenders: number;
  readonly winRate: number;
}

export function runConvoySimulation(ruleset: Ruleset, samples: number = CONVOY_SAMPLES): ConvoyScenarioResult[] {
  const model = convoyCombatModel(ruleset);
  if (!model || !convoyRules(ruleset)) throw new Error(`${ruleset.meta.id} has no convoys.`);
  const home = ruleset.round.startingCitySlug;
  const zone = ruleset.cities?.[home]?.zoneHours ?? 0;
  return convoyScenarios.map((scenario) => {
    const backup = scenario.home ? homeBackupThugs(ruleset, home, scenario.home.zoneShare * zone, scenario.home.fit) : 0;
    const defenders = scenario.escorts + backup + scenario.sentBackup;
    let wins = 0;
    for (let sample = 0; sample < samples; sample++) {
      const rng = seededRng(hashParts('convoy', scenario.name, sample));
      const result = simulateRaid({
        attacker: armed(scenario.attackers, model),
        defender: armed(defenders, model),
        attackingThugs: Math.min(scenario.attackers, model.squadCap),
        attackerTurns: model.turnCost,
        defenderCashCents: 0n,
      }, model, rng);
      if (result.winner === 'ATTACKER') wins++;
    }
    return { scenario, defenders, winRate: wins / samples };
  });
}

export function convoyGate(results: readonly ConvoyScenarioResult[]): string[] {
  return results.flatMap((result) => (result.winRate < result.scenario.band.min || result.winRate > result.scenario.band.max
    ? [`${result.scenario.name}: the attacker wins ${percent(result.winRate)}, outside ${percent(result.scenario.band.min)}-${percent(result.scenario.band.max)}.`]
    : []));
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function convoyMarkdown(ruleset: Ruleset, results: readonly ConvoyScenarioResult[]): string {
  const problems = convoyGate(results);
  return [
    `# Convoy simulation - ${ruleset.meta.version}`,
    '',
    `Ruleset \`${ruleset.meta.id}\`. A tail landing on a run, fought ${CONVOY_SAMPLES} times on the raid engine with the road's strength roll (defense x${convoyRules(ruleset)!.fight.defenseMultiplier}, variance ${Math.round(convoyRules(ruleset)!.fight.variance * 100)}%): the attacker's squad against the escorts and any backup that reaches them, every thug with a pistol, at ${MORALE}% morale. `
      + `Home backup is ${Math.round(convoyRules(ruleset)!.homeBackupMaxShare * 100)}% of the owner's fit thugs at home in the home town, falling to none at the edge of the home zone.`,
    '',
    '| Scenario | Attackers | Defenders | Attacker wins | Band |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...results.map((result) => `| ${result.scenario.name} | ${result.scenario.attackers} | ${result.defenders} | ${percent(result.winRate)} | ${percent(result.scenario.band.min)}-${percent(result.scenario.band.max)} |`),
    '',
    '## Gate',
    '',
    problems.length ? problems.map((line) => `- ${line}`).join('\n') : '- Passes: even fights are fights, light escorts are prey, a run at home is hard to take but not untouchable, and backup changes the odds.',
    '',
  ].join('\n');
}
