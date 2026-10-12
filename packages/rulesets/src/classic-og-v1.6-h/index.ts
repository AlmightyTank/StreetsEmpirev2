import { classicOgV16G } from '../classic-og-v1.6-g/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.6.0-H — international supply lanes. Suppliers abroad sell cheaper, in bigger lots, but
 * only by contract: the goods and a route card are paid up front, and the load arrives at a
 * warehouse in one of the card's entry cities after its transit time. On arrival it may be
 * searched: a clean arrival stores everything, a partial search takes a share, a seizure
 * takes the load and leaves evidence in that city's Case. The entry city's police pressure
 * scales the odds, so where a load lands matters as much as how it travels.
 *
 * Route cards are game abstractions with their own capacity, cost, time and risk:
 * - Freight: the biggest loads and the lowest fee a unit, but the slowest, through the ports.
 * - Overland: mid-sized loads through the southern hubs, quick but searched more often.
 * - Air: small loads, fast and quiet, at a steep fee a unit.
 * - Northern Supply: the northern border's mid-sized, mid-priced lane, through the north.
 *
 * Monterrey and Mexico City are the southern branch; the north stays an unnamed contact until
 * the map decides on a Canadian city. BALANCE_APPROXIMATION throughout, for 1.6.0-I.
 */
export const classicOgV16H = {
  ...classicOgV16G,
  meta: { id: 'classic-og-v1.6-h', version: '1.6.0-H', name: 'Classic OG - International Lanes' },
  supplyNetwork: {
    ...classicOgV16G.supplyNetwork,
    lanes: {
      maxInTransit: 2,
      routes: {
        FREIGHT: {
          name: 'Freight',
          description: 'A shipping contract through the ports. The biggest loads and the cheapest a unit, but slow, and the docks are watched.',
          entryCities: ['los-angeles', 'miami-beach', 'new-york-city', 'seattle'],
          capacityUnits: 20_000,
          baseFeeCents: 2_000_000,
          feeCentsPerUnit: 200,
          transitHours: 36,
          risk: { seizeChance: 0.06, partialChance: 0.14, partialShare: { min: 0.2, max: 0.5 }, casePoints: 3 },
        },
        OVERLAND: {
          name: 'Overland',
          description: 'A trucking contract up through the southern hubs. Quicker than freight, mid-sized, and searched more often.',
          entryCities: ['dallas', 'los-angeles'],
          capacityUnits: 6_000,
          baseFeeCents: 500_000,
          feeCentsPerUnit: 300,
          transitHours: 12,
          risk: { seizeChance: 0.1, partialChance: 0.2, partialShare: { min: 0.15, max: 0.4 }, casePoints: 3 },
        },
        AIR: {
          name: 'Air',
          description: 'Small loads flown in quietly. Fast and rarely searched, at a steep price a unit.',
          entryCities: ['new-york-city', 'miami-beach', 'atlanta', 'chicago', 'dallas', 'los-angeles', 'las-vegas'],
          capacityUnits: 1_000,
          baseFeeCents: 1_000_000,
          feeCentsPerUnit: 1_500,
          transitHours: 3,
          risk: { seizeChance: 0.04, partialChance: 0.08, partialShare: { min: 0.2, max: 0.6 }, casePoints: 2 },
        },
        NORTHERN: {
          name: 'Northern Supply',
          description: 'A contract across the northern border. Mid-sized and mid-priced, landing in the north.',
          entryCities: ['detroit', 'seattle', 'chicago'],
          capacityUnits: 8_000,
          baseFeeCents: 800_000,
          feeCentsPerUnit: 300,
          transitHours: 18,
          risk: { seizeChance: 0.05, partialChance: 0.12, partialShare: { min: 0.15, max: 0.45 }, casePoints: 2 },
        },
      },
      suppliers: [
        {
          key: 'monterrey-connection',
          name: 'Monterrey Connection',
          origin: 'Monterrey',
          description: 'The nearest of the southern sources: every card but the northern one, and the widest mix.',
          routes: ['OVERLAND', 'FREIGHT', 'AIR'],
          offers: {
            COCAINE: { unitCostCents: 2_300, minOrderQuantity: 500, maxOrderQuantity: 20_000, stockPerRound: 60_000 },
            METH: { unitCostCents: 500, minOrderQuantity: 500, maxOrderQuantity: 20_000, stockPerRound: 60_000 },
            HEROIN: { unitCostCents: 1_000, minOrderQuantity: 500, maxOrderQuantity: 20_000, stockPerRound: 40_000 },
          },
        },
        {
          key: 'mexico-city-contact',
          name: 'Mexico City Contact',
          origin: 'Mexico City',
          description: 'Further south and cheaper still, but only by freight or air, and only in big lots.',
          routes: ['FREIGHT', 'AIR'],
          offers: {
            COCAINE: { unitCostCents: 1_900, minOrderQuantity: 2_000, maxOrderQuantity: 20_000, stockPerRound: 50_000 },
            HEROIN: { unitCostCents: 850, minOrderQuantity: 2_000, maxOrderQuantity: 20_000, stockPerRound: 40_000 },
          },
        },
        {
          key: 'northern-contact',
          name: 'Northern Contact',
          origin: 'Across the northern border',
          description: 'Party product and weed from the north, by the northern lane or by air.',
          routes: ['NORTHERN', 'AIR'],
          offers: {
            WEED: { unitCostCents: 400, minOrderQuantity: 500, maxOrderQuantity: 20_000, stockPerRound: 60_000 },
            ECSTASY: { unitCostCents: 1_600, minOrderQuantity: 500, maxOrderQuantity: 20_000, stockPerRound: 40_000 },
          },
        },
      ],
    },
  },
} as const satisfies Ruleset;
