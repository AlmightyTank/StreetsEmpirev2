import { createHash } from 'node:crypto';
import type { NotificationChannel, Prisma, PrismaClient, Round } from '@prisma/client';
import { loadRulesetForRound, regenerateTurns } from '@streets/rules-engine';
import type {
  DiscordAlertsClaimDto,
  DiscordBattleEventDto,
  DiscordBattleKind,
  DiscordRankAlertDto,
  DiscordRoundEventDto,
  NotificationCategory,
  NotificationPayload,
  NotificationSettingsDto,
  PushDeviceDto,
  UpdateNotificationSettingsInput,
} from '@streets/shared';
import { env } from '../config/env.js';
import { RoundService } from './round.service.js';
import { gameUrl, playerUrl, roundStandings } from './standings.js';

type Tx = Prisma.TransactionClient;

/**
 * Turn reminder state machine. Turns only regenerate while below the cap, so
 * "armed" (seen below the cap) then "full" means they filled up since last time.
 */
export function reminderDecision(input: { armed: boolean; turns: number; cap: number }): 'arm' | 'notify' | 'none' {
  if (input.turns >= input.cap) return input.armed ? 'notify' : 'none';
  return input.armed ? 'none' : 'arm';
}

/** Rank alerts fire on the way down only: losing #1, or falling out of the top 10. */
export function rankAlertFor(previous: number | null, current: number): DiscordRankAlertDto['kind'] | null {
  if (previous === null) return null;
  if (previous === 1 && current > 1) return 'lost-first';
  if (previous <= 10 && current > 10) return 'out-of-top-10';
  return null;
}

/** Which channels collection writes rows for. Defaults follow what this server has configured. */
export interface ChannelSwitches {
  discord: boolean;
  push: boolean;
}

const defaultChannels = (): ChannelSwitches => ({ discord: env.discordBot.enabled, push: env.push.configured });

type Recipient = {
  discordEnabled: boolean;
  pushEnabled: boolean;
  account: { isActive: boolean; discordId: string | null; _count: { pushSubscriptions: number } };
};

const recipientSelect = {
  discordEnabled: true,
  pushEnabled: true,
  account: { select: { isActive: true, discordId: true, _count: { select: { pushSubscriptions: true } } } },
} as const;

/** The channels that can reach this account right now. */
export function channelsFor(recipient: Recipient, switches: ChannelSwitches): NotificationChannel[] {
  if (!recipient.account.isActive) return [];
  const channels: NotificationChannel[] = [];
  if (switches.discord && recipient.discordEnabled && recipient.account.discordId) channels.push('DISCORD');
  if (switches.push && recipient.pushEnabled && recipient.account._count.pushSubscriptions > 0) channels.push('PUSH');
  return channels;
}

type OutboxRow = Prisma.NotificationOutboxCreateManyInput;

function rowsFor(accountId: string, channels: NotificationChannel[], key: string, payload: NotificationPayload): OutboxRow[] {
  return channels.map((channel) => ({
    accountId,
    channel,
    category: payload.category,
    payload: payload as unknown as Prisma.InputJsonValue,
    dedupeKey: `${key}:${accountId}:${channel}`,
  }));
}

export const BATTLE_KINDS: readonly DiscordBattleKind[] = ['RAID', 'DRIVE_BY', 'DRUG_HOES', 'STEAL_RIDE', 'LURE_CREW'];

export const battleEventSelect = {
  id: true,
  kind: true,
  attackerReport: true,
  createdAt: true,
  attacker: { select: { displayName: true, publicPimpId: true, round: { select: { name: true } } } },
  defender: { select: { displayName: true, publicPimpId: true } },
} satisfies Prisma.RaidBattleSelect;

type BattleEventRow = Prisma.RaidBattleGetPayload<{ select: typeof battleEventSelect }>;

/** Names and result only: no loot, crew or weapons. */
export function battleEventDto(row: BattleEventRow): DiscordBattleEventDto {
  const report = row.attackerReport as { kind?: string; won?: boolean };
  return {
    id: row.id,
    kind: BATTLE_KINDS.find((candidate) => candidate === report.kind) ?? row.kind,
    roundName: row.attacker.round.name,
    attackerName: row.attacker.displayName,
    attackerProfileUrl: playerUrl(row.attacker.publicPimpId),
    defenderName: row.defender.displayName,
    defenderProfileUrl: playerUrl(row.defender.publicPimpId),
    attackerWon: report.won === true,
    createdAt: row.createdAt.toISOString(),
  };
}

export function roundEventDto(type: DiscordRoundEventDto['type'], round: Round, standings: DiscordRoundEventDto['standings'] = []): DiscordRoundEventDto {
  return {
    type,
    roundName: round.name,
    status: round.status,
    startsAt: round.startsAt.toISOString(),
    endsAt: round.endsAt.toISOString(),
    url: gameUrl(type === 'ended' ? '/game/rankings' : '/join'),
    standings,
  };
}

/** Final top 10 of a round, for the round-end post and alerts. */
export async function finalStandings(prisma: Pick<PrismaClient, 'roundPlayer'>, roundId: string) {
  const standings = await roundStandings(prisma, roundId);
  const top = standings.players.slice(0, 10).map((player, index) => ({
    rank: standings.ranks[index]!,
    publicPimpId: player.publicPimpId,
    displayName: player.displayName,
    city: player.city.name,
    netWorthCents: Number(player.netWorthCents),
    movement: null,
    profileUrl: playerUrl(player.publicPimpId),
  }));
  return { ...standings, top };
}

/** Which rounds are due each kind of round event. Shared by alerts and the public round-end post. */
export function endedRoundsWhere(marker: 'alertsEndedAt' | 'discordEndedAt', now: Date): Prisma.RoundWhereInput {
  return {
    [marker]: null,
    OR: [{ status: { in: ['ENDED', 'ARCHIVED'] } }, { status: { in: ['REGISTRATION', 'ACTIVE'] }, endsAt: { lte: now } }],
  };
}

async function collectAttacks(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const battles = await tx.raidBattle.findMany({
    where: { alertsCollectedAt: null, voidedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      ...battleEventSelect,
      defender: {
        select: {
          ...battleEventSelect.defender.select,
          accountId: true,
          account: { select: { notificationSettings: { select: { attacksEnabled: true, ...recipientSelect } } } },
        },
      },
    },
  });
  if (!battles.length) return [];
  await tx.raidBattle.updateMany({ where: { id: { in: battles.map((battle) => battle.id) }, alertsCollectedAt: null }, data: { alertsCollectedAt: now } });

  return battles.flatMap((battle) => {
    const settings = battle.defender.account.notificationSettings;
    if (!settings?.attacksEnabled) return [];
    return rowsFor(battle.defender.accountId, channelsFor(settings, switches), `battle:${battle.id}`, { category: 'attacks', battle: battleEventDto(battle) });
  });
}

async function collectRoundEvents(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const soon = new Date(now.getTime() + 24 * 60 * 60_000);
  const [openedRounds, endingSoonRounds, endedRounds] = await Promise.all([
    tx.round.findMany({ where: { alertsOpenedAt: null, status: { in: ['REGISTRATION', 'ACTIVE'] } } }),
    tx.round.findMany({ where: { alertsEndingSoonAt: null, alertsEndedAt: null, status: 'ACTIVE', endsAt: { gt: now, lte: soon } } }),
    tx.round.findMany({ where: endedRoundsWhere('alertsEndedAt', now) }),
  ]);
  if (!openedRounds.length && !endingSoonRounds.length && !endedRounds.length) return [];

  const endedIds = endedRounds.map((round) => round.id);
  await Promise.all([
    tx.round.updateMany({ where: { id: { in: openedRounds.map((round) => round.id) }, alertsOpenedAt: null }, data: { alertsOpenedAt: now } }),
    tx.round.updateMany({ where: { id: { in: endingSoonRounds.map((round) => round.id) }, alertsEndingSoonAt: null }, data: { alertsEndingSoonAt: now } }),
    tx.round.updateMany({ where: { id: { in: endedIds }, alertsEndedAt: null }, data: { alertsEndedAt: now } }),
  ]);
  // An ended round never needs its "ending soon" alert any more.
  await tx.round.updateMany({ where: { id: { in: endedIds }, alertsEndingSoonAt: null }, data: { alertsEndingSoonAt: now } });

  const subscribers = (await tx.notificationSettings.findMany({
    where: { roundEnabled: true, account: { isActive: true } },
    select: { accountId: true, ...recipientSelect },
  })).map((row) => ({ accountId: row.accountId, channels: channelsFor(row, switches) })).filter((row) => row.channels.length);
  if (!subscribers.length) return [];

  const rows: OutboxRow[] = [];
  // Ending soon can be re-armed when an admin moves the end date, so its key carries the collection time.
  const push = (event: DiscordRoundEventDto, key: string, rankByAccount: Map<string, number> | null) => {
    for (const subscriber of subscribers) {
      const rank = rankByAccount ? rankByAccount.get(subscriber.accountId) : null;
      if (rank === undefined) continue;
      rows.push(...rowsFor(subscriber.accountId, subscriber.channels, key, { category: 'round', event, rank }));
    }
  };
  for (const round of openedRounds) {
    // A round that opened and ended between checks only announces the ending.
    if (endedIds.includes(round.id)) continue;
    push(roundEventDto('opened', round), `round:${round.id}:opened`, null);
  }
  for (const round of endingSoonRounds) {
    const { rankByAccount } = await roundStandings(tx, round.id);
    push(roundEventDto('ending-soon', round), `round:${round.id}:ending-soon:${now.getTime()}`, rankByAccount);
  }
  for (const round of endedRounds) {
    const { top, rankByAccount } = await finalStandings(tx, round.id);
    push(roundEventDto('ended', round, top), `round:${round.id}:ended`, rankByAccount);
  }
  return rows;
}

/** Turn and rank alerts for the running round. */
async function collectPlayerAlerts(tx: Tx, round: Round, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const settings = await tx.notificationSettings.findMany({
    where: { OR: [{ turnsEnabled: true }, { rankEnabled: true }], account: { isActive: true } },
    select: {
      accountId: true,
      turnsEnabled: true,
      turnsArmed: true,
      rankEnabled: true,
      rankRoundId: true,
      rankLastNational: true,
      ...recipientSelect,
    },
  });
  if (!settings.length) return [];

  const [players, standings] = await Promise.all([
    tx.roundPlayer.findMany({
      where: { roundId: round.id, accountId: { in: settings.map((setting) => setting.accountId) } },
      select: { accountId: true, displayName: true, turns: true, lastTurnCalculationAt: true },
    }),
    settings.some((setting) => setting.rankEnabled) ? roundStandings(tx, round.id) : null,
  ]);
  const playerByAccount = new Map(players.map((player) => [player.accountId, player]));
  const ruleset = loadRulesetForRound(round);

  const arm: string[] = [];
  const turnsDue: string[] = [];
  const rows: OutboxRow[] = [];
  const rankUpdates: Array<{ accountId: string; rank: number }> = [];

  for (const setting of settings) {
    const player = playerByAccount.get(setting.accountId);
    if (!player) continue;
    const channels = channelsFor(setting, switches);

    if (setting.turnsEnabled) {
      const current = regenerateTurns(player, now, ruleset).turns;
      const decision = reminderDecision({ armed: setting.turnsArmed, turns: current, cap: ruleset.turns.cap });
      if (decision === 'arm') arm.push(setting.accountId);
      if (decision === 'notify') {
        turnsDue.push(setting.accountId);
        rows.push(...rowsFor(setting.accountId, channels, `turns:${round.id}:${now.getTime()}`, {
          category: 'turns',
          reminder: { displayName: player.displayName, roundName: round.name, turns: current, cap: ruleset.turns.cap, url: gameUrl('/game') },
        }));
      }
    }

    const rank = standings?.rankByAccount.get(setting.accountId);
    if (setting.rankEnabled && rank !== undefined) {
      // A rank remembered from another round says nothing about this one.
      const previous = setting.rankRoundId === round.id ? setting.rankLastNational : null;
      const kind = rankAlertFor(previous, rank);
      if (kind) {
        rows.push(...rowsFor(setting.accountId, channels, `rank:${round.id}:${now.getTime()}`, {
          category: 'rank',
          alert: { displayName: player.displayName, roundName: round.name, kind, rank, leaderName: standings!.players[0]?.displayName ?? null, url: gameUrl('/game/rankings') },
        }));
      }
      if (setting.rankRoundId !== round.id || setting.rankLastNational !== rank) rankUpdates.push({ accountId: setting.accountId, rank });
    }
  }

  if (arm.length) await tx.notificationSettings.updateMany({ where: { accountId: { in: arm } }, data: { turnsArmed: true } });
  if (turnsDue.length) {
    await tx.notificationSettings.updateMany({ where: { accountId: { in: turnsDue }, turnsArmed: true }, data: { turnsArmed: false, turnsLastSentAt: now } });
  }
  for (const update of rankUpdates) {
    await tx.notificationSettings.update({ where: { accountId: update.accountId }, data: { rankRoundId: round.id, rankLastNational: update.rank } });
  }
  return rows;
}

/** Current round, plus the account's turns and national rank in it when they have joined. */
export async function currentStanding(prisma: PrismaClient, accountId: string) {
  const round = await RoundService.getCurrent(prisma);
  if (!round) return { round: null, current: null };
  const player = await prisma.roundPlayer.findFirst({
    where: { roundId: round.id, accountId },
    select: { turns: true, lastTurnCalculationAt: true, netWorthCents: true },
  });
  if (!player) return { round, current: null };
  const ruleset = loadRulesetForRound(round);
  const ahead = await prisma.roundPlayer.count({
    where: { roundId: round.id, netWorthCents: { gt: player.netWorthCents }, account: { isActive: true } },
  });
  return {
    round,
    current: { turns: regenerateTurns(player, new Date(), ruleset).turns, cap: ruleset.turns.cap, nationalRank: ahead + 1 },
  };
}

type Standing = Awaited<ReturnType<typeof currentStanding>>;

/** The column change for switching one category, including the state that stops it alerting about the past. */
function categoryData(category: NotificationCategory, enabled: boolean, { round, current }: Standing): Omit<Prisma.NotificationSettingsUncheckedCreateInput, 'accountId'> {
  switch (category) {
    case 'attacks':
      return { attacksEnabled: enabled };
    case 'round':
      return { roundEnabled: enabled };
    case 'rank':
      // Start from the current rank, so switching on never alerts about the past.
      return {
        rankEnabled: enabled,
        rankRoundId: enabled && round && current ? round.id : null,
        rankLastNational: enabled && current ? current.nationalRank : null,
      };
    case 'turns':
      // Already full when switching on: the first reminder waits until they spend and refill.
      return { turnsEnabled: enabled, turnsArmed: enabled && (current ? current.turns < current.cap : true) };
  }
}

// Any fixed number works; it only has to be the same for every server process.
const COLLECT_LOCK_KEY = 72_026_091_601;

export const NotificationService = {
  /**
   * Work out every alert now due and write one outbox row per account and channel.
   * One pass at a time across all processes; a pass already running is skipped.
   */
  async collect(prisma: PrismaClient, now = new Date(), switches: ChannelSwitches = defaultChannels()): Promise<number> {
    // Outside the transaction: finding the current round also closes expired ones.
    const round = await RoundService.getCurrent(prisma, now);
    return prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(${COLLECT_LOCK_KEY}::bigint) AS locked`;
      if (!lock?.locked) return 0;

      const rows = [
        ...await collectAttacks(tx, now, switches),
        ...await collectRoundEvents(tx, now, switches),
        ...(round?.status === 'ACTIVE' ? await collectPlayerAlerts(tx, round, now, switches) : []),
      ];
      if (!rows.length) return 0;
      const { count } = await tx.notificationOutbox.createMany({ data: rows, skipDuplicates: true });
      return count;
    }, { maxWait: 10_000, timeout: 60_000 });
  },

  /** Discord DMs waiting for the bot, each handed out once. */
  async claimDiscord(prisma: PrismaClient, now = new Date(), limit = 200): Promise<Omit<DiscordAlertsClaimDto, 'battles' | 'turf' | 'territory' | 'crackdowns' | 'rounds'>> {
    const rows = await prisma.$transaction(async (tx) => {
      const pending = await tx.notificationOutbox.findMany({
        where: { channel: 'DISCORD', claimedAt: null },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true, payload: true, account: { select: { discordId: true, isActive: true } } },
      });
      if (pending.length) {
        await tx.notificationOutbox.updateMany({ where: { id: { in: pending.map((row) => row.id) }, claimedAt: null }, data: { claimedAt: now } });
      }
      return pending;
    });

    const claim: Omit<DiscordAlertsClaimDto, 'battles' | 'turf' | 'territory' | 'crackdowns' | 'rounds'> = { turns: [], ranks: [], attacks: [], roundAlerts: [] };
    for (const row of rows) {
      // Unlinked since the alert was collected: nowhere to send it.
      const discordId = row.account.isActive ? row.account.discordId : null;
      if (!discordId) continue;
      const payload = row.payload as unknown as NotificationPayload;
      switch (payload.category) {
        case 'attacks':
          claim.attacks.push({ ...payload.battle, discordId });
          break;
        case 'turns':
          claim.turns.push({ discordId, ...payload.reminder });
          break;
        case 'rank':
          claim.ranks.push({ discordId, ...payload.alert });
          break;
        case 'round':
          claim.roundAlerts.push({ ...payload.event, discordId, rank: payload.rank });
          break;
      }
    }
    return claim;
  },

  /** Old rows are history nobody reads; unclaimed ones this old are too stale to send. */
  async prune(prisma: PrismaClient, now = new Date(), maxAgeMs = 3 * 24 * 60 * 60_000): Promise<number> {
    const { count } = await prisma.notificationOutbox.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - maxAgeMs) } } });
    return count;
  },

  currentStanding,

  /** Switch one category on or off. Used by Discord /alerts and the account settings page alike. */
  async setCategory(prisma: PrismaClient, accountId: string, category: NotificationCategory, enabled: boolean, standing?: Standing) {
    const data = categoryData(category, enabled, standing ?? await currentStanding(prisma, accountId));
    return prisma.notificationSettings.upsert({
      where: { accountId },
      create: { accountId, ...data },
      update: data,
    });
  },

  async settings(prisma: PrismaClient, accountId: string): Promise<NotificationSettingsDto> {
    const [account, row, devices] = await Promise.all([
      prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: { discordId: true } }),
      prisma.notificationSettings.findUnique({ where: { accountId } }),
      prisma.pushSubscription.findMany({ where: { accountId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      categories: {
        attacks: row?.attacksEnabled ?? false,
        turns: row?.turnsEnabled ?? false,
        round: row?.roundEnabled ?? false,
        rank: row?.rankEnabled ?? false,
      },
      channels: { discord: row?.discordEnabled ?? true, push: row?.pushEnabled ?? false },
      discordLinked: Boolean(account.discordId),
      push: {
        available: env.push.configured,
        vapidPublicKey: env.push.configured ? env.push.publicKey : null,
        devices: devices.map((device): PushDeviceDto => ({
          id: device.id,
          endpointHash: createHash('sha256').update(device.endpoint).digest('hex').slice(0, 16),
          label: device.deviceLabel,
          userAgent: device.userAgent,
          createdAt: device.createdAt.toISOString(),
          lastSuccessAt: device.lastSuccessAt?.toISOString() ?? null,
        })),
      },
    };
  },

  async update(prisma: PrismaClient, accountId: string, input: UpdateNotificationSettingsInput): Promise<NotificationSettingsDto> {
    const changes = Object.entries(input.categories ?? {}) as Array<[NotificationCategory, boolean]>;
    if (changes.length) {
      const standing = await currentStanding(prisma, accountId);
      for (const [category, enabled] of changes) await NotificationService.setCategory(prisma, accountId, category, enabled, standing);
    }
    const channels = input.channels ?? {};
    if (channels.discord !== undefined || channels.push !== undefined) {
      const data = { discordEnabled: channels.discord, pushEnabled: channels.push };
      await prisma.notificationSettings.upsert({ where: { accountId }, create: { accountId, ...data }, update: data });
    }
    return NotificationService.settings(prisma, accountId);
  },
};

