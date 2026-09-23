import { describe, expect, it } from 'vitest';
import type { Db } from '../../utils/db.js';
import {
  allianceContractProgressCandidateIds,
  allianceContractState,
  lockAllianceContractActor,
} from '../alliance-contract.service.js';

describe('AllianceContractService', () => {
  it('locks the Alliance before the RoundPlayer and rechecks membership under both locks', async () => {
    const locks: string[] = [];
    const db = {
      $queryRaw: async (strings: TemplateStringsArray) => {
        locks.push(strings[0]?.includes('"Alliance"') ? 'alliance' : 'player');
        return [];
      },
      roundPlayer: {
        findUnique: async () => ({ allianceId: 'alliance-a' }),
      },
      alliance: {
        findUnique: async () => ({ disbandedAt: null }),
      },
    } as unknown as Db;

    await lockAllianceContractActor(db, 'p1', 'alliance-a');

    expect(locks).toEqual(['alliance', 'player']);
  });

  it('rejects if membership changed while waiting on the ordered locks', async () => {
    const db = {
      $queryRaw: async () => [],
      roundPlayer: {
        findUnique: async () => ({ allianceId: null }),
      },
      alliance: {
        findUnique: async () => ({ disbandedAt: null }),
      },
    } as unknown as Db;

    await expect(lockAllianceContractActor(db, 'p1', 'alliance-a'))
      .rejects.toMatchObject({ code: 'ALLIANCE_CHANGED' });
  });

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
