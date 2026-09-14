import { z } from 'zod';

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
});

/** Login accepts either the pimp name or the email on the account. */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your pimp name or email.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32, 'Open the full recovery link from your email.'),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  password: passwordSchema,
});

export const changeEmailSchema = z.object({
  email: emailSchema,
});

export const verifyEmailTokenSchema = z.object({
  token: z.string().trim().min(32, 'Open the full email verification link.'),
});

export const profileAccentSchema = z.enum(['default', 'crimson', 'gold', 'green', 'blue', 'purple']);

export const updateAccountProfileSettingsSchema = z.object({
  activeTitleKey: z.string().trim().min(1).max(80).nullable(),
  featuredBadgeKeys: z.array(z.string().trim().min(1).max(80)).max(6),
  profileAccent: profileAccentSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type VerifyEmailTokenInput = z.infer<typeof verifyEmailTokenSchema>;
export type ProfileAccentInput = z.infer<typeof profileAccentSchema>;
export type UpdateAccountProfileSettingsInput = z.infer<typeof updateAccountProfileSettingsSchema>;
