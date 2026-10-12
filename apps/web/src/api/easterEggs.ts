import type { ClientEasterEggId } from '@streets/shared';
import { api } from './client.js';

export interface EasterEggFoundDto {
  isNew: boolean;
  title: string;
  description: string;
}

export const easterEggsApi = {
  /** Report an egg only the browser can see. The server checks the date eggs itself. */
  found: (id: ClientEasterEggId) =>
    api.post<EasterEggFoundDto>(`/game/easter-eggs/${encodeURIComponent(id)}`),
};
