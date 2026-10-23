import { classicOgV24F } from '../classic-og-v2.4-f/index.js';
import { STREET_SKILLS_V2 } from '../street-skills.js';
import type { IndividualItemModRule, Ruleset } from '../types.js';

const gunMods: readonly IndividualItemModRule[] = [
  { key: 'BARREL', slot: 'BARREL', tiers: [{ tier: 1, effectPercent: 3 }, { tier: 2, effectPercent: 6 }, { tier: 3, effectPercent: 10 }] },
  { key: 'SCOPE', slot: 'SIGHT', tiers: [{ tier: 1, effectPercent: 2 }, { tier: 2, effectPercent: 4 }, { tier: 3, effectPercent: 7 }] },
  { key: 'EXTENDED_MAG', slot: 'MAGAZINE', tiers: [{ tier: 1, effectPercent: 10 }, { tier: 2, effectPercent: 20 }, { tier: 3, effectPercent: 30 }] },
  { key: 'COMPENSATOR', slot: 'MUZZLE', tiers: [{ tier: 1, effectPercent: 5 }, { tier: 2, effectPercent: 10 }, { tier: 3, effectPercent: 15 }] },
  { key: 'SUPPRESSOR', slot: 'MUZZLE', tiers: [{ tier: 1, effectPercent: 5 }, { tier: 2, effectPercent: 10 }, { tier: 3, effectPercent: 15 }] },
  { key: 'REINFORCED_FRAME', slot: 'FRAME', tiers: [{ tier: 1, effectPercent: 20 }, { tier: 2, effectPercent: 35 }, { tier: 3, effectPercent: 50 }] },
];
const vehicleMods: readonly IndividualItemModRule[] = [
  { key: 'CARGO', slot: 'CARGO', tiers: [{ tier: 1, effectPercent: 5 }, { tier: 2, effectPercent: 10 }, { tier: 3, effectPercent: 15 }] },
  { key: 'ARMOR', slot: 'BODY', tiers: [{ tier: 1, effectPercent: 10 }, { tier: 2, effectPercent: 20 }, { tier: 3, effectPercent: 30 }] },
  { key: 'ENGINE', slot: 'ENGINE', tiers: [{ tier: 1, effectPercent: 5 }, { tier: 2, effectPercent: 10 }, { tier: 3, effectPercent: 15 }] },
  { key: 'HIDDEN_COMPARTMENTS', slot: 'CARGO', tiers: [{ tier: 1, effectPercent: 5 }, { tier: 2, effectPercent: 10 }, { tier: 3, effectPercent: 15 }] },
  { key: 'FUEL_TANK', slot: 'FUEL', tiers: [{ tier: 1, effectPercent: 10 }, { tier: 2, effectPercent: 20 }, { tier: 3, effectPercent: 30 }] },
];

/** 2.5.0-A. Individual item tables and their round-pinned catalog; game flows opt in by ruleset. */
export const classicOgV25A = {
  ...classicOgV24F,
  meta: { ...classicOgV24F.meta, id: 'classic-og-v2.5-a', version: '2.5.0-A', name: 'Classic OG - Individual Armory' },
  round: {
    ...classicOgV24F.round,
    startingPlayer: {
      ...classicOgV24F.round.startingPlayer,
      pistols: 15,
      ammo: 100,
      vehicleParts: 50,
    },
  },
  streetSkills: STREET_SKILLS_V2,
  individualItems: {
    enabled: true,
    catalogVersion: 'armory-garage-v1',
    maxGuns: 2_000,
    maxVehicles: 100,
    guns: {
      PISTOL: { size: 'SMALL', slots: 2, wearPerFight: 2, mods: gunMods.filter(({ key }) => key !== 'SCOPE') },
      SHOTGUN: { size: 'MEDIUM', slots: 3, wearPerFight: 3, mods: gunMods },
      TEK9: { size: 'MEDIUM', slots: 3, wearPerFight: 3, mods: gunMods.filter(({ key }) => key !== 'SCOPE') },
      AK47: { size: 'LARGE', slots: 4, wearPerFight: 4, mods: gunMods },
    },
    vehicles: {
      SEDAN: { size: 'SMALL', slots: 2, wearPerRun: 1, mods: vehicleMods },
      LOW_RIDER: { size: 'MEDIUM', slots: 3, wearPerRun: 1, mods: vehicleMods },
      VAN: { size: 'LARGE', slots: 4, wearPerRun: 1, mods: vehicleMods },
    },
    modCosts: {
      SMALL: { 1: { parts: 5, cashCents: 10_000 }, 2: { parts: 15, cashCents: 30_000 }, 3: { parts: 40, cashCents: 90_000 } },
      MEDIUM: { 1: { parts: 10, cashCents: 20_000 }, 2: { parts: 30, cashCents: 60_000 }, 3: { parts: 80, cashCents: 180_000 } },
      LARGE: { 1: { parts: 20, cashCents: 40_000 }, 2: { parts: 60, cashCents: 120_000 }, 3: { parts: 160, cashCents: 360_000 } },
    },
  },
} as const satisfies Ruleset;
