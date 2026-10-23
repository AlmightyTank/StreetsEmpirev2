import type { PrismaClient } from '@prisma/client';

/** Additive migration policy: old PlayerCareer rows are authoritative and never become synthetic story claims. */
export const CareerStoryMigrationService = {
  async inspect(prisma: PrismaClient) {
    const [careerRows, storyRows] = await Promise.all([
      prisma.playerCareer.count(),
      prisma.careerStoryInstance.count(),
    ]);
    return { careerRows, storyRows, synthesizedClaims: 0, policy: 'NO_SYNTHETIC_PROGRESS' as const };
  },
};
