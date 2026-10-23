import type { PrismaClient } from '@prisma/client';
import {
  BIRTHDAY_DISCOUNT_PERCENT,
  BIRTHDAY_FRAME,
  BIRTHDAY_GIFT_CROWNS,
  BIRTHDAY_SOURCE,
  BIRTHDAY_THEME,
  BIRTHDAY_TITLE,
  birthdayGiftRef,
  birthdayWindow,
  isBirthdayDay,
  type BirthdayWindow,
} from '@streets/rulesets';
import type { BirthdayClaimResultDto, BirthdayStatusDto, CosmeticOptionDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { CrownWalletService } from './crown-wallet.service.js';

/**
 * Birthdays (docs/BIRTHDAYS.md): a once-a-year gift of Crowns and a title kept
 * for good, the shop discount for the week, and a frame and theme to wear on
 * the day. The frame and theme are virtual entitlements, like a supporter
 * trial's: offered while the day lasts and never stored as unlocks. The hourly
 * sweep takes them off again once the day is over.
 */

const BIRTHDAY_LOOK_KEYS = [BIRTHDAY_FRAME.styleKey!, BIRTHDAY_THEME.styleKey!];

function option(cosmetic: typeof BIRTHDAY_FRAME): CosmeticOptionDto {
  return { key: cosmetic.styleKey ?? cosmetic.key, label: cosmetic.name, description: cosmetic.description };
}

export async function birthdayWindowFor(db: Db | PrismaClient, accountId: string, now: Date): Promise<BirthdayWindow | null> {
  const account = await db.account.findUnique({ where: { id: accountId }, select: { birthDate: true } });
  return birthdayWindow(account?.birthDate ?? null, now);
}

/** The frame and theme this account may wear right now: both on the birthday, none otherwise. */
export async function birthdayLookOptions(
  db: Db | PrismaClient,
  accountId: string,
  now: Date,
): Promise<{ frames: CosmeticOptionDto[]; themes: CosmeticOptionDto[] }> {
  const today = isBirthdayDay(await birthdayWindowFor(db, accountId, now), now);
  return today ? { frames: [option(BIRTHDAY_FRAME)], themes: [option(BIRTHDAY_THEME)] } : { frames: [], themes: [] };
}

/** The birthday-week Drop discount, as a percent, and when it ends; null outside the week. */
export async function birthdayDiscount(db: Db | PrismaClient, accountId: string, now: Date): Promise<{ percent: number; endsAt: Date } | null> {
  const window = await birthdayWindowFor(db, accountId, now);
  return window ? { percent: BIRTHDAY_DISCOUNT_PERCENT, endsAt: window.weekEndsAt } : null;
}

/** Whether to show a cake on this account's name now: only on the day, and only if it opted in. */
export async function showsBirthdayCake(db: Db | PrismaClient, accountId: string, showCake: boolean | null | undefined, now: Date): Promise<boolean> {
  if (!showCake) return false;
  return isBirthdayDay(await birthdayWindowFor(db, accountId, now), now);
}

async function status(db: Db | PrismaClient, accountId: string, now: Date): Promise<BirthdayStatusDto> {
  const [window, profile] = await Promise.all([
    birthdayWindowFor(db, accountId, now),
    db.accountProfile.findUnique({ where: { accountId }, select: { showBirthdayCake: true } }),
  ]);
  const claimed = window
    ? Boolean(await db.crownLedgerEntry.findUnique({ where: { externalRef: birthdayGiftRef(accountId, window.year) }, select: { id: true } }))
    : false;
  return {
    active: Boolean(window),
    today: isBirthdayDay(window, now),
    date: window?.date ?? null,
    claimable: Boolean(window) && !claimed,
    claimed,
    giftCrowns: BIRTHDAY_GIFT_CROWNS,
    discountPercent: BIRTHDAY_DISCOUNT_PERCENT,
    dayEndsAt: window?.dayEndsAt.toISOString() ?? null,
    weekEndsAt: window?.weekEndsAt.toISOString() ?? null,
    titleKey: BIRTHDAY_TITLE.key,
    titleName: BIRTHDAY_TITLE.name,
    frameKey: BIRTHDAY_FRAME.styleKey!,
    themeKey: BIRTHDAY_THEME.styleKey!,
    showCake: profile?.showBirthdayCake ?? false,
  };
}

export const BirthdayService = {
  status(prisma: PrismaClient, accountId: string, now = new Date()): Promise<BirthdayStatusDto> {
    return status(prisma, accountId, now);
  },

  /**
   * Claims this year's gift: the Crowns (an EARN outside any round, so it never
   * counts against the round's earning cap) and the title, once. A repeat claim
   * changes nothing and answers `granted: false`.
   */
  async claim(prisma: PrismaClient, accountId: string, now = new Date()): Promise<BirthdayClaimResultDto> {
    return prisma.$transaction(async (tx) => {
      const window = await birthdayWindowFor(tx, accountId, now);
      if (!window) throw AppError.conflict('BIRTHDAY_NOT_NOW', 'Your birthday gift can be claimed during your birthday week.');
      const result = await CrownWalletService.apply(tx, {
        accountId,
        kind: 'EARN',
        delta: BIRTHDAY_GIFT_CROWNS,
        source: BIRTHDAY_SOURCE,
        externalRef: birthdayGiftRef(accountId, window.year),
        roundId: null,
        reason: `Birthday gift ${window.year}`,
        metadata: { year: window.year, date: window.date },
      });
      if (result.applied) {
        await tx.accountCosmeticUnlock.createMany({
          data: [{
            accountId,
            key: BIRTHDAY_TITLE.key,
            kind: BIRTHDAY_TITLE.kind,
            title: BIRTHDAY_TITLE.name,
            description: BIRTHDAY_TITLE.description,
            rarity: BIRTHDAY_TITLE.rarity,
            styleKey: null,
            sourceQuestKey: BIRTHDAY_SOURCE,
            sourceRulesetId: BIRTHDAY_SOURCE,
            sourceRulesetVersion: String(window.year),
            awardedAt: now,
          }],
          skipDuplicates: true,
        });
      }
      return {
        status: await status(tx, accountId, now),
        granted: result.applied,
        crowns: result.applied ? BIRTHDAY_GIFT_CROWNS : 0,
        balance: result.balance,
      };
    });
  },

  /**
   * Takes the birthday frame and theme off anyone whose day is over. Other
   * players' views read the saved keys directly, so they must not outlive it.
   */
  async sweep(prisma: PrismaClient, now = new Date()): Promise<{ cleared: number }> {
    const wearing = await prisma.accountProfile.findMany({
      where: {
        OR: [
          { activeProfileFrameKey: { in: BIRTHDAY_LOOK_KEYS } },
          { activeAvatarFrameKey: { in: BIRTHDAY_LOOK_KEYS } },
          { activeSiteThemeKey: { in: BIRTHDAY_LOOK_KEYS } },
        ],
      },
      select: { accountId: true, activeProfileFrameKey: true, activeAvatarFrameKey: true, activeSiteThemeKey: true, account: { select: { birthDate: true } } },
    });
    let cleared = 0;
    for (const profile of wearing) {
      if (isBirthdayDay(birthdayWindow(profile.account.birthDate, now), now)) continue;
      const off = (key: string | null) => (key && BIRTHDAY_LOOK_KEYS.includes(key) ? null : key);
      await prisma.accountProfile.update({
        where: { accountId: profile.accountId },
        data: {
          activeProfileFrameKey: off(profile.activeProfileFrameKey),
          activeAvatarFrameKey: off(profile.activeAvatarFrameKey),
          activeSiteThemeKey: off(profile.activeSiteThemeKey),
        },
      });
      cleared += 1;
    }
    return { cleared };
  },
};
