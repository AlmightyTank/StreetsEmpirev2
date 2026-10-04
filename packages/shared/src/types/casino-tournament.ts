/** 1.2.0-G. Weekly equal-buy-in Hold'em circuit and season records. */
export interface CasinoTournamentStandingDto {
  place: number;
  isYou: boolean;
  displayName: string;
  entries: number;
  buyInCents: number;
  netCents: number;
  returnBps: number;
}

export interface CasinoSeasonRecordDto {
  key: 'most_entries' | 'best_return' | 'biggest_cashout';
  label: string;
  displayName: string | null;
  value: number;
  detail: string;
}

export interface CasinoTournamentPageDto {
  available: boolean;
  weekStartsAt: string;
  weekEndsAt: string;
  serverTime: string;
  standings: CasinoTournamentStandingDto[];
  yourEntries: number;
  records: CasinoSeasonRecordDto[];
}
