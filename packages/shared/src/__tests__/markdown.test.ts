import { describe, expect, it } from 'vitest';
import { markdownToPlainText, parseMarkdown, parseMarkdownInline, renderMarkdown, safeMarkdownHref } from '../markdown.js';

type Node = { type: string; props: Record<string, unknown> | null; children: Array<Node | string> };
const h = (type: string, props: Record<string, unknown> | null, ...children: Array<Node | string>): Node => ({ type, props, children });

/** The rendered tree as compact HTML-ish text, so expectations read like the page. */
function html(nodes: Array<Node | string>): string {
  return nodes.map((node) => {
    if (typeof node === 'string') return node;
    const attrs = Object.entries(node.props ?? {}).filter(([name]) => name !== 'key').map(([name, value]) => ` ${name}="${String(value)}"`).join('');
    return node.children.length || !['br', 'hr'].includes(node.type) ? `<${node.type}${attrs}>${html(node.children)}</${node.type}>` : `<${node.type}${attrs}/>`;
  }).join('');
}

const render = (text: string, options = {}) => html(renderMarkdown(text, h, options));

describe('inline markdown', () => {
  it('formats bold, italic, strike, code and links', () => {
    expect(render('**big** *small* __also__ _tilt_ ~~gone~~ `turns`')).toBe('<p><strong>big</strong> <em>small</em> <strong>also</strong> <em>tilt</em> <s>gone</s> <code>turns</code></p>');
    expect(render('Read [the guide](/guide) or [Discord](https://discord.gg/se).')).toBe(
      '<p>Read <a href="/guide">the guide</a> or <a href="https://discord.gg/se" target="_blank" rel="noopener noreferrer nofollow ugc">Discord</a>.</p>',
    );
  });

  it('links bare addresses without their trailing punctuation', () => {
    expect(render('See https://streetsempire.dev/news.')).toBe(
      '<p>See <a href="https://streetsempire.dev/news" target="_blank" rel="noopener noreferrer nofollow ugc">https://streetsempire.dev/news</a>.</p>',
    );
  });

  it('leaves ordinary text alone', () => {
    expect(render('2 * 3 * 4 and snake_case_name and a lone ** pair')).toBe('<p>2 * 3 * 4 and snake_case_name and a lone ** pair</p>');
    expect(render('\\*not italic\\*')).toBe('<p>*not italic*</p>');
  });

  it('nests formatting', () => {
    expect(parseMarkdownInline('**bold *and italic* too**')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'bold ' }, { type: 'em', children: [{ type: 'text', text: 'and italic' }] }, { type: 'text', text: ' too' }] },
    ]);
  });
});

describe('safety', () => {
  it('never turns text into markup', () => {
    expect(render('<script>alert(1)</script> <img src=x onerror=alert(1)>')).toBe('<p><script>alert(1)</script> <img src=x onerror=alert(1)></p>');
    const [paragraph] = renderMarkdown('<b>hi</b>', h);
    expect(paragraph!.children).toEqual(['<b>hi</b>']);
  });

  it('keeps unsafe link targets as text', () => {
    expect(safeMarkdownHref('javascript:alert(1)')).toBeNull();
    expect(safeMarkdownHref('data:text/html,hi')).toBeNull();
    expect(safeMarkdownHref('//evil.example')).toBeNull();
    expect(render('[click](javascript:alert(1))')).toBe('<p>[click](javascript:alert(1))</p>');
  });

  it('shows the real address of an outside link in player posts', () => {
    expect(render('[the game](https://elsewhere.example/login)', { maskedLinks: false })).toBe(
      '<p><span>the game (<a href="https://elsewhere.example/login" target="_blank" rel="noopener noreferrer nofollow ugc">https://elsewhere.example/login</a>)</span></p>',
    );
    expect(render('[our page](/game/alliance)', { maskedLinks: false })).toBe('<p><a href="/game/alliance">our page</a></p>');
  });
});

describe('blocks', () => {
  it('builds paragraphs, line breaks, lists, quotes, rules and code', () => {
    expect(render('Line one\nline two\n\n- a\n- b\n\n3. c\n4. d\n\n> quoted\n\n---\n\n```\nx < y\n```')).toBe(
      '<p>Line one<br/>line two</p><ul><li>a</li><li>b</li></ul><ol start="3"><li>c</li><li>d</li></ol><blockquote>quoted</blockquote><hr/><pre><code>x < y</code></pre>',
    );
  });

  it('allows headings only when asked, starting below the page title', () => {
    expect(render('# Fixes\n### Small', { headings: true })).toBe('<h3>Fixes</h3><h5>Small</h5>');
    expect(render('# not a heading')).toBe('<p># not a heading</p>');
  });

  it('reads patch notes as a list', () => {
    expect(parseMarkdown('- First\n- Second')).toEqual([
      { type: 'list', ordered: false, start: 1, items: [[{ type: 'text', text: 'First' }], [{ type: 'text', text: 'Second' }]] },
    ]);
  });
});

describe('markdownToPlainText', () => {
  it('keeps the words and drops the markup', () => {
    expect(markdownToPlainText('## Fixes\n- **Raids** pay out\n- [Turf](https://x.dev) holds\n\n> Thanks, `crew`.')).toBe('Fixes Raids pay out · Turf holds Thanks, crew.');
  });
});
