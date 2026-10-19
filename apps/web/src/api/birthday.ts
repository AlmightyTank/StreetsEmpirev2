import type { BirthdayClaimResultDto, BirthdayStatusDto } from '@streets/shared';
import { api } from './client.js';

/** Birthdays (docs/BIRTHDAYS.md): the signed-in account's own birthday only. */
export const birthdayApi = {
  status: () => api.get<BirthdayStatusDto>('/birthday'),
  claim: () => api.post<BirthdayClaimResultDto>('/birthday/claim', {}),
};
