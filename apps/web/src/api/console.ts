import type {
  ConsoleBlocksDto,
  ConsoleFolder,
  PimpConsoleDto,
  SendMessageResultDto,
} from '@streets/shared';
import { api } from './client.js';

export const consoleApi = {
  page: (folder: ConsoleFolder = 'inbox', page = 1) =>
    api.get<PimpConsoleDto>(`/game/console?folder=${encodeURIComponent(folder)}&page=${page}`),

  send: (input: {
    recipientPublicPimpId: number;
    subject: string;
    body: string;
    actionId: string;
  }) => api.post<SendMessageResultDto>('/game/console/messages', input),

  read: (messageId: string) =>
    api.post<{ ok: true }>(`/game/console/messages/${encodeURIComponent(messageId)}/read`, {}),

  archive: (messageId: string, archived = true) =>
    api.post<{ ok: true }>(`/game/console/messages/${encodeURIComponent(messageId)}/archive`, { archived }),

  report: (messageId: string, reason: string) =>
    api.post<{ ok: true }>(`/game/console/messages/${encodeURIComponent(messageId)}/report`, { reason }),

  blocks: () => api.get<ConsoleBlocksDto>('/game/console/blocks'),

  block: (targetPublicPimpId: number) =>
    api.post<ConsoleBlocksDto>('/game/console/blocks', { targetPublicPimpId }),

  unblock: (publicPimpId: number) =>
    api.post<ConsoleBlocksDto>(`/game/console/blocks/${publicPimpId}/remove`, {}),
};
