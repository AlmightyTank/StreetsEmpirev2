import { SlashCommandBuilder, type APIEmbed, type ChatInputCommandInteraction } from 'discord.js';
import { newsEmbed, profileEmbed, rankingsEmbed, roundEmbed } from './format.js';
import { GameApiError, type GameApi } from './game-api.js';

export const commandData = [
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Show a player's public Street Empire profile")
    .addUserOption((option) => option.setName('user').setDescription('A Discord member with a linked game account'))
    .addStringOption((option) => option.setName('name').setDescription('In-game player name').setMaxLength(40)),
  new SlashCommandBuilder().setName('rankings').setDescription('Top 10 players in the current round'),
  new SlashCommandBuilder().setName('round').setDescription('Current round status and time left'),
  new SlashCommandBuilder().setName('news').setDescription('Latest Street Empire news'),
].map((command) => command.toJSON());

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

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  deps: { api: GameApi; origin: string },
): Promise<void> {
  // Game API calls can outlast Discord's 3-second reply window.
  await interaction.deferReply();
  const user = interaction.options.getUser('user');
  const name = interaction.options.getString('name');
  const self = interaction.commandName === 'profile' && !user && !name;

  try {
    let embed: APIEmbed;
    switch (interaction.commandName) {
      case 'profile':
        embed = profileEmbed(await deps.api.profile(user ? { discordId: user.id } : name ? { name } : { discordId: interaction.user.id }));
        break;
      case 'rankings':
        embed = rankingsEmbed(await deps.api.rankings(), deps.origin);
        break;
      case 'round':
        embed = roundEmbed(await deps.api.round(), deps.origin);
        break;
      case 'news':
        embed = newsEmbed(await deps.api.news(), deps.origin);
        break;
      default:
        await interaction.editReply({ content: 'Unknown command.', allowedMentions: { parse: [] } });
        return;
    }
    await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    if (!(error instanceof GameApiError && error.status === 404)) console.error(`/${interaction.commandName} failed:`, error);
    await interaction.editReply({ content: errorReply(error, deps.origin, self), allowedMentions: { parse: [] } });
  }
}
