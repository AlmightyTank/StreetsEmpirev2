import type { AccountDto, ChangeEmailInput, ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput, VerifyEmailTokenInput } from '@streets/shared';
import { api } from './client.js';

interface AccountResponse {
  account: AccountDto;
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

  requestEmailVerification: () =>
    api.post<MessageResponse>('/auth/email/verify/request'),

  requestEmailChange: (input: ChangeEmailInput) =>
    api.post<MessageResponse>('/auth/email/change/request', input),

  verifyEmailToken: (input: VerifyEmailTokenInput) =>
    api.post<OptionalAccountResponse>('/auth/email/verify', input),

  logout: () => api.post<{ ok: true }>('/auth/logout'),

  me: () => api.get<AccountResponse>('/auth/me'),
};
