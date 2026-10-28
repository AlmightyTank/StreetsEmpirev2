import { describe, expect, it } from 'vitest';
import { gangStatusForRelationship, gangStatusForScore } from '../gang-relationship.service.js';

describe('gang relationship standing', () => {
  it('keeps the existing hostility thresholds for Nemesis escalation', () => {
    expect(gangStatusForScore(0)).toBe('UNKNOWN');
    expect(gangStatusForScore(4)).toBe('HOSTILE');
    expect(gangStatusForScore(8)).toBe('VENDETTA');
    expect(gangStatusForScore(12)).toBe('NEMESIS');
  });

  it('derives friendship from trust when hostility is low', () => {
    expect(gangStatusForRelationship(0, 4)).toBe('FRIENDLY');
    expect(gangStatusForRelationship(0, 8)).toBe('TRUSTED');
    expect(gangStatusForRelationship(0, 12)).toBe('ALLIED');
  });

  it('lets hostility override trust after betrayal or attack', () => {
    expect(gangStatusForRelationship(4, 12)).toBe('HOSTILE');
    expect(gangStatusForRelationship(12, 12)).toBe('NEMESIS');
  });
});
