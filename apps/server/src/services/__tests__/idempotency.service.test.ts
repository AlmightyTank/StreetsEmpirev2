import { describe, expect, it } from 'vitest';
import { IdempotencyService } from '../idempotency.service.js';
import type { Db } from '../../utils/db.js';

function fakeDb(action: string): Db {
  return {
    processedAction: {
      findUnique: async () => ({
        id: 'processed',
        actionId: 'same-id',
        roundPlayerId: 'player',
        action,
        result: { success: true },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }),
    },
  } as unknown as Db;
}

describe('IdempotencyService action binding', () => {
  it('replays the same action', async () => {
    await expect(IdempotencyService.find(fakeDb('SCOUT'), 'same-id', 'player', 'SCOUT'))
      .resolves.toEqual({ success: true });
  });

  it('rejects reuse for a different action', async () => {
    await expect(IdempotencyService.find(fakeDb('SCOUT'), 'same-id', 'player', 'PRODUCE_CRACK'))
      .rejects.toMatchObject({ statusCode: 409, code: 'ACTION_ID_REUSED' });
  });
});
