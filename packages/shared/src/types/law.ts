/** 1.3.0-A. A stage on the Wanted ladder, lowest first. */
export type WantedStageDto = 'QUIET' | 'NOTICED' | 'INVESTIGATION' | 'WARRANT' | 'FEDERAL';

/** 1.3.0-A. What drew the Heat a Case was built from. */
export type CaseSourceDto =
  | 'SCOUT' | 'PRODUCE' | 'RUN_SALE' | 'COMBAT' | 'CONVOY' | 'TORCH' | 'SACK' | 'RACKETS' | 'CRACKDOWN'
  // 1.3.0-B: direct evidence, currency reports, and what takes a Case down.
  | 'BUST' | 'ARREST' | 'ROAD_STOP' | 'HIJACK' | 'CURRENCY_REPORT' | 'LAUNDERING' | 'COOLING'
  // 1.3.0-C: a warrant served, or answered by a lawyer.
  | 'WARRANT' | 'LAWYER'
  // 1.3.0-D: a DA quashing a warrant, and Internal Affairs catching an official.
  | 'QUASH' | 'STING'
  // 1.3.0-E: a federal case moving with a relocation.
  | 'FEDERAL';

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
  /**
   * 1.3.0-B. When this Case starts (or started) cooling, and how fast. Null where it never
   * cools, or there is nothing left to cool.
   */
  cooling: { startsAt: string; perHour: number } | null;
  /** 1.3.0-E. How this city's police work: their pace against a plain city. Null before E. */
  law: { blurb: string; caseSpeed: number; coolingSpeed: number; warningHoursMultiplier: number } | null;
  updatedAt: string;
}

/** One itemised change to a Case: why it exists. */
export interface CaseReceiptDto {
  id: string;
  citySlug: string;
  cityName: string;
  source: CaseSourceDto;
  /** Heat the act drew; 0 for direct evidence. */
  heat: number;
  /** Case it added, in points. Negative when laundering or cooling took Case off. */
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
  /** 1.3.0-B. Direct evidence points, currency reports, cooling and laundering. Null before B. */
  evidence: { bust: number; arrest: number; roadStop: number; torch: number; sack: number; hijack: number } | null;
  currencyReport: { thresholdCents: number; points: number } | null;
  cooling: { quietHours: number; decayPerHour: number } | null;
  laundering: { casePerHeat: number; dailyCaseCap: number } | null;
  /** Where each stage starts, lowest first. */
  stages: Array<{ stage: WantedStageDto; startsAt: number }>;
  /** Cities with a Case, highest first. */
  cases: CityCaseDto[];
  /** 1.3.0-C. Open and waiting warrants, then the latest served or answered. Empty before C. */
  warrants: WarrantDto[];
  /** 1.3.0-C. The lawyer on retainer, and what one costs now. Null before C. */
  lawyer: {
    retainedUntil: string | null;
    retainerCents: number;
    days: number;
    seizureCut: number;
    downtimeCut: number;
  } | null;
  /** 1.3.0-C. Today's police losses against the day's cap. Null before C. */
  dailyLoss: { capCents: number; lostTodayCents: number } | null;
  /** 1.3.0-D. The player's corrupt officials, and what each post costs. Null before D. */
  payroll: PayrollDto | null;
  /** 1.3.0-D. Informant prices and the tips already bought. Null before D. */
  informants: { sweepCents: number; cityCents: number; tips: TipDto[] } | null;
  /** The latest receipts across every city, newest first. */
  receipts: CaseReceiptDto[];
  /** 1.3.0-F. The contact who gives law Jobs, or null before F. */
  contact: { name: string; shortName: string; role: string; description: string } | null;
}

/** 1.3.0-C. What a warrant names. */
export type WarrantTargetDto = 'HIDEOUT' | 'BUSINESS' | 'PERSONAL';

/** 1.3.0-C. OPEN: in its warning window. WAITING: a personal warrant waiting for the boss. */
export type WarrantStatusDto = 'OPEN' | 'WAITING' | 'SERVED' | 'LAWYERED' | 'QUASHED';

/** 1.3.0-C. One warrant against the player reading it. */
export interface WarrantDto {
  id: string;
  citySlug: string;
  cityName: string;
  target: WarrantTargetDto;
  businessName: string | null;
  status: WarrantStatusDto;
  draftedAt: string;
  servesAt: string;
  resolvedAt: string | null;
  /** Open or waiting: what serving it would take now, and the lawyer's price to answer it. */
  atRisk: {
    seized: Record<string, number>;
    fineCents: number;
    registerFineCents: number;
    shutHours: number;
    lockMinutes: number;
    capped: boolean;
  } | null;
  lawyerUpCents: number | null;
  /** 1.3.0-D. A DA on the payroll in that city can quash it now. */
  quashable: boolean;
  /** Served or answered: what it did. */
  outcome: Record<string, unknown> | null;
}

/** 1.3.0-D. A post on the payroll. */
export type OfficialRoleDto = 'CAPTAIN' | 'DA' | 'JUDGE' | 'CUSTOMS';

/** 1.3.0-D. One official. LAPSED: on the books but unpaid, so doing nothing. */
export interface OfficialDto {
  id: string;
  citySlug: string;
  cityName: string;
  role: OfficialRoleDto;
  status: 'ACTIVE' | 'LAPSED' | 'CUT' | 'STUNG';
  paidUntil: string;
  exposure: number;
  /** Internal Affairs: when the file opened and when the sting lands, unless cut first. */
  iaOpenedAt: string | null;
  stingAt: string | null;
  /** A DA's next quash. */
  quashReadyAt: string | null;
  /** Another week, now. */
  weekCents: number;
}

export interface PayrollDto {
  weekDays: number;
  exposureLine: number;
  stingPoints: number;
  roles: Array<{ role: OfficialRoleDto; weekCents: number }>;
  cities: Array<{ slug: string; name: string }>;
  officials: OfficialDto[];
}

/** 1.3.0-D. A tip from an informant. */
export interface TipDto {
  id: string;
  kind: 'SWEEP' | 'CITY';
  cityName: string | null;
  payload: Record<string, unknown>;
  at: string;
}
