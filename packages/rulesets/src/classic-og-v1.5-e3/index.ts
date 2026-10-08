import { classicOgV15E2 } from '../classic-og-v1.5-e2/index.js';
import type { Ruleset } from '../types.js';

const base = classicOgV15E2;
const OLD = 'beverly-hills';
const NEW = 'san-francisco';

/** The same record with Beverly Hills' entry re-keyed to San Francisco, in the same place in the order. */
function rekey<T>(record: Readonly<Record<string, T>>, value?: unknown): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => (key === OLD ? [NEW, (value ?? entry) as T] : [key, entry])));
}

const { [OLD]: beverlyHills, ...otherCities } = base.cities;

/**
 * 1.5.0-E3 — San Francisco.
 *
 * San Francisco takes Beverly Hills' place on the map. It keeps the same economy: the
 * richest buyers on the coast, heavy police, the same prices, supply and Heat lines, the Pawn
 * Shop signature and the private-club casino. Only the geography and the words change: I-5
 * now runs Los Angeles to San Francisco (6 hours) and on to Seattle (12 hours), replacing the
 * 30-minute Sunset Blvd hop and the direct Los Angeles–Seattle road.
 */
export const classicOgV15E3 = {
  ...base,
  meta: { id: 'classic-og-v1.5-e3', version: '1.5.0-E3', name: 'Classic OG - San Francisco' },
  cities: {
    ...Object.fromEntries(Object.entries({ ...otherCities }).slice(0, 4)),
    [NEW]: {
      ...beverlyHills,
      name: 'San Francisco',
      trait: 'Tech Money',
      blurb: 'The richest buyers on the coast, and police on every hill.',
      talk: [
        'Tech money pays for cocaine like nowhere else.',
        'Ecstasy sells at the warehouse parties south of Market.',
        "Pip won't carry crack or meth on these streets.",
        'One big sale and the price falls through the floor.',
      ],
      districts: {
        CASINO: { name: 'Nob Hill Rooms', blurb: 'Private tables, new money and expensive tastes. The richest block is also the least forgiving.' },
        NIGHTCLUB: { name: 'SoMa After Dark', blurb: 'Warehouse parties and velvet-rope rooms bring strong money with plenty of eyes watching.' },
        LOW_RENT: { name: 'The Mission', blurb: 'The working side of a rich city: apartments, corner stores and steadier street money.' },
        URBAN_GHETTO: { name: 'Tenderloin Alleys', blurb: 'Tight blocks where crews, workers and delivery traffic overlap after dark.' },
        WINO_SLUMS: { name: 'Embarcadero Motels', blurb: 'The cheap edge of expensive territory, where recruits are easier to find than wealthy customers.' },
      },
    },
    ...Object.fromEntries(Object.entries({ ...otherCities }).slice(4)),
  },
  travel: {
    ...base.travel,
    roads: [
      ...base.travel.roads.filter((road) => road.to !== OLD && !(road.from === 'los-angeles' && road.to === 'seattle')),
      { from: 'los-angeles', to: NEW, name: 'I-5', driveHours: 6, police: 1.3, note: 'Up the Central Valley: the coast is watching.' },
      { from: NEW, to: 'seattle', name: 'I-5', driveHours: 12, police: 1 },
    ],
    trips: { ...base.travel.trips, hotelPrice: rekey(base.travel.trips.hotelPrice) },
  },
  turf: { ...base.turf, locals: { ...base.turf.locals, byCity: rekey(base.turf.locals.byCity) } },
  business: { ...base.business, signatures: rekey(base.business.signatures) },
  casino: {
    ...base.casino,
    venues: rekey(base.casino.venues, {
      ...base.casino.venues[OLD],
      name: 'Nob Hill Private Club',
      blurb: 'Invitation energy, tech fortunes and tables where nobody asks what you do for a living.',
    }),
  },
  law: {
    ...base.law,
    cities: rekey(base.law.cities, { ...base.law.cities[OLD], blurb: 'Police on every hill: cases build fast and stay warm.' }),
  },
} as const satisfies Ruleset;
