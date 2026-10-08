import { describe, expect, it } from 'vitest';
import { buildNpcGrudges, grudgesJson, MAX_REMEMBERED_GRUDGES, openNpcGrudges, storedNpcGrudges, type NpcGrudgeHit } from '../npc-gang-memory.js';

const now = new Date('2026-10-08T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

function hit(attackerId: string, hours: number, overrides: Partial<NpcGrudgeHit> = {}): NpcGrudgeHit {
  return {
    id: `battle-${attackerId}-${hours}`,
    attackerId,
    publicPimpId: Number(attackerId.replace(/\D/g, '')) || 1,
    name: `Crew ${attackerId}`,
    kind: 'RAID',
    createdAt: hoursAgo(hours),
    ...overrides,
  };
}

describe('NPC gang grudges (Phase I)', () => {
  it('folds hits into one grudge per attacker that expires a window after their latest hit', () => {
    const grudges = buildNpcGrudges([hit('p1', 10), hit('p1', 2, { kind: 'DRIVE_BY' }), hit('p2', 5)], [], 24, now);

    expect(grudges).toHaveLength(2);
    expect(grudges[0]).toMatchObject({
      attackerId: 'p1',
      hits: 2,
      lastKind: 'DRIVE_BY',
      lastHitAt: hoursAgo(2).toISOString(),
      expiresAt: new Date(hoursAgo(2).getTime() + 24 * 3_600_000).toISOString(),
      settledAt: null,
    });
    expect(grudges[1]).toMatchObject({ attackerId: 'p2', hits: 1 });
  });

  it('forgets hits older than the window', () => {
    expect(buildNpcGrudges([hit('p1', 30)], [], 24, now)).toEqual([]);
  });

  it('settles a grudge with a payback after the latest hit, and a fresh hit reopens it', () => {
    const settled = buildNpcGrudges([hit('p1', 6)], [{ id: 'payback', defenderId: 'p1', createdAt: hoursAgo(3) }], 24, now);
    expect(settled[0]).toMatchObject({ settledAt: hoursAgo(3).toISOString(), settledBattleId: 'payback' });
    expect(openNpcGrudges(settled, now)).toEqual([]);

    const reopened = buildNpcGrudges([hit('p1', 6), hit('p1', 1)], [{ id: 'payback', defenderId: 'p1', createdAt: hoursAgo(3) }], 24, now);
    expect(reopened[0]).toMatchObject({ hits: 2, settledAt: null });
    expect(openNpcGrudges(reopened, now)).toHaveLength(1);
  });

  it('ignores paybacks against someone else', () => {
    const grudges = buildNpcGrudges([hit('p1', 6)], [{ id: 'other', defenderId: 'p2', createdAt: hoursAgo(1) }], 24, now);
    expect(openNpcGrudges(grudges, now)).toHaveLength(1);
  });

  it('ranks open grudges ahead of settled ones, then by hits, and caps memory', () => {
    const hits = [
      hit('p1', 8),
      hit('p2', 7), hit('p2', 6),
      ...Array.from({ length: MAX_REMEMBERED_GRUDGES + 2 }, (_, index) => hit(`p${index + 10}`, 4)),
    ];
    const grudges = buildNpcGrudges(hits, [{ id: 'payback', defenderId: 'p2', createdAt: hoursAgo(1) }], 24, now);

    expect(grudges).toHaveLength(MAX_REMEMBERED_GRUDGES);
    expect(grudges.every((grudge) => !grudge.settledAt)).toBe(true);
    expect(grudges.some((grudge) => grudge.attackerId === 'p2')).toBe(false);
  });

  it('round-trips through memory JSON and drops expired or malformed rows', () => {
    const grudges = buildNpcGrudges([hit('p1', 2), hit('p2', 20)], [], 24, now);
    const memory = { lastOutcome: 'RAIDED', grudges: [...grudgesJson(grudges), { attackerId: 7 }, 'junk'] };

    expect(storedNpcGrudges(memory, now)).toEqual(grudges);
    expect(storedNpcGrudges(memory, new Date(now.getTime() + 5 * 3_600_000)).map((grudge) => grudge.attackerId)).toEqual(['p1']);
    expect(storedNpcGrudges(null, now)).toEqual([]);
    expect(storedNpcGrudges({ grudges: 'nope' }, now)).toEqual([]);
  });
});
