import { Client, Events, GatewayIntentBits, MessageFlags, RESTEvents } from 'discord.js';
import { commandData, handleAutocomplete, handleCommand, type CommandDeps } from './commands.js';
import { loadConfig } from './config.js';
import { createGameApi, type City } from './game-api.js';
import { Cooldowns } from './lookup.js';
import { managedRoles, parseForumGroupList } from './roles.js';
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

async function logSync(label: string): Promise<void> {
  try {
    const summary = await sync?.syncAll();
    if (summary) console.log(`${label}: ${summary.members} members, ${summary.added} roles added, ${summary.removed} removed, ${summary.failed} failed.`);
  } catch (error) {
    console.error(`${label} failed:`, error);
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

    sync = new RoleSync(guild, managed, api);
    console.log(`Street Empire bot ready as ${ready.user.tag} in ${guild.name} with ${commandData.length} commands; syncing roles every ${config.DISCORD_SYNC_MINUTES} min.`);

    // Commands are answered while the first sync runs.
    void logSync('Role sync');
    setInterval(() => void logSync('Role sync'), config.DISCORD_SYNC_MINUTES * 60_000);
  } catch (error) {
    // Exit so the process manager restarts us, instead of staying online but deaf.
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
