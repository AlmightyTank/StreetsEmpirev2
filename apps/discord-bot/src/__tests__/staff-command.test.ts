import { describe, expect, it } from 'vitest';
import { commandData } from '../commands.js';
import { STAFF_COMMAND_ROLES, staffRoleSetLine, staffRoleSetText, staffRosterEmbed } from '../staff-command.js';

describe('/staff', () => {
  it('never offers the Founder role', () => {
    expect(STAFF_COMMAND_ROLES).not.toContain('FOUNDER');
    const staff = commandData.find((command) => command.name === 'staff')!;
    const set = (staff.options as Array<{ name: string; options?: Array<{ name: string; choices?: Array<{ value: string }> }> }>).find((option) => option.name === 'set')!;
    expect(set.options!.find((option) => option.name === 'role')!.choices!.map((choice) => choice.value)).toEqual(['ADMIN', 'MOD', 'JR_MOD', 'HELPER']);
  });

  it('says what changed, privately and in the staff channel', () => {
    const made = { username: 'Ace_Deuce', fromRole: null, toRole: 'MOD' as const };
    expect(staffRoleSetText(made)).toMatch(/^Done: Ace\\_Deuce is now Mod \(was no staff role\)\./);
    expect(staffRoleSetLine('111111111111111111', '222222222222222222', made, 'New moderator'))
      .toBe('🛡️ <@111111111111111111> made <@222222222222222222> **Mod** with /staff. Reason: New moderator');
    const removed = { username: 'Ace', fromRole: 'HELPER' as const, toRole: null };
    expect(staffRoleSetLine('111111111111111111', '222222222222222222', removed, 'Stepped down'))
      .toBe("🛡️ <@111111111111111111> took <@222222222222222222>'s **Helper** role away with /staff. Reason: Stepped down");
  });

  it('lists staff with a warning where their roles cannot sync', () => {
    const embed = staffRosterEmbed({
      members: [
        { username: 'Owner', staffRole: 'FOUNDER', discordId: '111111111111111111', forumLinked: true, isActive: true },
        { username: 'Helpy', staffRole: 'HELPER', discordId: null, forumLinked: false, isActive: true },
      ],
    });
    expect(embed.description).toBe('**Founder** · Owner · <@111111111111111111>\n**Helper** · Helpy · ⚠️ Discord not linked · ⚠️ forum not linked');
    expect(staffRosterEmbed({ members: [] }).description).toBe('Nobody holds a staff role yet.');
  });
});
