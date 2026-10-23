import type { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/errors.js';

/**
 * Resolves the explicit beta/live account link in the canonical entitlement
 * store. This must never fall back to email, username, or a local account id:
 * those values are not proof that two isolated accounts belong together.
 */
export async function requireSharedEntitlementAccount(
  shared: PrismaClient,
  environment: string,
  localAccountId: string,
): Promise<{ id: string }> {
  const link = await shared.sharedEntitlementLink.findUnique({
    where: { environment_localAccountId: { environment, localAccountId } },
    select: { accountId: true },
  });
  if (!link) {
    throw new AppError(
      503,
      'SHARED_ENTITLEMENT_LINK_REQUIRED',
      'This account is not linked to the shared Crown wallet yet. Contact support before using shared purchases.',
    );
  }
  return { id: link.accountId };
}

/**
 * Creates an operator-approved link. The identity key is supplied by the
 * merge/link workflow, never derived here from private account fields.
 */
export async function linkSharedEntitlementAccount(
  shared: PrismaClient,
  input: { identityKey: string; environment: string; localAccountId: string },
): Promise<{ id: string }> {
  if (!input.identityKey.trim() || !input.environment.trim() || !input.localAccountId.trim()) {
    throw AppError.badRequest('SHARED_ENTITLEMENT_LINK_INVALID', 'A shared identity, environment, and local account are required.');
  }

  return shared.$transaction(async (tx) => {
    const account = await tx.sharedEntitlementAccount.upsert({
      where: { identityKey: input.identityKey },
      create: { identityKey: input.identityKey },
      update: {},
      select: { id: true },
    });
    const existing = await tx.sharedEntitlementLink.findUnique({
      where: { environment_localAccountId: { environment: input.environment, localAccountId: input.localAccountId } },
      select: { accountId: true },
    });
    if (existing && existing.accountId !== account.id) {
      throw AppError.conflict('SHARED_ENTITLEMENT_LINK_CONFLICT', 'That local account is already linked to another shared account.');
    }
    await tx.sharedEntitlementLink.upsert({
      where: { environment_localAccountId: { environment: input.environment, localAccountId: input.localAccountId } },
      create: { accountId: account.id, environment: input.environment, localAccountId: input.localAccountId },
      update: {},
    });
    return account;
  });
}
