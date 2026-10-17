import { classicOgV21A } from '../classic-og-v2.1-a/index.js';
import {
  HOLIDAY_ROAD_CHOICE_KEY,
  HOLIDAY_ROAD_COSMETIC_KEY,
  HOLIDAY_ROAD_ENCOUNTER_KEY,
  HOLIDAY_ROAD_STYLE_KEY,
  HOLIDAY_ROAD_WINDOW,
} from '../holiday-road.js';
import type { Ruleset } from '../types.js';

/** Holiday Road: a Christmas-only, low-weight travel encounter, never a paid drop. */
const travel = classicOgV21A.randomEncounters!.triggers.TRAVEL!;
export const classicOgV21B = {
  ...classicOgV21A,
  meta: {
    ...classicOgV21A.meta,
    id: 'classic-og-v2.1-b',
    version: '2.1.0-B',
    name: 'Classic OG - Holiday Road Encounter',
  },
  cosmetics: {
    ...classicOgV21A.cosmetics!,
    [HOLIDAY_ROAD_COSMETIC_KEY]: {
      key: HOLIDAY_ROAD_COSMETIC_KEY,
      name: 'Holiday Road Sedan',
      description: 'The legendary wood-paneled Christmas wagon and its enormous roof tree. A permanent hidden Sedan look.',
      kind: 'ITEM_COLLECTION',
      styleKey: HOLIDAY_ROAD_STYLE_KEY,
      rarity: 'legendary',
    },
  },
  randomEncounters: {
    ...classicOgV21A.randomEncounters!,
    triggers: {
      ...classicOgV21A.randomEncounters!.triggers,
      TRAVEL: {
        ...travel,
        entries: [
          ...travel.entries,
          {
            key: HOLIDAY_ROAD_ENCOUNTER_KEY,
            title: 'The Perfect Christmas Tree',
            text: 'At a snow-covered roadside lot, a family is trying to haul an impossibly huge fir home on a wood-paneled wagon. The rope is coming loose. Help them secure it?',
            tone: 'good',
            weight: 1,
            availableUtc: HOLIDAY_ROAD_WINDOW,
            choices: [
              {
                key: HOLIDAY_ROAD_CHOICE_KEY,
                label: 'Help strap down the tree',
                text: 'You tighten the last knot. The grateful driver hands over the keys to a matching Holiday Road look for your sedan — tree included!',
              },
              {
                key: 'give-a-wave',
                label: 'Wish them luck',
                text: 'They drive off beneath a mountain of pine branches. A few needles drift behind them.',
              },
            ],
          },
        ],
      },
    },
  },
} satisfies Ruleset;
