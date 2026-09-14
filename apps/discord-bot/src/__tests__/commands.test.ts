import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { commandData, errorReply, PRIVATE_COMMANDS } from '../commands.js';
import { HELP_LINES } from '../format.js';
import { GameApiError } from '../game-api.js';

const origin = 'https://streetsempire.dev';

describe('commandData', () => {
  it('documents every registered command in /help, and nothing else', () => {
    const documented = HELP_LINES.map(([usage]) => usage.split(' ')[0]).sort();
    expect(documented).toEqual(commandData.map((command) => `/${command.name}`).sort());
  });

  it('keeps account commands private', () => {
    expect([...PRIVATE_COMMANDS].sort()).toEqual(['help', 'link', 'sync', 'syncall']);
    for (const name of PRIVATE_COMMANDS) expect(commandData.some((command) => command.name === name)).toBe(true);
  });

  it('hides /syncall from members without Manage Roles, and only that command', () => {
    const gated = commandData.filter((command) => command.default_member_permissions);
    expect(gated.map((command) => command.name)).toEqual(['syncall']);
    expect(gated[0]!.default_member_permissions).toBe(String(PermissionFlagsBits.ManageRoles));
  });
});

describe('errorReply', () => {
  const notLinked = new GameApiError(404, 'DISCORD_NOT_LINKED', 'That Discord account is not linked to a Street Empire account.');

  it('tells people how to link their own account', () => {
    expect(errorReply(notLinked, origin, true)).toBe(`Your Discord isn't linked to a Street Empire account yet. Link it from ${origin}/account, then try again.`);
    expect(errorReply(notLinked, origin, false)).toBe(notLinked.message);
  });

  it('passes through other not-found messages and hides everything else', () => {
    expect(errorReply(new GameApiError(404, 'PLAYER_NOT_FOUND', 'No player by that name in Game #008.'), origin, false)).toBe('No player by that name in Game #008.');
    for (const error of [new GameApiError(500, 'INTERNAL', 'stack trace here'), new Error('boom'), 'nope']) {
      expect(errorReply(error, origin, false)).toBe('Street Empire is not answering right now. Try again in a minute.');
    }
  });
});
