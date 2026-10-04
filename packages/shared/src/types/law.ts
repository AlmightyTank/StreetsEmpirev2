/** 1.3.0-A. A stage on the Wanted ladder, lowest first. */
export type WantedStageDto = 'QUIET' | 'NOTICED' | 'INVESTIGATION' | 'WARRANT' | 'FEDERAL';

/** 1.3.0-A. What drew the Heat a Case was built from. */
export type CaseSourceDto = 'SCOUT' | 'PRODUCE' | 'RUN_SALE' | 'COMBAT' | 'CONVOY' | 'TORCH' | 'SACK' | 'RACKETS' | 'CRACKDOWN';

/**
 * 1.3.0-A. The player's worst Case, for the dashboard. Stage Quiet with no city when the
 * police have nothing anywhere. Private to the player it belongs to.
 */
export interface LawSummaryDto {
  stage: WantedStageDto;
  case: number;
  cityName: string | null;
}

/** One city's Case on the player reading it. Case values are points, to two decimals. */
export interface CityCaseDto {
  citySlug: string;
  cityName: string;
  /** The player's home city. */
  isHome: boolean;
  case: number;
  stage: WantedStageDto;
  /** The next stage up and the Case it starts at, or null at Federal. */
  next: { stage: WantedStageDto; startsAt: number } | null;
  updatedAt: string;
}

/** One itemised change to a Case: why it exists. */
export interface CaseReceiptDto {
  id: string;
  citySlug: string;
  cityName: string;
  source: CaseSourceDto;
  /** Heat the act drew. */
  heat: number;
  /** Case it added, in points. */
  added: number;
  caseAfter: number;
  stageAfter: WantedStageDto;
  at: string;
}

/**
 * 1.3.0-A. "What they have on you." Private: only the player it belongs to ever reads it.
 * Read-only in A; nothing in the game reads the Case yet.
 */
export interface LawPageDto {
  caseMax: number;
  /** Share of Heat drawn in a city that becomes Case there. */
  heatToCase: number;
  /** Where each stage starts, lowest first. */
  stages: Array<{ stage: WantedStageDto; startsAt: number }>;
  /** Cities with a Case, highest first. */
  cases: CityCaseDto[];
  /** The latest receipts across every city, newest first. */
  receipts: CaseReceiptDto[];
}
