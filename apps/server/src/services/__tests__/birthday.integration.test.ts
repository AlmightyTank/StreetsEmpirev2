import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Birthdays against PostgreSQL: the once-a-year gift, the week's discount, the
 * day-only frame and theme, the sweep and the opt-in cake. Opt in with
 * BIRTHDAY_INTEGRATION=1. It removes its own accounts afterwards.
 */
describe.runIf(process.env.BIRTHDAY_INTEGRATION === '1')('Birthdays with PostgreSQL', () => {
  let app: FastifyInstance;
  const accountIds: string[] = [];
  const now = new Date();
  const todayIn1990 = new Date(Date.UTC(1990, now.getUTCMonth(), now.getUTCDate()));
  const offBirthday = new Date(Date.UTC(1990, (now.getUTCMonth() + 6) % 12, 10));

  async function makeAccount(birthDate: Date): Promise<{ id: string; cookie: string }> {
    const name = `bday_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID(), ageConfirmed: true } });
    expect(registered.statusCode, registered.body).toBe(201);
    const id = registered.json().account.id as string;
    accountIds.push(id);
    await app.prisma.account.update({ where: { id }, data: { birthDate } });
    return { id, cookie: registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ') };
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await app.close();
  });

  it('gives the gift once a year: 300 Crowns and a title kept for good', async () => {
    const { id, cookie } = await makeAccount(todayIn1990);
    const status = await app.inject({ method: 'GET', url: '/api/birthday', headers: { cookie } });
    expect(status.json()).toMatchObject({ active: true, today: true, claimable: true, giftCrowns: 300, discountPercent: 15, showCake: false });
    const claims = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/api/birthday/claim', headers: { cookie } })));
    expect(claims.map((claim) => claim.statusCode)).toEqual([200, 200]);
    expect(claims.filter((claim) => claim.json().granted)).toHaveLength(1);
    const wallet = await app.prisma.crownWallet.findUniqueOrThrow({ where: { accountId: id } });
    expect(wallet.balance).toBe(300);
    expect(await app.prisma.accountCosmeticUnlock.count({ where: { accountId: id, key: 'birthday-title' } })).toBe(1);
    const after = await app.inject({ method: 'GET', url: '/api/birthday', headers: { cookie } });
    expect(after.json()).toMatchObject({ claimed: true, claimable: false });
  });

  it('refuses the gift outside the birthday week and offers no birthday look', async () => {
    const { cookie } = await makeAccount(offBirthday);
    const claim = await app.inject({ method: 'POST', url: '/api/birthday/claim', headers: { cookie } });
    expect(claim.statusCode).toBe(409);
    const settings = await app.inject({ method: 'GET', url: '/api/auth/profile-settings', headers: { cookie } });
    if (settings.statusCode === 200) {
      expect(settings.json().options.frames.map((option: { key: string }) => option.key)).not.toContain('birthday-frame');
    }
  });

  it('lets the frame and theme be worn on the day, and the sweep takes them off after it', async () => {
    const { id, cookie } = await makeAccount(todayIn1990);
    const { AccountProfileService } = await import('../account-profile.service.js');
    const current = await AccountProfileService.settings(app.prisma, id);
    expect(current.options.frames.map((option) => option.key)).toContain('birthday-frame');
    expect(current.options.themes.map((option) => option.key)).toContain('birthday-shell');
    await AccountProfileService.update(app.prisma, id, {
      ...current.settings,
      activeProfileFrameKey: 'birthday-frame',
      activeAvatarFrameKey: 'birthday-frame',
      activeSiteThemeKey: 'birthday-shell',
      showBirthdayCake: true,
    } as never);
    const { BirthdayService } = await import('../birthday.service.js');
    expect((await BirthdayService.sweep(app.prisma, now)).cleared).toBe(0);
    await app.prisma.account.update({ where: { id }, data: { birthDate: offBirthday } });
    await BirthdayService.sweep(app.prisma, now);
    const profile = await app.prisma.accountProfile.findUniqueOrThrow({ where: { accountId: id } });
    expect(profile).toMatchObject({ activeProfileFrameKey: null, activeAvatarFrameKey: null, activeSiteThemeKey: null, showBirthdayCake: true });
    expect(cookie).toBeTruthy();
  });
});
