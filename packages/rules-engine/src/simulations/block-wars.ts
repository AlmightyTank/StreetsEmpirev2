import type { Ruleset } from '@streets/rulesets';
import { hashParts, seededRng, type Rng } from '../rng.js';
import { simulateRaid } from '../calculations/combat.js';
import { turfPushCombatModel } from '../calculations/turf.js';
import { allyThugCap } from '../calculations/business.js';
import { alliedShare, blockWarRules, controlAfterBreak, siegeControlAfter } from '../calculations/block-wars.js';

/**
 * 1.1.0-D's war gate. Ally help is no longer a dice roll: it depends on a real member being
 * online and answering, and it can match the declarer's whole squad. So the simulation runs
 * whole wars, hour by hour, against a response-rate assumption: how often a holder or an
 * ally is online, by time of day. It plays the server's rules: the opening fight, sieges,
 * break attempts, re-assaults after the cooldown, and the time limit.
 */

const HAPPINESS = 85;
/** Online chance in a given hour: waking hours and the night. */
export const ONLINE_DAY = 0.45;
export const ONLINE_NIGHT = 0.05;
/** Chance an online ally answers a call. */
export const ALLY_ANSWERS = 0.6;
/**
 * Mid-round crews of about 30 fit thugs, each drawn between 70% and 130% of that. The
 * declarer sends two thirds and keeps the rest home; the holder has a third on the corner
 * and the rest at home; an ally sends two thirds of its own crew, up to the cap (the
 * declarer's squad).
 */
export const WAR_CREW = 30;
export const WAR_CREW_SPREAD = 0.3;
export const WAR_SQUAD_SHARE = 2 / 3;
export const WAR_CORNER_SHARE = 1 / 3;
/**
 * Even matchups (solo vs. solo, alliance vs. alliance) must stay swingy: the attacker wins
 * inside this band, and a holder who comes online within 8 hours wins at least this share.
 */
export const WAR_ATTACKER_WIN_BAND: readonly [number, number] = [0.2, 0.75];
export const WAR_RESPONSIVE_DEFENDER_MIN = 0.3;
export const WAR_RESPONSE_HOURS = 8;
/**
 * Lopsided matchups: an alliance with its ally online beats a lone holder most of the time
 * (the decided 1x ally cap doubles the squad), but never every time; and a lone declarer
 * still beats an allied holder sometimes.
 */
export const WAR_ALLIANCE_VS_SOLO_MAX = 0.85;
export const WAR_SOLO_VS_ALLIANCE_MIN = 0.1;

export interface BlockWarScenario {
  readonly key: 'SOLO_VS_SOLO' | 'ALLIANCE_VS_SOLO' | 'SOLO_VS_ALLIANCE' | 'ALLIANCE_VS_ALLIANCE';
  readonly label: string;
  readonly attackerAlly: boolean;
  readonly defenderAlly: boolean;
  /** Both sides equally placed: the swing band applies. */
  readonly even: boolean;
}

export const BLOCK_WAR_SCENARIOS: readonly BlockWarScenario[] = [
  { key: 'SOLO_VS_SOLO', label: 'Solo vs. solo', attackerAlly: false, defenderAlly: false, even: true },
  { key: 'ALLIANCE_VS_SOLO', label: 'Alliance vs. solo', attackerAlly: true, defenderAlly: false, even: false },
  { key: 'SOLO_VS_ALLIANCE', label: 'Solo vs. alliance', attackerAlly: false, defenderAlly: true, even: false },
  { key: 'ALLIANCE_VS_ALLIANCE', label: 'Alliance vs. alliance', attackerAlly: true, defenderAlly: true, even: true },
];

export interface BlockWarScenarioSummary {
  readonly scenario: BlockWarScenario;
  readonly wars: number;
  readonly attackerWinRate: number;
  /** Of the wars where the holder came online within 8 hours, the share the holder won. */
  readonly responsiveDefenderWinRate: number;
  readonly averageHours: number;
  readonly longestHours: number;
  readonly averageFights: number;
  readonly averageSiegeHours: number;
}

function online(hourOfDay: number, rng: Rng): boolean {
  const awake = hourOfDay >= 8 && hourOfDay < 24;
  return rng() < (awake ? ONLINE_DAY : ONLINE_NIGHT);
}

interface WarRun {
  attackerWon: boolean;
  hours: number;
  fights: number;
  siegeHours: number;
  firstResponseHour: number;
}

function runWar(ruleset: Ruleset, scenario: BlockWarScenario, index: number): WarRun {
  const wars = blockWarRules(ruleset)!;
  const model = turfPushCombatModel(ruleset)!;
  const rng = seededRng(hashParts(ruleset.meta.id, 'block-war', scenario.key, index));
  const crew = (thugs: number) => ({ thugs, thugHappiness: HAPPINESS, weapons: { PISTOL: thugs, SHOTGUN: 0, TEK9: 0, AK47: 0 } });
  const fight = (attackers: number, defenders: number): { won: boolean; attackerWounds: number; defenderWounds: number } => {
    const squad = Math.min(model.squadCap, Math.max(1, attackers));
    const result = simulateRaid({
      attacker: crew(squad),
      defender: crew(Math.max(0, defenders)),
      attackingThugs: squad,
      attackerTurns: model.turnCost,
      defenderCashCents: 0n,
    }, model, rng);
    return { won: result.winner === 'ATTACKER', attackerWounds: result.wounds.attacker, defenderWounds: result.wounds.defender };
  };

  const start = Math.floor(rng() * 24);
  const crewSize = () => Math.round(WAR_CREW * (1 - WAR_CREW_SPREAD + 2 * WAR_CREW_SPREAD * rng()));
  const declarer = crewSize();
  const holder = crewSize();
  const squadSize = Math.round(declarer * WAR_SQUAD_SHARE);
  const allyCap = allyThugCap(ruleset, squadSize);
  const attackerAllyThugs = Math.min(allyCap, Math.round(crewSize() * WAR_SQUAD_SHARE));
  const defenderAllyThugs = Math.min(allyCap, Math.round(crewSize() * WAR_SQUAD_SHARE));
  let corner = Math.round(holder * WAR_CORNER_SHARE);
  let holderHome = holder - corner;
  let fights = 0;
  let siegeHours = 0;
  let firstResponseHour = Number.POSITIVE_INFINITY;
  const respond = (hour: number) => {
    const on = online((start + Math.floor(hour)) % 24, rng);
    if (on && hour < firstResponseHour) firstResponseHour = hour;
    return on;
  };
  const allyAnswers = (hour: number) => online((start + Math.floor(hour)) % 24, rng) && rng() < ALLY_ANSWERS;
  // The declarer has to be online to call their ally into a siege.
  const declarerCalls = (hour: number) => online((start + Math.floor(hour)) % 24, rng);

  // An assault: the declarer's squad (and the ally, if they answer) against the corner,
  // with the holder's backup and ally if they are online before it lands.
  const assault = (hour: number): { won: boolean; squad: number; ally: number } => {
    fights += 1;
    const ally = scenario.attackerAlly && allyAnswers(hour) ? attackerAllyThugs : 0;
    const holderOnline = respond(hour);
    const backup = holderOnline ? holderHome : 0;
    const defAlly = holderOnline && scenario.defenderAlly && allyAnswers(hour) ? defenderAllyThugs : 0;
    const result = fight(squadSize + ally, corner + backup + defAlly);
    // Wounds land on the corner first, then the backup.
    const cornerWounds = Math.min(corner, result.defenderWounds);
    corner -= cornerWounds;
    holderHome = Math.max(0, holderHome - Math.max(0, result.defenderWounds - cornerWounds));
    const share = squadSize / (squadSize + ally);
    const squadLeft = Math.max(0, squadSize - Math.round(result.attackerWounds * share));
    const allyLeft = Math.max(0, ally - (result.attackerWounds - Math.round(result.attackerWounds * share)));
    return { won: result.won, squad: squadLeft, ally: allyLeft };
  };

  let hour = wars.warningMinutes / 60;
  let opened = assault(hour);
  while (hour < wars.maxWarHours) {
    if (!opened.won) {
      // Beaten: the squad goes home, and the declarer tries again after the cooldown.
      hour += wars.resiegeCooldownHours + wars.breakMusterMinutes / 60;
      if (hour >= wars.maxWarHours) break;
      opened = assault(hour);
      continue;
    }
    // The siege: Control climbs each hour; an online holder tries to break it.
    let control = 0;
    let squad = opened.squad;
    let ally = opened.ally;
    let broken = false;
    while (hour < wars.maxWarHours) {
      const step = 1;
      const share = alliedShare(squad, ally);
      const before = control;
      control = siegeControlAfter(ruleset, control, step, share);
      const used = control >= 100 ? (100 - before) / (control - before) * step : step;
      hour += used;
      siegeHours += used;
      if (control >= 100) return { attackerWon: hour <= wars.maxWarHours, hours: Math.min(hour, wars.maxWarHours), fights, siegeHours, firstResponseHour };
      if (scenario.attackerAlly && ally === 0 && declarerCalls(hour) && allyAnswers(hour)) ally = attackerAllyThugs;
      if (respond(hour) && holderHome + corner > 0) {
        fights += 1;
        const defAlly = scenario.defenderAlly && allyAnswers(hour) ? defenderAllyThugs : 0;
        hour += wars.breakMusterMinutes / 60;
        // The holder breaks with home thugs, the ally and what is left of the corner. It is
        // still the holder's block, so the holder's side fights on home ground.
        const result = fight(squad + ally, holderHome + corner + defAlly);
        if (!result.won) {
          broken = true;
          control = controlAfterBreak(ruleset, control);
          break;
        }
        holderHome = Math.max(0, holderHome - result.defenderWounds);
        squad = Math.max(1, squad - result.attackerWounds);
      }
    }
    if (!broken) break;
    hour += wars.resiegeCooldownHours;
    if (hour >= wars.maxWarHours) break;
    opened = assault(hour);
  }
  return { attackerWon: false, hours: wars.maxWarHours, fights, siegeHours, firstResponseHour };
}

export function runBlockWarSimulation(ruleset: Ruleset, samples = 2_000): BlockWarScenarioSummary[] {
  if (!blockWarRules(ruleset) || !turfPushCombatModel(ruleset)) return [];
  return BLOCK_WAR_SCENARIOS.map((scenario) => {
    let attackerWins = 0;
    let responsive = 0;
    let responsiveHeld = 0;
    let hours = 0;
    let longest = 0;
    let fights = 0;
    let siege = 0;
    for (let index = 0; index < samples; index++) {
      const run = runWar(ruleset, scenario, index);
      if (run.attackerWon) attackerWins += 1;
      if (run.firstResponseHour <= WAR_RESPONSE_HOURS) {
        responsive += 1;
        if (!run.attackerWon) responsiveHeld += 1;
      }
      hours += run.hours;
      longest = Math.max(longest, run.hours);
      fights += run.fights;
      siege += run.siegeHours;
    }
    return {
      scenario,
      wars: samples,
      attackerWinRate: attackerWins / samples,
      responsiveDefenderWinRate: responsive ? responsiveHeld / responsive : 0,
      averageHours: hours / samples,
      longestHours: longest,
      averageFights: fights / samples,
      averageSiegeHours: siege / samples,
    };
  });
}

export function blockWarGate(ruleset: Ruleset, summaries: readonly BlockWarScenarioSummary[]): string[] {
  const wars = blockWarRules(ruleset);
  if (!wars) return [];
  const problems: string[] = [];
  const [low, high] = WAR_ATTACKER_WIN_BAND;
  const percent = (value: number) => `${(value * 100).toFixed(0)}%`;
  for (const summary of summaries) {
    const { scenario } = summary;
    if (scenario.even && (summary.attackerWinRate < low || summary.attackerWinRate > high)) {
      problems.push(`${scenario.label}: the attacker wins ${percent(summary.attackerWinRate)} of wars, outside ${percent(low)}-${percent(high)}.`);
    }
    if (scenario.even && summary.responsiveDefenderWinRate < WAR_RESPONSIVE_DEFENDER_MIN) {
      problems.push(`${scenario.label}: a holder who responds within ${WAR_RESPONSE_HOURS} hours wins only ${percent(summary.responsiveDefenderWinRate)}.`);
    }
    if (scenario.attackerAlly && !scenario.defenderAlly && summary.attackerWinRate > WAR_ALLIANCE_VS_SOLO_MAX) {
      problems.push(`${scenario.label}: the attacker wins ${percent(summary.attackerWinRate)}, so a lone holder never stands a chance.`);
    }
    if (!scenario.attackerAlly && scenario.defenderAlly && summary.attackerWinRate < WAR_SOLO_VS_ALLIANCE_MIN) {
      problems.push(`${scenario.label}: the attacker wins only ${percent(summary.attackerWinRate)}, so an allied block can't be touched.`);
    }
    if (summary.longestHours > wars.maxWarHours) {
      problems.push(`${summary.scenario.label}: a war ran ${summary.longestHours.toFixed(1)} hours, past the ${wars.maxWarHours}-hour limit.`);
    }
  }
  return problems;
}

export function blockWarMarkdown(ruleset: Ruleset, summaries: readonly BlockWarScenarioSummary[]): string {
  if (!summaries.length) return '';
  const lines = [
    '### Block war outcomes',
    '',
    `Mid-round crews of ${WAR_CREW} fit thugs, each between ${Math.round((1 - WAR_CREW_SPREAD) * WAR_CREW)} and ${Math.round((1 + WAR_CREW_SPREAD) * WAR_CREW)}, pistols all round: the declarer sends two thirds, the holder has a third on the corner, an ally sends two thirds of its crew up to the cap. Declared at a random hour. A holder or ally is online ${ONLINE_DAY * 100}% of waking hours and ${ONLINE_NIGHT * 100}% of night hours, an online ally answers ${ALLY_ANSWERS * 100}% of calls, and an online holder tries to break the siege. ${summaries[0]!.wars.toLocaleString('en-US')} wars per line.`,
    '',
    '| Scenario | Attacker wins | Holder wins if online within 8h | Average length | Fights | Siege hours |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const summary of summaries) {
    lines.push(`| ${summary.scenario.label} | ${(summary.attackerWinRate * 100).toFixed(0)}% | ${(summary.responsiveDefenderWinRate * 100).toFixed(0)}% | ${summary.averageHours.toFixed(1)}h | ${summary.averageFights.toFixed(1)} | ${summary.averageSiegeHours.toFixed(1)} |`);
  }
  lines.push('');
  return lines.join('\n');
}
