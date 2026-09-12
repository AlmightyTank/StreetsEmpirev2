import type { AccountDto, ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from '@streets/shared';
import { api } from './client.js';

interface AccountResponse {
  account: AccountDto;
}

interface MessageResponse {
  ok: true;
  message: string;
}

export const authApi = {
  register: (input: RegisterInput) =>
    api.post<AccountResponse>('/auth/register', input),

  login: (input: LoginInput) => api.post<AccountResponse>('/auth/login', input),

  forgotPassword: (input: ForgotPasswordInput) =>
    api.post<MessageResponse>('/auth/password/forgot', input),

  resetPassword: (input: ResetPasswordInput) =>
    api.post<AccountResponse>('/auth/password/reset', input),

  logout: () => api.post<{ ok: true }>('/auth/logout'),

  me: () => api.get<AccountResponse>('/auth/me'),
};
