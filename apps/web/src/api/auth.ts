import type {
  AccountDto,
  AccountSessionsResponseDto,
  AccountProfileSettingsResponseDto,
  ChangeEmailInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateAccountProfileSettingsInput,
  VerifyEmailTokenInput,
} from '@streets/shared';
import { api } from './client.js';

interface AccountResponse {
  account: AccountDto;
  approvalRequired?: boolean;
  message?: string;
}

interface MessageResponse {
  ok: true;
  message: string;
}

interface OptionalAccountResponse extends MessageResponse {
  account?: AccountDto;
}

export const authApi = {
  register: (input: RegisterInput) =>
    api.post<AccountResponse>('/auth/register', input),

  login: (input: LoginInput) => api.post<AccountResponse>('/auth/login', input),

  forgotPassword: (input: ForgotPasswordInput) =>
    api.post<MessageResponse>('/auth/password/forgot', input),

  resetPassword: (input: ResetPasswordInput) =>
    api.post<AccountResponse>('/auth/password/reset', input),

  changePassword: (input: ChangePasswordInput) =>
    api.post<MessageResponse>('/auth/password/change', input),

  requestEmailVerification: () =>
    api.post<MessageResponse>('/auth/email/verify/request'),

  requestEmailChange: (input: ChangeEmailInput) =>
    api.post<MessageResponse>('/auth/email/change/request', input),

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
