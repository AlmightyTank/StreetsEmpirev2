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
} from 'discord.js';
import { commandData, handleAutocomplete, handleCommand, type CommandDeps } from './commands.js';
import { loadConfig } from './config.js';
import {
  allianceAlertEmbed,
  attackAlertEmbed,
  battleFeedEmbed,
  crackdownFeedEmbed,
  newsPostEmbed,
  rankAlertEmbed,
  roundEventEmbed,
  territoryFeedEmbed,
  turfAlertEmbed,
  turfFeedEmbed,
  turnReminderEmbed,
} from './format.js';
import { createGameApi, type City } from './game-api.js';
import { Cooldowns } from './lookup.js';
import { managedRoles, parseForumGroupList } from './roles.js';
import { startPoller } from './schedule.js';
import { RoleSync } from './sync.js';
import { startOptionalPushServer } from './push-server.js';

const config = loadConfig();
const api = createGameApi({ baseUrl: config.GAME_API_URL, token: config.DISCORD_BOT_API_TOKEN });
const managed = managedRoles(parseForumGroupList(config.DISCORD_FORUM_GROUPS));

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

/** A configured text channel, or null (with the reason logged) if the bot can't post there. */
async function findPostChannel(guild: Guild, channelId: string, label: string): Promise<GuildTextBasedChannel | null> {
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    console.warn(`${label} is off: channel ${channelId} is not a text channel in ${guild.name}.`);
    return null;
  }
  const me = await guild.members.fetchMe();
  const missing = channel.permissionsFor(me).missing([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]);
  if (missing.length) {
    console.warn(`${label} is off: the bot needs ${missing.join(', ')} in #${channel.name}.`);
    return null;
  }
  return channel;
}

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
    }
  }
}

async function sendAlerts(channels: { news: GuildTextBasedChannel | null; raidFeed: GuildTextBasedChannel | null }): Promise<void> {
  const claimed = await api.claimAlerts();

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

  for (const event of claimed.territory) {
    if (channels.raidFeed) {
      try {
        await channels.raidFeed.send({ embeds: [territoryFeedEmbed(event)], allowedMentions: { parse: [] } });
      } catch (error) {
        console.error(`Could not post city-control change ${event.id} to #${channels.raidFeed.name}:`, error);
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
    // Guild commands update immediately, unlike global ones.
    await guild.commands.set(commandData);
    void getCities();

    const roleSync = new RoleSync(guild, managed, api);
    sync = roleSync;
    console.log(`StreetsEmpire bot ready as ${ready.user.tag} in ${guild.name} with ${commandData.length} commands; syncing roles every ${config.DISCORD_SYNC_MINUTES} min.`);

    // Commands are answered while these run.
    startPoller('Role sync', config.DISCORD_SYNC_MINUTES * 60_000, async () => {
      const summary = await roleSync.syncAll();
      if (summary) console.log(`Role sync: ${summary.members} members, ${summary.added} roles added, ${summary.removed} removed, ${summary.failed} failed.`);
    });

    const newsChannel = await findPostChannel(guild, config.DISCORD_NEWS_CHANNEL_ID, 'News auto-post');
    const runNews = serialTask('News auto-post', async () => {
      if (newsChannel) await postNews(newsChannel);
    });
    if (newsChannel) {
      console.log(`Posting new game news to #${newsChannel.name} (checking every ${config.DISCORD_NEWS_MINUTES} min).`);
      startPoller('News auto-post', config.DISCORD_NEWS_MINUTES * 60_000, runNews);
    }

    const raidFeedChannel = await findPostChannel(guild, config.DISCORD_RAID_FEED_CHANNEL_ID, 'Raid feed');
    if (raidFeedChannel) console.log(`Posting raid feed events to #${raidFeedChannel.name}.`);

    const runAlerts = serialTask('Discord alerts', () => sendAlerts({ news: newsChannel, raidFeed: raidFeedChannel }));
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
    const runWake = serialTask('Discord push wake', async () => {
      await runNews();
      await runAlerts();
      await runAdminResync();
    });

    console.log(`Checking Discord alerts every ${config.DISCORD_ALERTS_MINUTES} min.`);
    startPoller('Discord alerts', config.DISCORD_ALERTS_MINUTES * 60_000, runAlerts);

    // Resyncs an admin asked for in the game panel. A full sync that is already
    // running covers an "everyone" request, so a skipped run is not lost work.
    startPoller('Admin role resync', config.DISCORD_ALERTS_MINUTES * 60_000, runAdminResync);

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
