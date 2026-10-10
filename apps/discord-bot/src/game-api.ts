import { BUG_REPORT_RESOLUTIONS, type BugReportCategory, type BugReportResolution } from '@streets/shared';
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
      // Any string: the game adds categories (0.9.0-F season feats brought street,
      // turf, travel and economy), and an unknown one must not fail all of /badges.
      category: z.string(),
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

const okSchema = z.object({ ok: z.literal(true) });

const staffBugReportSchema = z.object({
  id: z.string(),
  category: z.string(),
  summary: z.string(),
  details: z.string(),
  username: z.string(),
  source: z.enum(['GAME', 'DISCORD']),
  pagePath: z.string().nullable(),
  appVersion: z.string().nullable(),
  createdAt: z.string(),
  resolution: z.enum(BUG_REPORT_RESOLUTIONS).nullable(),
  resolvedByUsername: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  url: z.string(),
});

const reportPartySchema = z.object({ username: z.string(), displayName: z.string(), publicPimpId: z.number() });

/** Who reported whom and why. The game never sends the message itself. */
const staffMessageReportSchema = z.object({
  id: z.string(),
  source: z.enum(['PLAYER', 'AUTO']),
  reason: z.string(),
  createdAt: z.string(),
  reporterUsername: z.string().nullable(),
  roundName: z.string(),
  sender: reportPartySchema,
  recipient: reportPartySchema,
  reportsOnMessage: z.number(),
  openAgainstSender: z.number(),
  senderRestricted: z.boolean(),
  resolvedAt: z.string().nullable(),
  resolvedByUsername: z.string().nullable(),
  resolution: z.enum(['DISMISSED', 'ACTIONED']).nullable(),
  url: z.string(),
});

const staffPostSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'BUG_REPORT', 'BUG_REPORT_RESOLVED', 'MESSAGE_REPORT', 'MESSAGE_REPORT_RESOLVED', 'PATCH_NOTES_HELD',
    'STATUS_DEPLOY_STARTED', 'STATUS_DEPLOY_FINISHED', 'STATUS_DEPLOY_FAILED', 'STATUS_MAINTENANCE',
  ]),
  editMessageId: z.string().nullable(),
  bugReport: staffBugReportSchema.optional(),
  messageReport: staffMessageReportSchema.optional(),
  patchNotes: z.object({ id: z.string(), title: z.string(), body: z.string(), publishedAt: z.string(), url: z.string() }).optional(),
  deploy: z.object({ phase: z.enum(['started', 'finished', 'failed']), commit: z.string(), at: z.string() }).optional(),
  maintenance: z.object({ message: z.string(), startsAt: z.string(), endsAt: z.string() }).optional(),
});

/** Public: which build answered, and the season it is serving. */
const metaSchema = z.object({
  app: z.object({ version: z.string(), commit: z.string().nullable().optional() }),
  season: z.object({ name: z.string(), status: z.string(), endsAt: z.string() }).nullable(),
});

/** Public: the live site banner, which carries any maintenance window. */
const bannerSchema = z.object({
  banner: z.object({
    message: z.string(),
    kind: z.enum(['notice', 'maintenance']),
    maintenance: z.object({ startsAt: z.string(), endsAt: z.string() }).nullable(),
  }).nullable(),
});

const readySchema = z.object({ ok: z.boolean() });

const staffClaimSchema = z.object({ posts: z.array(staffPostSchema) });
const bugCreatedSchema = z.object({ ok: z.literal(true), id: z.string(), message: z.string() });
const bugResolvedSchema = z.object({ report: staffBugReportSchema });
/** applied: muted now. kept: a longer mute was already in force. none: dismissed. */
const reportActedSchema = z.object({ report: staffMessageReportSchema, mute: z.enum(['applied', 'kept', 'none']) });

const ticketSchema = z.object({
  id: z.string(),
  discordId: z.string(),
  discordName: z.string(),
  subject: z.string(),
  threadId: z.string().nullable(),
  staffMessageId: z.string().nullable(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  closedByName: z.string().nullable(),
});

/** Staff-only: posted to the staff channel, never into the ticket thread the member reads. */
const supportContextSchema = z.object({
  account: z.object({
    username: z.string(),
    createdAt: z.string(),
    lastLoginAt: z.string().nullable(),
    emailVerified: z.boolean(),
    isAdmin: z.boolean(),
    restrictions: z.array(z.string()),
    url: z.string(),
  }).nullable(),
  player: z.object({ roundName: z.string(), displayName: z.string(), publicPimpId: z.number(), url: z.string() }).nullable(),
  bugReports: z.object({ open: z.number(), recent: z.array(z.object({ summary: z.string(), resolution: z.string().nullable() })) }),
  openReportsAgainst: z.number(),
  pastTickets: z.number(),
});

const openTicketSchema = z.union([
  z.object({ existing: ticketSchema }),
  z.object({ ticket: ticketSchema, context: supportContextSchema }),
]);
const closedTicketSchema = z.object({ ticket: ticketSchema });
const staffCheckSchema = z.object({ admin: z.boolean() });

const newsCreatedSchema = z.object({ id: z.string(), title: z.string(), url: z.string().url(), roundName: z.string().nullable() });

export const ALERT_TYPES = ['attacks', 'round', 'rank', 'turns', 'turf', 'alliance'] as const;

const alertSettingsSchema = z.object({
  alerts: z.object({ attacks: z.boolean(), round: z.boolean(), rank: z.boolean(), turns: z.boolean(), turf: z.boolean(), alliance: z.boolean() }),
  roundName: z.string().nullable(),
  current: z.object({ turns: z.number(), cap: z.number(), nationalRank: z.number() }).nullable(),
});

const battleEventSchema = z.object({
  id: z.string(),
  kind: z.enum(['RAID', 'DRIVE_BY', 'DRUG_HOES', 'STEAL_RIDE', 'LURE_CREW']),
  roundName: z.string(),
  attackerName: z.string(),
  attackerProfileUrl: z.string().url(),
  defenderName: z.string(),
  defenderProfileUrl: z.string().url(),
  attackerWon: z.boolean(),
  createdAt: z.string(),
});

const turfEventSchema = z.object({
  id: z.string(),
  roundName: z.string(),
  city: z.string(),
  cityName: z.string(),
  district: z.string(),
  districtName: z.string(),
  attackerName: z.string(),
  attackerProfileUrl: z.string().url(),
  attackerAllianceTag: z.string().nullable(),
  defenderName: z.string(),
  defenderProfileUrl: z.string().url(),
  settledAt: z.string(),
});

/** 1.1.0-D. Block wars on the street feed. Older servers send none. */
const blockWarEventSchema = z.object({
  id: z.string(),
  phase: z.enum(['DECLARED', 'ENDED']),
  roundName: z.string(),
  cityName: z.string(),
  districtName: z.string(),
  goal: z.enum(['TAKE', 'SACK']),
  attackerName: z.string(),
  attackerProfileUrl: z.string().url(),
  attackerAllianceTag: z.string().nullable(),
  defenderName: z.string(),
  defenderProfileUrl: z.string().url(),
  defenderAllianceTag: z.string().nullable(),
  winner: z.enum(['ATTACKER', 'DEFENDER']).nullable(),
  reason: z.string().nullable(),
  at: z.string(),
});

const territoryEventSchema = z.object({
  id: z.string(),
  roundName: z.string(),
  city: z.string(),
  cityName: z.string(),
  previous: z.object({ name: z.string(), tag: z.string(), blocksHeld: z.number() }).nullable(),
  next: z.object({ name: z.string(), tag: z.string(), blocksHeld: z.number() }).nullable(),
  blocksTotal: z.number(),
  happenedAt: z.string(),
});

const turfCitySchema = z.object({
  roundName: z.string(),
  city: citySchema,
  control: z.object({
    alliance: z.object({ name: z.string(), tag: z.string() }),
    blocksHeld: z.number(),
    blocksTotal: z.number(),
    share: z.number(),
  }).nullable(),
  blocks: z.array(z.object({
    district: z.string(),
    districtName: z.string(),
    holder: z.object({
      publicPimpId: z.number(),
      displayName: z.string(),
      alliance: z.object({ name: z.string(), tag: z.string() }).nullable(),
    }).nullable(),
    cornerThugs: z.number(),
    cornerGuns: z.number(),
    localsThugs: z.number(),
    vacant: z.boolean(),
    heldSince: z.string().nullable(),
    shieldUntil: z.string().nullable(),
  })),
});

const allianceCardSchema = z.object({
  roundName: z.string(),
  alliance: z.object({
    name: z.string(),
    tag: z.string(),
    rank: z.number(),
    combinedNetWorthCents: z.number(),
    memberCount: z.number(),
    maxMembers: z.number(),
    leader: z.object({ publicPimpId: z.number(), displayName: z.string() }).nullable(),
    members: z.array(z.object({
      publicPimpId: z.number(),
      displayName: z.string(),
      netWorthCents: z.number(),
      nationalRank: z.number(),
      isLeader: z.boolean(),
      isYou: z.boolean(),
      joinedAt: z.string(),
    })),
    foundedAt: z.string(),
    isYours: z.boolean(),
    forumUrl: z.string().url().nullable(),
  }),
  turf: z.object({
    blocksHeld: z.number(),
    citiesControlled: z.number(),
    cities: z.array(z.object({
      slug: z.string(),
      name: z.string(),
      blocksHeld: z.number(),
      blocksTotal: z.number(),
      controls: z.boolean(),
    })),
    recent: z.array(turfEventSchema),
  }),
});

const crackdownEventSchema = z.object({
  id: z.string(),
  phase: z.enum(['warning', 'sweep']),
  roundName: z.string(),
  city: z.string(),
  cityName: z.string(),
  warningAt: z.string(),
  sweepAt: z.string(),
  holdersAffected: z.number(),
  thugsPickedUp: z.number(),
  // 1.1.0-F. Older game servers omit the racket warning amount.
  racketHeatPerBusiness: z.number().default(0),
});

// 1.4.0-F. A player reaching a faction's Inner Circle. Older game servers send none.
const factionEventSchema = z.object({
  id: z.string(),
  roundName: z.string(),
  publicPimpId: z.number(),
  displayName: z.string(),
  profileUrl: z.string().url(),
  factionKey: z.string(),
  factionName: z.string(),
  tierName: z.string(),
  happenedAt: z.string(),
});

const roundEventSchema = z.object({
  type: z.enum(['opened', 'ending-soon', 'ended']),
  roundName: z.string(),
  status: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  url: z.string().url(),
  standings: z.array(rankingEntrySchema),
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
  attacks: z.array(battleEventSchema.extend({ discordId: z.string() })),
  roundAlerts: z.array(roundEventSchema.extend({ discordId: z.string(), rank: z.number().nullable() })),
  turfAlerts: z.array(turfEventSchema.extend({ discordId: z.string() })),
  allianceAlerts: z.array(territoryEventSchema.extend({
    discordId: z.string(),
    allianceTag: z.string(),
    change: z.enum(['gained', 'lost']),
  })),
  // 0.9.0-G categories, already worded by the server. Older servers do not send it.
  notices: z.array(z.object({
    discordId: z.string(),
    category: z.string(),
    title: z.string(),
    body: z.string(),
    url: z.string().url(),
    tag: z.string(),
  })).default([]),
  battles: z.array(battleEventSchema),
  turf: z.array(turfEventSchema),
  blockWars: z.array(blockWarEventSchema).default([]),
  territory: z.array(territoryEventSchema),
  crackdowns: z.array(crackdownEventSchema),
  rounds: z.array(roundEventSchema),
  factions: z.array(factionEventSchema).default([]),
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
export type TurfCity = z.infer<typeof turfCitySchema>;
export type AllianceCard = z.infer<typeof allianceCardSchema>;
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
export type TurfEvent = AlertsClaim['turf'][number];
export type BlockWarEvent = AlertsClaim['blockWars'][number];
export type TerritoryEvent = AlertsClaim['territory'][number];
export type CrackdownEvent = AlertsClaim['crackdowns'][number];
export type FactionEvent = AlertsClaim['factions'][number];
export type TurfAlert = AlertsClaim['turfAlerts'][number];
export type AllianceAlert = AlertsClaim['allianceAlerts'][number];
export type GameNotice = AlertsClaim['notices'][number];
export type StaffPost = z.infer<typeof staffPostSchema>;
export type PlatformMeta = z.infer<typeof metaSchema>;
export type SiteBanner = z.infer<typeof bannerSchema>['banner'];
export type StaffBugReport = z.infer<typeof staffBugReportSchema>;
export type StaffMessageReport = z.infer<typeof staffMessageReportSchema>;
export type ReportAction = 'mute-1d' | 'dismiss';
export type SupportTicket = z.infer<typeof ticketSchema>;
export type SupportContext = z.infer<typeof supportContextSchema>;
export type BugCategory = BugReportCategory;
export type BugResolution = BugReportResolution;
export type RoundEvent = AlertsClaim['rounds'][number];
export type RoundStatus = z.infer<typeof statusSchema>;
export type NewsFeed = z.infer<typeof newsSchema>;

/** 0.3.0-C. Live alliances in the current round, one Discord role each. */
export const alliancesSchema = z.object({ alliances: z.array(z.object({ tag: z.string(), name: z.string() })) });

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
    turf: (city: string) => call(turfCitySchema, `/api/internal/discord/turf?${query({ city })}`),
    alliance: (alliance: { discordId: string } | { tag: string }) =>
      call(allianceCardSchema, `/api/internal/discord/alliance?${query(alliance)}`),
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
    /** Discord refused a claimed post; the admin panel shows why and offers a resend. */
    newsFailed: async (newsId: string, error: string) => {
      await call(okSchema, `/api/internal/discord/news/${encodeURIComponent(newsId)}/failed`, { method: 'POST', body: { error } });
    },
    /** Whether the news channel is usable, so the admin panel can say why news is stuck. */
    reportNewsChannel: async (report: { channel: string | null; problem: string | null }) => {
      await call(okSchema, '/api/internal/discord/news/status', { method: 'POST', body: report });
    },
    /** /bug: a report from the member's linked account. */
    createBugReport: (discordId: string, report: { category: BugCategory; summary: string; details: string }) =>
      call(bugCreatedSchema, '/api/internal/discord/bug-reports', { method: 'POST', body: { discordId, report } }),
    /** A staff button; the game checks the member is a linked admin. */
    resolveBugReport: async (reportId: string, input: { discordId: string; resolution: BugResolution; note: string; playerReply?: string }) =>
      (await call(bugResolvedSchema, `/api/internal/discord/bug-reports/${encodeURIComponent(reportId)}/resolve`, { method: 'POST', body: input })).report,
    /** A staff button on a message report; the game checks the member is a linked admin. */
    actOnMessageReport: async (reportId: string, input: { discordId: string; action: ReportAction; note: string }) =>
      call(reportActedSchema, `/api/internal/discord/message-reports/${encodeURIComponent(reportId)}/act`, { method: 'POST', body: input }),
    /** Whether a member may use staff buttons: a linked, active game admin. */
    isStaff: async (discordId: string) => (await call(staffCheckSchema, `/api/internal/discord/staff?${query({ discordId })}`)).admin,
    /** /support: their open ticket, or a new one with staff-only context. */
    openTicket: (input: { discordId: string; discordName: string; subject: string }) =>
      call(openTicketSchema, '/api/internal/discord/support-tickets', { method: 'POST', body: input }),
    attachTicket: async (ticketId: string, input: { threadId: string; staffMessageId: string | null }) => {
      await call(okSchema, `/api/internal/discord/support-tickets/${encodeURIComponent(ticketId)}/attach`, { method: 'POST', body: input });
    },
    abandonTicket: async (ticketId: string) => {
      await call(okSchema, `/api/internal/discord/support-tickets/${encodeURIComponent(ticketId)}/abandon`, { method: 'POST' });
    },
    /** The member who opened it or a linked game admin; the game checks which. */
    closeTicket: async (ticketId: string, input: { discordId: string; name: string }) =>
      (await call(closedTicketSchema, `/api/internal/discord/support-tickets/${encodeURIComponent(ticketId)}/close`, { method: 'POST', body: input })).ticket,
    /** Staff channel posts, each handed out once. */
    claimStaffPosts: async (audience: 'staff' | 'status' = 'staff') =>
      (await call(staffClaimSchema, '/api/internal/discord/staff-posts/claim', { method: 'POST', body: { audience } })).posts,
    staffPostPosted: async (postId: string, messageId: string) => {
      await call(okSchema, `/api/internal/discord/staff-posts/${encodeURIComponent(postId)}/posted`, { method: 'POST', body: { messageId } });
    },
    staffPostFailed: async (postId: string, error: string) => {
      await call(okSchema, `/api/internal/discord/staff-posts/${encodeURIComponent(postId)}/failed`, { method: 'POST', body: { error } });
    },
    alertSettings: (discordId: string) => call(alertSettingsSchema, `/api/internal/discord/alerts?${query({ discordId })}`),
    setAlert: (discordId: string, type: AlertType, enabled: boolean) =>
      call(alertSettingsSchema, '/api/internal/discord/alerts', { method: 'PUT', body: { discordId, type, enabled } }),
    /** Battles, round events, rank drops and full turns, each handed out once. */
    /** `feed: false` leaves raid-feed events on the server until the bot can post them. */
    claimAlerts: (options?: { feed: boolean }) => call(alertsClaimSchema, '/api/internal/discord/alerts/claim', { method: 'POST', body: options }),
    alliances: () => call(alliancesSchema, '/api/internal/discord/alliances'),
    /** Admin-requested role resyncs, each handed out once. */
    claimResync: () => call(resyncClaimSchema, '/api/internal/discord/resync/claim', { method: 'POST' }),
    round: () => call(statusSchema, '/api/rounds/current/status', { auth: false }),
    news: () => call(newsSchema, '/api/rounds/current/news', { auth: false }),
    /** Database answers and the current round loads; throws when the game is down. */
    ready: () => call(readySchema, '/api/ready', { auth: false }),
    meta: () => call(metaSchema, '/api/meta', { auth: false }),
    banner: async () => (await call(bannerSchema, '/api/site/banner', { auth: false })).banner,
  };
}

export type GameApi = ReturnType<typeof createGameApi>;
