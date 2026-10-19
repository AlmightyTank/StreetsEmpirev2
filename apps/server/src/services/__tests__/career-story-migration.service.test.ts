import { describe, expect, it } from 'vitest';
import { CareerStoryMigrationService } from '../career-story-migration.service.js';

describe('career story migration policy', () => {
  it('never synthesizes story progress from career history', async () => {
    const prisma = { playerCareer: { count: async () => 4 }, careerStoryInstance: { count: async () => 1 } } as never;
    await expect(CareerStoryMigrationService.inspect(prisma)).resolves.toEqual({ careerRows: 4, storyRows: 1, synthesizedClaims: 0, policy: 'NO_SYNTHETIC_PROGRESS' });
  });
});
