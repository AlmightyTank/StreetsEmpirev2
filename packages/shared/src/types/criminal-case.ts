/** Owner-only Living Streets case data. Never serialize privileged target recon. */
export type CriminalCaseStatusDto = 'LOCKED' | 'AVAILABLE' | 'ACTIVE' | 'SOLVED' | 'CLOSED' | 'EXPIRED';
export interface CriminalCaseClueDto {
  key: string;
  label: string;
  sourceKind: string;
  found: boolean;
  observedAt: string | null;
  /** The action to seek; not a target, location, or private recon field. */
  hint: string;
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
  confidence: 'rumor' | 'likely' | 'confirmed';
  nextClueKey: string | null;
  nextAction: 'SCOUT' | 'CONTACT' | 'TRAVEL' | 'ENCOUNTER' | null;
  choices: string[];
  chosenBranch: string | null;
  /** Predictable, non-punitive choices; no concealed random roll. */
  choiceDetails: Array<{ key: string; title: string; category: string; choiceCostCents: number }>;
  outcome: { title: string; summary: string; category: string } | null;
  rewardCents: number;
  rewardClaimedAt: string | null;
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
