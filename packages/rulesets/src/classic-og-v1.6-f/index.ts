import { classicOgV16E } from '../classic-og-v1.6-e/index.js';
import { NPC_GANG_ROSTER } from '../npc-gang-personalities.js';
import type { Ruleset } from '../types.js';

const crew = (slug: string) => {
  const found = NPC_GANG_ROSTER.find((entry) => entry.slug === slug);
  if (!found) throw new Error(`Missing NPC crew ${slug}`);
  return found;
};

const RED_HAND = crew('red-hand');
const QUIET_MONEY = crew('quiet-money');
const BACK_ALLEY = crew('back-alley');
const COOKHOUSE = crew('cookhouse');
const HOT_WIRE = crew('hot-wire');

/**
 * 1.6.0-F — sales, restocking and the ledger. Working crews sell on the server's clock in
 * whole hours: stock out, cash in after the dealers' cut and wages, experience to the
 * dealers who sold it. Police-heavy cities sell slower. Stock moves between warehouses
 * only by run, so restocking a crew in another city takes a shipment and the cars for it.
 *
 * BALANCE_APPROXIMATION, for 1.6.0-I's simulation to tune.
 */
export const classicOgV16F = {
  ...classicOgV16E,
  meta: { id: 'classic-og-v1.6-f', version: '1.6.0-F', name: 'Classic OG - Dealer Sales' },
  supplyNetwork: {
    ...classicOgV16E.supplyNetwork,
    pickups: { ...classicOgV16E.supplyNetwork.pickups, shipments: true },
    dealers: {
      ...classicOgV16E.supplyNetwork.dealers,
      // San Francisco's 1.6 pressure sells at about 79% pace; Atlanta's 0.6 at about 129%.
      pressureWeight: 0.5,
      sales: { intervalMinutes: 60, maxBatchIntervals: 24, experiencePerUnit: 1 },
    },
  },
  npcGangs: {
    enabled: false,
    spawn: { enabled: false },
  },
  randomEncounters: {
    enabled: true,
    triggers: {
      SCOUT: {
        enabled: true,
        chance: 0.12,
        cooldownMinutes: 30,
        perKeyCooldownMinutes: 180,
        minTurns: 5,
        entries: [
          {
            key: 'scout-street-tip',
            title: 'Street tip',
            text: 'A regular points your crew toward a small side score before the block dries up.',
            tone: 'good',
            weight: 10,
            cash: { minCents: 2_500, maxCents: 12_500 },
          },
          {
            key: 'scout-low-rent-tip',
            title: 'Back-room tip',
            text: 'Someone in the neighborhood owes a favor and passes your crew a cleaner lead than usual.',
            tone: 'good',
            weight: 4,
            districts: ['LOW_RENT', 'WINO_SLUMS'],
            cash: { minCents: 5_000, maxCents: 20_000 },
          },
          {
            key: 'scout-shakedown',
            title: 'Sidewalk shakedown',
            text: 'Some local muscle presses the crew before anyone important sees it.',
            tone: 'warn',
            weight: 3,
            cash: { minCents: -15_000, maxCents: -3_000 },
          },
          {
            key: 'scout-red-hand-pressure',
            title: `${RED_HAND.crewName} pressure`,
            text: `${RED_HAND.crewName} hitters lean on the corner and make your crew pay to keep the night quiet.`,
            tone: 'warn',
            weight: 2,
            cash: { minCents: -18_000, maxCents: -4_000 },
          },
          {
            key: 'scout-lookout-spooked',
            title: 'Lookout spooked',
            text: 'A twitchy lookout thinks he saw a badge and scatters part of the corner supply.',
            tone: 'warn',
            weight: 3,
            supplies: {
              condoms: { min: -4, max: -1 },
              beer: { min: -3, max: -1 },
            },
          },
          {
            key: 'scout-cruiser-rolls-by',
            title: 'Cruiser rolls by',
            text: 'A patrol car circles the block twice. Nobody gets pinched, but the street gets hot.',
            tone: 'bad',
            weight: 2,
            heat: { min: 1, max: 3 },
          },
          {
            key: 'scout-quiet-money-lead',
            title: `${QUIET_MONEY.crewName} lead`,
            text: `${QUIET_MONEY.bossName}'s people pass along a quiet customer list before a louder crew finds it.`,
            tone: 'good',
            weight: 2,
            cash: { minCents: 7_500, maxCents: 22_500 },
          },
          {
            key: 'scout-back-alley-choice',
            title: `${BACK_ALLEY.crewName} whisper`,
            text: `${BACK_ALLEY.crewName} offers a tip on a distracted corner, but the play could draw attention.`,
            tone: 'neutral',
            weight: 2,
            choices: [
              {
                key: 'pay-whisper',
                label: 'Pay for the whisper',
                text: 'Pay for the lead and keep the exchange quiet.',
                cash: { minCents: -7_500, maxCents: -7_500 },
              },
              {
                key: 'run-whisper',
                label: 'Run the play',
                text: 'Take the opening and move fast before the corner notices.',
                cash: { minCents: 10_000, maxCents: 28_000 },
                heat: { min: 1, max: 2 },
              },
              {
                key: 'leave-whisper',
                label: 'Leave it alone',
                text: 'Let the rumor die on the block.',
              },
            ],
          },
          {
            key: 'scout-kid-tip-choice',
            title: 'Corner tip',
            text: 'A nervous kid says he knows where a small stash changed hands.',
            tone: 'neutral',
            weight: 4,
            choices: [
              {
                key: 'buy-tip',
                label: 'Buy the tip',
                text: 'Pay for the lead and keep things friendly.',
                cash: { minCents: -5_000, maxCents: -5_000 },
              },
              {
                key: 'shake-tip',
                label: 'Press him',
                text: 'Lean on him and see what falls out, even if the corner talks afterward.',
                cash: { minCents: 2_500, maxCents: 15_000 },
                heat: { min: 1, max: 2 },
              },
              {
                key: 'walk-away',
                label: 'Walk away',
                text: 'No payday, no trouble.',
              },
            ],
          },
        ],
      },
      PRODUCE: {
        enabled: true,
        chance: 0.1,
        cooldownMinutes: 45,
        perKeyCooldownMinutes: 240,
        minTurns: 5,
        entries: [
          {
            key: 'produce-buyer-waiting',
            title: 'Buyer waiting',
            text: 'A small buyer is ready when the batch wraps, paying a little extra for speed.',
            tone: 'good',
            weight: 8,
            cash: { minCents: 5_000, maxCents: 18_000 },
          },
          {
            key: 'produce-lookout-tax',
            title: 'Lookout tax',
            text: 'The cook stays quiet, but a lookout needs paying before word spreads.',
            tone: 'warn',
            weight: 3,
            cash: { minCents: -12_000, maxCents: -2_500 },
          },
          {
            key: 'produce-cookhouse-spare-bag',
            title: `${COOKHOUSE.crewName} spare bag`,
            text: `${COOKHOUSE.bossName}'s cooks trade a little extra stock for staying out of their kitchen's way.`,
            tone: 'good',
            weight: 2,
            supplies: {
              crack: { min: 8, max: 24 },
            },
          },
          {
            key: 'produce-cookhouse-smoke',
            title: `${COOKHOUSE.crewName} smoke`,
            text: `${COOKHOUSE.crewName} stirs noise around the batch and forces your lookouts to cool the room down.`,
            tone: 'bad',
            weight: 2,
            heat: { min: 1, max: 2 },
          },
        ],
      },
      TRAVEL: {
        enabled: true,
        chance: 0.12,
        cooldownMinutes: 45,
        perKeyCooldownMinutes: 240,
        minTurns: 0,
        entries: [
          {
            key: 'travel-roadside-tip',
            title: 'Roadside tip',
            text: 'A gas-station regular passes the crew a shortcut to a quiet payday before they roll out.',
            tone: 'good',
            weight: 7,
            cash: { minCents: 4_000, maxCents: 16_000 },
          },
          {
            key: 'travel-scale-house',
            title: 'Scale-house delay',
            text: 'A state scale-house wave-through turns into paperwork and a little money under the counter.',
            tone: 'warn',
            weight: 4,
            cash: { minCents: -10_000, maxCents: -2_500 },
          },
          {
            key: 'travel-hot-wire-toll',
            title: `${HOT_WIRE.crewName} toll`,
            text: `${HOT_WIRE.crewName} spots the convoy and taxes the route before anyone starts shooting.`,
            tone: 'warn',
            weight: 3,
            cash: { minCents: -20_000, maxCents: -5_000 },
          },
          {
            key: 'travel-quiet-money-detour',
            title: `${QUIET_MONEY.crewName} detour`,
            text: `${QUIET_MONEY.crewName} sends the crew around a known checkpoint and keeps the plates colder than usual.`,
            tone: 'good',
            weight: 2,
            heat: { min: -2, max: -1 },
          },
          {
            key: 'travel-marked-cruiser',
            title: 'Marked cruiser',
            text: 'A marked cruiser tails the crew long enough for the plates to get noticed.',
            tone: 'bad',
            weight: 3,
            heat: { min: 1, max: 2 },
          },
        ],
      },
    },
  },
} as const satisfies Ruleset;
