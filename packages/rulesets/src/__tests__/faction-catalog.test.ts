import { describe, expect, it } from 'vitest';
import { classicOgV13G } from '../classic-og-v1.3-g/index.js';
import { classicOgV14A } from '../classic-og-v1.4-a/index.js';
import { factionProblems } from '../faction-definitions.js';
import type { Ruleset } from '../types.js';

describe('1.4.0-A faction catalog', () => {
  it('pins a new ruleset on top of 1.3.0-G that adds factions and changes nothing else', () => {
    expect(classicOgV14A.meta).toEqual({ id: 'classic-og-v1.4-a', version: '1.4.0-A', name: 'Classic OG - Faction Catalog' });
    expect({ ...classicOgV14A, meta: null, contacts: null, factions: null }).toEqual({ ...classicOgV13G, meta: null, contacts: null, factions: null });
    expect((classicOgV13G as Ruleset).factions).toBeUndefined();
    expect(classicOgV14A.questDefinitions).toBe(classicOgV13G.questDefinitions);
  });

  it('ships the first five factions', () => {
    expect(Object.keys(classicOgV14A.factions)).toEqual(['KINGS', 'OUTFIT', 'ROAD_SAINTS', 'CARTEL_LINE', 'CIVIC_HANDSHAKE']);
    expect(factionProblems(classicOgV14A)).toEqual([]);
  });

  it('gives every contact a faction or an independent reason, and changes nothing else about them', () => {
    const factionOf = Object.fromEntries(Object.values(classicOgV14A.contacts).map((contact) => [contact.key, 'factionKey' in contact ? contact.factionKey : 'independent']));
    expect(factionOf).toEqual({
      MAMA_KING: 'KINGS', BLOCKS: 'KINGS', TOMMY: 'OUTFIT', WHEELS: 'ROAD_SAINTS', PIP: 'CARTEL_LINE',
      VIC: 'independent', ACE: 'independent', LEDGER: 'independent',
    });
    for (const [key, contact] of Object.entries(classicOgV14A.contacts)) {
      const { factionKey: _faction, independent: _independent, ...rest } = contact as Record<string, unknown>;
      expect(rest).toEqual(classicOgV13G.contacts[key as keyof typeof classicOgV13G.contacts]);
    }
  });

  it('keeps every rivalry two-sided, with Civic Handshake against both trading factions', () => {
    const { factions } = classicOgV14A;
    expect(factions.KINGS.rivals).toEqual(['OUTFIT']);
    expect(factions.OUTFIT.rivals).toEqual(['KINGS']);
    expect(factions.CIVIC_HANDSHAKE.rivals).toEqual(['ROAD_SAINTS', 'CARTEL_LINE']);
  });

  it('reports the catalog problems a later slice could introduce', () => {
    const broken = {
      contacts: { TOMMY: { ...classicOgV14A.contacts.TOMMY, factionKey: undefined } },
      questDefinitions: classicOgV14A.questDefinitions,
      factions: { ...classicOgV14A.factions, KINGS: { ...classicOgV14A.factions.KINGS, rivals: ['OUTFIT', 'ROAD_SAINTS'] } },
    } as unknown as Ruleset;
    expect(factionProblems(broken)).toEqual(expect.arrayContaining([
      'The Kings lists ROAD_SAINTS as a rival, but not the other way round.',
      'Tommy gives Jobs but has no faction and no independent reason.',
      'The Outfit has no contact and no faces note.',
    ]));
    expect(factionProblems(classicOgV13G)).toEqual([]);

    const { PIP: _pip, ...withoutPip } = classicOgV14A.contacts;
    expect(factionProblems({ ...classicOgV14A, contacts: withoutPip } as unknown as Ruleset))
      .toContain('Jobs name contact PIP, who is missing from the contact catalog.');
  });
});
