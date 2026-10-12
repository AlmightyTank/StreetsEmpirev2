import { classicOgV16F } from '../classic-og-v1.6-f/index.js';
import type { Ruleset } from '../types.js';

const base = classicOgV16F;

/**
 * 1.6.0-G — Chicago, Tulsa and Dallas join the map, each with its own reason to drive there.
 *
 * - Chicago is the big, contested market in the middle: the deepest market after New York,
 *   crack, weed and heroin dear, tough locals, busy police and long files. Four and a half hours
 *   from Detroit on I-94.
 * - Tulsa is the junction, not a filler stop: Pip's meth is cheapest here, rent is nothing,
 *   the roads are quiet and the law is slow. Its market is thin, so it is where crews stage
 *   stock rather than where they sell it. It sits between Chicago, Dallas, Las Vegas and Atlanta.
 * - Dallas is the southern hub: cocaine comes up cheap from the border, a new supplier sells in
 *   bulk, ecstasy and meth both pay, and its warehouses are the biggest on the map. I-20 runs
 *   east to Atlanta and west to Los Angeles, along the watched border road.
 *
 * Every existing city keeps its numbers. BALANCE_APPROXIMATION throughout, for 1.6.0-I.
 */
export const classicOgV16G = {
  ...base,
  meta: { id: 'classic-og-v1.6-g', version: '1.6.0-G', name: 'Classic OG - Chicago, Tulsa & Dallas' },
  cities: {
    ...base.cities,
    chicago: {
      name: 'Chicago',
      trait: 'Big Shoulders',
      blurb: 'The biggest market in the middle of the country, and the hardest to hold.',
      talk: [
        'Crack, weed and heroin all move by the ton on the West Side.',
        'Every block has an owner, and the locals fight back.',
        'The cops are busy, but the files stay open.',
      ],
      products: {
        CRACK: { price: 1.3, demand: 1, supply: 'NORMAL' },
        WEED: { price: 1.3, demand: 0.95, supply: 'NORMAL' },
        ECSTASY: { price: 1.1, demand: 0.7, supply: 'NORMAL' },
        COCAINE: { price: 1.1, demand: 0.8, supply: 'NORMAL' },
        METH: { price: 0.9, demand: 0.5, supply: 'NORMAL' },
        HEROIN: { price: 1.35, demand: 1.1, supply: 'LOW' },
      },
      supplySwing: 0.3,
      supplyFloor: 'LOW',
      policePressure: 1.2,
      marketDepth: 1_000,
      heat: { dragStartsAt: 35, bustStartsAt: 65, arrestStartsAt: 85, bustSeverity: 1.1 },
      modifiers: { scout: 1, income: 1, crack: 1 },
      zoneHours: 2,
      districts: {
        CASINO: { name: 'Gold Coast Rooms', blurb: 'Lake views and old money. The richest tables in the city, and the most careful doormen.' },
        NIGHTCLUB: { name: 'River North After Dark', blurb: 'Clubs and rooftop bars packed every weekend, with plenty of money and plenty of eyes.' },
        LOW_RENT: { name: 'Pilsen Two-Flats', blurb: 'Working blocks of two-flats and corner stores: steady street money, few surprises.' },
        URBAN_GHETTO: { name: 'West Side Blocks', blurb: 'The busiest corners in the city, held block by block by crews who do not give ground.' },
        WINO_SLUMS: { name: 'Lower Wacker Underpass', blurb: 'The street under the street, where recruits are easy to find and money is not.' },
      },
    },
    tulsa: {
      name: 'Tulsa',
      trait: 'The Junction',
      blurb: 'Small-town money where the interstates cross, and nobody watching the warehouses.',
      talk: [
        'Meth is cheap out here: the cooks are everywhere.',
        'Nobody buys much, but everybody drives through.',
        'Rent is nothing and the police are spread thin.',
      ],
      products: {
        CRACK: { price: 1, demand: 0.5, supply: 'NORMAL' },
        WEED: { price: 1, demand: 0.5, supply: 'NORMAL' },
        ECSTASY: { price: 1.1, demand: 0.5, supply: 'LOW' },
        COCAINE: { price: 1.4, demand: 0.8, supply: 'LOW' },
        METH: { price: 0.5, demand: 0.35, supply: 'PLENTIFUL' },
        HEROIN: { price: 1.1, demand: 0.5, supply: 'NORMAL' },
      },
      supplySwing: 0.6,
      supplyFloor: 'OUT',
      policePressure: 0.7,
      marketDepth: 200,
      heat: { dragStartsAt: 50, bustStartsAt: 80, arrestStartsAt: 95, bustSeverity: 0.9 },
      modifiers: { scout: 1, income: 1, crack: 1 },
      zoneHours: 3,
      districts: {
        CASINO: { name: 'River Spirit Rooms', blurb: 'The casino strip on the river, where oil money still comes to play.' },
        NIGHTCLUB: { name: 'Brady District After Dark', blurb: 'A few blocks of bars and venues that carry the whole city on a Saturday.' },
        LOW_RENT: { name: 'Kendall-Whittier Rentals', blurb: 'Cheap rentals and student traffic: small money, steady and quiet.' },
        URBAN_GHETTO: { name: 'North Tulsa Blocks', blurb: 'Hard blocks with long memories, where crews recruit more than they earn.' },
        WINO_SLUMS: { name: 'Route 66 Motels', blurb: 'Weekly-rate motels along the old highway, full of people passing through.' },
      },
    },
    dallas: {
      name: 'Dallas',
      trait: 'The Hub',
      blurb: 'The southern crossroads: everything heading east or west passes through.',
      talk: [
        'Cocaine comes up from the border cheap.',
        'Ecstasy sells in Deep Ellum, and meth sells everywhere else.',
        'Big roads, big trucks, big warehouses.',
      ],
      products: {
        CRACK: { price: 1, demand: 0.6, supply: 'NORMAL' },
        WEED: { price: 0.9, demand: 0.6, supply: 'NORMAL' },
        ECSTASY: { price: 1.25, demand: 0.95, supply: 'LOW' },
        COCAINE: { price: 0.6, demand: 0.45, supply: 'PLENTIFUL' },
        METH: { price: 1.3, demand: 1, supply: 'LOW' },
        HEROIN: { price: 1.1, demand: 0.7, supply: 'NORMAL' },
      },
      supplySwing: 0.6,
      supplyFloor: 'OUT',
      policePressure: 1,
      marketDepth: 700,
      heat: { dragStartsAt: 40, bustStartsAt: 70, arrestStartsAt: 88, bustSeverity: 1 },
      modifiers: { scout: 1, income: 1, crack: 1 },
      zoneHours: 2.5,
      districts: {
        CASINO: { name: 'Uptown Rooms', blurb: 'Glass towers and private rooms where the deals are bigger than the bets.' },
        NIGHTCLUB: { name: 'Deep Ellum After Dark', blurb: 'Live music, warehouses and crowds until dawn: the best party money in Texas.' },
        LOW_RENT: { name: 'Oak Cliff Rentals', blurb: 'Big neighborhoods of working families and steady corner business.' },
        URBAN_GHETTO: { name: 'South Dallas Blocks', blurb: 'Tough blocks off the freeway where muscle is cheap and loyalty is not.' },
        WINO_SLUMS: { name: 'Stemmons Motels', blurb: 'Freeway motels by the warehouses, full of drivers between loads.' },
      },
    },
  },
  travel: {
    ...base.travel,
    roads: [
      ...base.travel.roads,
      { from: 'detroit', to: 'chicago', name: 'I-94', driveHours: 4.5, police: 1.1, note: 'Along the lake: short and watched.' },
      { from: 'chicago', to: 'new-york-city', name: 'I-80 / I-90', driveHours: 12.5, police: 1 },
      { from: 'chicago', to: 'tulsa', name: 'I-44', driveHours: 10.5, police: 0.9, note: 'Down through St. Louis on old Route 66.' },
      { from: 'tulsa', to: 'dallas', name: 'US-75', driveHours: 4, police: 0.9 },
      { from: 'tulsa', to: 'las-vegas', name: 'I-40', driveHours: 19, police: 0.8, note: 'The long empty road west: hardly a patrol car.' },
      { from: 'tulsa', to: 'atlanta', name: 'I-40 / I-22', driveHours: 12.5, police: 0.9 },
      { from: 'dallas', to: 'atlanta', name: 'I-20', driveHours: 11.5, police: 1.1 },
      { from: 'dallas', to: 'los-angeles', name: 'I-20 / I-10', driveHours: 20, police: 1.4, note: 'The border run: fast money and heavy patrols.' },
    ],
    trips: { ...base.travel.trips, hotelPrice: { ...base.travel.trips.hotelPrice, chicago: 1.3, tulsa: 0.5, dallas: 0.9 } },
  },
  turf: { ...base.turf, locals: { ...base.turf.locals, byCity: { ...base.turf.locals.byCity, chicago: 1.35, tulsa: 0.6, dallas: 1 } } },
  business: {
    ...base.business,
    signatures: {
      ...base.business.signatures,
      chicago: { business: 'BAR', multiplier: 1.25 },
      tulsa: { business: 'CONVENIENCE_STORE', multiplier: 1.25 },
      dallas: { business: 'WAREHOUSE', multiplier: 1.25 },
    },
  },
  casino: {
    ...base.casino,
    venues: {
      ...base.casino.venues,
      chicago: {
        name: 'Back of the Yards Card Room',
        blurb: 'An old union hall with a card room in the back. Everybody knows who runs it, and nobody says.',
        kind: 'UNDERGROUND',
        identity: { tagline: 'Old money, new faces, and a game that never closes.', signatureGame: 'POKER', accent: 'STEEL' },
        vipRoom: { name: 'The Alderman’s Table', blurb: 'A private game for people who make phone calls instead of bets.', minTier: 'PREFERRED', visitorMinBodyguards: 1 },
      },
      tulsa: {
        name: 'Route 66 Dice House',
        blurb: 'A roadhouse off the old highway where truckers and oilmen roll dice until sunrise.',
        kind: 'PRIVATE_CLUB',
        identity: { tagline: 'Cheap drinks, loud dice and nobody in a hurry.', signatureGame: 'STREET_DICE', accent: 'SUNSET' },
        vipRoom: { name: 'The Back Booth', blurb: 'A quiet booth where the regulars play for real money.', minTier: 'REGULAR', visitorMinBodyguards: 0 },
      },
      dallas: {
        name: 'Uptown Lone Star Club',
        blurb: 'A glass-walled club where deals close between hands and the chips are heavier than the drinks.',
        kind: 'NIGHTLIFE',
        identity: { tagline: 'Big money, bigger hats, and a wheel that never stops.', signatureGame: 'ROULETTE', accent: 'GOLD' },
        vipRoom: { name: 'The Cattle Baron Room', blurb: 'High stakes under longhorns, for people who own the trucks.', minTier: 'PREFERRED', visitorMinBodyguards: 1 },
      },
    },
  },
  law: {
    ...base.law,
    cities: {
      ...base.law.cities,
      chicago: { blurb: 'Busy precincts with long memories: files build steadily and rarely close.', caseSpeed: 1.1, coolingSpeed: 0.85, warningHoursMultiplier: 1 },
      tulsa: { blurb: 'Spread thin: files build slowly and go quiet fast.', caseSpeed: 0.6, coolingSpeed: 1.3, warningHoursMultiplier: 1.25 },
      dallas: { blurb: 'Ordinary police on extraordinary roads: an even hand.', caseSpeed: 1, coolingSpeed: 1, warningHoursMultiplier: 1 },
    },
  },
  supplyNetwork: {
    ...base.supplyNetwork,
    suppliers: [
      ...base.supplyNetwork.suppliers,
      {
        key: 'southern-crossing',
        name: 'Southern Crossing',
        citySlug: 'dallas',
        description: 'Fresh over the border: the cheapest cocaine on the map, in smaller lots.',
        offers: {
          WEED: { unitCostCents: 600, minOrderQuantity: 100, maxOrderQuantity: 8_000, stockPerRound: 24_000 },
          COCAINE: { unitCostCents: 3_100, minOrderQuantity: 100, maxOrderQuantity: 5_000, stockPerRound: 15_000 },
          METH: { unitCostCents: 1_250, minOrderQuantity: 100, maxOrderQuantity: 5_000, stockPerRound: 15_000 },
        },
      },
    ],
    properties: {
      ...base.supplyNetwork.properties,
      cities: {
        ...base.supplyNetwork.properties.cities,
        chicago: { warehouse: { costCents: 21_000_000, upkeepCents: 380_000, capacityUnits: 27_000 }, safehouse: { costCents: 9_500_000, upkeepCents: 190_000 } },
        tulsa: { warehouse: { costCents: 8_000_000, upkeepCents: 150_000, capacityUnits: 26_000 }, safehouse: { costCents: 3_500_000, upkeepCents: 70_000 } },
        dallas: { warehouse: { costCents: 14_000_000, upkeepCents: 250_000, capacityUnits: 32_000 }, safehouse: { costCents: 6_000_000, upkeepCents: 120_000 } },
      },
    },
  },
} as const satisfies Ruleset;
