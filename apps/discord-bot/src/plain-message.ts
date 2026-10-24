import { MessageFlags, type APIEmbed } from 'discord.js';

type TextPayload = {
  content?: string | null;
  embeds?: APIEmbed[];
  flags?: number;
  [key: string]: unknown;
};

type PlainPayload<T extends TextPayload> = Omit<T, 'content' | 'embeds' | 'flags'> & {
  content: string;
  embeds: APIEmbed[];
  flags: typeof MessageFlags.SuppressEmbeds;
};

/**
 * Render rich Discord cards as compact Markdown messages. Links stay clickable,
 * automatic previews are suppressed, and an empty embeds array clears older cards
 * when the bot edits a message that used to contain one.
 */
export function plainDiscordMessage<T extends TextPayload>(payload: T): PlainPayload<T> {
  const render = (embed: APIEmbed): string => {
    const lines: string[] = [];
    if (embed.author?.name) lines.push(`**${embed.author.name}**`);
    if (embed.title) {
      const title = embed.url ? `[**${embed.title}**](${embed.url})` : `**${embed.title}**`;
      lines.push(title);
    }
    if (embed.description) lines.push(embed.description);
    if (embed.fields?.length) lines.push(...embed.fields.map((field) => `**${field.name}**\n${field.value}`));
    if (embed.image?.url) lines.push(`[View image](${embed.image.url})`);
    if (embed.thumbnail?.url) lines.push(`[View image](${embed.thumbnail.url})`);
    const metadata = [
      embed.footer?.text,
      embed.timestamp ? `<t:${Math.floor(Date.parse(embed.timestamp) / 1000)}:f>` : undefined,
    ].filter(Boolean);
    if (metadata.length) lines.push(metadata.join(' · '));
    if (!embed.title && !embed.description && !embed.fields?.length && embed.url) lines.push(embed.url);
    return lines.join('\n\n');
  };

  const { embeds = [], content, flags = 0, ...rest } = payload;
  const rendered = embeds.map(render).filter(Boolean).join('\n\n');
  const combined = [content, rendered].filter((part): part is string => Boolean(part?.trim())).join('\n\n');
  const clipped = combined.length > 1900 ? `${combined.slice(0, 1899).trimEnd()}…` : combined;
  return {
    ...rest,
    content: clipped || 'StreetsEmpire update.',
    embeds: [],
    flags: (flags | MessageFlags.SuppressEmbeds) as typeof MessageFlags.SuppressEmbeds,
  } as unknown as PlainPayload<T>;
}
