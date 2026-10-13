import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DashboardStorySpotlight } from '../DashboardStorySpotlight.js';

describe('DashboardStorySpotlight', () => {
  it('exposes the story as a clear landmark with a direct quest link while loading', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <DashboardStorySpotlight />
      </MemoryRouter>,
    );
    expect(html).toContain('aria-labelledby="dashboard-story-title"');
    expect(html).toContain('Main story');
    expect(html).toContain('Checking your next chapter');
    expect(html).toContain('href="/game/quests"');
    expect(html).not.toContain('undefined');
  });
});
