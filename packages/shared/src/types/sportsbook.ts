export type SportsbookLeagueKey = 'NFL' | 'NBA' | 'MLB' | 'NHL';
export type SportsbookSelection = 'HOME' | 'AWAY';
export type SportsbookBetStatus = 'OPEN' | 'WON' | 'LOST' | 'PUSH' | 'VOID';

export interface SportsbookEventDto {
  id: string;
  sport: SportsbookLeagueKey;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  oddsUpdatedAt: string | null;
  homeOdds: number | null;
  awayOdds: number | null;
}

export interface SportsbookBoardDto {
  enabled: boolean;
  refreshedAt: string | null;
  leagues: Array<{ key: SportsbookLeagueKey; name: string }>;
  events: SportsbookEventDto[];
}

export interface SportsbookBetDto {
  id: string;
  sport: SportsbookLeagueKey;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  selection: SportsbookSelection;
  oddsAmerican: number;
  stakeCents: number;
  payoutCents: number;
  status: SportsbookBetStatus;
  createdAt: string;
}

export interface SportsbookBetInput {
  eventId: string;
  selection: SportsbookSelection;
  stakeCents: number;
  actionId: string;
}
