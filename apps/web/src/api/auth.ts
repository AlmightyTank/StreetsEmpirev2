import type {
  BugReportInput,
  AccountDto,
  BirthDateUpdateInput,
  AccountSessionsResponseDto,
  AccountProfileSettingsResponseDto,
  ChangeEmailInput,
  ChangePasswordInput,
  ChangeUsernameInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  TrustedDeviceDto,
  TwoFactorRequiredDto,
  TwoFactorSetupDto,
  TwoFactorStatusDto,
  UpdateAccountProfileSettingsInput,
  UsernameChangeStatusDto,
  VerifyEmailTokenInput,
} from '@streets/shared';
import { api } from './client.js';

interface AccountResponse {
  account: AccountDto;
  approvalRequired?: boolean;
  message?: string;
}

interface PlayGamesResponse extends AccountResponse {
  linked: boolean;
}

interface MessageResponse {
  ok: true;
  message: string;
}

interface OptionalAccountResponse extends MessageResponse {
  account?: AccountDto;
}

export const authApi = {
  providers: () => api.get<{ apple: boolean; discord: boolean; google: boolean; facebook: boolean }>('/auth/providers'),
  register: (input: RegisterInput) =>
    api.post<AccountResponse>('/auth/register', input),

  saveBirthday: (input: BirthDateUpdateInput) => api.post<AccountResponse>('/auth/birthday', input),

  /** rc.3: with two-step sign-in on, the answer asks for a code instead of signing in. */
  login: (input: LoginInput) => api.post<AccountResponse | TwoFactorRequiredDto>('/auth/login', input),

  playGames: (serverAuthCode: string, link = false) =>
    api.post<PlayGamesResponse>('/auth/play-games', { serverAuthCode, link }),

  /** rc.3. The authenticator (or recovery) code for a sign-in that is waiting for one. */
  verifyTwoFactor: (code: string, trustDevice = false) =>
    api.post<AccountResponse & { recoveryCodesLeft?: number }>('/auth/2fa/verify', { code, trustDevice }),
  /** rc.4. Re-confirm with a code without signing out (admin tools). */
  stepUpTwoFactor: (code: string) => api.post<AccountResponse>('/auth/2fa/step-up', { code }),
  trustedDevices: () => api.get<{ devices: TrustedDeviceDto[] }>('/auth/2fa/trusted-devices'),
  forgetTrustedDevice: (deviceId: string) => api.delete<{ ok: true; forgotten: number }>(`/auth/2fa/trusted-devices/${encodeURIComponent(deviceId)}`),
  forgetTrustedDevices: () => api.delete<{ ok: true; forgotten: number }>('/auth/2fa/trusted-devices'),
  twoFactorStatus: () => api.get<TwoFactorStatusDto>('/auth/2fa'),
  setupTwoFactor: (currentPassword?: string) => api.post<TwoFactorSetupDto>('/auth/2fa/setup', currentPassword ? { currentPassword } : {}),
  enableTwoFactor: (code: string) => api.post<{ recoveryCodes: string[]; account: AccountDto }>('/auth/2fa/enable', { code }),
  disableTwoFactor: (code: string) => api.post<MessageResponse & { account: AccountDto }>('/auth/2fa/disable', { code }),
  regenerateRecoveryCodes: (code: string) => api.post<{ recoveryCodes: string[] }>('/auth/2fa/recovery-codes', { code }),

  forgotPassword: (input: ForgotPasswordInput) =>
    api.post<MessageResponse>('/auth/password/forgot', input),

  resetPassword: (input: ResetPasswordInput) =>
    api.post<AccountResponse | TwoFactorRequiredDto>('/auth/password/reset', input),

  changePassword: (input: ChangePasswordInput) =>
    api.post<MessageResponse>('/auth/password/change', input),

  /** rc.5. Deletes the account (anonymized in season history if it played). */
  deleteAccount: (input: { currentPassword?: string; confirm: 'DELETE' }) =>
    api.post<MessageResponse & { mode: 'deleted' | 'anonymized' }>('/auth/account/delete', input),

  /** rc.2. Closes the account and signs it out everywhere. */
  closeAccount: (input: { currentPassword?: string; confirm: 'CLOSE' }) =>
    api.post<MessageResponse>('/auth/account/close', input),

  /** rc.2. Report a bug from the game. */
  reportBug: (input: BugReportInput) => api.post<{ ok: true; id: string; message: string }>('/support/bug-reports', input),

  unlinkDiscord: (input: { currentPassword: string }) =>
    api.delete<AccountResponse & { ok: true; message: string }>('/auth/discord', input),

  unlinkApple: (input: { currentPassword: string }) =>
    api.delete<AccountResponse & { ok: true; message: string }>('/auth/apple', input),
  unlinkGoogle: (input: { currentPassword: string }) =>
    api.delete<AccountResponse & { ok: true; message: string }>('/auth/google', input),
  unlinkFacebook: (input: { currentPassword: string }) =>
    api.delete<AccountResponse & { ok: true; message: string }>('/auth/facebook', input),

  requestEmailVerification: () =>
    api.post<MessageResponse>('/auth/email/verify/request'),

  /** Whether the player may change their pimp name now, and if not, when. */
  usernameStatus: () =>
    api.get<{ status: UsernameChangeStatusDto }>('/auth/username'),

  changeUsername: (input: ChangeUsernameInput) =>
    api.post<{ account: AccountDto; status: UsernameChangeStatusDto; message: string }>('/auth/username', input),

  requestEmailChange: (input: ChangeEmailInput) =>
    api.post<OptionalAccountResponse>('/auth/email/change/request', input),

  verifyEmailToken: (input: VerifyEmailTokenInput) =>
    api.post<OptionalAccountResponse>('/auth/email/verify', input),

  profileSettings: () =>
    api.get<AccountProfileSettingsResponseDto>('/auth/profile-settings'),

  updateProfileSettings: (input: UpdateAccountProfileSettingsInput) =>
    api.put<AccountProfileSettingsResponseDto>('/auth/profile-settings', input),

  sessions: () =>
    api.get<AccountSessionsResponseDto>('/auth/sessions'),

  revokeSession: (sessionId: string) =>
    api.delete<{ ok: true; revoked: number }>(`/auth/sessions/${encodeURIComponent(sessionId)}`),

  revokeOtherSessions: () =>
    api.delete<{ ok: true; revoked: number }>('/auth/sessions/others'),

  logout: () => api.post<{ ok: true }>('/auth/logout'),

  me: () => api.get<AccountResponse>('/auth/me'),
};
