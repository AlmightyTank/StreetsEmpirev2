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
import { newsPostEmbed, turnReminderEmbed } from './format.js';
import { createGameApi, type City } from './game-api.js';
import { Cooldowns } from './lookup.js';
import { managedRoles, parseForumGroupList } from './roles.js';
import { startPoller } from './schedule.js';
import { RoleSync } from './sync.js';

const config = loadConfig();
const api = createGameApi({ baseUrl: config.GAME_API_URL, token: config.DISCORD_BOT_API_TOKEN });
const managed = managedRoles(parseForumGroupList(config.DISCORD_FORUM_GROUPS));

// GuildMembers is a privileged intent: enable "Server Members Intent" in the developer portal.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  allowedMentions: { parse: [] },
});

let sync: RoleSync | null = null;

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

/** The configured news channel, or null (with the reason logged) if the bot can't post there. */
async function findNewsChannel(guild: Guild): Promise<GuildTextBasedChannel | null> {
  if (!config.DISCORD_NEWS_CHANNEL_ID) return null;
  const channel = await guild.channels.fetch(config.DISCORD_NEWS_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) {
    console.warn(`News auto-post is off: DISCORD_NEWS_CHANNEL_ID ${config.DISCORD_NEWS_CHANNEL_ID} is not a text channel in ${guild.name}.`);
    return null;
  }
  const me = await guild.members.fetchMe();
  const missing = channel.permissionsFor(me).missing([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]);
  if (missing.length) {
    console.warn(`News auto-post is off: the bot needs ${missing.join(', ')} in #${channel.name}.`);
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

async function sendTurnReminders(): Promise<void> {
  for (const reminder of await api.claimTurnReminders()) {
    try {
      await client.users.send(reminder.discordId, { embeds: [turnReminderEmbed(reminder)] });
    } catch (error) {
      // Usually the member has DMs from server members turned off.
      console.warn(`Could not DM a turn reminder to ${reminder.discordId}:`, error instanceof Error ? error.message : error);
    }
  }
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
    console.log(`Street Empire bot ready as ${ready.user.tag} in ${guild.name} with ${commandData.length} commands; syncing roles every ${config.DISCORD_SYNC_MINUTES} min.`);

    // Commands are answered while these run.
    startPoller('Role sync', config.DISCORD_SYNC_MINUTES * 60_000, async () => {
      const summary = await roleSync.syncAll();
      if (summary) console.log(`Role sync: ${summary.members} members, ${summary.added} roles added, ${summary.removed} removed, ${summary.failed} failed.`);
    });

    const newsChannel = await findNewsChannel(guild);
    if (newsChannel) {
      console.log(`Posting new game news to #${newsChannel.name} (checking every ${config.DISCORD_NEWS_MINUTES} min).`);
      startPoller('News auto-post', config.DISCORD_NEWS_MINUTES * 60_000, () => postNews(newsChannel));
    }

    startPoller('Turn reminders', config.DISCORD_REMINDER_MINUTES * 60_000, sendTurnReminders);
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
      interaction.reply({ content: 'This bot only works in the Street Empire server.', flags: MessageFlags.Ephemeral })
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
    void client.destroy().finally(() => process.exit(0));
  });
}

await client.login(config.DISCORD_BOT_TOKEN);
