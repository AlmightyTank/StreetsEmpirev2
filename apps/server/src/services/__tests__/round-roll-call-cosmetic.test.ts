import { describe, expect, it } from 'vitest';
import type { Round } from '@prisma/client';
import type { Db } from '../../utils/db.js';
import { ROUND_ROLL_CALL_FINALE, ROUND_ROLL_CALL_FINALE_COSMETICS } from '@streets/rulesets';
import { RoundRollCallCosmeticService, rollCallFinaleEligible } from '../round-roll-call-cosmetic.service.js';

const day = 86_400_000;
const started = new Date('2026-10-01T00:00:00.000Z');
function makeRound(durationDays = 28): Round {
  return {
    id: 'r1', startsAt: started, endsAt: new Date(started.getTime() + durationDays * day),
    status: 'ACTIVE', pausedAt: null, pausedMinutesTotal: 0,
    rulesetId: 'classic-og-v1', rulesetVersion: '1.0.0',
  } as Round;
}

function store(stamps: number) {
  const unlocks = new Map<string, { key: string; sourceQuestKey: string; kind: string }>();
  const db = {
    roundLoginCheckIn: {
      count: async () => stamps,
      groupBy: async () => [{ roundPlayerId: 'p1', _count: { _all: stamps } }],
    },
    roundPlayer: { findMany: async () => [{ id: 'p1', accountId: 'a1' }] },
    accountCosmeticUnlock: {
      upsert: async ({ create }: { create: { key: string; sourceQuestKey: string; kind: string } }) => {
        if (!unlocks.has(create.key)) unlocks.set(create.key, create);
        return unlocks.get(create.key);
      },
      findMany: async () => [...unlocks.values()],
    },
  };
  return { db: db as unknown as Db, unlocks };
}

describe('Round Roll Call Slice D permanent cosmetics', () => {
  it('requires the full current round track (not a streak or a purchase)', () => {
    expect(rollCallFinaleEligible(21, 20)).toBe(false);
    expect(rollCallFinaleEligible(21, 21)).toBe(true);
    expect(rollCallFinaleEligible(28, 21)).toBe(false);
    expect(rollCallFinaleEligible(0, 0)).toBe(false);
  });

  it('refuses early stamps and awards both parts only at completion', async () => {
    const { db, unlocks } = store(20);
    expect(await RoundRollCallCosmeticService.awardIfEligible(db, makeRound(), 'p1', 'a1')).toBe(false);
    expect(unlocks.size).toBe(0);
    const enough = store(21);
    expect(await RoundRollCallCosmeticService.awardIfEligible(enough.db, makeRound(), 'p1', 'a1')).toBe(true);
    expect([...enough.unlocks.keys()].sort()).toEqual([
      ROUND_ROLL_CALL_FINALE.crewKey, ROUND_ROLL_CALL_FINALE.themeKey,
    ].sort());
    expect([...enough.unlocks.values()].every((row) => row.sourceQuestKey === 'round-roll-call:r1:finale')).toBe(true);
    expect(await RoundRollCallCosmeticService.awardIfEligible(enough.db, makeRound(), 'p1', 'a1')).toBe(true);
    expect(enough.unlocks.size).toBe(2);
    expect((await RoundRollCallCosmeticService.ownership(enough.db, 'a1')).unlocked).toBe(true);
  });

  it('adjusts for longer and shorter rounds rather than a hardcoded 21-tier cap', async () => {
    expect(await RoundRollCallCosmeticService.awardIfEligible(store(21).db, makeRound(35), 'p1', 'a1')).toBe(false);
    expect(await RoundRollCallCosmeticService.awardIfEligible(store(28).db, makeRound(35), 'p1', 'a1')).toBe(true);
    expect(await RoundRollCallCosmeticService.awardIfEligible(store(7).db, makeRound(14), 'p1', 'a1')).toBe(true);
    expect(await RoundRollCallCosmeticService.awardIfEligible(store(0).db, makeRound(7), 'p1', 'a1')).toBe(false);
  });

  it('preserves seven-day allowance after a completed pause extended the round', async () => {
    const round = makeRound(29);
    round.pausedMinutesTotal = 1_440;
    expect(await RoundRollCallCosmeticService.awardIfEligible(store(20).db, round, 'p1', 'a1')).toBe(false);
    expect(await RoundRollCallCosmeticService.awardIfEligible(store(21).db, round, 'p1', 'a1')).toBe(true);
  });

  it('round close awards verified attendance without paying unclaimed gameplay rewards', async () => {
    const { db, unlocks } = store(21);
    const granted = await RoundRollCallCosmeticService.grantCompletedAtClose(db, makeRound(), new Date(started.getTime() + 27 * day));
    expect(granted).toBe(1);
    expect(unlocks.size).toBe(2);
  });

  it('keeps the permanent theme and crew collection visually paired', () => {
    expect(ROUND_ROLL_CALL_FINALE_COSMETICS[ROUND_ROLL_CALL_FINALE.themeKey].kind).toBe('SITE_THEME');
    expect(ROUND_ROLL_CALL_FINALE_COSMETICS[ROUND_ROLL_CALL_FINALE.crewKey].kind).toBe('ITEM_COLLECTION');
    expect(ROUND_ROLL_CALL_FINALE_COSMETICS[ROUND_ROLL_CALL_FINALE.themeKey].rarity).toBe('legendary');
    expect(ROUND_ROLL_CALL_FINALE_COSMETICS[ROUND_ROLL_CALL_FINALE.crewKey].rarity).toBe('legendary');
  });
});
