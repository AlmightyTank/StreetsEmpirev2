import { z } from 'zod';

export class GameApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'GameApiError';
  }
}

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const rolesSchema = z.object({ members: z.record(z.array(z.string())) });

const raritySchema = z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']);

const badgeSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  rarity: raritySchema,
  permanent: z.boolean(),
});

const legacySchema = z.object({
  roundsPlayed: z.number(),
  roundWins: z.number(),
  topTenFinishes: z.number(),
  bestNationalRank: z.number().nullable(),
  bestLocalRank: z.number().nullable(),
  totalFinalNetWorthCents: z.number(),
});

const profileSchema = z.object({
  player: z.object({
    roundName: z.string(),
    displayName: z.string(),
    publicPimpId: z.number(),
    city: z.string(),
    netWorthCents: z.number(),
    rank: z.object({ local: z.number(), national: z.number(), nationalMovement: z.number().nullable() }),
    legacy: legacySchema,
    badges: z.array(badgeSchema),
    profileUrl: z.string().url(),
    forumProfileUrl: z.string().url().nullable(),
  }),
});

const badgesSchema = z.object({
  player: z.object({
    roundName: z.string(),
    displayName: z.string(),
    publicPimpId: z.number(),
    profileUrl: z.string().url(),
    awards: z.array(z.object({
      key: z.string(),
      title: z.string(),
      description: z.string(),
      category: z.enum(['rank', 'wealth', 'combat', 'intel', 'reputation', 'legacy']),
      rarity: raritySchema,
      unlocked: z.boolean(),
      earnedAt: z.string().nullable(),
      progress: z.object({ current: z.number(), target: z.number(), label: z.string() }).nullable(),
    })),
  }),
});

const roundSummarySchema = z.object({ name: z.string(), status: z.string(), endsAt: z.string() });
const citySchema = z.object({ slug: z.string(), name: z.string() });
const citiesSchema = z.object({ cities: z.array(citySchema) });

const rankingEntrySchema = z.object({
  rank: z.number(),
  publicPimpId: z.number(),
  displayName: z.string(),
  city: z.string(),
  netWorthCents: z.number(),
  movement: z.number().nullable(),
  profileUrl: z.string().url(),
});

const rankingsSchema = z.object({
  round: roundSummarySchema.nullable(),
  // Optional for game servers from before city rankings.
  city: citySchema.nullable().optional(),
  entries: z.array(rankingEntrySchema),
});

const leaderboardStats = ['raids', 'defenses', 'drive-bys', 'recon', 'rides', 'lures'] as const;

const leaderboardSchema = z.object({
  round: roundSummarySchema.nullable(),
  stat: z.enum(leaderboardStats),
  label: z.string(),
  entries: z.array(z.object({
    rank: z.number(),
    publicPimpId: z.number(),
    displayName: z.string(),
    city: z.string(),
    value: z.number(),
    profileUrl: z.string().url(),
  })),
});

const hallOfFameSchema = z.object({
  rounds: z.array(z.object({
    name: z.string(),
    endedAt: z.string(),
    podium: z.array(z.object({ rank: z.number(), displayName: z.string(), netWorthCents: z.number(), city: z.string() })),
  })),
});

const historySchema = z.object({
  displayName: z.string(),
  rounds: z.array(z.object({
    name: z.string(),
    endedAt: z.string(),
    displayName: z.string(),
    rank: z.number().nullable(),
    netWorthCents: z.number(),
    city: z.string(),
  })),
  legacy: legacySchema,
});

const memberSchema = z.object({
  linked: z.boolean(),
  username: z.string().nullable(),
  forumUsername: z.string().nullable(),
  roundName: z.string().nullable(),
  player: z.object({ displayName: z.string(), publicPimpId: z.number(), profileUrl: z.string().url() }).nullable(),
  roles: z.array(z.string()),
});

const statsSchema = z.object({
  roundName: z.string(),
  displayName: z.string(),
  publicPimpId: z.number(),
  profileUrl: z.string().url(),
  cashCents: z.number(),
  netWorthCents: z.number(),
  payoutPercent: z.number(),
  turns: z.object({ turns: z.number(), cap: z.number(), nextTurnAt: z.string(), perTick: z.number() }),
  crew: z.object({ whores: z.number(), thugs: z.number(), fitThugs: z.number(), woundedThugs: z.number(), armedThugs: z.number() }),
  weapons: z.object({ pistols: z.number(), shotguns: z.number(), tek9s: z.number(), ak47s: z.number() }),
  supplies: z.object({ condoms: z.number(), medicine: z.number(), crack: z.number(), beer: z.number() }),
  lowRiders: z.number(),
  happiness: z.object({ whore: z.number(), thug: z.number() }),
  rank: z.object({ local: z.number().nullable(), national: z.number().nullable() }),
});

const newsClaimSchema = z.object({
  news: z.array(z.object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    isPinned: z.boolean(),
    publishedAt: z.string(),
    authorName: z.string().nullable(),
    url: z.string().url(),
  })),
});

const newsCreatedSchema = z.object({ id: z.string(), title: z.string(), url: z.string().url(), roundName: z.string().nullable() });

export const ALERT_TYPES = ['attacks', 'round', 'rank', 'turns'] as const;

const alertSettingsSchema = z.object({
  alerts: z.object({ attacks: z.boolean(), round: z.boolean(), rank: z.boolean(), turns: z.boolean() }),
  roundName: z.string().nullable(),
  current: z.object({ turns: z.number(), cap: z.number(), nationalRank: z.number() }).nullable(),
});

const alertsClaimSchema = z.object({
  turns: z.array(z.object({
    discordId: z.string(),
    displayName: z.string(),
    roundName: z.string(),
    turns: z.number(),
    cap: z.number(),
    url: z.string().url(),
  })),
  ranks: z.array(z.object({
    discordId: z.string(),
    displayName: z.string(),
    roundName: z.string(),
    kind: z.enum(['lost-first', 'out-of-top-10']),
    rank: z.number(),
    leaderName: z.string().nullable(),
    url: z.string().url(),
  })),
  battles: z.array(z.object({
    id: z.string(),
    kind: z.enum(['RAID', 'DRIVE_BY', 'DRUG_HOES', 'STEAL_RIDE', 'LURE_CREW']),
    roundName: z.string(),
    attackerName: z.string(),
    attackerProfileUrl: z.string().url(),
    defenderName: z.string(),
    defenderProfileUrl: z.string().url(),
    attackerWon: z.boolean(),
    createdAt: z.string(),
    alertDiscordId: z.string().nullable(),
  })),
  rounds: z.array(z.object({
    type: z.enum(['opened', 'ending-soon', 'ended']),
    roundName: z.string(),
    status: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    url: z.string().url(),
    standings: z.array(rankingEntrySchema),
    recipients: z.array(z.object({ discordId: z.string(), rank: z.number().nullable() })),
  })),
});

const statusSchema = z.object({
  round: z.object({ name: z.string(), status: z.string(), msRemaining: z.number(), playerCount: z.number() }).nullable(),
  ruleset: z.object({ name: z.string() }).nullable(),
  turns: z.object({ amountPerInterval: z.number(), intervalMinutes: z.number(), cap: z.number() }).nullable(),
});

const newsSchema = z.object({
  news: z.array(z.object({
    title: z.string(),
    body: z.string(),
    isPinned: z.boolean(),
    publishedAt: z.string(),
    authorName: z.string().nullable(),
  })),
});

export type ProfileCard = z.infer<typeof profileSchema>['player'];
export type BadgeCard = z.infer<typeof badgesSchema>['player'];
export type City = z.infer<typeof citySchema>;
export type Rankings = z.infer<typeof rankingsSchema>;
export type LeaderboardStat = (typeof leaderboardStats)[number];
export type Leaderboard = z.infer<typeof leaderboardSchema>;
export type HallOfFame = z.infer<typeof hallOfFameSchema>;
export type History = z.infer<typeof historySchema>;
export type Member = z.infer<typeof memberSchema>;
export type Stats = z.infer<typeof statsSchema>;
export type NewsPost = z.infer<typeof newsClaimSchema>['news'][number];
export type NewsCreated = z.infer<typeof newsCreatedSchema>;
export type AlertType = (typeof ALERT_TYPES)[number];
export type AlertSettings = z.infer<typeof alertSettingsSchema>;
export type AlertsClaim = z.infer<typeof alertsClaimSchema>;
export type TurnReminder = AlertsClaim['turns'][number];
export type RankAlert = AlertsClaim['ranks'][number];
export type BattleEvent = AlertsClaim['battles'][number];
export type RoundEvent = AlertsClaim['rounds'][number];
export type RoundStatus = z.infer<typeof statusSchema>;
export type NewsFeed = z.infer<typeof newsSchema>;

/** Role resyncs an admin asked for from the game panel. */
export const resyncClaimSchema = z.object({ all: z.boolean(), discordIds: z.array(z.string()) });
export type ResyncClaim = z.infer<typeof resyncClaimSchema>;

export function isLeaderboardStat(value: string): value is LeaderboardStat {
  return (leaderboardStats as readonly string[]).includes(value);
}

export function createGameApi(options: { baseUrl: string; token: string; fetch?: typeof fetch; timeoutMs?: number }) {
  const fetchImpl = options.fetch ?? fetch;

  async function call<S extends z.ZodTypeAny>(
    schema: S,
    path: string,
    init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; auth?: boolean } = {},
  ): Promise<z.infer<S>> {
    const response = await fetchImpl(new URL(path, options.baseUrl), {
      method: init.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        // Public game endpoints never get the bot token.
        ...(init.auth === false ? {} : { authorization: `Bearer ${options.token}` }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = errorSchema.safeParse(json);
      throw error.success
        ? new GameApiError(response.status, error.data.error.code, error.data.error.message)
        : new GameApiError(response.status, 'HTTP_ERROR', `The game API returned ${response.status}.`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new GameApiError(502, 'BAD_RESPONSE', 'The game API returned an unexpected response.');
    return parsed.data;
  }

  const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

  return {
    roles: (discordIds: string[]) =>
      call(rolesSchema, '/api/internal/discord/roles', { method: 'POST', body: { discordIds } }),
    profile: async (player: { discordId: string } | { name: string }) =>
      (await call(profileSchema, `/api/internal/discord/profile?${query(player)}`)).player,
    badges: async (player: { discordId: string } | { name: string }) =>
      (await call(badgesSchema, `/api/internal/discord/badges?${query(player)}`)).player,
    history: (player: { discordId: string } | { name: string }) =>
      call(historySchema, `/api/internal/discord/history?${query(player)}`),
    rankings: () => call(rankingsSchema, '/api/internal/discord/rankings'),
    leaderboard: (stat: LeaderboardStat) => call(leaderboardSchema, `/api/internal/discord/leaderboard?${query({ stat })}`),
    cities: async () => (await call(citiesSchema, '/api/internal/discord/cities')).cities,
    cityRankings: (slug: string) => call(rankingsSchema, `/api/internal/discord/city-rankings?${query({ city: slug })}`),
    hallOfFame: () => call(hallOfFameSchema, '/api/internal/discord/hall-of-fame'),
    member: (discordId: string) => call(memberSchema, `/api/internal/discord/member?${query({ discordId })}`),
    stats: (discordId: string) => call(statsSchema, `/api/internal/discord/stats?${query({ discordId })}`),
    createNews: (input: { discordId: string; title: string; body: string; pinned: boolean; scope: 'round' | 'global' }) =>
      call(newsCreatedSchema, '/api/internal/discord/news', { method: 'POST', body: input }),
    /** Claimed posts count as posted, even if sending them fails. */
    claimNews: async () => (await call(newsClaimSchema, '/api/internal/discord/news/claim', { method: 'POST' })).news,
    alertSettings: (discordId: string) => call(alertSettingsSchema, `/api/internal/discord/alerts?${query({ discordId })}`),
    setAlert: (discordId: string, type: AlertType, enabled: boolean) =>
      call(alertSettingsSchema, '/api/internal/discord/alerts', { method: 'PUT', body: { discordId, type, enabled } }),
    /** Battles, round events, rank drops and full turns, each handed out once. */
    claimAlerts: () => call(alertsClaimSchema, '/api/internal/discord/alerts/claim', { method: 'POST' }),
    /** Admin-requested role resyncs, each handed out once. */
    claimResync: () => call(resyncClaimSchema, '/api/internal/discord/resync/claim', { method: 'POST' }),
    round: () => call(statusSchema, '/api/rounds/current/status', { auth: false }),
    news: () => call(newsSchema, '/api/rounds/current/news', { auth: false }),
  };
}

export type GameApi = ReturnType<typeof createGameApi>;
