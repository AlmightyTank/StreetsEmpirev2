import { SPORTSBOOK_TEAMS, type SportsbookLeagueKey } from '@streets/shared';
import type {
  NormalizedSportsbookEvent,
  NormalizedSportsbookResult,
  SportsbookProvider,
  SportsbookProviderCapabilities,
  SportsbookProviderDiagnostic,
  SportsbookProviderOutcome,
  ProviderSession,
} from './sportsbook-provider.js';
import { ProviderSession as Session } from './sportsbook-provider.js';

export const INTERNAL_SPORTSBOOK_PROVIDER_ID = 'internal';

const LEAGUES = Object.keys(SPORTSBOOK_TEAMS) as SportsbookLeagueKey[];
type ScheduleProfile = {
  start: [number, number];
  end: [number, number];
  gamesPerDay: number;
  startHoursUtc: readonly number[];
};

// These are broad real-world scheduling patterns, not live fixtures. The
// generated board stays fictional but feels like each league's calendar.
const SCHEDULES: Record<SportsbookLeagueKey, ScheduleProfile> = {
  NFL: { start: [9, 1], end: [2, 15], gamesPerDay: 1, startHoursUtc: [17, 20, 0] },
  NBA: { start: [10, 20], end: [6, 25], gamesPerDay: 5, startHoursUtc: [23, 1, 3] },
  MLB: { start: [3, 26], end: [11, 5], gamesPerDay: 8, startHoursUtc: [17, 19, 22] },
  NHL: { start: [10, 1], end: [6, 25], gamesPerDay: 6, startHoursUtc: [23, 1, 3] },
  SOFTBALL: { start: [2, 1], end: [6, 10], gamesPerDay: 5, startHoursUtc: [17, 20, 23] },
  // Main cards are staged for Saturday evening in North American time, not daily.
  MMA: { start: [1, 1], end: [12, 31], gamesPerDay: 1, startHoursUtc: [23] },
};

function inSeason(league: SportsbookLeagueKey, date: Date): boolean {
  const [startMonth, startDay] = SCHEDULES[league].start;
  const [endMonth, endDay] = SCHEDULES[league].end;
  const value = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;
  return start <= end ? value >= start && value <= end : value >= start || value <= end;
}

function gamesFor(league: SportsbookLeagueKey, date: Date): number {
  const base = SCHEDULES[league].gamesPerDay;
  if (league === 'NFL') return [0, 6].includes(date.getUTCDay()) ? 6 : base;
  if (league === 'MMA') return date.getUTCDay() === 6 ? 1 : 0;
  return base;
}

function teamStrength(league: SportsbookLeagueKey, team: string): number {
  // Fictional ratings seeded from the real team registry. They are stable, not
  // claims about real-world performance.
  return 72 + (hash(`${league}:strength:${team}`) % 25);
}

function americanOdds(probability: number): number {
  const probabilityClamped = Math.max(0.08, Math.min(0.92, probability));
  const raw = probabilityClamped >= 0.5
    ? -100 * probabilityClamped / (1 - probabilityClamped)
    : 100 * (1 - probabilityClamped) / probabilityClamped;
  const rounded = Math.round(Math.abs(raw) / 5) * 5;
  return probabilityClamped >= 0.5 ? -Math.max(105, rounded) : Math.max(105, rounded);
}

function gameMoneyline(league: SportsbookLeagueKey, date: string, home: string, away: string): { home: number; away: number } {
  const homeForm = (hash(`${league}:${date}:${home}:form`) % 13) - 6;
  const awayForm = (hash(`${league}:${date}:${away}:form`) % 13) - 6;
  const homeAdvantage = league === 'NFL' || league === 'NHL' ? 3.5 : 2.5;
  const edge = teamStrength(league, home) + homeForm + homeAdvantage
    - teamStrength(league, away) - awayForm;
  const homeChance = 1 / (1 + Math.exp(-edge / 10));
  const vig = 1.045;
  return {
    home: americanOdds(homeChance / (homeChance + (1 - homeChance)) * vig),
    away: americanOdds((1 - homeChance) / (homeChance + (1 - homeChance)) * vig),
  };
}
const hash = (value: string): number => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
};

function session(): ProviderSession {
  return new Session({
    id: INTERNAL_SPORTSBOOK_PROVIDER_ID,
    name: 'StreetsEmpire Sports Network',
    baseUrl: 'internal://sportsbook',
    authHeaders: () => ({}),
    usage: () => ({ units: 0 }),
  }, 'internal', { used: 0, limit: 0, remaining: null, period: 'internal' });
}

export class InternalSportsbookProvider implements SportsbookProvider {
  readonly id = INTERNAL_SPORTSBOOK_PROVIDER_ID;
  readonly name = 'StreetsEmpire Sports Network';
  readonly capabilities: SportsbookProviderCapabilities = {
    leagues: LEAGUES,
    markets: ['MONEYLINE'],
    odds: true,
    results: true,
    bulkResults: true,
  };
  readonly session = session();

  constructor(private readonly now = new Date()) {}

  async listEvents(league: SportsbookLeagueKey, dates: readonly string[]): Promise<NormalizedSportsbookEvent[]> {
    const teams = Object.entries(SPORTSBOOK_TEAMS[league]);
    const schedule = SCHEDULES[league];
    return dates.flatMap((date) => {
      const day = new Date(`${date}T00:00:00.000Z`);
      if (!inSeason(league, day)) return [];
      return Array.from({ length: gamesFor(league, day) }, (_, matchup) => {
      const seed = hash(`${league}:${date}:${matchup}`);
      const home = teams[(seed + matchup * 2) % teams.length]!;
      const away = teams[(seed + matchup * 2 + 1) % teams.length]!;
      const hour = schedule.startHoursUtc[matchup % schedule.startHoursUtc.length]!;
      const startsAt = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`);
      const moneyline = gameMoneyline(league, date, home[1].name, away[1].name);
      return {
         // The version suffix prevents a regenerated slate from reattaching to a
         // settled historical row after an admin reset.
         providerEventId: `${this.id}:${league}:${date}:${matchup}:v2`,
        league,
        homeTeam: home[1].name,
        awayTeam: away[1].name,
        startsAt,
        status: startsAt <= this.now ? 'FINAL' as SportsbookProviderOutcome : 'PRE' as SportsbookProviderOutcome,
        prices: { moneyline },
        scores: { home: null, away: null },
      };
      });
    });
  }

  async getResult(providerEventId: string, league?: SportsbookLeagueKey): Promise<NormalizedSportsbookResult | null> {
    const [, eventLeague, date, matchupText] = providerEventId.split(':');
    if (!eventLeague || !date || !matchupText || !LEAGUES.includes(eventLeague as SportsbookLeagueKey)) return null;
    const resolvedLeague = (league ?? eventLeague) as SportsbookLeagueKey;
    const matchup = Number(matchupText);
    const events = await this.listEvents(resolvedLeague, [date]);
    const event = events[matchup];
    if (!event || event.startsAt > this.now) return { providerEventId, status: 'PRE', scores: { home: null, away: null } };
    const seed = hash(providerEventId);
    return { providerEventId, status: 'FINAL', scores: { home: 1 + (seed % 5), away: 1 + ((seed >>> 3) % 5) } };
  }

  async diagnose(league: SportsbookLeagueKey, date: string): Promise<SportsbookProviderDiagnostic> {
    const events = await this.listEvents(league, [date]);
    return {
      events: events.length,
      parsed: events.length,
      withoutPrices: 0,
      skipped: {},
      statuses: events.map((event) => ({ raw: event.status, outcome: event.status, count: 1 })),
      samples: events.map((event) => ({
        providerEventId: event.providerEventId,
        startsAt: event.startsAt.toISOString(),
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
        homeOdds: event.prices.moneyline.home,
        awayOdds: event.prices.moneyline.away,
        rawStatus: event.status,
        outcome: event.status,
      })),
    };
  }
}
