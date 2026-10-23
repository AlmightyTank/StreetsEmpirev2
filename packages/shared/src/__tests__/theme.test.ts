import { describe, expect, it } from 'vitest';
import { STREETSEMPIRE_COLORS, STREETSEMPIRE_NAV_SECTIONS, STREETSEMPIRE_RADII, STREETSEMPIRE_SHELL } from '../theme.js';

describe('StreetsEmpire shell theme contract', () => {
  it('keeps the shared tokens aligned with the web shell', () => {
    expect(STREETSEMPIRE_COLORS).toEqual({
      bg: '#07090c',
      panel: '#12161c',
      panelHi: '#181d25',
      line: '#303743',
      lineSoft: '#202630',
      text: '#e4e9f1',
      textDim: '#a9b3c0',
      muted: '#8a96a5',
      accent: '#ef4657',
      accentDim: '#b72e3d',
      accentHover: '#ff7784',
      accent2: '#d6dee8',
      good: '#4ade80',
      bad: '#f33f63',
      warn: '#ff791a',
    });
    expect(STREETSEMPIRE_RADII).toEqual({ sm: 4, md: 6 });
    expect(STREETSEMPIRE_SHELL).toEqual({
      sidebarWidth: 232,
      topbarHeight: 58,
      tabbarHeight: 60,
      contentMaxWidth: 1320,
      expandedBreakpoint: 900,
    });
  });

  it('covers every game menu section exactly once', () => {
    const ids = STREETSEMPIRE_NAV_SECTIONS.map((section) => section.id);
    expect(ids).toEqual(['command', 'empire', 'competition', 'career', 'community', 'support']);
    for (const section of STREETSEMPIRE_NAV_SECTIONS) {
      expect(section.pages.length).toBeGreaterThan(0);
    }
  });
});
