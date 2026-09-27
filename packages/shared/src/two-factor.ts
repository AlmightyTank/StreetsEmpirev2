import { z } from 'zod';

/** rc.3. Two-step sign-in with an authenticator app. */

export interface TwoFactorStatusDto {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
}

export interface TwoFactorSetupDto {
  /** Base32, for typing into the app by hand. */
  secret: string;
  otpauthUrl: string;
  /** The same as a QR code, as an SVG document. */
  qrSvg: string;
}

/** An authenticator code (6 digits) or a recovery code (xxxx-xxxx). */
export const twoFactorCodeSchema = z.string().trim().min(6, 'Enter the 6-digit code from your app.').max(20);

export const twoFactorSetupSchema = z.object({ currentPassword: z.string().max(200).optional() }).strict();
export const twoFactorCodeBodySchema = z.object({ code: twoFactorCodeSchema }).strict();

/** Login and password reset answer this instead of an account when a code is still needed. */
export interface TwoFactorRequiredDto {
  twoFactorRequired: true;
}
