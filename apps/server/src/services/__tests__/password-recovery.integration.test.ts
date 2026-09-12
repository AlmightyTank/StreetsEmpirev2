import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

function hashAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieHeader(response: { cookies: { name: string; value: string }[] }): string {
  return response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

describe.runIf(process.env.AUTH_INTEGRATION === '1')('account email auth with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId: string;
  let email: string;
  let oldPassword: string;
  let currentPassword: string;
  let cookie: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();

    const name = `recover_${randomUUID().slice(0, 8)}`;
    email = `${name}@example.invalid`;
    oldPassword = `${randomUUID()}A!`;
    currentPassword = oldPassword;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email, password: oldPassword },
    });
    expect(registered.statusCode).toBe(201);
    accountId = registered.json().account.id;
    cookie = cookieHeader(registered);
  });

  afterAll(async () => {
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  const headers = () => ({ cookie });

  it('accepts recovery requests without revealing whether the email exists', async () => {
    const known = await app.inject({
      method: 'POST',
      url: '/api/auth/password/forgot',
      payload: { email },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/password/forgot',
      payload: { email: `missing_${email}` },
    });

    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.json()).toEqual(unknown.json());
    expect(await app.prisma.passwordResetToken.count({ where: { accountId } })).toBe(1);
  });

  it('uses a reset token once, changes the password, and signs the player in', async () => {
    const token = randomUUID() + randomUUID();
    const newPassword = `${randomUUID()}B!`;

    await app.prisma.passwordResetToken.create({
      data: {
        accountId,
        tokenHash: hashAuthToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const reset = await app.inject({
      method: 'POST',
      url: '/api/auth/password/reset',
      payload: { token, password: newPassword },
    });
    expect(reset.statusCode, reset.body).toBe(200);
    expect(reset.cookies.some((entry) => entry.name === 'se_session')).toBe(true);
    expect(reset.json().account.emailVerifiedAt).not.toBeNull();
    cookie = cookieHeader(reset);
    currentPassword = newPassword;

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: oldPassword },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: currentPassword },
    });
    expect(newLogin.statusCode).toBe(200);
    cookie = cookieHeader(newLogin);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/password/reset',
      payload: { token, password: `${randomUUID()}C!` },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error.code).toBe('PASSWORD_RESET_INVALID');
  });

  it('requires current email verification before changing email, then confirms the new address', async () => {
    await app.prisma.account.update({
      where: { id: accountId },
      data: { emailVerifiedAt: null },
    });

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/email/change/request',
      headers: headers(),
      payload: { email: `new_${email}` },
    });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().error.code).toBe('CURRENT_EMAIL_UNVERIFIED');

    const requested = await app.inject({
      method: 'POST',
      url: '/api/auth/email/verify/request',
      headers: headers(),
    });
    expect(requested.statusCode, requested.body).toBe(200);
    expect(await app.prisma.accountEmailToken.count({ where: { accountId, purpose: 'VERIFY_EMAIL' } })).toBe(1);

    const verifyToken = randomUUID() + randomUUID();
    await app.prisma.accountEmailToken.create({
      data: {
        accountId,
        purpose: 'VERIFY_EMAIL',
        tokenHash: hashAuthToken(verifyToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const verified = await app.inject({
      method: 'POST',
      url: '/api/auth/email/verify',
      headers: headers(),
      payload: { token: verifyToken },
    });
    expect(verified.statusCode, verified.body).toBe(200);
    expect(verified.json().account.emailVerifiedAt).not.toBeNull();

    const nextEmail = `changed_${email}`;
    const changeRequested = await app.inject({
      method: 'POST',
      url: '/api/auth/email/change/request',
      headers: headers(),
      payload: { email: nextEmail },
    });
    expect(changeRequested.statusCode, changeRequested.body).toBe(200);
    expect(await app.prisma.accountEmailToken.count({ where: { accountId, purpose: 'CHANGE_EMAIL', newEmail: nextEmail } })).toBe(1);

    const changeToken = randomUUID() + randomUUID();
    await app.prisma.accountEmailToken.create({
      data: {
        accountId,
        purpose: 'CHANGE_EMAIL',
        newEmail: nextEmail,
        tokenHash: hashAuthToken(changeToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const changed = await app.inject({
      method: 'POST',
      url: '/api/auth/email/verify',
      headers: headers(),
      payload: { token: changeToken },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json().account.email).toBe(nextEmail);
    expect(changed.json().account.emailVerifiedAt).not.toBeNull();
    email = nextEmail;
  });
});
