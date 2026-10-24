import { MessageFlags, type APIEmbed } from 'discord.js';

type TextPayload = {
  content?: string | null;
  embeds?: APIEmbed[];
  flags?: number;
  [key: string]: unknown;
};

/**
 * Render rich Discord cards as compact Markdown messages. This keeps the same
 * information in the channel without the card layout; links stay clickable but
 * Discord link previews are suppressed.
 */
export function plainDiscordMessage<T extends TextPayload>(
  payload: T,
  options: { keepEmbeds?: boolean } = {},
): T {
  if (!payload.embeds?.length || options.keepEmbeds) return payload;

  const render = (embed: APIEmbed): string => {
    const lines: string[] = [];
    if (embed.author?.name) lines.push(`**${embed.author.name}**`);
    if (embed.title) {
      const title = embed.url ? `[**${embed.title}**](${embed.url})` : `**${embed.title}**`;
      lines.push(title);
    }
    if (embed.description) lines.push(embed.description);
    if (embed.fields?.length) {
      lines.push(...embed.fields.map((field) => `**${field.name}**\n${field.value}`));
    }
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

  const { embeds, content, ...rest } = payload;
  const rendered = embeds.map(render).filter(Boolean).join('\n\n');
  const combined = [content, rendered].filter((part): part is string => Boolean(part?.trim())).join('\n\n');
  const clipped = combined.length > 1900 ? `${combined.slice(0, 1899).trimEnd()}…` : combined;
  return {
    ...rest,
    content: clipped || 'StreetsEmpire update.',
    flags: (payload.flags ?? 0) | MessageFlags.SuppressEmbeds,
  } as T;
}
