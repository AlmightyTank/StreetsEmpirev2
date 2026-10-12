import { writeFile } from 'node:fs/promises';
import { seededRng } from '@streets/rules-engine';
import { NPC_GANG_PERSONALITIES, classicOgV15E3, rulesets, type NpcGangTier, type Ruleset } from '@streets/rulesets';
import { dormancyCall, momentumAggression, npcMomentum, type NpcFight } from '../../apps/server/src/services/npc-gang-momentum.js';
import { npcBountyCents, npcRetireReason } from '../../apps/server/src/services/npc-gang-rewards.js';
import { npcRules } from '../../apps/server/src/services/npc-gang-rules.js';
import { npcCrewTarget } from '../../apps/server/src/services/npc-gang-spawn.service.js';
import { NpcGangModel, type NpcGangIntent, type NpcGangModelTraits, type NpcGangOutcome } from '../../apps/server/src/services/npc-gang.service.js';

/**
 * Phase P: NPC gang balance model.
 *
 * Runs crews through the live scheduler's intent weights, pacing, momentum, dormancy,
 * break-up and bounty rules for 7 days and a full season, in a world of `--humans`
 * active humans. An attack needs a human no NPC hit inside the retaliation window
 * (the live anti-dogpile rule), then passes shields and "not back" checks with
 * `--target-odds`, and wins with `--npc-win`. Humans hit each crew `--human-hits`
 * times a day and win `--human-win` of those. The roster crews a round of this size
 * would spawn share one world (as Scrubs; the sim has no economy, so tiers stay put);
 * each grid crew gets a world of its own. Measured numbers live in Admin → Integrations.
 *
 *   npm run qa:npc-gangs -- [--ruleset <id>] [--humans 10] [--npc-win 0.5] [--human-win 0.5]
 *                           [--human-hits 1] [--target-odds 0.7] [--seed 7] [--output report.md] [--quiet]
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const num = (name: string, fallback: number) => (arg(name) === undefined ? fallback : Number(arg(name)));

const ruleset: Ruleset = (arg('ruleset') && rulesets[arg('ruleset')!]) || classicOgV15E3;
const rules = npcRules(ruleset);
const HUMANS = Math.max(1, num('humans', 10));
const NPC_WIN = num('npc-win', 0.5);
const HUMAN_WIN = num('human-win', 0.5);
const HUMAN_HITS_PER_DAY = num('human-hits', 1);
const TARGET_ODDS = num('target-odds', 0.7);
const SEED = num('seed', 7);
const SEASON_DAYS = ruleset.round.defaultDurationDays;
const START = new Date('2026-01-01T00:00:00.000Z');
const DAY = 24 * 60;

const ATTACKS: Partial<Record<NpcGangIntent, NpcGangOutcome>> = {
  RAID_PLAYER: 'RAIDED',
  DRIVE_BY_PLAYER: 'DROVE_BY',
  SPECIAL_RAID_PLAYER: 'SPECIAL_RAIDED',
};
const CALM: Record<string, NpcGangOutcome> = { RESTOCK: 'RESTOCKED', PRODUCE: 'PRODUCED', HUSTLE: 'HUSTLED', TURF: 'WORKED_TURF', LAY_LOW: 'LAY_LOW' };

interface Profile { name: string; traits: NpcGangModelTraits }

interface Result {
  name: string;
  hitsPerDay: number;
  winsPerDay: number;
  dogpileSkips: number;
  humanHitsTaken: number;
  dormancies: number;
  retiredDay: number | null;
  hotShare: number;
  dormantShare: number;
  bounties: number;
  bountyCents: number;
  mix: Record<string, number>;
}

interface CrewState {
  profile: Profile;
  fights: Array<NpcFight & { minute: number }>;
  mix: Record<string, number>;
  minute: number;
  lastWoke: number;
  dormantUntil: number;
  dormancies: number;
  retiredDay: number | null;
  hits: number;
  wins: number;
  humanHitsTaken: number;
  actions: number;
  hotActions: number;
  dormantMinutes: number;
  bounties: number;
  bountyCents: number;
  bountyDays: Map<number, number>;
  lastHitOnHuman: number;
  dogpileSkips: number;
  humanHits: number[];
  nextHuman: number;
}

/** The scheduler's availability gates, by effective aggression and ambition. */
function available(traits: NpcGangModelTraits, aggression: number): NpcGangIntent[] {
  const out: NpcGangIntent[] = ['RESTOCK', 'HUSTLE'];
  if (aggression >= 80 && ruleset.combat?.driveBy) out.push('DRIVE_BY_PLAYER');
  if (aggression >= 70 && ruleset.combat?.specialRaids) out.push('SPECIAL_RAID_PLAYER');
  if (aggression >= 55 && ruleset.combat) out.push('RAID_PLAYER');
  if (traits.ambition >= 30) out.push('PRODUCE');
  if (traits.ambition >= rules.turf.minAmbition && ruleset.turf?.holding) out.push('TURF');
  return out;
}

/** One world: crews act in time order against a shared pool of humans. */
function simulateWorld(crewProfiles: readonly Profile[], days: number, rng: () => number): Result[] {
  const end = days * DAY;
  const dogpileMinutes = Math.max(1, rules.retaliationHours) * 60;
  const lastNpcHit = Array.from({ length: HUMANS }, () => -Infinity);
  const when = (at: number) => new Date(START.getTime() + at * 60_000);

  const crews: CrewState[] = crewProfiles.map((profile) => {
    const humanHits: number[] = [];
    for (let at = 0; HUMAN_HITS_PER_DAY > 0;) {
      at += (-Math.log(1 - rng()) / HUMAN_HITS_PER_DAY) * DAY;
      if (at >= end) break;
      humanHits.push(at);
    }
    return {
      profile, fights: [], mix: {}, minute: Math.floor(rng() * 30), lastWoke: 0, dormantUntil: -1, dormancies: 0, retiredDay: null,
      hits: 0, wins: 0, humanHitsTaken: 0, actions: 0, hotActions: 0, dormantMinutes: 0, bounties: 0, bountyCents: 0,
      bountyDays: new Map(), lastHitOnHuman: -Infinity, dogpileSkips: 0, humanHits, nextHuman: 0,
    };
  });

  // Human hits on a crew land whether it is awake or not; a win on a wanted crew pays.
  const takeHumanHits = (crew: CrewState, until: number) => {
    while (crew.nextHuman < crew.humanHits.length && crew.humanHits[crew.nextHuman]! <= until) {
      const at = crew.humanHits[crew.nextHuman++]!;
      if (crew.retiredDay !== null && at >= crew.retiredDay * DAY) continue;
      const humanWon = rng() < HUMAN_WIN;
      crew.humanHitsTaken += 1;
      crew.fights.push({ attacker: false, won: !humanWon, cashCents: 0, human: true, opponent: 'human', kind: 'RAID', at: when(at), minute: at });
      const day = Math.floor(at / DAY);
      if (humanWon && at - crew.lastHitOnHuman <= rules.rewards.wantedHours * 60 && (crew.bountyDays.get(day) ?? 0) < rules.rewards.maxPerCrewPerDay) {
        crew.bounties += 1;
        crew.bountyCents += npcBountyCents(crew.profile.traits.tier, 'ATTACKER', rules.rewards);
        crew.bountyDays.set(day, (crew.bountyDays.get(day) ?? 0) + 1);
      }
    }
  };

  for (;;) {
    const crew = crews.filter((row) => row.retiredDay === null && row.minute < end).sort((left, right) => left.minute - right.minute)[0];
    if (!crew) break;
    const minute = crew.minute;
    takeHumanHits(crew, minute);
    if (minute < crew.dormantUntil) {
      crew.dormantMinutes += Math.min(crew.dormantUntil, end) - minute;
      crew.minute = crew.dormantUntil;
      crew.lastWoke = crew.dormantUntil;
      continue;
    }

    const now = when(minute);
    const window = Math.max(crew.lastWoke, minute - rules.escalation.windowHours * 60);
    const recent = crew.fights.filter((fight) => fight.minute >= window);
    const momentum = npcMomentum(recent, 0, rules.escalation, now);
    const humanHitsDay = recent.filter((fight) => !fight.attacker && fight.minute >= minute - rules.escalation.overTargetedHours * 60).length;
    const ground = dormancyCall({ momentum, humanHits: humanHitsDay, rules: rules.escalation });
    if (ground) {
      crew.dormancies += 1;
      if (npcRetireReason({ dormancies: crew.dormancies, woke: false, thugs: 99, rules: rules.rewards })) {
        crew.retiredDay = Math.round((minute / DAY) * 10) / 10;
        continue;
      }
      crew.dormantUntil = minute + ground.hours * 60;
      continue;
    }

    crew.actions += 1;
    if (momentum >= rules.escalation.hotAt) crew.hotActions += 1;
    const aggression = Math.max(0, Math.min(100, crew.profile.traits.aggression + momentumAggression(momentum, rules.escalation)));
    const tempered = { ...crew.profile.traits, aggression };
    const candidates = available(crew.profile.traits, aggression).map((intent) => ({ intent, weight: NpcGangModel.intentWeight(tempered, intent, ruleset) }));
    const layLow = Math.max(0, NpcGangModel.intentWeight(tempered, 'LAY_LOW', ruleset) - candidates.length * 12);
    if (layLow > 0) candidates.push({ intent: 'LAY_LOW', weight: layLow });
    const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let roll = rng() * total;
    const picked = candidates.find((candidate) => (roll -= candidate.weight) <= 0)?.intent ?? 'LAY_LOW';

    let outcome: NpcGangOutcome = ATTACKS[picked] ?? CALM[picked] ?? 'LAY_LOW';
    if (ATTACKS[picked]) {
      // The live picker walks targets in order: anyone an NPC hit inside the window is a dogpile skip.
      const open = lastNpcHit.map((at, index) => ({ at, index })).filter((row) => minute - row.at >= dogpileMinutes);
      crew.dogpileSkips += lastNpcHit.length - open.length;
      const target = open.length && rng() < TARGET_ODDS ? open[Math.floor(rng() * open.length)]! : null;
      if (target) {
        const won = rng() < NPC_WIN;
        crew.hits += 1;
        crew.wins += won ? 1 : 0;
        crew.lastHitOnHuman = minute;
        lastNpcHit[target.index] = minute;
        crew.fights.push({ attacker: true, won, cashCents: won ? 1 : 0, human: true, opponent: 'human', kind: picked, at: now, minute });
      } else {
        outcome = 'LAY_LOW';
      }
    }
    crew.mix[outcome] = (crew.mix[outcome] ?? 0) + 1;
    crew.minute = minute + NpcGangModel.nextActionMinutes(tempered, momentum, ruleset, outcome, now);
  }

  return crews.map((crew) => {
    takeHumanHits(crew, end);
    const lived = Math.max(1 / 24, Math.min(days, crew.retiredDay ?? days));
    return {
      name: crew.profile.name,
      hitsPerDay: Math.round((crew.hits / lived) * 100) / 100,
      winsPerDay: Math.round((crew.wins / lived) * 100) / 100,
      dogpileSkips: crew.dogpileSkips,
      humanHitsTaken: crew.humanHitsTaken,
      dormancies: crew.dormancies,
      retiredDay: crew.retiredDay,
      hotShare: crew.actions ? Math.round((crew.hotActions / crew.actions) * 100) / 100 : 0,
      dormantShare: Math.round((crew.dormantMinutes / (lived * DAY)) * 100) / 100,
      bounties: crew.bounties,
      bountyCents: crew.bountyCents,
      mix: crew.mix,
    };
  });
}

const seededProfiles: Profile[] = rules.roster.slice(0, npcCrewTarget(HUMANS, rules.spawn, rules.roster.length)).map((entry) => ({
  name: `${entry.crewName} (${entry.personality})`,
  traits: { archetype: entry.personality, tier: 'SCRUB', aggression: entry.aggression, ambition: entry.ambition, discipline: entry.discipline },
}));
const gridProfiles: Profile[] = Object.keys(NPC_GANG_PERSONALITIES).flatMap((archetype) => (['SCRUB', 'VETERAN', 'KINGPIN'] as NpcGangTier[]).map((tier) => ({
  name: `${archetype} · ${tier}`,
  traits: { archetype, tier, aggression: 60, ambition: 55, discipline: 50 },
})));

function row(result: Result): string {
  const mix = Object.entries(result.mix).sort((left, right) => right[1] - left[1]).map(([key, value]) => `${key.toLowerCase()} ${value}`).join(', ');
  return `| ${result.name} | ${result.hitsPerDay} | ${result.winsPerDay} | ${result.dogpileSkips} | ${result.humanHitsTaken} | ${result.dormancies} | ${result.retiredDay ?? '-'} | ${result.hotShare} | ${result.dormantShare} | ${result.bounties} | $${(result.bountyCents / 100).toLocaleString('en-US')} | ${mix} |`;
}

function table(days: number): string {
  const seeded = simulateWorld(seededProfiles, days, seededRng(SEED));
  const grid = gridProfiles.map((profile, index) => simulateWorld([profile], days, seededRng(SEED * 1_000 + index))[0]!);
  const hitsPerDay = seeded.reduce((sum, result) => sum + result.hitsPerDay, 0);
  const cap = (HUMANS * 24) / Math.max(1, rules.retaliationHours);
  const header = [
    '| Crew | Hits/day | Wins/day | Dogpile skips | Hits taken | Grounded | Broke up (day) | Hot share | Dormant share | Bounties | Bounty cash | Move mix |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  return [
    `### ${days} days`,
    '',
    `Roster crews for ${HUMANS} humans (${seededProfiles.length}), one shared world: **${hitsPerDay.toFixed(1)} hits a day**, **${(hitsPerDay / HUMANS).toFixed(2)} per active human** across ${HUMANS}. The anti-dogpile window caps all NPC hits at ${cap.toFixed(1)} a day for this many humans.`,
    '',
    ...header,
    ...seeded.map(row),
    '',
    'Grid crews (traits 60/55/50), each alone in a world of its own:',
    '',
    ...header,
    ...grid.map(row),
    '',
  ].join('\n');
}

const report = [
  `## NPC gang balance model · ${ruleset.meta.id}`,
  '',
  `Assumptions: attacks clear shields and checks ${TARGET_ODDS * 100}% of the time and win ${NPC_WIN * 100}%; humans hit each crew ${HUMAN_HITS_PER_DAY}×/day and win ${HUMAN_WIN * 100}%. Seed ${SEED}.`,
  '',
  table(7),
  table(SEASON_DAYS),
].join('\n');

const output = arg('output');
if (output) await writeFile(output, report);
if (!process.argv.includes('--quiet')) console.log(report);
