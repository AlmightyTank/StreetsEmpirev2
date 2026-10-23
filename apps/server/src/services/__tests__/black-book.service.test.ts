import { describe, expect, it } from 'vitest';
import { BlackBookService, blackBookActionLinks, mergeIntelSources } from '../black-book.service.js';

describe('Black Book intelligence', () => {
  it('raises confidence only for independent source kinds', () => {
    const contact = mergeIntelSources([], { kind: 'contact', observedAt: '2026-10-20T10:00:00.000Z' });
    expect(contact.confidence).toBe('rumor');

    const repeatedContact = mergeIntelSources(contact.sources, { kind: 'contact', observedAt: '2026-10-20T11:00:00.000Z' });
    expect(repeatedContact.confidence).toBe('rumor');
    expect(repeatedContact.sources).toHaveLength(1);

    const scouted = mergeIntelSources(repeatedContact.sources, { kind: 'scout', observedAt: '2026-10-20T12:00:00.000Z' });
    expect(scouted.confidence).toBe('likely');
    expect(scouted.sources.map((source) => source.kind)).toEqual(['contact', 'scout']);
  });

  it('stores only a qualitative band, never exact enemy numbers', async () => {
    const captured: { saved?: Record<string, unknown> } = {};
    const db = {
      intelRumor: {
        findUnique: async () => null,
        upsert: async (args: { create: Record<string, unknown> }) => { captured.saved = args.create; return args.create; },
      },
    };
    await BlackBookService.recordSignal(db as never, {
      roundId: 'round', ownerId: 'owner', targetId: 'target', cityId: 'city',
      topic: 'rival:target:defense', sourceKind: 'contact', strengthBand: 'guarded',
      expiresAt: new Date('2026-10-21T00:00:00.000Z'),
    });
    expect(captured.saved).toBeDefined();
    expect(captured.saved?.detail).toEqual({ strengthBand: 'guarded' });
    expect(JSON.stringify(captured.saved)).not.toMatch(/fitThugs|strength\s*:/);
  });

  it('upgrades a contact rumor when a scout independently corroborates it', async () => {
    const state: { row?: Record<string, unknown> } = {};
    const db = {
      intelRumor: {
        findUnique: async () => state.row && ({ sources: state.row.sources, expiresAt: state.row.expiresAt }),
        upsert: async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          state.row = state.row ? { ...state.row, ...args.update } : args.create;
          return state.row;
        },
      },
    };
    const common = {
      roundId: 'round', ownerId: 'owner', targetId: 'target', cityId: 'city',
      topic: 'rival:target:defense', strengthBand: 'guarded' as const,
      expiresAt: new Date('2026-10-21T00:00:00.000Z'),
    };
    await BlackBookService.recordSignal(db as never, { ...common, sourceKind: 'contact', observedAt: new Date('2026-10-20T10:00:00.000Z') });
    await BlackBookService.recordSignal(db as never, { ...common, sourceKind: 'scout', observedAt: new Date('2026-10-20T11:00:00.000Z') });
    expect(state.row).toMatchObject({ confidence: 'likely' });
    expect((state.row?.sources as Array<{ kind: string }>).map((source) => source.kind)).toEqual(['contact', 'scout']);
  });

  it('removes expired intelligence in the cleanup job', async () => {
    let where: unknown;
    const count = await BlackBookService.expireStale({
      intelRumor: { deleteMany: async (args: { where: unknown }) => { where = args.where; return { count: 2 }; } },
    } as never, new Date('2026-10-20T12:00:00.000Z'), 'owner');
    expect(count).toBe(2);
    expect(where).toEqual({ expiresAt: { lte: new Date('2026-10-20T12:00:00.000Z') }, ownerId: 'owner' });
  });

  it('deep-links reinforcement to the selected district', () => {
    const links = blackBookActionLinks({ citySlug: 'new-york', district: 'LOW_RENT', targetPublicPimpId: 42 });
    expect(links.reinforce).toBe('/game/turf?city=new-york&district=LOW_RENT');
    expect(links.investigate).toBe('/game/combat?target=42#intel');
    expect(links.negotiate).toBe('/game/players/42');
    expect(links.strike).toBe('/game/combat?target=42');
  });
});
