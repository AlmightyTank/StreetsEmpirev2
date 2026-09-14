import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type APIEmbed,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  compareEmbed,
  hallOfFameEmbed,
  helpEmbed,
  memberEmbed,
  newsEmbed,
  profileEmbed,
  rankingsEmbed,
  roundEmbed,
  syncAllText,
  syncMemberText,
} from './format.js';
import { GameApiError, type City, type GameApi } from './game-api.js';
import { cityChoices, parsePlayerRef, resolveCity, type Cooldowns } from './lookup.js';
import { roleNamesForKeys, type ManagedRole } from './roles.js';
import type { RoleSync } from './sync.js';

export const commandData = [
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Show a player's public Street Empire profile")
    .addUserOption((option) => option.setName('user').setDescription('A Discord member with a linked game account'))
    .addStringOption((option) => option.setName('name').setDescription('In-game player name').setMaxLength(40)),
  new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compare two players side by side')
    .addStringOption((option) => option.setName('player').setDescription('Player name or @member').setRequired(true).setMaxLength(40))
    .addStringOption((option) => option.setName('with').setDescription('Player name or @member (default: you)').setMaxLength(40)),
  new SlashCommandBuilder().setName('rankings').setDescription('Top 10 players in the current round'),
  new SlashCommandBuilder()
    .setName('city')
    .setDescription('Top 10 in one city this round')
    .addStringOption((option) => option.setName('name').setDescription('City').setRequired(true).setAutocomplete(true).setMaxLength(60)),
  new SlashCommandBuilder().setName('halloffame').setDescription('Podiums from recent finished rounds'),
  new SlashCommandBuilder().setName('round').setDescription('Current round status and time left'),
  new SlashCommandBuilder().setName('news').setDescription('Latest Street Empire news'),
  new SlashCommandBuilder().setName('link').setDescription('Your link status and the roles you qualify for (only you see it)'),
  new SlashCommandBuilder().setName('sync').setDescription('Update your Street Empire roles now'),
  new SlashCommandBuilder().setName('help').setDescription('List the Street Empire bot commands'),
  new SlashCommandBuilder()
    .setName('syncall')
    .setDescription('Re-sync Street Empire roles for every member (mods)')
    // Hidden from members without Manage Roles; also checked at run time, since server admins can override it.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
].map((command) => command.toJSON());

/** Replies only the caller sees. */
export const PRIVATE_COMMANDS: ReadonlySet<string> = new Set(['link', 'sync', 'help', 'syncall']);

export interface CommandDeps {
  api: GameApi;
  origin: string;
  getSync: () => RoleSync | null;
  getCities: () => Promise<City[]>;
  managed: ManagedRole[];
  syncCooldowns: Cooldowns;
}

type Reply = { content: string } | { embeds: APIEmbed[] };

const STARTING = { content: 'The bot is still starting up. Try again in a minute.' };

/** A friendly reply for errors the player can act on; anything else is an outage. */
export function errorReply(error: unknown, origin: string, self: boolean): string {
  if (error instanceof GameApiError && error.status === 404) {
    if (error.code === 'DISCORD_NOT_LINKED') {
      return self
        ? `Your Discord isn't linked to a Street Empire account yet. Link it from ${origin}/account, then try again.`
        : error.message;
    }
    return error.message;
  }
  return 'Street Empire is not answering right now. Try again in a minute.';
}

/** Marks a lookup of the caller's own account, so "not linked" can say how to link. */
class SelfLookupError extends Error {
  constructor(readonly inner: unknown) {
    super('Self lookup failed');
  }
}

async function run(interaction: ChatInputCommandInteraction, deps: CommandDeps): Promise<Reply> {
  const { api, origin } = deps;
  switch (interaction.commandName) {
    case 'profile': {
      const user = interaction.options.getUser('user');
      const name = interaction.options.getString('name');
      if (user) return { embeds: [profileEmbed(await api.profile({ discordId: user.id }))] };
      if (name) return { embeds: [profileEmbed(await api.profile({ name }))] };
      try {
        return { embeds: [profileEmbed(await api.profile({ discordId: interaction.user.id }))] };
      } catch (error) {
        throw new SelfLookupError(error);
      }
    }

    case 'compare': {
      const first = parsePlayerRef(interaction.options.getString('player', true));
      const withValue = interaction.options.getString('with');
      const second = withValue ? parsePlayerRef(withValue) : { discordId: interaction.user.id };
      if (!first || !second) return { content: 'Give a player name (up to 40 characters) or an @mention.' };
      const [a, b] = await Promise.allSettled([api.profile(first), api.profile(second)]);
      if (a.status === 'rejected') throw a.reason;
      if (b.status === 'rejected') throw withValue ? b.reason : new SelfLookupError(b.reason);
      return { embeds: [compareEmbed(a.value, b.value)] };
    }

    case 'rankings':
      return { embeds: [rankingsEmbed(await api.rankings(), origin)] };

    case 'city': {
      const city = resolveCity(interaction.options.getString('name', true), await deps.getCities());
      if (!city) return { content: 'No city by that name. Pick one from the list as you type.' };
      return { embeds: [rankingsEmbed(await api.cityRankings(city.slug), origin)] };
    }

    case 'halloffame':
      return { embeds: [hallOfFameEmbed(await api.hallOfFame(), origin)] };

    case 'round':
      return { embeds: [roundEmbed(await api.round(), origin)] };

    case 'news':
      return { embeds: [newsEmbed(await api.news(), origin)] };

    case 'link': {
      const member = await api.member(interaction.user.id);
      return { embeds: [memberEmbed(member, roleNamesForKeys(member.roles, deps.managed), origin)] };
    }

    case 'sync': {
      const wait = deps.syncCooldowns.take(interaction.user.id);
      if (wait) return { content: `You just synced. Try again in ${wait}s.` };
      const sync = deps.getSync();
      if (!sync || !interaction.guild) return STARTING;
      const result = await sync.syncMember(await interaction.guild.members.fetch(interaction.user.id));
      if (result.failed) return { content: "Couldn't update your roles. A mod may need to move the bot's role higher." };
      return { content: syncMemberText(result) };
    }

    case 'help':
      return { embeds: [helpEmbed(origin)] };

    case 'syncall': {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        return { content: 'You need the Manage Roles permission to run a full sync.' };
      }
      const sync = deps.getSync();
      if (!sync) return STARTING;
      const summary = await sync.syncAll();
      return { content: summary ? syncAllText(summary) : 'A full sync is already running. Try again when it finishes.' };
    }

    default:
      return { content: 'Unknown command.' };
  }
}

export async function handleCommand(interaction: ChatInputCommandInteraction, deps: CommandDeps): Promise<void> {
  const received = Date.now();
  // Discord gives 3 seconds to acknowledge; game API calls can take longer, so defer first.
  try {
    await interaction.deferReply(PRIVATE_COMMANDS.has(interaction.commandName) ? { flags: MessageFlags.Ephemeral } : {});
  } catch (error) {
    console.error(
      `Could not acknowledge /${interaction.commandName}: it reached the bot ${received - interaction.createdTimestamp}ms after it was sent, `
      + `and acknowledging took ${Date.now() - received}ms. Discord shows "did not respond in time" after 3000ms.`,
      error,
    );
    return;
  }
  const acknowledged = Date.now();

  let reply: Reply;
  try {
    reply = await run(interaction, deps);
  } catch (caught) {
    const self = caught instanceof SelfLookupError;
    const error = self ? caught.inner : caught;
    if (!(error instanceof GameApiError && error.status === 404)) console.error(`/${interaction.commandName} failed:`, error);
    reply = { content: errorReply(error, deps.origin, self) };
  }

  try {
    await interaction.editReply({ ...reply, allowedMentions: { parse: [] } });
  } catch (error) {
    console.error(`/${interaction.commandName} could not send its reply:`, error);
  }
  console.log(
    `/${interaction.commandName} from ${interaction.user.id}: delivered after ${received - interaction.createdTimestamp}ms, `
    + `acknowledged in ${acknowledged - received}ms, answered in ${Date.now() - received}ms.`,
  );
}

export async function handleAutocomplete(interaction: AutocompleteInteraction, deps: Pick<CommandDeps, 'getCities'>): Promise<void> {
  try {
    const choices = interaction.commandName === 'city'
      ? cityChoices(String(interaction.options.getFocused()), await deps.getCities())
      : [];
    await interaction.respond(choices);
  } catch (error) {
    console.warn(`Autocomplete for /${interaction.commandName} failed:`, error);
  }
}
