import type { CityProductRules, CityRules, SupplyLevel } from '../types.js';

/**
 * 0.5.0-A. The eight cities, each with a character.
 *
 * BALANCE_APPROXIMATION, set against `runTravelSimulation`
 * (docs/TRAVEL-SIMULATION-0.5.0-A.md).
 *
 * Prices are multiples of Pip's base prices, so a product's value stays where
 * 0.4.0-D put it and a city only leans on it. The rules every city keeps:
 *
 *   - `demand` never reaches `price x 0.8 / 0.95` (the plentiful lean, over the
 *     high-market seller's share), so buying at Pip's and selling on the high market in
 *     the same city always loses. Travel is where the money is.
 *   - "Cheap here" is a low price and plentiful supply; "pays here" is high
 *     demand, and Pip charges a lot for it there too.
 *   - New York is every base price and every usual supply, the home Pip's store
 *     unchanged, so a 0.5.0-A round in New York plays like 0.4.0-E.
 *   - `talk` names every product a city has plenty of and every one it pays well for
 *     (`cityRulesetProblems` checks), and never says how much.
 */

type Row = readonly [price: number, demand: number, supply: SupplyLevel | null];
type Products = { readonly CRACK: Row; readonly WEED: Row; readonly ECSTASY: Row; readonly COCAINE: Row; readonly METH: Row; readonly HEROIN: Row };

function products(rows: Products): { readonly [product: string]: CityProductRules } {
  return Object.fromEntries(Object.entries(rows).map(([key, [price, demand, supply]]) => [key, { price, demand, supply }]));
}

const P = 'PLENTIFUL';
const N = 'NORMAL';
const L = 'LOW';

const NO_MODIFIERS = { scout: 1, income: 1, crack: 1 } as const;

export const cities = {
  'new-york-city': {
    name: 'New York City',
    trait: 'The Exchange',
    blurb: 'The city that never sleeps, and never runs dry.',
    talk: [
      "Everything's on Pip's shelf, and nothing on it is a bargain.",
      'Old-timers still pay well for heroin.',
      "The market's so big one crew can barely move the price.",
    ],
    products: products({
      CRACK: [1, 0.6, N], WEED: [1, 0.6, N], ECSTASY: [1, 0.6, N], COCAINE: [1, 0.6, N], METH: [1, 0.6, N],
      // The one thing New York pays for. Kept under the same-city line at base price.
      HEROIN: [1, 0.82, N],
    }),
    supplySwing: 0.1,
    supplyFloor: L,
    policePressure: 1,
    marketDepth: 1200,
    // The 0.4.0-C levels, so staying home changes nothing.
    heat: { dragStartsAt: 40, bustStartsAt: 70, arrestStartsAt: 90, bustSeverity: 1 },
    modifiers: NO_MODIFIERS,
    zoneHours: 2,
    districtPay: { NIGHTCLUB: 1.1 },
  },
  'detroit': {
    name: 'Detroit',
    trait: 'Motor City',
    blurb: 'Hard streets and cheap muscle.',
    talk: [
      'Crack is everywhere, and cheap with it.',
      'Heroin moves fast on the east side.',
      "Pip's always short on ecstasy and cocaine up here.",
    ],
    products: products({
      CRACK: [0.55, 0.4, P], WEED: [1, 0.6, N], ECSTASY: [1.2, 0.7, L], COCAINE: [1.2, 0.8, L], METH: [1, 0.6, N], HEROIN: [1.4, 1.15, N],
    }),
    supplySwing: 0.5,
    supplyFloor: 'OUT',
    policePressure: 0.9,
    marketDepth: 500,
    // Stretched thin: the line is high, but a bust takes more.
    heat: { dragStartsAt: 45, bustStartsAt: 78, arrestStartsAt: 92, bustSeverity: 1.3 },
    modifiers: NO_MODIFIERS,
    zoneHours: 2,
    storePrices: { TOMMY: 0.85, CHARLIE: 0.85 },
  },
  'miami-beach': {
    name: 'Miami Beach',
    trait: 'The Port',
    blurb: 'Sun, boats, and money nobody asks about.',
    talk: [
      'Cocaine comes off the boats cheap.',
      'The clubs on the beach pay for ecstasy.',
      'The feds watch the water, and the highway in.',
    ],
    products: products({
      CRACK: [1, 0.6, N], WEED: [1.2, 0.7, L], ECSTASY: [1.5, 1.25, N], COCAINE: [0.55, 0.4, P], METH: [1.2, 0.7, L], HEROIN: [1.2, 0.7, L],
    }),
    supplySwing: 0.8,
    supplyFloor: 'OUT',
    policePressure: 1.4,
    marketDepth: 600,
    heat: { dragStartsAt: 30, bustStartsAt: 55, arrestStartsAt: 75, bustSeverity: 1.1 },
    modifiers: NO_MODIFIERS,
    zoneHours: 1.5,
  },
  'seattle': {
    name: 'Seattle',
    trait: 'Rain and Green',
    blurb: 'Quiet, patient, and a long way from anywhere.',
    talk: [
      'Weed grows on trees.',
      'Ecstasy comes down cheap from Canada.',
      "Nobody sells heroin here, and nobody's in a hurry to buy much else.",
    ],
    products: products({
      CRACK: [1.2, 0.6, L], WEED: [0.45, 0.35, P],
      // Down from Canada, over the border.
      ECSTASY: [0.7, 0.5, P], COCAINE: [1.2, 0.7, L], METH: [1, 0.6, N], HEROIN: [1, 0.6, null],
    }),
    supplySwing: 0.2,
    supplyFloor: L,
    policePressure: 0.7,
    marketDepth: 300,
    heat: { dragStartsAt: 50, bustStartsAt: 80, arrestStartsAt: 95, bustSeverity: 0.9 },
    modifiers: NO_MODIFIERS,
    zoneHours: 1.5,
  },
  'beverly-hills': {
    name: 'Beverly Hills',
    trait: 'Old Money',
    blurb: 'The richest buyers on the coast, and police on every corner.',
    talk: [
      'Old money pays for cocaine like nowhere else.',
      'Ecstasy sells at the parties up in the hills.',
      "Pip won't carry crack or meth on these streets.",
      'One big sale and the price falls through the floor.',
    ],
    products: products({
      CRACK: [1, 0.5, null], WEED: [1.2, 0.9, N], ECSTASY: [1.4, 1.15, N], COCAINE: [1.8, 1.5, L], METH: [1, 0.5, null], HEROIN: [1.3, 1, L],
    }),
    supplySwing: 0.5,
    supplyFloor: 'OUT',
    policePressure: 1.6,
    marketDepth: 160,
    heat: { dragStartsAt: 25, bustStartsAt: 45, arrestStartsAt: 65, bustSeverity: 1.2 },
    modifiers: NO_MODIFIERS,
    zoneHours: 0.5,
    districtPay: { CASINO: 1.2 },
  },
  'las-vegas': {
    name: 'Las Vegas',
    trait: 'The Strip',
    blurb: 'Fast money, and it moves fast.',
    talk: [
      'Ecstasy and cocaine sell on the Strip.',
      'Prices change here faster than anywhere.',
      'The police look away for a long time, then all at once.',
    ],
    products: products({
      CRACK: [1, 0.6, N], WEED: [1, 0.6, N], ECSTASY: [1.5, 1.25, L], COCAINE: [1.5, 1.25, L], METH: [1, 0.6, N], HEROIN: [1, 0.6, N],
    }),
    supplySwing: 1,
    supplyFloor: 'OUT',
    policePressure: 1.1,
    marketDepth: 400,
    // Looks away, then does not: a small gap between a bust and an arrest.
    heat: { dragStartsAt: 45, bustStartsAt: 75, arrestStartsAt: 82, bustSeverity: 1 },
    modifiers: NO_MODIFIERS,
    zoneHours: 1.5,
    districtPay: { CASINO: 1.15 },
  },
  'los-angeles': {
    name: 'Los Angeles',
    trait: 'The Valley',
    blurb: 'Big, crowded, and it cooks.',
    talk: [
      'Meth is cheap in the Valley.',
      'Weed sells well out here.',
      'Every road on the West Coast runs through town.',
    ],
    products: products({
      CRACK: [1, 0.6, N], WEED: [1.4, 1.15, N], ECSTASY: [1, 0.6, N], COCAINE: [1, 0.7, N], METH: [0.55, 0.4, P], HEROIN: [1.2, 0.7, L],
    }),
    supplySwing: 0.5,
    supplyFloor: 'OUT',
    policePressure: 1,
    marketDepth: 800,
    heat: { dragStartsAt: 40, bustStartsAt: 70, arrestStartsAt: 88, bustSeverity: 1 },
    modifiers: NO_MODIFIERS,
    zoneHours: 2,
  },
  'atlanta': {
    name: 'Atlanta',
    trait: 'The Crossroads',
    blurb: 'Middle of the map, middle of the road.',
    talk: [
      'Heroin comes through cheap.',
      'Meth sells well down here.',
      'The police look the other way, and half the South drives through.',
    ],
    products: products({
      CRACK: [1, 0.6, N], WEED: [1, 0.6, N], ECSTASY: [1.2, 0.7, L], COCAINE: [1, 0.6, N], METH: [1.4, 1.15, L], HEROIN: [0.55, 0.4, P],
    }),
    supplySwing: 0.5,
    supplyFloor: 'OUT',
    policePressure: 0.6,
    marketDepth: 500,
    heat: { dragStartsAt: 55, bustStartsAt: 85, arrestStartsAt: 97, bustSeverity: 0.9 },
    modifiers: NO_MODIFIERS,
    zoneHours: 2.5,
  },
} as const satisfies { readonly [slug: string]: CityRules };
