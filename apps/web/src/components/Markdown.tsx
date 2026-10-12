import { createElement, type ReactNode } from 'react';
import { renderMarkdown, type MarkdownOptions } from '@streets/shared';

const h = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]): ReactNode => createElement(type, props, ...children);

/**
 * A news or Alliance Wire body with its markdown formatting. Built from React
 * elements, never HTML, so a post's text is always escaped.
 */
export function Markdown({ text, className, ...options }: { text: string; className?: string | undefined } & MarkdownOptions) {
  return <div className={className ? `se-markdown ${className}` : 'se-markdown'}>{renderMarkdown(text, h, options)}</div>;
}
