import { describe, expect, it } from 'vitest';
import type { Db } from '../../utils/db.js';
import {
  allianceContractProgressCandidateIds,
  allianceContractState,
} from '../alliance-contract.service.js';

describe('AllianceContractService', () => {
  it('parses only complete snapshotted alliance state', () => {
    const state = {
      allianceContract: {
        allianceId: 'alliance-a',
        allianceName: 'North Side',
        windowStart: '2026-09-21T00:00:00.000Z',
        windowEnd: '2026-09-28T00:00:00.000Z',
        acceptedAt: '2026-09-22T01:00:00.000Z',
        participantIds: ['p1', 'p2', 'p2'],
      },
    };

    expect(allianceContractState(state)).toEqual({
      ...state.allianceContract,
      participantIds: ['p1', 'p2'],
    });
    expect(allianceContractState({ allianceContract: { allianceId: 'alliance-a' } })).toBeNull();
  });

  it('fans one participant event out only to snapshotted members still in the alliance', async () => {
    const state = {
      allianceContract: {
        allianceId: 'alliance-a',
        allianceName: 'North Side',
        windowStart: '2026-09-21T00:00:00.000Z',
        windowEnd: '2026-09-28T00:00:00.000Z',
        acceptedAt: '2026-09-22T01:00:00.000Z',
        participantIds: ['p1', 'p2', 'p3'],
      },
    };
    const db = {
      roundPlayer: {
        findUnique: async () => ({ allianceId: 'alliance-a' }),
        findMany: async () => [{ id: 'p1' }, { id: 'p2' }],
      },
      playerQuest: {
        findMany: async ({ where }: any) => {
          if (where.roundPlayerId === 'p1') {
            return [{ questDefinitionId: 'definition-1', rewardState: state }];
          }
          return [
            { id: 'q1', rewardState: state },
            { id: 'q2', rewardState: state },
          ];
        },
      },
    } as unknown as Db;

    await expect(allianceContractProgressCandidateIds(db, 'p1'))
      .resolves.toEqual(['q1', 'q2']);
  });
});
