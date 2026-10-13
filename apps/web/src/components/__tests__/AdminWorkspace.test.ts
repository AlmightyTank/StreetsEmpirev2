import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AdminWorkspace } from '../AdminWorkspace.js';

describe('AdminWorkspace', () => {
  it('groups restricted tools into five purpose-led destinations', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(AdminWorkspace, { pathname: '/game/admin/economy' }),
    ));

    expect(html).toContain('aria-label="Admin workspace"');
    expect(html).toContain('Operations');
    expect(html).toContain('Players');
    expect(html).toContain('Economy');
    expect(html).toContain('Content');
    expect(html).toContain('Monitoring');
    expect(html).toContain('Review money and markets');
  });

  it('keeps existing direct URLs and marks the current work area', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(AdminWorkspace, { pathname: '/game/admin/accounts/example' }),
    ));

    expect(html).toContain('href="/game/admin/accounts"');
    expect(html).toContain('href="/game/admin/rounds"');
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/game\/admin\/accounts"/);
  });
});
