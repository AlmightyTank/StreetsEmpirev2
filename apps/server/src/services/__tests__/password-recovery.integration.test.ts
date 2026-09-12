import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describe.runIf(process.env.AUTH_INTEGRATION === '1')('password recovery with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId: string;
  let email: string;
  let oldPassword: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();

    const name = `recover_${randomUUID().slice(0, 8)}`;
    email = `${name}@example.invalid`;
    oldPassword = `${randomUUID()}A!`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email, password: oldPassword },
    });
    expect(registered.statusCode).toBe(201);
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

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
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const reset = await app.inject({
      method: 'POST',
      url: '/api/auth/password/reset',
      payload: { token, password: newPassword },
    });
    expect(reset.statusCode, reset.body).toBe(200);
    expect(reset.cookies.some((cookie) => cookie.name === 'se_session')).toBe(true);
    expect(reset.json().account.emailVerifiedAt).not.toBeNull();

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: oldPassword },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: newPassword },
    });
    expect(newLogin.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/password/reset',
      payload: { token, password: `${randomUUID()}C!` },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error.code).toBe('PASSWORD_RESET_INVALID');
  });
});
