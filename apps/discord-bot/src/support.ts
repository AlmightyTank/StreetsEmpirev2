import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThreadAutoArchiveDuration,
  type APIActionRowComponent,
  type APIButtonComponent,
  type APIComponentInMessageActionRow,
  type APIEmbed,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  type Message,
  type ModalSubmitInteraction,
  type TextChannel,
  type ThreadChannel,
} from 'discord.js';
import { escapeMarkdown, truncate } from './format.js';
import { GameApiError, type GameApi, type SupportContext, type SupportTicket } from './game-api.js';
import { staffErrorText, type StaffMessage } from './staff.js';

/**
 * /support: a private thread between one member and staff. What staff should know
 * about the member goes to the staff channel only, never into the thread they read.
 */

const TICKET_FORM = 'ticket-form';
const CLOSE_BUTTON = 'ticket-close';
const JOIN_BUTTON = 'ticket-join';
const OPEN_COLOR = 0x3b82f6;
const CLOSED_COLOR = 0x6b7480;

export interface SupportDeps {
  api: GameApi;
  origin: string;
  /** The channel tickets are threads in, when it is set and the bot can use it. */
  supportChannel: () => Promise<TextChannel | null>;
  staffChannel: () => Promise<GuildTextBasedChannel | null>;
}

export function ticketForm(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TICKET_FORM)
    .setTitle('Ask StreetsEmpire staff')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
        .setCustomId('subject').setLabel('What do you need help with?').setStyle(TextInputStyle.Short)
        .setRequired(true).setMinLength(5).setMaxLength(80)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
        .setCustomId('details').setLabel('Tell us more').setStyle(TextInputStyle.Paragraph)
        .setRequired(true).setMinLength(10).setMaxLength(2000)
        .setPlaceholder('What happened, and your in-game name if you have one. Never share your password.')),
    );
}

/** The ticket a close button carries, or null. */
export function parseCloseId(customId: string): string | null {
  const [head, ticketId, ...rest] = customId.split(':');
  return head === CLOSE_BUTTON && ticketId && !rest.length ? ticketId : null;
}

/** The ticket and thread a join button carries, or null. */
export function parseJoinId(customId: string): { ticketId: string; threadId: string } | null {
  const [head, ticketId, threadId, ...rest] = customId.split(':');
  return head === JOIN_BUTTON && ticketId && threadId && /^\d{17,20}$/.test(threadId) && !rest.length ? { ticketId, threadId } : null;
}

export function ticketThreadName(name: string, subject: string): string {
  return truncate(`🎫 ${name} · ${subject}`, 100);
}

/** The first post in the thread: the member's own words and a way to close it. */
export function ticketOpeningMessage(ticket: Pick<SupportTicket, 'id' | 'subject'>, details: string): StaffMessage {
  return {
    embeds: [{
      title: truncate(escapeMarkdown(ticket.subject), 256),
      color: OPEN_COLOR,
      description: truncate(escapeMarkdown(details), 4000),
      footer: { text: 'Only you and StreetsEmpire staff can see this thread. Staff will reply here.' },
    }],
    components: [{
      type: ComponentType.ActionRow,
      components: [{ type: ComponentType.Button, style: ButtonStyle.Danger, label: 'Close ticket', custom_id: `${CLOSE_BUTTON}:${ticket.id}` }],
    }],
  };
}

function linkButton(label: string, url: string): APIButtonComponent {
  return { type: ComponentType.Button, style: ButtonStyle.Link, label, url };
}

const day = (iso: string) => iso.slice(0, 10);

/** Staff channel only: who opened the ticket and what the game knows about them. */
export function ticketStaffMessage(ticket: SupportTicket, context: SupportContext, thread: { id: string; url: string }): StaffMessage {
  const { account, player, bugReports } = context;
  const fields = account
    ? [
      { name: 'Game account', value: `${escapeMarkdown(account.username)}${account.isAdmin ? ' (admin)' : ''}`, inline: true },
      { name: 'Joined', value: day(account.createdAt), inline: true },
      { name: 'Last sign-in', value: account.lastLoginAt ? day(account.lastLoginAt) : 'Never', inline: true },
      { name: 'Email', value: account.emailVerified ? 'Verified' : 'Not verified', inline: true },
      { name: 'This round', value: player ? `${escapeMarkdown(player.displayName)} (#${player.publicPimpId})` : 'Not playing', inline: true },
      { name: 'Open reports against them', value: String(context.openReportsAgainst), inline: true },
      { name: 'Restrictions', value: account.restrictions.length ? truncate(account.restrictions.map(escapeMarkdown).join('\n'), 1024) : 'None' },
      {
        name: `Bug reports (${bugReports.open} open)`,
        value: bugReports.recent.length
          ? truncate(bugReports.recent.map((bug) => `• ${escapeMarkdown(truncate(bug.summary, 80))}${bug.resolution ? ` (${bug.resolution.toLowerCase().replace('_', ' ')})` : ''}`).join('\n'), 1024)
          : 'None',
      },
    ]
    : [{ name: 'Game account', value: 'Not linked to a StreetsEmpire account. Ask for their in-game name if it matters.' }];
  fields.push({ name: 'Past tickets', value: String(context.pastTickets), inline: true });
  return {
    embeds: [{
      title: truncate(`🎫 Support ticket: ${ticket.subject}`, 256),
      url: thread.url,
      color: OPEN_COLOR,
      description: `From **${escapeMarkdown(ticket.discordName)}** (<@${ticket.discordId}>). Join the ticket to reply.`,
      fields,
      footer: { text: 'Staff only. None of this is shown in the ticket.' },
      timestamp: ticket.createdAt,
    }],
    components: [{
      type: ComponentType.ActionRow,
      components: [
        { type: ComponentType.Button, style: ButtonStyle.Primary, label: 'Join ticket', custom_id: `${JOIN_BUTTON}:${ticket.id}:${thread.id}` },
        linkButton('Open thread', thread.url),
        ...(account ? [linkButton('Admin account', account.url)] : []),
      ],
    }],
  };
}

/** The staff post once the ticket closes: who closed it, and only its links left. */
export function closedStaffMessage(embed: APIEmbed, rows: APIActionRowComponent<APIComponentInMessageActionRow>[], closedBy: string): StaffMessage {
  const links = rows.flatMap((row) => row.components).filter((component): component is APIButtonComponent =>
    component.type === ComponentType.Button && component.style === ButtonStyle.Link);
  return {
    embeds: [{
      ...embed,
      title: truncate((embed.title ?? 'Support ticket').replace(/^🎫 Support ticket/, '✅ Closed ticket'), 256),
      color: CLOSED_COLOR,
      footer: { text: `Closed by ${closedBy}` },
    }],
    components: links.length ? [{ type: ComponentType.ActionRow, components: links }] : [],
  };
}

export async function showTicketForm(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.showModal(ticketForm());
}

function memberName(interaction: ModalSubmitInteraction | ButtonInteraction): string {
  const member = interaction.member;
  const display = member && 'displayName' in member ? member.displayName : null;
  return display ?? interaction.user.globalName ?? interaction.user.username;
}

export async function handleTicketForm(interaction: ModalSubmitInteraction, deps: SupportDeps): Promise<void> {
  if (interaction.customId !== TICKET_FORM) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const support = await deps.supportChannel();
  if (!support) {
    await interaction.editReply({ content: "Support tickets aren't set up on this server yet. Use /bug for bugs, or ask on the forum." });
    return;
  }
  const subject = interaction.fields.getTextInputValue('subject').trim();
  const details = interaction.fields.getTextInputValue('details').trim();
  const name = memberName(interaction);

  let opened: Awaited<ReturnType<GameApi['openTicket']>>;
  try {
    opened = await deps.api.openTicket({ discordId: interaction.user.id, discordName: name, subject });
  } catch (error) {
    if (!(error instanceof GameApiError && error.status < 500)) console.error('Could not open a support ticket:', error);
    await interaction.editReply({ content: staffErrorText(error, deps.origin) });
    return;
  }
  if ('existing' in opened) {
    await interaction.editReply({ content: `You already have an open ticket: <#${opened.existing.threadId}>. Add to it there, or close it first.` });
    return;
  }

  const { ticket, context } = opened;
  let thread: ThreadChannel | null = null;
  try {
    thread = await support.threads.create({
      name: ticketThreadName(name, subject),
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: `Support ticket ${ticket.id}`,
    });
    await thread.members.add(interaction.user.id);
    await thread.send({
      content: `Thanks <@${interaction.user.id}>. A staff member will reply here.`,
      ...ticketOpeningMessage(ticket, details),
      allowedMentions: { users: [interaction.user.id] },
    });
  } catch (error) {
    console.error(`Could not make the thread for support ticket ${ticket.id}:`, error);
    await thread?.delete().catch(() => undefined);
    await deps.api.abandonTicket(ticket.id).catch(() => undefined);
    await interaction.editReply({ content: 'Could not open a ticket right now. Try again in a minute, or ask on the forum.' });
    return;
  }

  let staffMessageId: string | null = null;
  const staff = await deps.staffChannel();
  if (staff) {
    try {
      staffMessageId = (await staff.send({ ...ticketStaffMessage(ticket, context, thread), allowedMentions: { parse: [] } })).id;
    } catch (error) {
      console.error(`Could not post support ticket ${ticket.id} to #${staff.name}:`, error);
    }
  }
  await deps.api.attachTicket(ticket.id, { threadId: thread.id, staffMessageId })
    .catch((error: unknown) => console.error(`Could not record the thread for support ticket ${ticket.id}:`, error));
  await interaction.editReply({ content: `Ticket opened: <#${thread.id}>. Staff will reply there.` });
}

export async function handleTicketButton(interaction: ButtonInteraction, deps: SupportDeps): Promise<void> {
  const join = parseJoinId(interaction.customId);
  const closeId = parseCloseId(interaction.customId);
  if (!join && !closeId) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (join) {
      if (!(await deps.api.isStaff(interaction.user.id))) {
        await interaction.editReply({ content: 'Only game admins can join support tickets.' });
        return;
      }
      const thread = await interaction.client.channels.fetch(join.threadId).catch(() => null);
      if (!thread?.isThread()) {
        await interaction.editReply({ content: 'That ticket thread is gone.' });
        return;
      }
      await thread.members.add(interaction.user.id);
      await interaction.editReply({ content: `Added you to <#${thread.id}>.` });
      return;
    }

    const closedBy = memberName(interaction);
    const ticket = await deps.api.closeTicket(closeId!, { discordId: interaction.user.id, name: closedBy });
    await interaction.message.edit({ components: [] }).catch(() => undefined);
    const thread = interaction.channel?.isThread() ? interaction.channel : null;
    await thread?.send({ content: `Ticket closed by ${escapeMarkdown(closedBy)}. Thanks for getting in touch.`, allowedMentions: { parse: [] } }).catch(() => undefined);
    const staff = ticket.staffMessageId ? await deps.staffChannel() : null;
    const posted: Message | null = staff ? await staff.messages.fetch(ticket.staffMessageId!).catch(() => null) : null;
    if (posted?.embeds[0]) {
      await posted.edit(closedStaffMessage(posted.embeds[0].toJSON(), posted.components.map((row) => row.toJSON() as APIActionRowComponent<APIComponentInMessageActionRow>), closedBy))
        .catch((error: unknown) => console.warn(`Could not mark support ticket ${ticket.id} closed in the staff channel:`, error));
    }
    await interaction.editReply({ content: 'Ticket closed.' });
    // Locking needs Manage Threads; archiving alone still tidies it away.
    await thread?.setLocked(true).catch(() => undefined);
    await thread?.setArchived(true).catch(() => undefined);
  } catch (error) {
    if (!(error instanceof GameApiError && error.status < 500)) console.error(`Ticket button ${interaction.customId} failed:`, error);
    await interaction.editReply({ content: staffErrorText(error, deps.origin) }).catch(() => undefined);
  }
}
