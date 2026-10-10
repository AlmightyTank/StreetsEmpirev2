/**
 * The small, Discord-flavoured markdown that news and Alliance Wire posts use:
 * **bold**, *italic*, ~~strike~~, `code`, [links](https://…), bare links,
 * - lists, 1. lists, > quotes, ``` code blocks, --- rules and, for news only,
 * # headings. It never produces HTML: renderMarkdown hands each piece to the
 * caller's element factory (React's createElement), so text is always escaped
 * and player-written posts cannot inject markup.
 */

export type MarkdownInline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong' | 'em' | 'strike'; children: MarkdownInline[] }
  | { type: 'link'; href: string; children: MarkdownInline[] };

export type MarkdownBlock =
  | { type: 'paragraph'; lines: MarkdownInline[][] }
  | { type: 'heading'; level: 1 | 2 | 3; children: MarkdownInline[] }
  | { type: 'list'; ordered: boolean; start: number; items: MarkdownInline[][] }
  | { type: 'quote'; lines: MarkdownInline[][] }
  | { type: 'codeblock'; text: string }
  | { type: 'rule' };

export interface MarkdownOptions {
  /** # headings. Off for short player posts, where a leading # stays text. */
  headings?: boolean | undefined;
  /**
   * [text](url) shows its text. Off for player posts: an outside link then shows
   * its real address beside the text, so "[the game](https://elsewhere)" can't pass
   * for a game link.
   */
  maskedLinks?: boolean | undefined;
}

/** Links may go to the web or to a path on this site; anything else (javascript:, data:) stays text. */
export function safeMarkdownHref(href: string): string | null {
  const value = href.trim();
  if (/^https?:\/\/[^\s/]+/i.test(value)) return value;
  if (/^\/(?!\/)\S*$/.test(value)) return value;
  return null;
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*```/;
const URL_END = /[.,;:!?)\]'"]+$/;

/** Text between a delimiter pair: not empty and not padded with spaces, like Discord. */
function closing(text: string, from: number, delimiter: string): number {
  const end = text.indexOf(delimiter, from);
  if (end <= from) return -1;
  const inner = text.slice(from, end);
  return inner.trim() === inner ? end : -1;
}

/** `_` only emphasises at word edges, so snake_case and URLs stay as they are. */
function wordEdge(text: string, index: number): boolean {
  const char = text[index];
  return char === undefined || !/[\p{L}\p{N}]/u.test(char);
}

function pushText(out: MarkdownInline[], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.type === 'text') last.text += text;
  else out.push({ type: 'text', text });
}

export function parseMarkdownInline(text: string): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    const char = text[index]!;

    if (char === '\\' && /^\\[\\`*_~[\]()#>+\-.!|]/.test(rest)) {
      pushText(out, rest[1]!);
      index += 2;
      continue;
    }
    if (char === '`') {
      const end = text.indexOf('`', index + 1);
      if (end > index + 1) {
        out.push({ type: 'code', text: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }
    if (char === '[') {
      const link = /^\[([^\]\n]+)\]\(([^()\s]+)\)/.exec(rest);
      const href = link ? safeMarkdownHref(link[2]!) : null;
      if (link && href) {
        out.push({ type: 'link', href, children: parseMarkdownInline(link[1]!) });
        index += link[0].length;
        continue;
      }
    }
    if ((char === 'h' || char === 'H') && wordEdge(text, index - 1)) {
      const bare = /^https?:\/\/[^\s<>]+/i.exec(rest);
      if (bare) {
        const url = bare[0].replace(URL_END, '');
        out.push({ type: 'link', href: url, children: [{ type: 'text', text: url }] });
        index += url.length;
        continue;
      }
    }
    const pair = rest.startsWith('**') ? '**' : rest.startsWith('__') ? '__' : rest.startsWith('~~') ? '~~' : null;
    if (pair && (pair !== '__' || wordEdge(text, index - 1))) {
      const end = closing(text, index + 2, pair);
      if (end > 0 && (pair !== '__' || wordEdge(text, end + 2))) {
        out.push({ type: pair === '~~' ? 'strike' : 'strong', children: parseMarkdownInline(text.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }
    if ((char === '*' || char === '_') && (char === '*' || wordEdge(text, index - 1))) {
      const end = closing(text, index + 1, char);
      if (end > 0 && (char === '*' || wordEdge(text, end + 1))) {
        out.push({ type: 'em', children: parseMarkdownInline(text.slice(index + 1, end)) });
        index = end + 1;
        continue;
      }
    }
    pushText(out, char);
    index += 1;
  }
  return out;
}

export function parseMarkdown(text: string, options: MarkdownOptions = {}): MarkdownBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  const kindOf = (line: string): 'blank' | 'fence' | 'rule' | 'heading' | 'quote' | 'bullet' | 'numbered' | 'text' => {
    if (!line.trim()) return 'blank';
    if (FENCE.test(line)) return 'fence';
    if (RULE.test(line)) return 'rule';
    if (options.headings && HEADING.test(line)) return 'heading';
    if (QUOTE.test(line)) return 'quote';
    if (BULLET.test(line)) return 'bullet';
    if (NUMBERED.test(line)) return 'numbered';
    return 'text';
  };

  while (index < lines.length) {
    const line = lines[index]!;
    const kind = kindOf(line);
    if (kind === 'blank') {
      index += 1;
    } else if (kind === 'fence') {
      const end = lines.findIndex((next, at) => at > index && FENCE.test(next));
      const stop = end < 0 ? lines.length : end;
      blocks.push({ type: 'codeblock', text: lines.slice(index + 1, stop).join('\n') });
      index = stop + 1;
    } else if (kind === 'rule') {
      blocks.push({ type: 'rule' });
      index += 1;
    } else if (kind === 'heading') {
      const [, hashes, title] = HEADING.exec(line)!;
      blocks.push({ type: 'heading', level: hashes!.length as 1 | 2 | 3, children: parseMarkdownInline(title!) });
      index += 1;
    } else if (kind === 'quote') {
      const quoted: MarkdownInline[][] = [];
      while (index < lines.length && kindOf(lines[index]!) === 'quote') {
        quoted.push(parseMarkdownInline(QUOTE.exec(lines[index]!)![1]!));
        index += 1;
      }
      blocks.push({ type: 'quote', lines: quoted });
    } else if (kind === 'bullet' || kind === 'numbered') {
      const pattern = kind === 'bullet' ? BULLET : NUMBERED;
      const items: MarkdownInline[][] = [];
      const start = kind === 'numbered' ? Number(NUMBERED.exec(line)![1]) : 1;
      while (index < lines.length && kindOf(lines[index]!) === kind) {
        const match = pattern.exec(lines[index]!)!;
        items.push(parseMarkdownInline(match[match.length - 1]!));
        index += 1;
      }
      blocks.push({ type: 'list', ordered: kind === 'numbered', start, items });
    } else {
      const paragraph: MarkdownInline[][] = [];
      while (index < lines.length && kindOf(lines[index]!) === 'text') {
        paragraph.push(parseMarkdownInline(lines[index]!.trim()));
        index += 1;
      }
      blocks.push({ type: 'paragraph', lines: paragraph });
    }
  }
  return blocks;
}

function inlineText(parts: MarkdownInline[]): string {
  return parts.map((part) => ('children' in part ? inlineText(part.children) : part.text)).join('');
}

/** The words without the markup, on one line: for excerpts, push notices and Discord field previews. */
export function markdownToPlainText(text: string, options: MarkdownOptions = { headings: true }): string {
  return parseMarkdown(text, options)
    .map((block) => {
      switch (block.type) {
        case 'paragraph':
        case 'quote':
          return block.lines.map(inlineText).join(' ');
        case 'heading':
          return inlineText(block.children);
        case 'list':
          return block.items.map(inlineText).join(' · ');
        case 'codeblock':
          return block.text;
        case 'rule':
          return '';
      }
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** createElement-shaped, so shared code can build React elements without depending on React. */
export type MarkdownElementFactory<T> = (
  type: string,
  props: Record<string, unknown> | null,
  ...children: Array<T | string>
) => T;

/**
 * Elements for a post body, in order. Headings start at h3, under the page's and
 * the card's own titles. Outside links open in a new tab with no referrer and
 * nofollow, since wire posts are player-written.
 */
export function renderMarkdown<T>(text: string, h: MarkdownElementFactory<T>, options: MarkdownOptions = {}): T[] {
  const inline = (parts: MarkdownInline[]): Array<T | string> => parts.map((part, key) => {
    switch (part.type) {
      case 'text':
        return part.text;
      case 'code':
        return h('code', { key }, part.text);
      case 'strong':
        return h('strong', { key }, ...inline(part.children));
      case 'em':
        return h('em', { key }, ...inline(part.children));
      case 'strike':
        return h('s', { key }, ...inline(part.children));
      case 'link': {
        if (part.href.startsWith('/')) return h('a', { key, href: part.href }, ...inline(part.children));
        const outside = { key, href: part.href, target: '_blank', rel: 'noopener noreferrer nofollow ugc' };
        if (options.maskedLinks !== false || inlineText(part.children) === part.href) return h('a', outside, ...inline(part.children));
        return h('span', { key }, ...inline(part.children), ' (', h('a', outside, part.href), ')');
      }
    }
  });
  const lines = (rows: MarkdownInline[][]): Array<T | string> =>
    rows.flatMap((row, at) => (at ? [h('br', { key: `br-${at}` }), ...inline(row)] : inline(row)));

  return parseMarkdown(text, options).map((block, key) => {
    switch (block.type) {
      case 'paragraph':
        return h('p', { key }, ...lines(block.lines));
      case 'heading':
        return h(`h${block.level + 2}`, { key }, ...inline(block.children));
      case 'list':
        return block.ordered
          ? h('ol', { key, ...(block.start !== 1 ? { start: block.start } : {}) }, ...block.items.map((item, at) => h('li', { key: at }, ...inline(item))))
          : h('ul', { key }, ...block.items.map((item, at) => h('li', { key: at }, ...inline(item))));
      case 'quote':
        return h('blockquote', { key }, ...lines(block.lines));
      case 'codeblock':
        return h('pre', { key }, h('code', null, block.text));
      case 'rule':
        return h('hr', { key });
    }
  });
}
