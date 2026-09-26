import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { classicOgV03D } from '@streets/rulesets';
import { ContactsService } from '../contacts.service.js';

describe('ContactsService.list', () => {
  it('returns explicit lanes plus earned battle, recon, turf and block context', async () => {
    const owner = {
      id: 'owner-player',
      roundId: 'round-1',
      accountId: 'owner-account',
      allianceId: 'alliance-1',
      allianceJoinedAt: new Date('2026-09-25T00:00:00Z'),
      thugs: 100,
      woundedThugs: 10,
      thugHappiness: 100,
      pistols: 10,
      shotguns: 5,
      tek9s: 0,
      ak47s: 0,
      round: {
        id: 'round-1',
        rulesetId: classicOgV03D.meta.id,
        rulesetVersion: classicOgV03D.meta.version,
      },
    };
    const target = {
      id: 'target-player',
      roundId: 'round-1',
      accountId: 'target-account',
      allianceId: 'alliance-1',
      publicPimpId: 2002,
      displayName: 'Target',
      netWorthCents: 50_000n,
      lastActiveAt: new Date('2026-09-26T01:00:00Z'),
      city: { name: 'Detroit' },
      alliance: { name: 'Westside', tag: 'WEST' },
      account: { isActive: true },
    };

    const prisma = {
      roundPlayer: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(owner),
        count: vi.fn().mockResolvedValue(3),
      },
      playerContact: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'contact-1',
          ownerId: owner.id,
          targetId: target.id,
          kind: 'ENEMY',
          note: 'Took my block',
          createdAt: new Date('2026-09-26T00:00:00Z'),
          updatedAt: new Date('2026-09-26T00:05:00Z'),
          target,
        }]),
      },
      playerBlock: {
        findMany: vi.fn().mockResolvedValue([{
          blockedAccountId: target.accountId,
          createdAt: new Date('2026-09-26T02:00:00Z'),
          blocked: {
            roundPlayers: [target],
          },
        }]),
      },
      raidBattle: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{
            attackerId: owner.id,
            defenderId: target.id,
            createdAt: new Date('2026-09-26T03:00:00Z'),
            attackerReport: {
              kind: 'RAID',
              createdAt: '2026-09-26T03:00:00.000Z',
              role: 'ATTACKER',
              won: true,
              cashChangeCents: 12_000,
              yourWounds: 1,
              opponentWounds: 2,
            },
            defenderReport: {},
          }])
          .mockResolvedValueOnce([{
            attackerId: target.id,
            defenderId: owner.id,
            createdAt: new Date(),
          }]),
      },
      combatIntel: {
        findMany: vi.fn().mockResolvedValue([{
          targetId: target.id,
          expiresAt: new Date('2026-09-26T04:00:00Z'),
          report: {
            createdAt: '2026-09-26T02:30:00.000Z',
            expiresAt: '2026-09-26T04:00:00.000Z',
            strength: 88,
            cashBand: { label: 'Loaded' },
          },
        }]),
      },
      turfPush: {
        findMany: vi.fn().mockResolvedValue([{
          attackerId: owner.id,
          defenderId: target.id,
          captured: true,
          settledAt: new Date('2026-09-26T03:30:00Z'),
        }]),
      },
    } as unknown as PrismaClient;

    const result = await ContactsService.list(prisma, owner.id);

    expect(result.counts).toMatchObject({ ALL: 1, CONTACT: 0, ENEMY: 1, ALLIANCE: 1, BLOCKED: 1 });
    expect(result.blocked).toEqual([expect.objectContaining({ publicPimpId: target.publicPimpId, isContact: true })]);
    expect(result.contacts[0]).toMatchObject({
      publicPimpId: target.publicPimpId,
      kind: 'ENEMY',
      categories: ['ENEMY', 'ALLIANCE', 'BLOCKED'],
      blocked: true,
      intel: {
        lastBattle: { kind: 'RAID', role: 'ATTACKER', won: true },
        payback: { available: true, source: 'direct' },
        lastRecon: { strength: 88, cashBand: 'Loaded', strengthBand: expect.any(String) },
        turf: { blocksWon: 1, blocksLost: 0 },
      },
    });
  });
});
