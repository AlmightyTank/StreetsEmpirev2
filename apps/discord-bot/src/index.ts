import { Client, Events, GatewayIntentBits } from 'discord.js';
import { commandData, handleCommand } from './commands.js';
import { loadConfig } from './config.js';
import { createGameApi } from './game-api.js';
import { managedRoles, parseForumGroupList } from './roles.js';
import { RoleSync } from './sync.js';

const config = loadConfig();
const api = createGameApi({ baseUrl: config.GAME_API_URL, token: config.DISCORD_BOT_API_TOKEN });

// GuildMembers is a privileged intent: enable "Server Members Intent" in the developer portal.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  allowedMentions: { parse: [] },
});

let sync: RoleSync | null = null;

client.once(Events.ClientReady, async (ready) => {
  const guild = await ready.guilds.fetch(config.DISCORD_GUILD_ID);
  // Guild commands update immediately, unlike global ones.
  await guild.commands.set(commandData);

  sync = new RoleSync(guild, managedRoles(parseForumGroupList(config.DISCORD_FORUM_GROUPS)), api);
  const run = () => sync!.syncAll().catch((error: unknown) => console.error('Role sync failed:', error));
  await run();
  setInterval(run, config.DISCORD_SYNC_MINUTES * 60_000);

  console.log(`Street Empire bot ready as ${ready.user.tag} in ${guild.name}; syncing roles every ${config.DISCORD_SYNC_MINUTES} min.`);
});

client.on(Events.GuildMemberAdd, (member) => {
  if (member.guild.id !== config.DISCORD_GUILD_ID || !sync) return;
  sync.syncMembers([member]).catch((error: unknown) => console.error(`Role sync failed for new member ${member.id}:`, error));
});

client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.guildId !== config.DISCORD_GUILD_ID) return;
  handleCommand(interaction, { api, origin: config.frontendOrigin })
    .catch((error: unknown) => console.error(`/${interaction.commandName} could not reply:`, error));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void client.destroy().finally(() => process.exit(0));
  });
}

await client.login(config.DISCORD_BOT_TOKEN);
