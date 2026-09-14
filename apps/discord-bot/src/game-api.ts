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

const profileSchema = z.object({
  player: z.object({
    roundName: z.string(),
    displayName: z.string(),
    publicPimpId: z.number(),
    city: z.string(),
    netWorthCents: z.number(),
    rank: z.object({ local: z.number(), national: z.number(), nationalMovement: z.number().nullable() }),
    legacy: z.object({ roundsPlayed: z.number(), roundWins: z.number(), bestNationalRank: z.number().nullable() }),
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

const citySchema = z.object({ slug: z.string(), name: z.string() });
const citiesSchema = z.object({ cities: z.array(citySchema) });

const rankingsSchema = z.object({
  round: z.object({ name: z.string(), status: z.string(), endsAt: z.string() }).nullable(),
  // Optional for game servers from before city rankings.
  city: citySchema.nullable().optional(),
  entries: z.array(z.object({
    rank: z.number(),
    publicPimpId: z.number(),
    displayName: z.string(),
    city: z.string(),
    netWorthCents: z.number(),
    movement: z.number().nullable(),
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

const memberSchema = z.object({
  linked: z.boolean(),
  username: z.string().nullable(),
  forumUsername: z.string().nullable(),
  roundName: z.string().nullable(),
  player: z.object({ displayName: z.string(), publicPimpId: z.number(), profileUrl: z.string().url() }).nullable(),
  roles: z.array(z.string()),
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

const reminderStateSchema = z.object({
  turns: z.boolean(),
  roundName: z.string().nullable(),
  current: z.object({ turns: z.number(), cap: z.number() }).nullable(),
});

const reminderClaimSchema = z.object({
  reminders: z.array(z.object({
    discordId: z.string(),
    displayName: z.string(),
    roundName: z.string(),
    turns: z.number(),
    cap: z.number(),
    url: z.string().url(),
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
export type HallOfFame = z.infer<typeof hallOfFameSchema>;
export type Member = z.infer<typeof memberSchema>;
export type NewsPost = z.infer<typeof newsClaimSchema>['news'][number];
export type ReminderState = z.infer<typeof reminderStateSchema>;
export type TurnReminder = z.infer<typeof reminderClaimSchema>['reminders'][number];
export type RoundStatus = z.infer<typeof statusSchema>;
export type NewsFeed = z.infer<typeof newsSchema>;

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

  return {
    roles: (discordIds: string[]) =>
      call(rolesSchema, '/api/internal/discord/roles', { method: 'POST', body: { discordIds } }),
    profile: async (query: { discordId: string } | { name: string }) =>
      (await call(profileSchema, `/api/internal/discord/profile?${new URLSearchParams(query)}`)).player,
    badges: async (query: { discordId: string } | { name: string }) =>
      (await call(badgesSchema, `/api/internal/discord/badges?${new URLSearchParams(query)}`)).player,
    rankings: () => call(rankingsSchema, '/api/internal/discord/rankings'),
    cities: async () => (await call(citiesSchema, '/api/internal/discord/cities')).cities,
    cityRankings: (slug: string) =>
      call(rankingsSchema, `/api/internal/discord/city-rankings?${new URLSearchParams({ city: slug })}`),
    hallOfFame: () => call(hallOfFameSchema, '/api/internal/discord/hall-of-fame'),
    member: (discordId: string) =>
      call(memberSchema, `/api/internal/discord/member?${new URLSearchParams({ discordId })}`),
    /** Claimed posts count as posted, even if sending them fails. */
    claimNews: async () => (await call(newsClaimSchema, '/api/internal/discord/news/claim', { method: 'POST' })).news,
    setTurnReminder: (discordId: string, turns: boolean) =>
      call(reminderStateSchema, '/api/internal/discord/reminders', { method: 'PUT', body: { discordId, turns } }),
    claimTurnReminders: async () =>
      (await call(reminderClaimSchema, '/api/internal/discord/reminders/claim', { method: 'POST' })).reminders,
    round: () => call(statusSchema, '/api/rounds/current/status', { auth: false }),
    news: () => call(newsSchema, '/api/rounds/current/news', { auth: false }),
  };
}

export type GameApi = ReturnType<typeof createGameApi>;
