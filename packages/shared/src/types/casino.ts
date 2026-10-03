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

export interface CasinoSlotMachineDto {
  key: string;
  name: string;
  blurb: string;
  minWagerCents: number;
  maxWagerCents: number;
  wagerStepCents: number;
  availableHere: boolean;
  baseRtpBps: number;
  progressive: {
    poolCents: number;
    contributionBps: number;
    eligibleWagerCents: number;
  } | null;
}

export interface CasinoSlotReelDto {
  key: string;
  label: string;
  glyph: string;
}

export interface CasinoSlotSpinDto {
  actionId: string;
  machineKey: string;
  machineName: string;
  wagerCents: number;
  payoutCents: number;
  netCents: number;
  payoutBps: number;
  reels: [CasinoSlotReelDto, CasinoSlotReelDto, CasinoSlotReelDto];
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
