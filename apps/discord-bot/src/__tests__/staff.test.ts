import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { BUG_REPORT_CATEGORIES, BUG_REPORT_RESOLUTIONS } from '@streets/shared';
import { GameApiError, type StaffBugReport, type StaffMessageReport } from '../game-api.js';
import {
  actionForm,
  bugReportMessage,
  messageReportMessage,
  parseActionId,
  parseReportFormId,
  parseResolveId,
  patchNotesHeldMessage,
  reportForm,
  resolveForm,
  staffErrorText,
  staffPostMessage,
} from '../staff.js';

const origin = 'https://streetsempire.dev';
const report: StaffBugReport = {
  id: 'cmbug1',
  category: 'Something in the game works wrong',
  summary: 'Raid *button* does nothing',
  details: 'I clicked raid on @everyone and **nothing** happened.',
  username: 'Big_Daddy',
  source: 'GAME',
  pagePath: '/game/raids',
  appVersion: '1.6.5',
  createdAt: '2026-10-10T12:00:00.000Z',
  resolution: null,
  resolvedByUsername: null,
  resolvedAt: null,
  url: `${origin}/game/admin/bugs`,
};

type Button = { type: ComponentType.Button; style: ButtonStyle; label: string; custom_id?: string; url?: string };
const buttons = (message: ReturnType<typeof bugReportMessage>) => message.components[0]!.components as Button[];

describe('custom ids', () => {
  it('reads a resolve button and its form, and nothing else', () => {
    expect(parseResolveId('bug-resolve:FIXED:cmbug1')).toEqual({ resolution: 'FIXED', reportId: 'cmbug1' });
    expect(parseResolveId('bug-resolve-form:DUPLICATE:cmbug1', 'bug-resolve-form')).toEqual({ resolution: 'DUPLICATE', reportId: 'cmbug1' });
    expect(parseResolveId('bug-resolve-form:FIXED:cmbug1')).toBeNull();
    expect(parseResolveId('bug-resolve:DELETE:cmbug1')).toBeNull();
    expect(parseResolveId('bug-resolve:FIXED')).toBeNull();
    expect(parseResolveId('bug-resolve:FIXED:cmbug1:extra')).toBeNull();
  });

  it('reads the /bug form category', () => {
    expect(parseReportFormId('bug-report-form:DISPLAY')).toBe('DISPLAY');
    expect(parseReportFormId('bug-report-form:NOPE')).toBeNull();
    expect(parseReportFormId('bug-resolve:FIXED:cmbug1')).toBeNull();
  });
});

describe('bugReportMessage', () => {
  it('shows an open report with the three resolve buttons and an admin link', () => {
    const message = bugReportMessage(report);
    const [embed] = message.embeds;
    expect(embed!.title).toBe('🐞 Raid *button* does nothing');
    expect(embed!.description).toBe('I clicked raid on @everyone and \\*\\*nothing\\*\\* happened.');
    expect(embed!.fields).toEqual([
      { name: 'Category', value: 'Something in the game works wrong', inline: true },
      { name: 'From', value: 'Big\\_Daddy', inline: true },
      { name: 'Page', value: '`/game/raids`', inline: true },
      { name: 'Version', value: '1.6.5', inline: true },
    ]);
    expect(buttons(message).map((button) => button.custom_id ?? button.url)).toEqual([
      'bug-resolve:FIXED:cmbug1',
      'bug-resolve:WONT_FIX:cmbug1',
      'bug-resolve:DUPLICATE:cmbug1',
      `${origin}/game/admin/bugs`,
    ]);
    expect(buttons(message)[0]!.style).toBe(ButtonStyle.Success);
  });

  it('marks /bug reports and drops the buttons once resolved', () => {
    const message = bugReportMessage({ ...report, source: 'DISCORD', pagePath: null, appVersion: null, resolution: 'WONT_FIX', resolvedByUsername: 'admin', resolvedAt: '2026-10-10T13:00:00.000Z' });
    const [embed] = message.embeds;
    expect(embed!.title!.startsWith('✅')).toBe(true);
    expect(embed!.footer!.text).toBe("Won't fix by admin");
    expect(embed!.timestamp).toBe('2026-10-10T13:00:00.000Z');
    expect(embed!.fields!.map((field) => field.value)).toEqual(['Something in the game works wrong', 'Big\\_Daddy (via /bug)']);
    expect(buttons(message).map((button) => button.label)).toEqual(['Open in admin']);
  });

  it('stays inside Discord limits', () => {
    const [embed] = bugReportMessage({ ...report, summary: 's'.repeat(300), details: 'd'.repeat(5000) }).embeds;
    expect(embed!.title!.length).toBeLessThanOrEqual(256);
    expect(embed!.description!.length).toBeLessThanOrEqual(1500);
  });
});

describe('patch notes and claimed posts', () => {
  const notes = { id: 'n1', title: 'Patch notes: October 10, 2026', body: '- Raids show crew size', publishedAt: '2026-10-10T16:20:00.000Z', url: `${origin}/game/admin/news` };

  it('nudges staff to review held notes before they publish', () => {
    const message = patchNotesHeldMessage(notes);
    expect(message.embeds[0]!.title).toBe('📝 Waiting for review: Patch notes: October 10, 2026');
    expect(message.embeds[0]!.fields![0]!.value).toBe(`<t:${Date.parse(notes.publishedAt) / 1000}:R> unless someone edits, deletes or publishes it first.`);
    expect((message.components[0]!.components[0] as Button).url).toBe(notes.url);
  });

  it('turns each claimed post into its message', () => {
    expect(staffPostMessage({ id: 'p1', kind: 'BUG_REPORT', editMessageId: null, bugReport: report })!.embeds[0]!.title).toMatch(/^🐞/);
    expect(staffPostMessage({ id: 'p2', kind: 'PATCH_NOTES_HELD', editMessageId: null, patchNotes: notes })!.embeds[0]!.title).toMatch(/^📝/);
    expect(staffPostMessage({ id: 'p3', kind: 'BUG_REPORT', editMessageId: null })).toBeNull();
  });
});

const messageReport: StaffMessageReport = {
  id: 'cmrep1',
  source: 'PLAYER',
  reason: 'Threats in a *private* message',
  createdAt: '2026-10-10T12:00:00.000Z',
  reporterUsername: 'quiet_one',
  roundName: 'Game #021',
  sender: { username: 'loud_guy', displayName: 'Loud_Guy', publicPimpId: 41 },
  recipient: { username: 'quiet_one', displayName: 'Quiet', publicPimpId: 7 },
  reportsOnMessage: 2,
  openAgainstSender: 3,
  senderRestricted: false,
  resolvedAt: null,
  resolvedByUsername: null,
  resolution: null,
  url: `${origin}/game/admin/reports`,
};

describe('messageReportMessage', () => {
  it('shows who reported whom and why, never the message, with mute and dismiss', () => {
    const message = messageReportMessage(messageReport);
    const [embed] = message.embeds;
    expect(embed!.title).toBe('🚩 Message report: Loud_Guy');
    expect(embed!.description).toBe('**Reason:** Threats in a \\*private\\* message\n-# The message is only shown in the admin panel, where opening a report is audited.');
    expect(embed!.fields!.map((field) => [field.name, field.value])).toEqual([
      ['Sender', 'Loud\\_Guy (loud\\_guy, #41)'],
      ['Recipient', 'Quiet (quiet\\_one, #7)'],
      ['Reported by', 'quiet\\_one'],
      ['Round', 'Game \\#021'],
      ['Open against sender', '3'],
      ['Sender muted', 'No'],
    ]);
    expect(embed!.footer!.text).toBe('Open · 2 reports on this message');
    expect(buttons(message).map((button) => button.custom_id ?? button.url)).toEqual(['report-act:mute-1d:cmrep1', 'report-act:dismiss:cmrep1', `${origin}/game/admin/reports`]);
    expect(buttons(message)[0]!.style).toBe(ButtonStyle.Danger);
  });

  it('names automatic flags and drops the buttons once closed', () => {
    const message = messageReportMessage({ ...messageReport, source: 'AUTO', reporterUsername: null, senderRestricted: true, resolution: 'ACTIONED', resolvedByUsername: 'admin', resolvedAt: '2026-10-10T13:00:00.000Z' });
    const [embed] = message.embeds;
    expect(embed!.title).toBe('✅ Auto-flagged message: Loud_Guy');
    expect(embed!.description!.startsWith('**Flagged for:**')).toBe(true);
    expect(embed!.fields!.find((field) => field.name === 'Reported by')!.value).toBe('Automatic spam check');
    expect(embed!.fields!.find((field) => field.name === 'Sender muted')!.value).toBe('Yes');
    expect(embed!.footer!.text).toBe('Actioned by admin');
    expect(buttons(message).map((button) => button.label)).toEqual(['Read in admin']);
    expect(staffPostMessage({ id: 'p4', kind: 'MESSAGE_REPORT', editMessageId: null, messageReport })!.embeds[0]!.title).toMatch(/^🚩/);
  });

  it('reads its buttons and forms, and nothing else', () => {
    expect(parseActionId('report-act:mute-1d:cmrep1')).toEqual({ action: 'mute-1d', reportId: 'cmrep1' });
    expect(parseActionId('report-act-form:dismiss:cmrep1', 'report-act-form')).toEqual({ action: 'dismiss', reportId: 'cmrep1' });
    expect(parseActionId('report-act:ban:cmrep1')).toBeNull();
    expect(parseActionId('bug-resolve:FIXED:cmbug1')).toBeNull();
  });
});

describe('forms', () => {
  it('builds every form within Discord limits', () => {
    const forms = [
      ...BUG_REPORT_RESOLUTIONS.map((resolution) => resolveForm(resolution, 'c'.repeat(30))),
      actionForm('mute-1d', 'c'.repeat(30)),
      actionForm('dismiss', 'c'.repeat(30)),
      ...BUG_REPORT_CATEGORIES.map((category) => reportForm(category)),
    ];
    for (const form of forms) {
      const json = form.toJSON();
      expect(json.title.length).toBeLessThanOrEqual(45);
      expect(json.custom_id.length).toBeLessThanOrEqual(100);
    }
  });
});

describe('staffErrorText', () => {
  it('passes on refusals people can act on and hides outages', () => {
    expect(staffErrorText(new GameApiError(403, 'FORBIDDEN', 'Only game admins can resolve bug reports.'), origin)).toBe('Only game admins can resolve bug reports.');
    expect(staffErrorText(new GameApiError(409, 'BUG_REPORT_RESOLVED', 'Another admin already resolved that report.'), origin)).toBe('Another admin already resolved that report.');
    expect(staffErrorText(new GameApiError(429, 'BUG_REPORT_LIMIT', 'That is 5 reports this hour.'), origin)).toBe('That is 5 reports this hour.');
    expect(staffErrorText(new GameApiError(404, 'DISCORD_NOT_LINKED', 'not linked'), origin)).toBe(`Your Discord isn't linked to a StreetsEmpire account yet. Link it from ${origin}/account, then try again.`);
    for (const error of [new GameApiError(401, 'UNAUTHENTICATED', 'bad token'), new GameApiError(500, 'INTERNAL', 'stack'), new Error('boom')]) {
      expect(staffErrorText(error, origin)).toBe('StreetsEmpire is not answering right now. Try again in a minute.');
    }
  });
});
