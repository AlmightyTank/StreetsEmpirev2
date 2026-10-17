import { describe, expect, it } from 'vitest';
import { crewMomentsFor } from '../crew-moments.js';

const d = (n: number) => new Date(`2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`);
const setup = (receipts: Array<{ source: string; points: number; at: Date }> = [],
  careerEvents: Array<{ kind: string; assignmentKind: string | null; summary: string | null; at: Date }> = []) => ({
  role: 'THUG' as const, serial: 2, receipts, careerEvents,
});

describe('2.1.0-C crew personalities and verified moments', () => {
  it('renders deterministic, trait-based moments using distinct settled source categories', () => {
    const evidence = setup([
      { source: 'JOB_COMPLETED', points: 2, at: d(1) },
      { source: 'JOB_COMPLETED', points: 2, at: d(2) },
      { source: 'DEFENSE_HELD', points: 4, at: d(3) },
      { source: 'TRAVEL_COMPLETED', points: 3, at: d(4) },
      { source: 'DEALER_SHIFT', points: 2, at: d(5) },
    ]);
    const cards = crewMomentsFor(evidence);
    expect(cards.map(x => x.source)).toEqual(['DEALER_SHIFT', 'TRAVEL_COMPLETED', 'DEFENSE_HELD']);
    expect(cards[1]?.description).toContain('completed a verified escort or bodyguard trip');
    expect(cards.every(x => x.trait === cards[0]?.trait)).toBe(true);
    expect(crewMomentsFor(evidence)).toEqual(cards);
    expect(crewMomentsFor({ ...evidence, receipts: [...evidence.receipts].reverse() })).toEqual(cards);
  });

  it('will not invent moments from capped zero-point receipts, paid training, sign-in, or assignments', () => {
    const cards = crewMomentsFor(setup([
      { source: 'DEFENSE_HELD', points: 0, at: d(6) },
      { source: 'REASSIGN', points: 10, at: d(6) },
      { source: 'TRAINED', points: 10, at: d(6) },
      { source: 'JOB_COMPLETED', points: 2, at: d(1) },
    ], [
      { kind: 'TRAINED', assignmentKind: null, summary: 'Training completed', at: d(5) },
      { kind: 'ASSIGNED', assignmentKind: 'TURF', summary: 'Assigned to corner', at: d(4) },
    ]));
    expect(cards).toHaveLength(1);
    expect(cards[0]?.source).toBe('JOB_COMPLETED');
  });

  it('acknowledges a recorded injury without adding a penalty or claiming an unverified outcome', () => {
    const event = { kind: 'UNASSIGNED', assignmentKind: 'ESCORT', summary: 'Returned from run escort duty; wounded.', at: d(7) };
    const result = crewMomentsFor(setup([], [event]));
    expect(result).toMatchObject([{ source: 'RECOVERY_INCIDENT', title: 'The Road Left a Mark' }]);
    expect(result[0]?.description).toContain('recorded wound');
    expect(crewMomentsFor(setup([], [{ ...event, summary: 'Returned from run escort duty' }]))).toEqual([]);
    expect(crewMomentsFor(setup([], [{ ...event, assignmentKind: 'BUSINESS' }]))).toEqual([]);
  });

  it('is read-only, bounded, and consistent across members', () => {
    const receipts = ['JOB_COMPLETED', 'DEFENSE_HELD', 'TRAVEL_COMPLETED', 'DEALER_SHIFT'].map((source, index) => ({
      source, points: 2, at: d(index + 1),
    }));
    const before = JSON.stringify(receipts);
    const one = crewMomentsFor(setup(receipts));
    const other = crewMomentsFor({ ...setup(receipts), serial: 3 });
    expect(one.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(receipts)).toBe(before);
    expect(one[0]?.trait).not.toBe(other[0]?.trait);
    expect(crewMomentsFor(setup())).toEqual([]);
  });
});
