/** Owner-only Living Streets case data. Never serialize privileged target recon. */
export type CriminalCaseStatusDto = 'LOCKED' | 'AVAILABLE' | 'ACTIVE' | 'SOLVED' | 'CLOSED' | 'EXPIRED';
export interface CriminalCaseClueDto {
  key: string;
  label: string;
  sourceKind: string;
  found: boolean;
  observedAt: string | null;
}
export interface CriminalCaseFileDto {
  id: string;
  caseKey: string;
  title: string;
  storyKey: string;
  cityId: string;
  status: CriminalCaseStatusDto;
  clues: CriminalCaseClueDto[];
  cluesFound: number;
  cluesRequired: number;
  choices: string[];
  chosenBranch: string | null;
  acceptedAt: string | null;
  solvedAt: string | null;
  closedAt: string | null;
  expiresAtActive: string;
  createdAt: string;
}
export interface CriminalCasePageDto {
  active: CriminalCaseFileDto[];
  archived: CriminalCaseFileDto[];
  pageSize: number;
  activePage: number;
  archivePage: number;
  activeHasMore: boolean;
  archivedHasMore: boolean;
}
