import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rulesets } from '@streets/rulesets';

/** Slice R2: every contact a round can have gets a painted room, wired up in the room stylesheet. */
const web = path.resolve(import.meta.dirname, '../../..');
const css = readFileSync(path.join(web, 'src/styles/contact-room.css'), 'utf8');
const contactKeys = [...new Set(Object.values(rulesets).flatMap((ruleset) => Object.keys(ruleset.contacts ?? {})))];

describe('contact room art', () => {
  it.each(contactKeys)('%s has a painted room behind the tint fallback', (key) => {
    const rule = css.match(new RegExp(`\\.se-room\\[data-contact='${key.toLowerCase()}'\\] \\{([^}]*)\\}`))?.[1];
    expect(rule, `no room rule for ${key}`).toBeDefined();
    expect(rule).toMatch(/--room-tint: \d+, \d+, \d+;/);
    const file = rule!.match(/--room-art: url\('\/rooms\/([a-z-]+\.svg)'\)/)?.[1];
    expect(file, `no painted room for ${key}`).toBeDefined();
    const svg = path.join(web, 'public/rooms', file!);
    expect(existsSync(svg)).toBe(true);
    const source = readFileSync(svg, 'utf8');
    expect(source).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1200 480">/);
    // Room art is drawn, never fetched: no scripts or outside references.
    expect(source).not.toMatch(/<script|href=|url\(http/);
  });
});
