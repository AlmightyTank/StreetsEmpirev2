import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type APIEmbed,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  alertText,
  badgesEmbed,
  compareEmbed,
  hallOfFameEmbed,
  helpEmbed,
  historyEmbed,
  inviteEmbed,
  leaderboardEmbed,
  memberEmbed,
  newsCreatedText,
  newsEmbed,
  profileEmbed,
  rankingsEmbed,
  reminderText,
  roundEmbed,
  statsEmbed,
  syncAllText,
  syncMemberText,
} from './format.js';
import { ALERT_TYPES, GameApiError, isLeaderboardStat, type AlertType, type City, type GameApi } from './game-api.js';
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
    .setName('badges')
    .setDescription("Every achievement a player has earned, and the ones they're closest to")
    .addUserOption((option) => option.setName('user').setDescription('A Discord member with a linked game account'))
    .addStringOption((option) => option.setName('name').setDescription('In-game player name').setMaxLength(40)),
  new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compare two players side by side')
    .addStringOption((option) => option.setName('player').setDescription('Player name or @member').setRequired(true).setMaxLength(40))
    .addStringOption((option) => option.setName('with').setDescription('Player name or @member (default: you)').setMaxLength(40)),
  new SlashCommandBuilder().setName('rankings').setDescription('Top 10 players in the current round'),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top combat and intel counts this round')
    .addStringOption((option) => option
      .setName('stat')
      .setDescription('Leaderboard')
      .setRequired(true)
      .addChoices(
        { name: 'Raid wins', value: 'raids' },
        { name: 'Defense wins', value: 'defenses' },
        { name: 'Drive-bys landed', value: 'drive-bys' },
        { name: 'Recon runs', value: 'recon' },
        { name: 'Low-riders stolen', value: 'rides' },
        { name: 'Crew lured', value: 'lures' },
      )),
  new SlashCommandBuilder()
    .setName('history')
    .setDescription("Show a player's finished round history")
    .addUserOption((option) => option.setName('user').setDescription('A Discord member with a linked game account'))
    .addStringOption((option) => option.setName('name').setDescription('In-game player name, including a past name').setMaxLength(40)),
  new SlashCommandBuilder()
    .setName('city')
    .setDescription('Top 10 in one city this round')
    .addStringOption((option) => option.setName('name').setDescription('City').setRequired(true).setAutocomplete(true).setMaxLength(60)),
  new SlashCommandBuilder().setName('halloffame').setDescription('Podiums from recent finished rounds'),
  new SlashCommandBuilder().setName('round').setDescription('Current round status and time left'),
  new SlashCommandBuilder().setName('news').setDescription('Latest Street Empire news'),
  new SlashCommandBuilder().setName('invite').setDescription('How to start playing Street Empire and get your roles'),
  new SlashCommandBuilder().setName('link').setDescription('Your link status and the roles you qualify for (only you see it)'),
  new SlashCommandBuilder().setName('stats').setDescription('Your private cash, crew, weapons, supplies and turns'),
  new SlashCommandBuilder()
    .setName('alerts')
    .setDescription('DM alerts from the Street Empire bot (only you see the reply)')
    .addStringOption((option) => option
      .setName('type')
      .setDescription('Alert type')
      .setRequired(true)
      .addChoices(
        { name: 'Attacks against me', value: 'attacks' },
        { name: 'Round opened or ending', value: 'round' },
        { name: 'Losing #1 or top 10', value: 'rank' },
        { name: 'Turns full', value: 'turns' },
      ))
    .addStringOption((option) => option
      .setName('enabled')
      .setDescription('Turn this alert on or off')
      .setRequired(true)
      .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })),
  new SlashCommandBuilder()
    .setName('remind')
    .setDescription('DM reminders from the Street Empire bot (only you see the reply)')
    .addStringOption((option) => option
      .setName('turns')
      .setDescription('DM me when my turns are full')
      .setRequired(true)
      .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })),
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Game admins: post Street Empire news from Discord')
    .addStringOption((option) => option.setName('title').setDescription('News title').setRequired(true).setMaxLength(120))
    .addStringOption((option) => option.setName('body').setDescription('News body').setRequired(true).setMaxLength(4000))
    .addStringOption((option) => option
      .setName('scope')
      .setDescription('Post for this round or globally')
      .setRequired(true)
      .addChoices({ name: 'Current round', value: 'round' }, { name: 'Global', value: 'global' }))
    .addBooleanOption((option) => option.setName('pinned').setDescription('Pin this news post')),
  new SlashCommandBuilder().setName('sync').setDescription('Update your Street Empire roles now'),
  new SlashCommandBuilder().setName('help').setDescription('List the Street Empire bot commands'),
  new SlashCommandBuilder()
    .setName('syncall')
    .setDescription('Re-sync Street Empire roles for every member (mods)')
    // Hidden from members without Manage Roles; also checked at run time, since server admins can override it.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
].map((command) => command.toJSON());

/** Replies only the caller sees. */
export const PRIVATE_COMMANDS: ReadonlySet<string> = new Set(['alerts', 'announce', 'link', 'remind', 'stats', 'sync', 'help', 'syncall']);

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

    case 'badges': {
      const user = interaction.options.getUser('user');
      const name = interaction.options.getString('name');
      if (user) return { embeds: [badgesEmbed(await api.badges({ discordId: user.id }))] };
      if (name) return { embeds: [badgesEmbed(await api.badges({ name }))] };
      try {
        return { embeds: [badgesEmbed(await api.badges({ discordId: interaction.user.id }))] };
      } catch (error) {
        throw new SelfLookupError(error);
      }
    }

    case 'rankings':
      return { embeds: [rankingsEmbed(await api.rankings(), origin)] };

    case 'leaderboard': {
      const stat = interaction.options.getString('stat', true);
      if (!isLeaderboardStat(stat)) return { content: 'Pick a leaderboard from the list.' };
      return { embeds: [leaderboardEmbed(await api.leaderboard(stat), origin)] };
    }

    case 'history': {
      const user = interaction.options.getUser('user');
      const name = interaction.options.getString('name');
      if (user) return { embeds: [historyEmbed(await api.history({ discordId: user.id }), origin)] };
      if (name) return { embeds: [historyEmbed(await api.history({ name }), origin)] };
      try {
        return { embeds: [historyEmbed(await api.history({ discordId: interaction.user.id }), origin)] };
      } catch (error) {
        throw new SelfLookupError(error);
      }
    }

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

    case 'invite':
      // The steps still help when round status is unavailable.
      return { embeds: [inviteEmbed(await api.round().catch(() => null), origin)] };

    case 'stats':
      try {
        return { embeds: [statsEmbed(await api.stats(interaction.user.id))] };
      } catch (error) {
        throw new SelfLookupError(error);
      }

    case 'alerts': {
      const type = interaction.options.getString('type', true) as AlertType;
      const enabled = interaction.options.getString('enabled', true) === 'on';
      if (!(ALERT_TYPES as readonly string[]).includes(type)) return { content: 'Pick an alert type from the list.' };
      try {
        return { content: alertText(await api.setAlert(interaction.user.id, type, enabled), type, enabled) };
      } catch (error) {
        throw new SelfLookupError(error);
      }
    }

    case 'remind': {
      const enabled = interaction.options.getString('turns', true) === 'on';
      try {
        return { content: reminderText(await api.setAlert(interaction.user.id, 'turns', enabled)) };
      } catch (error) {
        throw new SelfLookupError(error);
      }
    }

    case 'announce': {
      const title = interaction.options.getString('title', true);
      const body = interaction.options.getString('body', true);
      const scope = interaction.options.getString('scope', true) === 'global' ? 'global' : 'round';
      const pinned = interaction.options.getBoolean('pinned') ?? false;
      return { content: newsCreatedText(await api.createNews({ discordId: interaction.user.id, title, body, pinned, scope })) };
    }

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
