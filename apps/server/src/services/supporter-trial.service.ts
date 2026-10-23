import type { PrismaClient } from '@prisma/client';
import { SUPPORTER_COSMETICS } from '@streets/rulesets';

/** Trial cosmetics are virtual entitlements: they must never become unlock rows. */
export async function supporterTrialActive(prisma: PrismaClient, accountId: string): Promise<boolean> {
  if (!('supporterMembership' in prisma)) return false;
  const membership = await prisma.supporterMembership.findUnique({
    where: { accountId },
    select: { status: true },
  });
  return membership?.status === 'trialing';
}

export const TRIAL_SUPPORTER_COSMETICS = Object.values(SUPPORTER_COSMETICS).filter((cosmetic) => cosmetic.kind !== 'CREW_BANNER');
