import { classicOgV13G } from '../classic-og-v1.3-g/index.js';
import type { ContactCatalog, FactionCatalog, Ruleset } from '../types.js';

/** 1.4.0-A. The first five factions. Each rivalry is listed on both sides. */
export const factions = {
  KINGS: {
    key: 'KINGS',
    name: 'The Kings',
    shortName: 'Kings',
    identity: 'Street gangs, block bosses and neighborhood crews.',
    lane: 'Turf, raids, block wars and the street',
    description: 'The Kings were on these corners before anyone kept score. They respect crews who hold ground, and they remember who took it from them.',
    rivals: ['OUTFIT'],
  },
  OUTFIT: {
    key: 'OUTFIT',
    name: 'The Outfit',
    shortName: 'Outfit',
    identity: 'Old-school organized crime: weapons, protection and quiet pressure.',
    lane: 'Weapons, rackets and protection',
    description: 'The Outfit sells guns, collects protection and expects to be asked first. Old money, older grudges, and no patience for street crews who forget their place.',
    rivals: ['KINGS'],
  },
  ROAD_SAINTS: {
    key: 'ROAD_SAINTS',
    name: 'Road Saints MC',
    shortName: 'Road Saints',
    identity: 'Bikers, chop shops and convoy muscle.',
    lane: 'Vehicles, runs, convoys and the road',
    description: 'If it moves between cities, the Road Saints have an opinion about it. They know the roads, the stops and the people who wave a car through.',
    rivals: ['CIVIC_HANDSHAKE'],
  },
  CARTEL_LINE: {
    key: 'CARTEL_LINE',
    name: 'The Cartel Line',
    shortName: 'Cartel Line',
    identity: 'The product suppliers and wholesale distribution behind every counter.',
    lane: 'Product, Pip and supply',
    description: 'Every unit Pip sells came down the Cartel Line first. They care about steady orders, quiet hands, and who is flooding a city they supply.',
    rivals: ['CIVIC_HANDSHAKE'],
  },
  CIVIC_HANDSHAKE: {
    key: 'CIVIC_HANDSHAKE',
    name: 'Civic Handshake',
    shortName: 'Civic Handshake',
    identity: 'Corrupt officials, clerks and inspectors.',
    lane: 'The officials on your payroll',
    description: 'Captains, district attorneys, judges and customs officers who take an envelope. Civic Handshake sells counterplay against the law, never immunity, and everyone who moves goods hates them.',
    rivals: ['ROAD_SAINTS', 'CARTEL_LINE'],
    facesNote: 'The Captains, District Attorneys, Judges and Customs Officers on the payroll.',
  },
} as const satisfies FactionCatalog;

const contacts = {
  ...classicOgV13G.contacts,
  MAMA_KING: { ...classicOgV13G.contacts.MAMA_KING, factionKey: 'KINGS' },
  BLOCKS: { ...classicOgV13G.contacts.BLOCKS, factionKey: 'KINGS' },
  TOMMY: { ...classicOgV13G.contacts.TOMMY, factionKey: 'OUTFIT' },
  WHEELS: { ...classicOgV13G.contacts.WHEELS, factionKey: 'ROAD_SAINTS' },
  PIP: { ...classicOgV13G.contacts.PIP, factionKey: 'CARTEL_LINE' },
  VIC: { ...classicOgV13G.contacts.VIC, independent: 'A broker: Vic knows every faction and works for none of them.' },
  ACE: { ...classicOgV13G.contacts.ACE, independent: 'The casino keeps its own counsel. The rooms serve everyone who pays.' },
  LEDGER: { ...classicOgV13G.contacts.LEDGER, independent: 'Ledger never took an envelope, and she is not starting now.' },
} as const satisfies ContactCatalog;

/**
 * 1.4.0-A — Faction Catalog.
 *
 * The first five underworld factions and the faction each contact works for. Factions are
 * identity only in A: no Job, reward, price or balance changes. Everything else is exactly
 * 1.3.0-G. See docs/ROADMAP-1.4.0.md.
 */
export const classicOgV14A = {
  ...classicOgV13G,
  meta: { id: 'classic-og-v1.4-a', version: '1.4.0-A', name: 'Classic OG - Faction Catalog' },
  contacts,
  factions,
} as const satisfies Ruleset;
