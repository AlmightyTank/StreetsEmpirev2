import { createHash, randomBytes } from 'node:crypto';
import type { Account, PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import type { TwoFactorSetupDto, TwoFactorStatusDto } from '@streets/shared';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  matchTotp,
  openSecret,
  otpauthUrl,
  sealSecret,
} from '../auth/totp.js';
import type { SessionMethod } from '../auth/play-access.js';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';

/** A sign-in waits this long for its code. */
export const LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000;
/** Wrong codes allowed on one sign-in before it has to start again. */
export const LOGIN_CHALLENGE_ATTEMPTS = 5;

function hashToken(token: string): string {
  return createHash('sha256').update(`challenge:${token}`).digest('hex');
}

function invalidCode(): AppError {
  return AppError.badRequest('TWO_FACTOR_INVALID', 'That code is not right. Check the app, or use a recovery code.', {
    code: 'Enter the 6-digit code from your authenticator app.',
  });
}

/**
 * Checks an authenticator code, or else a recovery code, and spends it: a TOTP step is
 * recorded so it cannot be used twice, and a recovery code is marked used. Both writes are
 * conditional, so two requests racing with the same code cannot both pass.
 */
async function spendCode(db: Db, account: Pick<Account, 'id' | 'twoFactorSecret' | 'twoFactorLastStep'>, code: string, now = new Date()): Promise<'totp' | 'recovery' | null> {
  if (!account.twoFactorSecret) return null;
  const step = matchTotp(openSecret(account.twoFactorSecret), code, account.twoFactorLastStep, now.getTime());
  if (step !== null) {
    const claimed = await db.account.updateMany({
      where: { id: account.id, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
      data: { twoFactorLastStep: step },
    });
    return claimed.count === 1 ? 'totp' : null;
  }
  if (!looksLikeRecoveryCode(code)) return null;
  const used = await db.twoFactorRecoveryCode.updateMany({
    where: { accountId: account.id, codeHash: hashRecoveryCode(code), usedAt: null },
    data: { usedAt: now },
  });
  return used.count === 1 ? 'recovery' : null;
}

async function freshRecoveryCodes(db: Db, accountId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db.twoFactorRecoveryCode.deleteMany({ where: { accountId } });
  await db.twoFactorRecoveryCode.createMany({ data: codes.map((code) => ({ accountId, codeHash: hashRecoveryCode(code) })) });
  return codes;
}

export const TwoFactorService = {
  async status(prisma: PrismaClient, account: Account): Promise<TwoFactorStatusDto> {
    const recoveryCodesLeft = account.twoFactorEnabledAt
      ? await prisma.twoFactorRecoveryCode.count({ where: { accountId: account.id, usedAt: null } })
      : 0;
    return {
      enabled: Boolean(account.twoFactorEnabledAt),
      enabledAt: account.twoFactorEnabledAt?.toISOString() ?? null,
      recoveryCodesLeft,
    };
  },

  /** Step 1: a new secret to scan. Nothing changes for sign-in until a code confirms it. */
  async setup(prisma: PrismaClient, account: Account): Promise<TwoFactorSetupDto> {
    if (account.twoFactorEnabledAt) throw AppError.conflict('TWO_FACTOR_ENABLED', 'Two-step sign-in is already on.');
    const secret = generateTotpSecret();
    await prisma.account.update({ where: { id: account.id }, data: { twoFactorPendingSecret: sealSecret(secret) } });
    const url = otpauthUrl(secret, account.username);
    const qrSvg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
    return { secret, otpauthUrl: url, qrSvg };
  },

  /** Step 2: the first code from the app proves it was scanned. Returns the recovery codes, shown once. */
  async enable(prisma: PrismaClient, account: Account, sessionId: string, code: string, now = new Date()): Promise<string[]> {
    if (account.twoFactorEnabledAt) throw AppError.conflict('TWO_FACTOR_ENABLED', 'Two-step sign-in is already on.');
    if (!account.twoFactorPendingSecret) throw AppError.conflict('TWO_FACTOR_NOT_STARTED', 'Start setup again: scan a new code first.');
    const secret = openSecret(account.twoFactorPendingSecret);
    const step = matchTotp(secret, code, null, now.getTime());
    if (step === null) throw invalidCode();
    return prisma.$transaction(async (tx) => {
      const enabled = await tx.account.updateMany({
        where: { id: account.id, twoFactorEnabledAt: null, twoFactorPendingSecret: account.twoFactorPendingSecret },
        data: { twoFactorSecret: account.twoFactorPendingSecret, twoFactorPendingSecret: null, twoFactorEnabledAt: now, twoFactorLastStep: step },
      });
      if (enabled.count !== 1) throw AppError.conflict('TWO_FACTOR_NOT_STARTED', 'Setup changed in another tab. Start again.');
      // This sign-in just produced a valid code, so it counts as a two-step session.
      await tx.session.update({ where: { id: sessionId }, data: { twoFactor: true } });
      return freshRecoveryCodes(tx, account.id);
    });
  },

  async disable(prisma: PrismaClient, account: Account, code: string): Promise<void> {
    if (!account.twoFactorEnabledAt) throw AppError.conflict('TWO_FACTOR_DISABLED', 'Two-step sign-in is already off.');
    await prisma.$transaction(async (tx) => {
      if (!(await spendCode(tx, account, code))) throw invalidCode();
      await TwoFactorService.clear(tx, account.id);
    });
  },

  /** Turns two-step sign-in off and forgets everything about it. Used by disable and by staff resets. */
  async clear(db: Db, accountId: string): Promise<void> {
    await db.account.update({
      where: { id: accountId },
      data: { twoFactorSecret: null, twoFactorPendingSecret: null, twoFactorEnabledAt: null, twoFactorLastStep: null },
    });
    await db.twoFactorRecoveryCode.deleteMany({ where: { accountId } });
    await db.loginChallenge.deleteMany({ where: { accountId } });
    // No session keeps a two-step mark the account no longer has.
    await db.session.updateMany({ where: { accountId }, data: { twoFactor: false } });
  },

  async regenerateRecoveryCodes(prisma: PrismaClient, account: Account, code: string): Promise<string[]> {
    if (!account.twoFactorEnabledAt) throw AppError.conflict('TWO_FACTOR_DISABLED', 'Two-step sign-in is off.');
    return prisma.$transaction(async (tx) => {
      if (!(await spendCode(tx, account, code))) throw invalidCode();
      return freshRecoveryCodes(tx, account.id);
    });
  },

  /** After the password (or Discord), a sign-in with two-step on waits here for its code. */
  async beginChallenge(prisma: PrismaClient, accountId: string, method: SessionMethod, now = new Date()): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await prisma.loginChallenge.deleteMany({ where: { OR: [{ accountId }, { expiresAt: { lt: now } }] } });
    await prisma.loginChallenge.create({
      data: { tokenHash: hashToken(token), accountId, method, expiresAt: new Date(now.getTime() + LOGIN_CHALLENGE_TTL_MS) },
    });
    return token;
  },

  /** The code for a waiting sign-in. On success the challenge is gone and the caller makes the session. */
  async completeChallenge(prisma: PrismaClient, token: string, code: string, now = new Date()): Promise<{ account: Account; method: SessionMethod; usedRecoveryCode: boolean }> {
    const expired = () => AppError.unauthenticated('Your sign-in timed out. Sign in again.');
    const challenge = await prisma.loginChallenge.findUnique({ where: { tokenHash: hashToken(token) }, include: { account: true } });
    if (!challenge || challenge.expiresAt <= now) throw expired();
    if (challenge.attempts >= LOGIN_CHALLENGE_ATTEMPTS) {
      await prisma.loginChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
      throw AppError.tooManyRequests('TWO_FACTOR_ATTEMPTS', 'Too many wrong codes. Sign in again.');
    }
    const result = await prisma.$transaction(async (tx) => {
      const spent = await spendCode(tx, challenge.account, code, now);
      if (!spent) return null;
      const consumed = await tx.loginChallenge.deleteMany({ where: { id: challenge.id } });
      return consumed.count === 1 ? spent : null;
    });
    if (!result) {
      await prisma.loginChallenge.updateMany({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw invalidCode();
    }
    return { account: challenge.account, method: challenge.method === 'DISCORD' ? 'DISCORD' : 'PASSWORD', usedRecoveryCode: result === 'recovery' };
  },
};
