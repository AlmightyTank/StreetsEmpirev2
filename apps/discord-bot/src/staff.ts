import {
  ActionRowBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
  type APIEmbed,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { BUG_REPORT_CATEGORIES, BUG_REPORT_REPLY_MAX, BUG_REPORT_RESOLUTIONS } from '@streets/shared';
import { escapeMarkdown, truncate } from './format.js';
import {
  GameApiError,
  type BugCategory,
  type BugResolution,
  type GameApi,
  type ReportAction,
  type StaffBugReport,
  type StaffMessageReport,
  type StaffPost,
} from './game-api.js';

/**
 * The staff channel and /bug: bug reports posted with resolve buttons, the forms
 * behind those buttons and behind /bug, and held patch notes. Every button checks
 * with the game that the member is a linked admin, so the audit log names them.
 */

export const RESOLUTION_LABELS: Record<BugResolution, string> = { FIXED: 'Fixed', WONT_FIX: "Won't fix", DUPLICATE: 'Duplicate' };
const RESOLUTION_COLORS: Record<BugResolution, number> = { FIXED: 0x22c55e, WONT_FIX: 0x6b7480, DUPLICATE: 0x3b82f6 };
const OPEN_COLOR = 0xf59e0b;

const RESOLVE_BUTTON = 'bug-resolve';
const RESOLVE_FORM = 'bug-resolve-form';
const REPORT_FORM = 'bug-report-form';
const ACT_BUTTON = 'report-act';
const ACT_FORM = 'report-act-form';
const REPORT_ACTIONS: readonly ReportAction[] = ['mute-1d', 'dismiss'];

export type StaffMessage = { embeds: APIEmbed[]; components: APIActionRowComponent<APIComponentInMessageActionRow>[] };

/** The resolution and report id a staff button or its form carries, or null for anything else. */
export function parseResolveId(customId: string, prefix: typeof RESOLVE_BUTTON | typeof RESOLVE_FORM = RESOLVE_BUTTON): { resolution: BugResolution; reportId: string } | null {
  const [head, resolution, reportId, ...rest] = customId.split(':');
  if (head !== prefix || rest.length || !reportId || !(BUG_REPORT_RESOLUTIONS as readonly string[]).includes(resolution ?? '')) return null;
  return { resolution: resolution as BugResolution, reportId };
}

/** The action and report id a message report button or its form carries, or null. */
export function parseActionId(customId: string, prefix: typeof ACT_BUTTON | typeof ACT_FORM = ACT_BUTTON): { action: ReportAction; reportId: string } | null {
  const [head, action, reportId, ...rest] = customId.split(':');
  if (head !== prefix || rest.length || !reportId || !(REPORT_ACTIONS as readonly string[]).includes(action ?? '')) return null;
  return { action: action as ReportAction, reportId };
}

/** The /bug category its form carries, or null. */
export function parseReportFormId(customId: string): BugCategory | null {
  const [head, category, ...rest] = customId.split(':');
  if (head !== REPORT_FORM || rest.length || !(BUG_REPORT_CATEGORIES as readonly string[]).includes(category ?? '')) return null;
  return category as BugCategory;
}

function linkButton(label: string, url: string) {
  return { type: ComponentType.Button as const, style: ButtonStyle.Link as const, label, url };
}

/** A report as staff see it: open with resolve buttons, or resolved with who did it. Player text is escaped. */
export function bugReportMessage(report: StaffBugReport): StaffMessage {
  const fields = [
    { name: 'Category', value: escapeMarkdown(report.category), inline: true },
    { name: 'From', value: `${escapeMarkdown(report.username)}${report.source === 'DISCORD' ? ' (via /bug)' : ''}`, inline: true },
    ...(report.pagePath ? [{ name: 'Page', value: `\`${truncate(report.pagePath.replace(/`/g, "'"), 200)}\``, inline: true }] : []),
    ...(report.appVersion ? [{ name: 'Version', value: escapeMarkdown(report.appVersion), inline: true }] : []),
  ];
  const resolved = report.resolution
    ? `${RESOLUTION_LABELS[report.resolution]} by ${report.resolvedByUsername ?? 'staff'}`
    : null;
  return {
    embeds: [{
      title: truncate(`${resolved ? '✅' : '🐞'} ${report.summary}`, 256),
      url: report.url,
      color: report.resolution ? RESOLUTION_COLORS[report.resolution] : OPEN_COLOR,
      description: truncate(escapeMarkdown(report.details), 1500),
      fields,
      footer: { text: resolved ?? 'Open bug report' },
      timestamp: report.resolvedAt ?? report.createdAt,
    }],
    components: [{
      type: ComponentType.ActionRow,
      components: [
        ...(report.resolution ? [] : BUG_REPORT_RESOLUTIONS.map((resolution) => ({
          type: ComponentType.Button as const,
          style: resolution === 'FIXED' ? ButtonStyle.Success as const : ButtonStyle.Secondary as const,
          label: RESOLUTION_LABELS[resolution],
          custom_id: `${RESOLVE_BUTTON}:${resolution}:${report.id}`,
        }))),
        linkButton('Open in admin', report.url),
      ],
    }],
  };
}

function partyText(party: StaffMessageReport['sender']): string {
  return `${escapeMarkdown(party.displayName)} (${escapeMarkdown(party.username)}, #${party.publicPimpId})`;
}

/**
 * A message report as staff see it: who reported whom and why, never the message.
 * Reading it stays in the admin panel, where opening a report is audited.
 */
export function messageReportMessage(report: StaffMessageReport): StaffMessage {
  const auto = report.source === 'AUTO';
  const resolved = report.resolution
    ? `${report.resolution === 'ACTIONED' ? 'Actioned' : 'Dismissed'} by ${report.resolvedByUsername ?? 'staff'}`
    : null;
  return {
    embeds: [{
      title: truncate(`${resolved ? '✅' : auto ? '🤖' : '🚩'} ${auto ? 'Auto-flagged message' : 'Message report'}: ${report.sender.displayName}`, 256),
      url: report.url,
      color: report.resolution === 'ACTIONED' ? RESOLUTION_COLORS.FIXED : report.resolution === 'DISMISSED' ? RESOLUTION_COLORS.WONT_FIX : 0xef4444,
      description: `**${auto ? 'Flagged for' : 'Reason'}:** ${truncate(escapeMarkdown(report.reason), 1000)}\n`
        + '-# The message is only shown in the admin panel, where opening a report is audited.',
      fields: [
        { name: 'Sender', value: partyText(report.sender), inline: true },
        { name: 'Recipient', value: partyText(report.recipient), inline: true },
        { name: 'Reported by', value: auto ? 'Automatic spam check' : escapeMarkdown(report.reporterUsername ?? 'a deleted account'), inline: true },
        { name: 'Round', value: escapeMarkdown(report.roundName), inline: true },
        { name: 'Open against sender', value: String(report.openAgainstSender), inline: true },
        { name: 'Sender muted', value: report.senderRestricted ? 'Yes' : 'No', inline: true },
      ],
      footer: { text: resolved ?? `Open · ${report.reportsOnMessage} report${report.reportsOnMessage === 1 ? '' : 's'} on this message` },
      timestamp: report.resolvedAt ?? report.createdAt,
    }],
    components: [{
      type: ComponentType.ActionRow,
      components: [
        ...(report.resolution ? [] : [
          { type: ComponentType.Button as const, style: ButtonStyle.Danger as const, label: 'Mute sender 1 day', custom_id: `${ACT_BUTTON}:mute-1d:${report.id}` },
          { type: ComponentType.Button as const, style: ButtonStyle.Secondary as const, label: 'Dismiss', custom_id: `${ACT_BUTTON}:dismiss:${report.id}` },
        ]),
        linkButton('Read in admin', report.url),
      ],
    }],
  };
}

/** Held deploy patch notes: a nudge to review them before they publish themselves. */
export function patchNotesHeldMessage(notes: NonNullable<StaffPost['patchNotes']>): StaffMessage {
  const publishes = Math.floor(Date.parse(notes.publishedAt) / 1000);
  return {
    embeds: [{
      title: truncate(`📝 Waiting for review: ${notes.title}`, 256),
      url: notes.url,
      color: OPEN_COLOR,
      description: truncate(notes.body, 1500),
      fields: [{ name: 'Publishes', value: `<t:${publishes}:R> unless someone edits, deletes or publishes it first.` }],
    }],
    components: [{ type: ComponentType.ActionRow, components: [linkButton('Review in Admin → News', notes.url)] }],
  };
}

/** What a claimed staff post becomes in the channel; null for a post with nothing to show. */
export function staffPostMessage(post: StaffPost): StaffMessage | null {
  if (post.bugReport) return bugReportMessage(post.bugReport);
  if (post.messageReport) return messageReportMessage(post.messageReport);
  if (post.patchNotes) return patchNotesHeldMessage(post.patchNotes);
  return null;
}

/** The game's words for a refusal the member can act on; anything else is an outage. */
export function staffErrorText(error: unknown, origin: string): string {
  if (error instanceof GameApiError && error.status >= 400 && error.status < 500 && error.status !== 401) {
    if (error.code === 'DISCORD_NOT_LINKED') return `Your Discord isn't linked to a StreetsEmpire account yet. Link it from ${origin}/account, then try again.`;
    return error.message;
  }
  return 'StreetsEmpire is not answering right now. Try again in a minute.';
}

export function resolveForm(resolution: BugResolution, reportId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${RESOLVE_FORM}:${resolution}:${reportId}`)
    .setTitle(`Mark as ${RESOLUTION_LABELS[resolution]}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
        .setCustomId('note').setLabel('Staff note (private)').setStyle(TextInputStyle.Paragraph)
        .setRequired(true).setMinLength(5).setMaxLength(500)
        .setPlaceholder('Why, for the queue and the audit log. The player never sees this.')),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
        .setCustomId('reply').setLabel('Message to the player (optional)').setStyle(TextInputStyle.Paragraph)
        .setRequired(false).setMaxLength(BUG_REPORT_REPLY_MAX)
        .setPlaceholder('Sent with their "report resolved" alert.')),
    );
}

export function actionForm(action: ReportAction, reportId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${ACT_FORM}:${action}:${reportId}`)
    .setTitle(action === 'mute-1d' ? 'Mute the sender for 1 day' : 'Dismiss this report')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
      .setCustomId('note').setLabel('Note for the audit log').setStyle(TextInputStyle.Paragraph)
      .setRequired(true).setMinLength(5).setMaxLength(500)
      .setPlaceholder(action === 'mute-1d'
        ? 'Read it in the admin panel first. Mutes messages, wire posts and recruiting for a day.'
        : 'Why this needs no action.')));
}

export function reportForm(category: BugCategory): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${REPORT_FORM}:${category}`)
    .setTitle('Report a bug')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
        .setCustomId('summary').setLabel('What went wrong, in a few words').setStyle(TextInputStyle.Short)
        .setRequired(true).setMinLength(5).setMaxLength(120)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
        .setCustomId('details').setLabel('What you did, and what happened').setStyle(TextInputStyle.Paragraph)
        .setRequired(true).setMinLength(10).setMaxLength(4000)),
    );
}

/** /bug: the form opens straight away, so this is the first reply and nothing is deferred. */
export async function showBugForm(interaction: ChatInputCommandInteraction): Promise<void> {
  const category = interaction.options.getString('category', true);
  if (!(BUG_REPORT_CATEGORIES as readonly string[]).includes(category)) {
    await interaction.reply({ content: 'Pick a category from the list.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.showModal(reportForm(category as BugCategory));
}

/** A staff button: opens its form. Whether the member may act is checked when they submit. */
export async function handleStaffButton(interaction: ButtonInteraction): Promise<void> {
  const resolve = parseResolveId(interaction.customId);
  if (resolve) {
    await interaction.showModal(resolveForm(resolve.resolution, resolve.reportId));
    return;
  }
  const act = parseActionId(interaction.customId);
  if (act) await interaction.showModal(actionForm(act.action, act.reportId));
}

export async function handleStaffModal(interaction: ModalSubmitInteraction, deps: { api: GameApi; origin: string }): Promise<void> {
  const category = parseReportFormId(interaction.customId);
  const resolve = parseResolveId(interaction.customId, RESOLVE_FORM);
  const act = parseActionId(interaction.customId, ACT_FORM);
  if (!category && !resolve && !act) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (act) {
      const report = await deps.api.actOnMessageReport(act.reportId, {
        discordId: interaction.user.id,
        action: act.action,
        note: interaction.fields.getTextInputValue('note').trim(),
      });
      if (interaction.message) await interaction.message.edit(messageReportMessage(report)).catch(() => undefined);
      await interaction.editReply({
        content: act.action === 'mute-1d'
          ? `Muted ${report.sender.displayName} for at least 1 day (a longer mute already in place is kept) and closed every report on that message. Change it from their admin account page.`
          : 'Dismissed every report on that message.',
      });
      return;
    }
    if (category) {
      const created = await deps.api.createBugReport(interaction.user.id, {
        category,
        summary: interaction.fields.getTextInputValue('summary').trim(),
        details: interaction.fields.getTextInputValue('details').trim(),
      });
      await interaction.editReply({ content: created.message });
      return;
    }
    const reply = interaction.fields.getTextInputValue('reply').trim();
    const report = await deps.api.resolveBugReport(resolve!.reportId, {
      discordId: interaction.user.id,
      resolution: resolve!.resolution,
      note: interaction.fields.getTextInputValue('note').trim(),
      ...(reply ? { playerReply: reply } : {}),
    });
    // The resolved post edits this message too; doing it now shows the result at once.
    if (interaction.message) await interaction.message.edit(bugReportMessage(report)).catch(() => undefined);
    await interaction.editReply({
      content: `Marked ${RESOLUTION_LABELS[resolve!.resolution]}. ${reply ? 'The reporter gets your message' : 'The reporter is told'} if they get message alerts.`,
    });
  } catch (error) {
    if (!(error instanceof GameApiError && error.status < 500)) console.error(`Staff form ${interaction.customId} failed:`, error);
    await interaction.editReply({ content: staffErrorText(error, deps.origin) }).catch(() => undefined);
  }
}
