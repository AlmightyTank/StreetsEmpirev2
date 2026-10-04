import type { LawPageDto } from '@streets/shared';
import { api } from './client.js';

/** 1.3.0-A. The player's own Case. There is no way to read anyone else's. */
export const lawApi = {
  page: () => api.get<LawPageDto>('/game/law'),
};
