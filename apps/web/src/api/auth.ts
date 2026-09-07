import type { AccountDto, LoginInput, RegisterInput } from '@streets/shared';
import { api } from './client.js';

interface AccountResponse {
  account: AccountDto;
}

export const authApi = {
  register: (input: RegisterInput) =>
    api.post<AccountResponse>('/auth/register', input),

  login: (input: LoginInput) => api.post<AccountResponse>('/auth/login', input),

  logout: () => api.post<{ ok: true }>('/auth/logout'),

  me: () => api.get<AccountResponse>('/auth/me'),
};
