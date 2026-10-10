import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  RESTEvents,
  type Guild,
  type GuildTextBasedChannel,
  type TextChannel,
} from 'discord.js';
import { commandData, handleAutocomplete, handleCommand, type CommandDeps } from './commands.js';
import { loadConfig } from './config.js';
import {
  allianceAlertEmbed,
  attackAlertEmbed,
  battleFeedEmbed,
  crackdownFeedEmbed,
  factionFeedEmbed,
  describeDiscordError,
  gameNoticeEmbed,
  newsPostEmbed,
  rankAlertEmbed,
  roundEventEmbed,
  territoryFeedEmbed,
  turfAlertEmbed,
  turfFeedEmbed,
  blockWarFeedEmbed,
  turnReminderEmbed,
} from './format.js';
import { createGameApi, type City } from './game-api.js';
import { Cooldowns } from './lookup.js';
import { betaTesterRoles, managedRoles, parseForumGroupList } from './roles.js';
import { startPoller } from './schedule.js';
import { RoleSync } from './sync.js';
import { startOptionalPushServer } from './push-server.js';
import { handleStaffButton, handleStaffModal, staffPostMessage } from './staff.js';
import { handleTicketButton, handleTicketForm, type SupportDeps } from './support.js';

const config = loadConfig();
const api = createGameApi({ baseUrl: config.GAME_API_URL, token: config.DISCORD_BOT_API_TOKEN });
const forumGroups = parseForumGroupList(config.DISCORD_FORUM_GROUPS);
const betaTesterOnly = config.DISCORD_ROLE_SYNC_MODE === 'beta-tester-only';
const managed = betaTesterOnly ? betaTesterRoles() : managedRoles(forumGroups);

// GuildMembers is a privileged intent: enable "Server Members Intent" in the developer portal.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  allowedMentions: { parse: [] },
});

let sync: RoleSync | null = null;
let stopPushServer: (() => Promise<void>) | null = null;

let cityCache: { cities: City[]; fetchedAt: number } | null = null;
async function getCities(): Promise<City[]> {
  if (cityCache && Date.now() - cityCache.fetchedAt < 10 * 60_000) return cityCache.cities;
  try {
    cityCache = { cities: await api.cities(), fetchedAt: Date.now() };
  } catch (error) {
    console.warn('Could not load cities from the game API:', error);
  }
  return cityCache?.cities ?? [];
}

const deps: CommandDeps = {
  api,
  origin: config.frontendOrigin,
  getSync: () => sync,
  getCities,
  managed,
  syncCooldowns: new Cooldowns(60_000),
};

// Requests queued behind Discord rate limits are one way commands miss the 3-second window.
client.rest.on(RESTEvents.RateLimited, (info) => {
  console.warn(`Discord rate limit${info.global ? ' (global)' : ''} on ${info.method} ${info.route}: waiting ${info.timeToReset}ms.`);
});

/** A configured text channel the bot can post in, or why it can't. */
async function checkPostChannel(
  guild: Guild,
  channelId: string,
  envName: string,
  extra: bigint[] = [],
): Promise<{ channel: GuildTextBasedChannel | null; problem: string | null }> {
  if (!channelId) return { channel: null, problem: `${envName} is not set in the bot's .env.` };
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    return { channel: null, problem: `channel ${channelId} (${envName}) is not a text channel the bot can see in ${guild.name}.` };
  }
  const me = await guild.members.fetchMe();
  const missing = channel.permissionsFor(me).missing([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    ...extra,
  ]);
  if (missing.length) return { channel: null, problem: `the bot needs ${missing.join(', ')} in #${channel.name}.` };
  return { channel, problem: null };
}

let readyGuild: Guild | null = null;

/** The staff channel, when it is set and the bot can post and edit there. */
async function usableStaffChannel(): Promise<GuildTextBasedChannel | null> {
  if (!readyGuild || !config.DISCORD_STAFF_CHANNEL_ID) return null;
  return (await checkPostChannel(readyGuild, config.DISCORD_STAFF_CHANNEL_ID, 'DISCORD_STAFF_CHANNEL_ID', [PermissionFlagsBits.ReadMessageHistory])).channel;
}

let supportProblem: string | null | undefined;
/**
 * The channel /support tickets are private threads in. Checked on every ticket, so
 * fixing it needs no restart. Members need View Channel there to see their thread.
 */
async function usableSupportChannel(): Promise<TextChannel | null> {
  if (!readyGuild || !config.DISCORD_SUPPORT_CHANNEL_ID) return null;
  const channel = await readyGuild.channels.fetch(config.DISCORD_SUPPORT_CHANNEL_ID).catch(() => null);
  let problem: string | null = null;
  if (!channel || channel.type !== ChannelType.GuildText) {
    problem = `channel ${config.DISCORD_SUPPORT_CHANNEL_ID} (DISCORD_SUPPORT_CHANNEL_ID) is not a text channel the bot can see in ${readyGuild.name}. Tickets are private threads, which need a plain text channel.`;
  } else {
    const missing = channel.permissionsFor(await readyGuild.members.fetchMe()).missing([
      PermissionFlagsBits.ViewChannel,
      // Discord also wants Send Messages to start a thread, even with Create Private Threads.
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.CreatePrivateThreads,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ManageThreads,
    ]);
    if (missing.length) problem = `the bot needs ${missing.join(', ')} in #${channel.name}.`;
  }
  if (problem !== supportProblem) {
    if (problem) console.warn(`Support tickets are off until fixed: ${problem}`);
    else console.log(`Opening /support tickets as private threads in #${(channel as TextChannel).name}.`);
    supportProblem = problem;
  }
  return problem ? null : channel as TextChannel;
}

const supportDeps: SupportDeps = { api, origin: config.frontendOrigin, supportChannel: usableSupportChannel, staffChannel: usableStaffChannel };

async function postNews(channel: GuildTextBasedChannel): Promise<void> {
  // Claimed posts count as posted, which is why the channel is checked before any claim.
  for (const post of await api.claimNews()) {
    try {
      const message = await channel.send({ embeds: [newsPostEmbed(post)], allowedMentions: { parse: [] } });
      if (channel.type === ChannelType.GuildAnnouncement) {
        await message.crosspost().catch((error: unknown) => console.warn('Could not publish news to following servers:', error));
      }
      console.log(`Posted news "${post.title}" to #${channel.name}.`);
    } catch (error) {
      console.error(`Could not post news "${post.title}":`, error);
      // The admin panel shows why, and an admin can resend it once that is fixed.
      await api.newsFailed(post.id, describeDiscordError(error, channel.name))
        .catch((reportError: unknown) => console.error(`Could not report the failed news post "${post.title}" to the game API:`, reportError));
    }
  }
}

/** Staff channel posts. A post about a report already in the channel edits that message. */
async function postStaff(channel: GuildTextBasedChannel): Promise<void> {
  for (const post of await api.claimStaffPosts()) {
    const message = staffPostMessage(post);
    if (!message) continue;
    try {
      const existing = post.editMessageId ? await channel.messages.fetch(post.editMessageId).catch(() => null) : null;
      const sent = existing ? await existing.edit(message) : await channel.send({ ...message, allowedMentions: { parse: [] } });
      await api.staffPostPosted(post.id, sent.id);
    } catch (error) {
      console.error(`Could not post staff ${post.kind} ${post.id} to #${channel.name}:`, error);
      await api.staffPostFailed(post.id, describeDiscordError(error, channel.name))
        .catch((reportError: unknown) => console.error(`Could not report the failed staff post ${post.id} to the game API:`, reportError));
    }
  }
}

async function sendAlerts(channels: { news: GuildTextBasedChannel | null; raidFeed: GuildTextBasedChannel | null }, feed: boolean): Promise<void> {
  const claimed = await api.claimAlerts({ feed });

  for (const reminder of claimed.turns) {
    try {
      await client.users.send(reminder.discordId, { embeds: [turnReminderEmbed(reminder)] });
    } catch (error) {
      console.warn(`Could not DM a turn reminder to ${reminder.discordId}:`, error instanceof Error ? error.message : error);
    }
  }

  for (const alert of claimed.ranks) {
    try {
      await client.users.send(alert.discordId, { embeds: [rankAlertEmbed(alert)] });
    } catch (error) {
      console.warn(`Could not DM a rank alert to ${alert.discordId}:`, error instanceof Error ? error.message : error);
    }
  }

  for (const alert of claimed.turfAlerts) {
    try {
      await client.users.send(alert.discordId, { embeds: [turfAlertEmbed(alert)] });
    } catch (error) {
      console.warn(`Could not DM a turf alert to ${alert.discordId}:`, error instanceof Error ? error.message : error);
    }
  }

  for (const alert of claimed.allianceAlerts) {
    try {
      await client.users.send(alert.discordId, { embeds: [allianceAlertEmbed(alert)] });
    } catch (error) {
      console.warn(`Could not DM an alliance alert to ${alert.discordId}:`, error instanceof Error ? error.message : error);
    }
  }

  for (const notice of claimed.notices) {
    try {
      await client.users.send(notice.discordId, { embeds: [gameNoticeEmbed(notice)] });
    } catch (error) {
      console.warn(`Could not DM a ${notice.category} alert to ${notice.discordId}:`, error instanceof Error ? error.message : error);
    }
  }

  for (const battle of claimed.battles) {
    if (channels.raidFeed) {
      try {
        await channels.raidFeed.send({ embeds: [battleFeedEmbed(battle)], allowedMentions: { parse: [] } });
      } catch (error) {
        console.error(`Could not post battle ${battle.id} to #${channels.raidFeed.name}:`, error);
      }
    }
  }

  for (const event of claimed.turf) {
    if (channels.raidFeed) {
      try {
        await channels.raidFeed.send({ embeds: [turfFeedEmbed(event)], allowedMentions: { parse: [] } });
      } catch (error) {
        console.error(`Could not post turf change ${event.id} to #${channels.raidFeed.name}:`, error);
      }
    }
  }

  for (const event of claimed.blockWars) {
    if (channels.raidFeed) {
      try {
        await channels.raidFeed.send({ embeds: [blockWarFeedEmbed(event)], allowedMentions: { parse: [] } });
      } catch (error) {
        console.error(`Could not post block war ${event.id} to #${channels.raidFeed.name}:`, error);
      }
    }
  }

  for (const event of claimed.territory) {
    if (channels.raidFeed) {
      try {
        await channels.raidFeed.send({ embeds: [territoryFeedEmbed(event)], allowedMentions: { parse: [] } });
      } catch (error) {
        console.error(`Could not post city-control change ${event.id} to #${channels.raidFeed.name}:`, error);
      }
    }
  }

  for (const event of claimed.factions) {
    if (channels.raidFeed) {
      try {
        await channels.raidFeed.send({ embeds: [factionFeedEmbed(event)], allowedMentions: { parse: [] } });
      } catch (error) {
        console.error(`Could not post Inner Circle ${event.id} to #${channels.raidFeed.name}:`, error);
      }
    }
  }

  for (const event of claimed.crackdowns) {
    if (channels.raidFeed) {
      try {
        await channels.raidFeed.send({ embeds: [crackdownFeedEmbed(event)], allowedMentions: { parse: [] } });
      } catch (error) {
        console.error(`Could not post turf crackdown ${event.id} (${event.phase}) to #${channels.raidFeed.name}:`, error);
      }
    }
  }

  for (const alert of claimed.attacks) {
    try {
      await client.users.send(alert.discordId, { embeds: [attackAlertEmbed(alert)] });
    } catch (error) {
      console.warn(`Could not DM an attack alert to ${alert.discordId}:`, error instanceof Error ? error.message : error);
    }
  }

  for (const event of claimed.rounds) {
    if (event.type === 'ended' && channels.news) {
      try {
        const message = await channels.news.send({ embeds: [roundEventEmbed(event)], allowedMentions: { parse: [] } });
        if (channels.news.type === ChannelType.GuildAnnouncement) {
          await message.crosspost().catch((error: unknown) => console.warn('Could not publish round-end post to following servers:', error));
        }
      } catch (error) {
        console.error(`Could not post round event "${event.roundName}" to #${channels.news.name}:`, error);
      }
    }
  }

  for (const alert of claimed.roundAlerts) {
    try {
      await client.users.send(alert.discordId, { embeds: [roundEventEmbed(alert)] });
    } catch (error) {
      console.warn(`Could not DM a round alert to ${alert.discordId}:`, error instanceof Error ? error.message : error);
    }
  }
}

function serialTask(name: string, task: () => Promise<void>): () => Promise<void> {
  let running = false;
  let queued = false;
  return async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      do {
        queued = false;
        await task();
      } while (queued);
    } catch (error) {
      console.error(`${name} failed:`, error);
    } finally {
      running = false;
    }
  };
}

client.once(Events.ClientReady, async (ready) => {
  try {
    const application = await ready.application.fetch();
    if (application.interactionsEndpointURL) {
      console.warn(
        `This Discord application has an Interactions Endpoint URL (${application.interactionsEndpointURL}). `
        + 'Discord sends slash commands to that URL instead of to this bot, so they time out. '
        + 'Clear it under General Information in the developer portal.',
      );
    }

    const guild = await ready.guilds.fetch(config.DISCORD_GUILD_ID);
    readyGuild = guild;
    // Guild commands update immediately, unlike global ones.
    await guild.commands.set(commandData);
    void getCities();

    const roleSync = new RoleSync(guild, managed, api, { allianceRoles: !betaTesterOnly });
    sync = roleSync;
    console.log(`StreetsEmpire bot ready as ${ready.user.tag} in ${guild.name} with ${commandData.length} commands; syncing ${betaTesterOnly ? 'beta tester role only' : 'roles'} every ${config.DISCORD_SYNC_MINUTES} min.`);

    // Commands are answered while these run.
    startPoller('Role sync', config.DISCORD_SYNC_MINUTES * 60_000, async () => {
      const summary = await roleSync.syncAll();
      if (summary) console.log(`Role sync: ${summary.members} members, ${summary.added} roles added, ${summary.removed} removed, ${summary.failed} failed.`);
    });

    // Checked on every run, so fixing the channel or its permissions needs no restart.
    // Each run also tells the game API, whose admin news panel shows why news is stuck.
    // Resolved before the alert poller starts, which posts round endings to it.
    let newsChannel = (await checkPostChannel(guild, config.DISCORD_NEWS_CHANNEL_ID, 'DISCORD_NEWS_CHANNEL_ID')).channel;
    let newsProblem: string | null | undefined;
    const runNews = serialTask('News auto-post', async () => {
      const check = await checkPostChannel(guild, config.DISCORD_NEWS_CHANNEL_ID, 'DISCORD_NEWS_CHANNEL_ID');
      if (check.problem !== newsProblem) {
        if (check.problem) console.warn(`News auto-post is off: ${check.problem}`);
        else console.log(`Posting new game news to #${check.channel!.name} (checking every ${config.DISCORD_NEWS_MINUTES} min).`);
        newsProblem = check.problem;
      }
      newsChannel = check.channel;
      await api.reportNewsChannel({ channel: check.channel?.name ?? null, problem: check.problem })
        .catch((error: unknown) => console.warn('Could not report the news channel status to the game API:', error instanceof Error ? error.message : error));
      if (newsChannel) await postNews(newsChannel);
    });
    startPoller('News auto-post', config.DISCORD_NEWS_MINUTES * 60_000, runNews);

    // Also checked on every run. While a configured feed channel is unusable its events stay
    // on the server, since a claimed event counts as posted; with no channel set they are dropped.
    let raidFeedProblem: string | null | undefined;
    const runAlerts = serialTask('Discord alerts', async () => {
      const configured = Boolean(config.DISCORD_RAID_FEED_CHANNEL_ID);
      const check = configured
        ? await checkPostChannel(guild, config.DISCORD_RAID_FEED_CHANNEL_ID, 'DISCORD_RAID_FEED_CHANNEL_ID')
        : { channel: null, problem: null };
      if (check.problem !== raidFeedProblem) {
        if (check.problem) console.warn(`Raid feed is paused until fixed: ${check.problem}`);
        else if (check.channel) console.log(`Posting raid feed events to #${check.channel.name}.`);
        raidFeedProblem = check.problem;
      }
      await sendAlerts({ news: newsChannel, raidFeed: check.channel }, !check.problem);
    });
    const runAdminResync = serialTask('Admin role resync', async () => {
      const claim = await api.claimResync();
      if (claim.all) {
        const summary = await roleSync.syncAll();
        if (summary) console.log(`Admin resync: ${summary.members} members, ${summary.added} roles added, ${summary.removed} removed, ${summary.failed} failed.`);
      } else if (claim.discordIds.length) {
        const members = await guild.members.fetch({ user: claim.discordIds }).catch(() => null);
        if (members?.size) await roleSync.syncMembers([...members.values()]);
        console.log(`Admin resync: ${members?.size ?? 0} of ${claim.discordIds.length} requested members synced.`);
      }
    });
    // Edits need Read Message History. While the channel is unusable, posts wait on the
    // server; with no channel set they are claimed and dropped, like the raid feed.
    let staffProblem: string | null | undefined;
    const runStaff = serialTask('Staff channel', async () => {
      if (!config.DISCORD_STAFF_CHANNEL_ID) {
        await api.claimStaffPosts();
        return;
      }
      const check = await checkPostChannel(guild, config.DISCORD_STAFF_CHANNEL_ID, 'DISCORD_STAFF_CHANNEL_ID', [PermissionFlagsBits.ReadMessageHistory]);
      if (check.problem !== staffProblem) {
        if (check.problem) console.warn(`Staff channel posts are paused until fixed: ${check.problem}`);
        else console.log(`Posting bug reports and held patch notes to #${check.channel!.name}.`);
        staffProblem = check.problem;
      }
      if (check.channel) await postStaff(check.channel);
    });
    const runWake = serialTask('Discord push wake', async () => {
      await runNews();
      await runAlerts();
      await runAdminResync();
      await runStaff();
    });

    console.log(`Checking Discord alerts every ${config.DISCORD_ALERTS_MINUTES} min.`);
    startPoller('Discord alerts', config.DISCORD_ALERTS_MINUTES * 60_000, runAlerts);

    // Resyncs an admin asked for in the game panel. A full sync that is already
    // running covers an "everyone" request, so a skipped run is not lost work.
    startPoller('Admin role resync', config.DISCORD_ALERTS_MINUTES * 60_000, runAdminResync);
    startPoller('Staff channel', config.DISCORD_ALERTS_MINUTES * 60_000, runStaff);

    if (config.DISCORD_BOT_LISTEN_PORT > 0) {
      stopPushServer = await startOptionalPushServer({
        host: config.DISCORD_BOT_LISTEN_HOST,
        port: config.DISCORD_BOT_LISTEN_PORT,
        token: config.DISCORD_BOT_API_TOKEN,
        onWake: runWake,
      });
    }
  } catch (error) {
    // Exit so systemd restarts us, instead of staying online but deaf.
    console.error('Startup failed:', error);
    process.exit(1);
  }
});

client.on(Events.GuildMemberAdd, (member) => {
  if (member.guild.id !== config.DISCORD_GUILD_ID || !sync) return;
  sync.syncMembers([member]).catch((error: unknown) => console.error(`Role sync failed for new member ${member.id}:`, error));
});

client.on(Events.InteractionCreate, (interaction) => {
  if (interaction.guildId !== config.DISCORD_GUILD_ID) {
    if (interaction.isChatInputCommand()) {
      console.warn(`Ignoring /${interaction.commandName} from ${interaction.guildId ? `server ${interaction.guildId}` : 'a DM'}; DISCORD_GUILD_ID is ${config.DISCORD_GUILD_ID}.`);
      interaction.reply({ content: 'This bot only works in the StreetsEmpire server.', flags: MessageFlags.Ephemeral })
        .catch(() => undefined);
    }
    return;
  }
  if (interaction.isAutocomplete()) {
    void handleAutocomplete(interaction, deps);
  } else if (interaction.isChatInputCommand()) {
    handleCommand(interaction, deps).catch((error: unknown) => console.error(`/${interaction.commandName} crashed:`, error));
  } else if (interaction.isButton()) {
    // Each handler ignores buttons that are not its own.
    Promise.all([handleStaffButton(interaction), handleTicketButton(interaction, supportDeps)])
      .catch((error: unknown) => console.error(`Button ${interaction.customId} crashed:`, error));
  } else if (interaction.isModalSubmit()) {
    Promise.all([handleStaffModal(interaction, deps), handleTicketForm(interaction, supportDeps)])
      .catch((error: unknown) => console.error(`Form ${interaction.customId} crashed:`, error));
  }
});

// Log instead of crashing: an offline bot makes every command time out.
process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void Promise.resolve()
      .then(() => stopPushServer?.())
      .finally(() => client.destroy())
      .finally(() => process.exit(0));
  });
}

await client.login(config.DISCORD_BOT_TOKEN);
