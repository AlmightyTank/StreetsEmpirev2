import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ONBOARDING_GUIDE_STEPS, ONBOARDING_PAGE_KEYS } from '@streets/shared';
import { GUIDE_STEPS, INTRO_CARDS, PAGE_HELP, PAGE_INTROS, pageHelpFor, pageIntroFor } from './catalog.js';

const rulesPage = readFileSync(new URL('../pages/RulesPage.tsx', import.meta.url), 'utf8');

describe('1.0.0-B help catalog', () => {
  it('keeps the first login short and ends on something to do', () => {
    expect(INTRO_CARDS.map((card) => card.key)).toEqual(['turns', 'scout', 'crew']);
    expect(INTRO_CARDS.at(-1)?.cta?.to).toBe('/game/scout');
  });

  it('introduces every later system on its own page', () => {
    for (const key of ONBOARDING_PAGE_KEYS) expect(PAGE_INTROS[key]?.body, key).toBeTruthy();
    expect(pageIntroFor('/game/stores/pip')).toBe('stores');
    expect(pageIntroFor('/game/produce')).toBe('produce');
    expect(pageIntroFor('/game/combat')).toBe('combat');
    expect(pageIntroFor('/game/travel')).toBe('travel');
    expect(pageIntroFor('/game/turf')).toBe('turf');
    expect(pageIntroFor('/game/hideout')).toBe('hideout');
    expect(pageIntroFor('/game/alliances/ABC')).toBe('alliance');
    expect(pageIntroFor('/game')).toBeNull();
    expect(pageIntroFor('/game/scout')).toBeNull();
  });

  it('gives every major page help with terms, risks and a real rules link', () => {
    const routes = ['/game', '/game/scout', '/game/produce', '/game/stores', '/game/stores/pip', '/game/combat', '/game/travel',
      '/game/turf', '/game/hideout', '/game/alliance', '/game/alliances', '/game/quests', '/game/console', '/game/players',
      '/game/rankings', '/game/contacts'];
    for (const route of routes) expect(pageHelpFor(route), route).not.toBeNull();
    expect(pageHelpFor('/game/rules')).toBeNull();
    for (const [key, help] of Object.entries(PAGE_HELP)) {
      expect(help.terms.length, key).toBeGreaterThan(0);
      expect(help.risks.length, key).toBeGreaterThan(0);
      expect(help.rules.startsWith('/game/rules'), key).toBe(true);
      const anchor = help.rules.split('#')[1];
      if (anchor) expect(rulesPage, `${key} → #${anchor}`).toContain(`id="${anchor}"`);
    }
  });

  it('has copy for every getting-started goal', () => {
    for (const key of ONBOARDING_GUIDE_STEPS) expect(GUIDE_STEPS[key]?.title, key).toBeTruthy();
  });
});
