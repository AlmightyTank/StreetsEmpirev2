import { classicOgV23A } from '../classic-og-v2.3-a/index.js';
import type { Ruleset } from '../types.js';

/** 2.4.0-A. New rounds may opt in to the versioned territory reward catalog. */
export const classicOgV24A = {
  ...classicOgV23A,
  meta: { ...classicOgV23A.meta, id: 'classic-og-v2.4-a', version: '2.4.0-A', name: 'Classic OG - Territory Rewards' },
  territoryPerks: { catalogVersion: 'territory-perks-v1', enabled: true, dailyYieldCapCentsPerMember: 25_000 },
  cosmetics: {
    ...classicOgV23A.cosmetics,
    'territory-regional-governor': {
      key: 'territory-regional-governor', name: 'Regional Governor',
      description: 'Awarded for helping your alliance hold a region at round close.', kind: 'TITLE_BADGE', rarity: 'epic',
    },
    'territory-national-kingpin': {
      key: 'territory-national-kingpin', name: 'National Kingpin',
      description: 'Awarded for helping your alliance control every eligible region at round close.', kind: 'TITLE_BADGE', rarity: 'legendary',
    },
    'territory-national-kingpin-frame': {
      key: 'territory-national-kingpin-frame', name: 'Crowned Territory',
      description: 'An animated frame reserved for contributors to a National Kingpin alliance.', kind: 'PROFILE_FRAME', rarity: 'legendary', styleKey: 'territory-national-kingpin-frame',
    },
  },
  randomEncounters: {
    ...classicOgV23A.randomEncounters!,
    triggers: {
      ...classicOgV23A.randomEncounters!.triggers,
      SCOUT: {
        ...classicOgV23A.randomEncounters!.triggers.SCOUT!,
        entries: [
          ...classicOgV23A.randomEncounters!.triggers.SCOUT!.entries,
          {
            key: 'territory-chicago-armory-tip',
            title: 'Armory connection',
            text: 'A contact inside the Chicago armory points your crew toward a small supply cache.',
            tone: 'good',
            weight: 1,
            territory: { scope: 'CITY', key: 'chicago' },
            supplies: { beer: { min: 1, max: 2 }, medicine: { min: 1, max: 1 } },
          },
          {
            key: 'territory-safehouse-intelligence',
            title: 'Safehouse intelligence',
            text: 'The neighborhood safehouse shares a quiet route and a warning about the next patrol shift.',
            tone: 'good',
            weight: 1,
            territory: { scope: 'DISTRICT', key: 'WINO_SLUMS' },
            heat: { min: -2, max: -1 },
            supplies: { medicine: { min: 1, max: 2 } },
          },
          {
            key: 'territory-supply-line-opportunity',
            title: 'Supply-line opportunity',
            text: 'A Midwest runner can move a small shipment through your alliance territory.',
            tone: 'good',
            weight: 1,
            territory: { scope: 'REGION', key: 'midwest', minimumTier: 1 },
            supplies: { crack: { min: 1, max: 2 }, beer: { min: 1, max: 2 } },
          },
        ],
      },
      STORE: {
        ...classicOgV23A.randomEncounters!.triggers.STORE!,
        entries: [
          ...classicOgV23A.randomEncounters!.triggers.STORE!.entries,
          {
            key: 'territory-black-market-stock',
            title: 'Black-market stock',
            text: 'A trusted Chicago broker offers a small off-book bundle from the local territory supply.',
            tone: 'good',
            weight: 1,
            territory: { scope: 'CITY', key: 'chicago' },
            choices: [
              { key: 'take-medicine', label: 'Take the medicine', text: 'Accept a discreet medical bundle.', supplies: { medicine: { min: 2, max: 2 } } },
              { key: 'take-beer', label: 'Take the beer', text: 'Accept a small nightlife shipment.', supplies: { beer: { min: 2, max: 2 } } },
            ],
          },
        ],
      },
      TURF: {
        ...classicOgV23A.randomEncounters!.triggers.TURF!,
        entries: [
          ...classicOgV23A.randomEncounters!.triggers.TURF!.entries,
          {
            key: 'territory-regional-kingpin-contract',
            title: 'Regional Kingpin contract',
            text: 'A regional fixer offers a one-time contract to stabilize the Midwest supply route.',
            tone: 'neutral',
            weight: 1,
            territory: { scope: 'REGION', key: 'midwest', minimumTier: 2 },
            choices: [
              { key: 'secure-route', label: 'Secure the route', text: 'Spend the lead to strengthen your crew.', turns: { min: -1, max: -1 }, thugs: { min: 1, max: 1 } },
              { key: 'decline-contract', label: 'Pass', text: 'Keep your crew focused on the current fight.' },
            ],
          },
        ],
      },
    },
  },
} satisfies Ruleset;
