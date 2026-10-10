import { z } from 'zod';
import { isValidTimeZone, NOTIFICATION_CATEGORIES } from '../notifications.js';
import { CUSTOMIZABLE_ITEM_KEYS, isReleasedItemCosmeticStyle } from '../cosmetics.js';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/** Letters, numbers, underscore and hyphen. Street names, not essays. */
export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN, `Pimp name must be at least ${USERNAME_MIN} characters.`)
  .max(USERNAME_MAX, `Pimp name must be ${USERNAME_MAX} characters or fewer.`)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'Pimp name can only use letters, numbers, underscores and hyphens.',
  );

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('That does not look like an email address.')
  .max(254);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer.`);

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  /** rc.5. "I am 13 or older" (the rules agreement asks every player again before play). */
  ageConfirmed: z.boolean().optional(),
  /** rc.5. Cloudflare Turnstile token, when bot checks are switched on. */
  captchaToken: z.string().max(4096).optional(),
});

/** Login accepts either the pimp name or the email on the account. */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your pimp name or email.'),
  password: z.string().min(1, 'Enter your password.'),
  /** rc.4. "Keep me signed in". Defaults to true. */
  remember: z.boolean().optional(),
  /** rc.6. Cloudflare Turnstile token, when bot checks are switched on. */
  captchaToken: z.string().max(4096).optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  /** rc.5. Cloudflare Turnstile token, when bot checks are switched on. */
  captchaToken: z.string().max(4096).optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32, 'Open the full recovery link from your email.'),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  password: passwordSchema,
  revokeOtherSessions: z.boolean().default(true),
});

export const changeEmailSchema = z.object({
  email: emailSchema,
});

export const verifyEmailTokenSchema = z.object({
  token: z.string().trim().min(32, 'Open the full email verification link.'),
});

export const profileAccentSchema = z.enum([
  'default',
  'crimson',
  'gold',
  'green',
  'blue',
  'purple',
  'ghost-violet',
  'top-shelf-teal',
  'enforcer-red',
  'open-road-blue',
  'clean-slate-ice',
  'corner-amber',
  'velvet-rose',
  // 1.4.0-F faction accents, earned at Connected.
  'kings-gold',
  'outfit-oxblood',
  'saints-chrome',
  'cartel-jade',
  'civic-seal',
]);
export const CREW_NAME_MIN = 3;
export const CREW_NAME_MAX = 32;
export const PROFILE_BIO_MAX = 500;
export const PROFILE_IMAGE_URL_MAX = 800;

/**
 * 0.9.0-F. Public crew name: same shape as an alliance name. Blank clears it.
 * Admins can clear it with a profile reset.
 */
export const crewNameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ' '))
  .pipe(z.union([
    z.literal(''),
    z.string()
      .min(CREW_NAME_MIN, `Crew names need at least ${CREW_NAME_MIN} characters.`)
      .max(CREW_NAME_MAX, `Crew names can be at most ${CREW_NAME_MAX} characters.`)
      .regex(/^[A-Za-z0-9][A-Za-z0-9 '._-]*[A-Za-z0-9.]$/, 'Use letters, numbers, spaces and simple punctuation.'),
  ]))
  .transform((value) => value || null);

export const uiDensitySchema = z.enum(['comfortable', 'compact']);
export const moneyFormatSchema = z.enum(['full', 'compact']);
export const defaultLandingSchema = z.enum(['game', 'profile', 'rankings', 'news']);
export const profileEffectSchema = z.enum([
  'none',
  'chrome-serpent',
  'phantom-convoy',
  'lantern-district',
  'siren-breaker',
  'block-sovereign',
  'gilded-house',
  'dead-or-alive',
  'laurel-ascendant',
  'snowstorm',
  'inferno',
]);

export const profileBioSchema = z
  .string()
  .trim()
  .max(PROFILE_BIO_MAX, `About me must be ${PROFILE_BIO_MAX} characters or fewer.`)
  .transform((value) => value.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'))
  .transform((value) => value || null);

const profileImageUrlValue = z
  .string()
  .trim()
  .max(PROFILE_IMAGE_URL_MAX, `Image URLs must be ${PROFILE_IMAGE_URL_MAX} characters or fewer.`)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use a direct HTTPS image URL.');

export const profileImageUrlSchema = z
  .union([z.literal(''), profileImageUrlValue])
  .transform((value) => value || null);

export const itemCosmeticStyleSchema = z.enum([
  'classic',
  'midnight-ops',
  'urban-ghost',
  'cartel-gold',
]);

export const crewCosmeticStyleSchema = itemCosmeticStyleSchema.refine(
  isReleasedItemCosmeticStyle,
  'That outfit has not been released yet.',
);

const customizableItemKeys = new Set<string>(CUSTOMIZABLE_ITEM_KEYS);
export const itemCosmeticLoadoutSchema = z
  .record(z.string().trim().min(1).max(40), itemCosmeticStyleSchema)
  .superRefine((value, ctx) => {
    for (const [key, style] of Object.entries(value)) {
      if (!customizableItemKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'That item does not support a custom skin yet.',
        });
      } else if (!isReleasedItemCosmeticStyle(style)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'That cosmetic artwork has not been released yet.',
        });
      }
    }
  })
  .default({});

export const crewCosmeticLoadoutSchema = z.object({
  THUG: crewCosmeticStyleSchema.default('classic'),
  HOE: crewCosmeticStyleSchema.default('classic'),
}).strict().default({ THUG: 'classic', HOE: 'classic' });

export const updateAccountProfileSettingsSchema = z.object({
  activeTitleKey: z.string().trim().min(1).max(80).nullable(),
  titlePlacement: z.enum(['prefix', 'suffix']).default('prefix'),
  /** Omitted keeps the current crew name; null or blank clears it. */
  crewName: crewNameSchema.nullable().optional(),
  profileBio: profileBioSchema.nullable().optional(),
  profileImageUrl: profileImageUrlSchema.nullable().optional(),
  profileBannerUrl: profileImageUrlSchema.nullable().optional(),
  profileEffect: profileEffectSchema.optional(),
  activeProfileFrameKey: z.string().trim().min(1).max(80).nullable(),
  activeAvatarFrameKey: z.string().trim().min(1).max(80).nullable().optional(),
  activeSiteThemeKey: z.string().trim().min(1).max(80).nullable().default(null),
  itemCosmetics: itemCosmeticLoadoutSchema,
  crewCosmetics: crewCosmeticLoadoutSchema,
  showThemeOnProfile: z.boolean().default(true),
  showLookOnProfile: z.boolean().default(true),
  featuredBadgeKeys: z.array(z.string().trim().min(1).max(80)).max(6),
  profileAccent: profileAccentSchema,
  uiDensity: uiDensitySchema,
  reducedMotion: z.boolean(),
  moneyFormat: moneyFormatSchema,
  defaultLanding: defaultLandingSchema,
});

const notificationCategorySchema = z.enum(NOTIFICATION_CATEGORIES);
const notificationToggles = z.record(notificationCategorySchema, z.boolean());

const minuteOfDay = z.number().int().min(0).max(24 * 60 - 1);

/** 0.9.0-G. Quiet hours in the player's own time zone; null switches them off. */
export const quietHoursSchema = z.object({
  start: minuteOfDay,
  end: minuteOfDay,
  timeZone: z.string().trim().min(1).max(64).refine(isValidTimeZone, 'Pick a real time zone.'),
}).strict().refine((value) => value.start !== value.end, { message: 'Quiet hours need different start and end times.', path: ['end'] });

export const updateNotificationSettingsSchema = z.object({
  categories: notificationToggles.optional(),
  channels: z.object({ discord: z.boolean(), push: z.boolean() }).partial().strict().optional(),
  paused: z.boolean().optional(),
  quietHours: quietHoursSchema.nullable().optional(),
  bellMuted: z.array(notificationCategorySchema).max(NOTIFICATION_CATEGORIES.length).optional(),
}).strict();

export const pushSubscribeSchema = z.object({
  endpoint: z.string().trim().url().max(1000),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(200),
    auth: z.string().trim().min(1).max(100),
  }),
  label: z.string().trim().min(1).max(60).nullable().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type VerifyEmailTokenInput = z.infer<typeof verifyEmailTokenSchema>;
export type ProfileAccentInput = z.infer<typeof profileAccentSchema>;
export type UiDensityInput = z.infer<typeof uiDensitySchema>;
export type MoneyFormatInput = z.infer<typeof moneyFormatSchema>;
export type DefaultLandingInput = z.infer<typeof defaultLandingSchema>;
export type ProfileEffectInput = z.infer<typeof profileEffectSchema>;
export type UpdateAccountProfileSettingsInput = z.infer<typeof updateAccountProfileSettingsSchema>;
export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsSchema>;
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;
