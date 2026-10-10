import { createElement, type ReactNode } from 'react';
import { renderMarkdown, type MarkdownOptions } from '@streets/shared';

const h = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]): ReactNode => createElement(type, props, ...children);

/** A news body with its markdown formatting, built from React elements so its text is always escaped. */
export function Markdown({ text, className, ...options }: { text: string; className?: string | undefined } & MarkdownOptions) {
  return <div className={className ? `site-markdown ${className}` : 'site-markdown'}>{renderMarkdown(text, h, options)}</div>;
}
