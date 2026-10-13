import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SocialNavigation } from '../SocialExperience.js';

describe('social experience primitives', () => {
  it('distinguishes each social destination by purpose', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(SocialNavigation, { active: 'console' }),
    ));
    expect(html).toContain('Find and track players');
    expect(html).toContain('Messages and alerts');
    expect(html).toContain('Private crew coordination');
    expect(html).toContain('Public round standings');
    expect(html).toContain('Official updates');
  });

  it('keeps direct links and identifies the current destination', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(SocialNavigation, { active: 'rankings' }),
    ));
    expect(html).toContain('href="/game/players"');
    expect(html).toContain('href="/game/console"');
    expect(html).toContain('href="/game/rankings"');
    expect(html).toContain('aria-current="page"');
  });
});
