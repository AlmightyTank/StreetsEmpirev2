export type CasinoVenueKindDto = 'FULL_CASINO' | 'PRIVATE_CLUB' | 'UNDERGROUND' | 'NIGHTLIFE';

export interface CasinoVenueDto {
  citySlug: string;
  cityName: string;
  name: string;
  blurb: string;
  kind: CasinoVenueKindDto;
  walletChipsCents: number;
  here: boolean;
}

export interface CasinoSessionDto {
  id: string;
  citySlug: string;
  cityName: string;
  venueName: string;
  bankrollCents: number;
  openedAt: string;
}

export interface CasinoSlotPaylineDto {
  key: string;
  name: string;
  /** One row index per reel: 0 top, 1 middle, 2 bottom. */
  rows: number[];
}

export interface CasinoSlotPaytableEntryDto {
  symbolKey: string;
  symbolLabel: string;
  glyph: string;
  payouts: Array<{ matches: number; payoutBps: number }>;
}

export interface CasinoSlotMachineDto {
  key: string;
  name: string;
  blurb: string;
  reels: number;
  rows: number;
  paylines: CasinoSlotPaylineDto[];
  paytable: CasinoSlotPaytableEntryDto[];
  minBetPerLineCents: number;
  maxBetPerLineCents: number;
  betStepCents: number;
  maxTotalWagerCents: number;
  availableHere: boolean;
  /** Effective base-game RTP at the posted minimum line bet. */
  baseRtpBps: number;
  progressive: {
    poolCents: number;
    contributionBps: number;
    eligibleBetPerLineCents: number;
    requiresAllPaylines: boolean;
  } | null;
}

export interface CasinoSlotReelDto {
  key: string;
  label: string;
  glyph: string;
}

export interface CasinoSlotPositionDto {
  reel: number;
  row: number;
}

export interface CasinoSlotLineWinDto {
  paylineKey: string;
  paylineName: string;
  symbolKey: string;
  symbolLabel: string;
  matchCount: number;
  payoutCents: number;
  positions: CasinoSlotPositionDto[];
}

export interface CasinoSlotSpinDto {
  actionId: string;
  machineKey: string;
  machineName: string;
  betPerLineCents: number;
  activePaylineKeys: string[];
  wagerCents: number;
  payoutCents: number;
  netCents: number;
  payoutBps: number;
  grid: CasinoSlotReelDto[][];
  winningLines: CasinoSlotLineWinDto[];
  jackpotContributionCents: number;
  jackpotAwardCents: number;
  bankrollAfterCents: number;
  createdAt: string;
}

export interface CasinoSlotSpinResponseDto {
  page: CasinoPageDto;
  spin: CasinoSlotSpinDto;
}

export type CasinoLedgerKindDto = 'BUY_CHIPS' | 'REDEEM_CHIPS' | 'SESSION_OPEN' | 'SESSION_CLOSE' | 'SLOT_SPIN';

export interface CasinoLedgerEntryDto {
  id: string;
  kind: CasinoLedgerKindDto;
  citySlug: string;
  cityName: string;
  venueName: string;
  sessionId: string | null;
  cashDeltaCents: number;
  walletChipDeltaCents: number;
  sessionChipDeltaCents: number;
  walletChipsAfterCents: number;
  sessionChipsAfterCents: number;
  createdAt: string;
}

export interface CasinoPageDto {
  enabled: boolean;
  /** Cash physically available to the boss at this location; zero while in transit. */
  cashCents: number;
  currentCitySlug: string | null;
  currentVenue: CasinoVenueDto | null;
  venues: CasinoVenueDto[];
  openSession: CasinoSessionDto | null;
  slotMachines: CasinoSlotMachineDto[];
  recentLedger: CasinoLedgerEntryDto[];
  totalCasinoValueCents: number;
  limits: {
    chipUnitCents: number;
    cashierMinCents: number;
    cashierMaxCents: number;
    sessionMinCents: number;
    sessionMaxCents: number;
  } | null;
}
