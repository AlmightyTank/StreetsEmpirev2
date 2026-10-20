import type { CriminalCaseFileDto, CriminalCasePageDto } from '@streets/shared';
import { api } from './client.js';

export interface PublicCaseOpportunity {
  memoryId: string;
  storyKey: string;
  caseKey: string;
  title: string;
  expiresAtActive: string;
}

// Dashboard and the full Case Files page often mount together. Share an
// in-flight page read so they do not issue the same owner-scoped request.
const pendingPages = new Map<string, Promise<CriminalCasePageDto>>();

/** Owner-scoped, no-store endpoints; fetches never claim rewards or generate offers. */
export const caseFilesApi = {
  page: (activePage = 1, archivePage = 1, pageSize = 12) => {
    const key = `${activePage}:${archivePage}:${pageSize}`;
    const pending = pendingPages.get(key);
    if (pending) return pending;

    const request = api.get<CriminalCasePageDto>(
      `/game/case-files?activePage=${activePage}&archivePage=${archivePage}&pageSize=${pageSize}`,
    );
    pendingPages.set(key, request);
    request.then(
      () => { if (pendingPages.get(key) === request) pendingPages.delete(key); },
      () => { if (pendingPages.get(key) === request) pendingPages.delete(key); },
    );
    return request;
  },
  get: (caseId: string) =>
    api.get<CriminalCaseFileDto>(`/game/case-files/${encodeURIComponent(caseId)}`),
  publications: (ids: string[]) => api.get<{ reports: Array<{ caseId: string; newsId: string; title: string }> }>(
    `/game/case-files/publications?ids=${encodeURIComponent(ids.join(','))}`,
  ),
  opportunities: () =>
    api.get<{ opportunities: PublicCaseOpportunity[] }>('/game/case-files/opportunities'),
  optIn: (memoryId: string) =>
    api.post<{ accepted: boolean }>(`/game/case-files/opportunities/${encodeURIComponent(memoryId)}`),
  activate: (caseId: string) =>
    api.post<CriminalCaseFileDto>(`/game/case-files/${encodeURIComponent(caseId)}/activate`),
  close: (caseId: string, branchKey: string) =>
    api.post<CriminalCaseFileDto>(`/game/case-files/${encodeURIComponent(caseId)}/close`, { branchKey }),
};

/** One event after confirmed case changes: panel, dashboard and overlay may refresh. */
export function notifyCaseFilesChanged(): void {
  window.dispatchEvent(new Event('streets:case-files-changed'));
}
