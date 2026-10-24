import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ONBOARDING_PAGE_KEYS } from '@streets/shared';
import { TOUR_STEP_KEYS } from '@streets/shared';
import { INTRO_CARDS, PAGE_HELP, PAGE_INTROS, TOUR_STEPS, pageHelpFor, pageIntroFor } from './catalog.js';

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

  it('has a tour tooltip on a real route for every walkthrough step', () => {
    expect([...TOUR_STEP_KEYS]).toEqual(Object.keys(TOUR_STEPS));
    for (const key of TOUR_STEP_KEYS) {
      const copy = TOUR_STEPS[key];
      expect(copy.title, key).toBeTruthy();
      expect(copy.detail, key).toBeTruthy();
      expect(copy.target, key).toBeTruthy();
      expect(pageHelpFor(copy.to), `${key} → ${copy.to}`).not.toBeNull();
    }
  });

  it('anchors every tour tooltip to a real action in its page', () => {
    const sources: Record<string, string> = {
      '/account': readFileSync(new URL('../pages/AccountSettingsPage.tsx', import.meta.url), 'utf8')
        + readFileSync(new URL('../components/StreetSignBuilder.tsx', import.meta.url), 'utf8'),
      '/game/quests': readFileSync(new URL('../pages/QuestPage.tsx', import.meta.url), 'utf8'),
      '/game/scout': readFileSync(new URL('../pages/ScoutPage.tsx', import.meta.url), 'utf8'),
      '/game/stores': readFileSync(new URL('../pages/StorePage.tsx', import.meta.url), 'utf8'),
      '/game/produce': readFileSync(new URL('../pages/ProducePage.tsx', import.meta.url), 'utf8'),
      '/game/hideout': readFileSync(new URL('../pages/HideoutPage.tsx', import.meta.url), 'utf8'),
      '/game/combat': readFileSync(new URL('../pages/CombatPage.tsx', import.meta.url), 'utf8'),
    };
    for (const key of TOUR_STEP_KEYS) {
      const copy = TOUR_STEPS[key];
      const path = copy.to.split(/[?#]/)[0] ?? copy.to;
      // Each store lives at /game/stores/:slug on the same page.
      const route = path.startsWith('/game/stores/') ? '/game/stores' : path;
      const source = sources[route] ?? '';
      // Panels take the anchor as a `tourTarget` prop, so it can appear as a string literal.
      const anchored = source.includes(`data-tour="${copy.target}"`)
        || (source.includes('tourTarget') && source.includes(`'${copy.target}'`));
      expect(anchored, `${key} anchor in ${copy.to}`).toBe(true);
    }
  });
});
