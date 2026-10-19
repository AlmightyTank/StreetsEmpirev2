/** docs/BIRTHDAYS.md. What the signed-in account's birthday gives it right now. */
export interface BirthdayStatusDto {
  /** True during the birthday week (the gift and the shop discount). */
  active: boolean;
  /** True on the birthday itself, when the frame and theme can be worn. */
  today: boolean;
  /** The birthday's date this year, YYYY-MM-DD; null outside the week. */
  date: string | null;
  /** The gift can be claimed now (in the week and not yet claimed this year). */
  claimable: boolean;
  claimed: boolean;
  giftCrowns: number;
  discountPercent: number;
  /** When the day ends (frame and theme) and when the week ends (gift and discount). */
  dayEndsAt: string | null;
  weekEndsAt: string | null;
  titleKey: string;
  titleName: string;
  frameKey: string;
  themeKey: string;
  /** The account's own choice to show a cake on its name on the day. Off by default. */
  showCake: boolean;
}

export interface BirthdayClaimResultDto {
  status: BirthdayStatusDto;
  /** False when this year's gift was already claimed; nothing changes. */
  granted: boolean;
  crowns: number;
  balance: number;
}
