import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import type { SupportContext, SupportTicket } from '../game-api.js';
import {
  closedStaffMessage,
  parseCloseId,
  parseJoinId,
  ticketForm,
  ticketOpeningMessage,
  ticketStaffMessage,
  ticketThreadName,
} from '../support.js';

const ticket: SupportTicket = {
  id: 'cmticket1',
  discordId: '123456789012345678',
  discordName: 'Big_Daddy',
  subject: 'Cannot sign in *at all*',
  threadId: null,
  staffMessageId: null,
  createdAt: '2026-10-10T12:00:00.000Z',
  closedAt: null,
  closedByName: null,
};
const thread = { id: '987654321098765432', url: 'https://discord.com/channels/111111111111111111/987654321098765432' };
const linked: SupportContext = {
  account: {
    username: 'big_daddy',
    createdAt: '2026-09-01T10:00:00.000Z',
    lastLoginAt: null,
    emailVerified: false,
    isAdmin: false,
    restrictions: ['Suspended until 2026-10-12: Alt accounts'],
    url: 'https://streetsempire.dev/game/admin/accounts/acct1',
  },
  player: { roundName: 'Game #021', displayName: 'Big_Daddy', publicPimpId: 41, url: 'https://streetsempire.dev/game/players/41' },
  bugReports: { open: 1, recent: [{ summary: 'Login loops', resolution: null }, { summary: 'Map grey', resolution: 'WONT_FIX' }] },
  openReportsAgainst: 2,
  pastTickets: 1,
};

type Button = { type: ComponentType; style: ButtonStyle; label: string; custom_id?: string; url?: string };
const buttons = (message: { components: Array<{ components: unknown[] }> }) => (message.components[0]?.components ?? []) as Button[];

describe('ticket ids and names', () => {
  it('reads close and join buttons, and nothing else', () => {
    expect(parseCloseId('ticket-close:cmticket1')).toBe('cmticket1');
    expect(parseCloseId('ticket-close:cmticket1:extra')).toBeNull();
    expect(parseJoinId(`ticket-join:cmticket1:${thread.id}`)).toEqual({ ticketId: 'cmticket1', threadId: thread.id });
    expect(parseJoinId('ticket-join:cmticket1:not-a-thread')).toBeNull();
    expect(parseJoinId('bug-resolve:FIXED:cm1')).toBeNull();
  });

  it('names the thread after the member and subject, within Discord limits', () => {
    expect(ticketThreadName('Big_Daddy', 'Cannot sign in')).toBe('🎫 Big_Daddy · Cannot sign in');
    expect(ticketThreadName('n'.repeat(60), 's'.repeat(80)).length).toBeLessThanOrEqual(100);
  });

  it('builds the form within Discord limits', () => {
    const json = ticketForm().toJSON();
    expect(json.title.length).toBeLessThanOrEqual(45);
    expect(json.custom_id).toBe('ticket-form');
  });
});

describe('ticketOpeningMessage', () => {
  it('shows the member their own words, escaped, with a close button', () => {
    const message = ticketOpeningMessage(ticket, 'I get **logged out** every time.');
    expect(message.embeds[0]).toMatchObject({ title: 'Cannot sign in \\*at all\\*', description: 'I get \\*\\*logged out\\*\\* every time.' });
    expect(buttons(message).map((button) => [button.label, button.custom_id, button.style])).toEqual([['Close ticket', 'ticket-close:cmticket1', ButtonStyle.Danger]]);
  });
});

describe('ticketStaffMessage', () => {
  it('gives staff the account picture, with join, thread and admin links', () => {
    const message = ticketStaffMessage(ticket, linked, thread);
    const [embed] = message.embeds;
    expect(embed!.title).toBe('🎫 Support ticket: Cannot sign in *at all*');
    expect(embed!.url).toBe(thread.url);
    expect(Object.fromEntries(embed!.fields!.map((field) => [field.name, field.value]))).toEqual({
      'Game account': 'big\\_daddy',
      'Joined': '2026-09-01',
      'Last sign-in': 'Never',
      'Email': 'Not verified',
      'This round': 'Big\\_Daddy (#41)',
      'Open reports against them': '2',
      // Reasons are written by admins, so they are escaped; Discord shows \- as a hyphen.
      'Restrictions': 'Suspended until 2026\\-10\\-12: Alt accounts',
      'Bug reports (1 open)': '• Login loops\n• Map grey (wont fix)',
      'Past tickets': '1',
    });
    expect(buttons(message).map((button) => button.custom_id ?? button.url)).toEqual([`ticket-join:cmticket1:${thread.id}`, thread.url, linked.account!.url]);
  });

  it('says when the member has no game account', () => {
    const message = ticketStaffMessage(ticket, { account: null, player: null, bugReports: { open: 0, recent: [] }, openReportsAgainst: 0, pastTickets: 0 }, thread);
    expect(message.embeds[0]!.fields!.map((field) => field.name)).toEqual(['Game account', 'Past tickets']);
    expect(message.embeds[0]!.fields![0]!.value).toMatch(/^Not linked/);
    expect(buttons(message).map((button) => button.label)).toEqual(['Join ticket', 'Open thread']);
  });

  it('marks the post closed and keeps only its links', () => {
    const open = ticketStaffMessage(ticket, linked, thread);
    const closed = closedStaffMessage(open.embeds[0]!, open.components, 'Staffer');
    expect(closed.embeds[0]!.title).toBe('✅ Closed ticket: Cannot sign in *at all*');
    expect(closed.embeds[0]!.footer!.text).toBe('Closed by Staffer');
    expect(buttons(closed).map((button) => button.label)).toEqual(['Open thread', 'Admin account']);
  });
});
