import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { classifyError, databaseRefusal } from '../../plugins/error-handler.js';
import { SEASON_CLOSE_MS_PER_PLAYER, seasonCloseTransaction } from '../round.service.js';

const prismaError = (code: string, message: string) => new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: 'test' });
const counting = (players: number) => ({ roundPlayer: { count: async () => players } }) as unknown as Parameters<typeof seasonCloseTransaction>[0];

describe('1.0.0-H load: an overloaded database is busy, not broken', () => {
  it('answers pool and transaction-slot exhaustion with 503 SERVER_BUSY', () => {
    for (const error of [
      prismaError('P2028', 'Transaction API error: Unable to start a transaction in the given time.'),
      prismaError('P2024', 'Timed out fetching a new connection from the connection pool.'),
    ]) {
      expect(databaseRefusal(error)).toEqual({ kind: 'busy' });
      expect(classifyError(error)).toEqual({ statusCode: 503, code: 'SERVER_BUSY', category: 'contention' });
    }
    expect(classifyError(new Error('something else')).statusCode).toBe(500);
  });
});

describe('1.0.0-H load: closing a season is sized to the season', () => {
  it('gives small seasons a minute and big ones time per player, up to half an hour', async () => {
    expect((await seasonCloseTransaction(counting(10), ['r'])).timeout).toBe(60_000);
    expect((await seasonCloseTransaction(counting(2_000), ['r'])).timeout).toBe(2_000 * SEASON_CLOSE_MS_PER_PLAYER);
    expect((await seasonCloseTransaction(counting(1_000_000), ['r'])).timeout).toBe(30 * 60_000);
    expect((await seasonCloseTransaction(counting(999), [])).timeout).toBe(60_000);
  });
});

describe('1.0.0-H config: a "false" in .env means false', () => {
  it('does not turn the beta-tester cosmetic on for BETA_TESTER_DISCORD_LINKED=false', async () => {
    const { vi } = await import('vitest');
    const saved = process.env.BETA_TESTER_DISCORD_LINKED;
    try {
      for (const [value, expected] of [['false', false], ['true', true]] as const) {
        process.env.BETA_TESTER_DISCORD_LINKED = value;
        vi.resetModules();
        const { env } = await import('../../config/env.js');
        expect(env.betaTester.discordLinked).toBe(expected);
      }
    } finally {
      if (saved === undefined) delete process.env.BETA_TESTER_DISCORD_LINKED;
      else process.env.BETA_TESTER_DISCORD_LINKED = saved;
      (await import('vitest')).vi.resetModules();
    }
  });
});
