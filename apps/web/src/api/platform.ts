import type { PlatformMetaDto } from '@streets/shared';
import { api } from './client.js';

/** 1.0.0-A. Which build, environment, ruleset and season this game host runs. */
export const platformApi = {
  meta: () => api.get<PlatformMetaDto>('/meta'),
};
