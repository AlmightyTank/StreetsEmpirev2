import { createHash, randomBytes } from 'node:crypto';
import type { AccountEmailTokenPurpose, Prisma } from '@prisma/client';
import { env } from '../config/env.js';

/** The link in a verification email. Shared by player requests and admin resends. */
export function emailVerificationUrl(token: string): string {
  const url = new URL('/verify-email', env.frontendOrigin);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * A single-use email token. Only its SHA-256 hash is stored; the raw token only
 * ever travels in the email link.
 */
export async function createAccountEmailToken(input: {
  prisma: Prisma.TransactionClient;
  accountId: string;
  purpose: AccountEmailTokenPurpose;
  newEmail?: string;
  userAgent: string | undefined;
  ip: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.email.verificationTtlMinutes * 60_000);

  await input.prisma.accountEmailToken.create({
    data: {
      accountId: input.accountId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      purpose: input.purpose,
      newEmail: input.newEmail,
      expiresAt,
      userAgent: input.userAgent,
      ip: input.ip,
    },
  });

  return { token, expiresAt };
}
