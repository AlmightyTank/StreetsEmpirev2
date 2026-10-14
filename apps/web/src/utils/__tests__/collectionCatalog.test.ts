import { describe, expect, it } from 'vitest';
import {
  buildCollectionCatalog,
  buildItemLooks,
  entriesForTab,
} from '../collectionCatalog.js';

describe('collection showcase catalog', () => {
  it('excludes hidden Easter-egg looks and eggs, but keeps earnable cosmetics', () => {
    const catalog = buildCollectionCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    for (const entry of catalog) {
      expect(entry.styleKey).not.toBe('eight-bit');
      expect(entry.styleKey).not.toBe('time-machine');
      expect(entry.styleKey).not.toBe('blue-sky');
      expect(entry.catalogKey.startsWith('egg-')).toBe(false);
      expect(entry.source.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('maps Street Pass collections to their tiers', () => {
    const catalog = buildCollectionCatalog();
    const byStyle = new Map(catalog.filter((e) => e.styleKey).map((e) => [e.styleKey!, e]));
    expect(byStyle.get('urban-ghost')?.source).toMatchObject({ kind: 'street-pass', label: expect.stringContaining('tier 8') });
    expect(byStyle.get('midnight-ops')?.source).toMatchObject({ kind: 'street-pass', label: expect.stringContaining('tier 18') });
    expect(byStyle.get('cartel-gold')?.source).toMatchObject({ kind: 'street-pass', label: expect.stringContaining('tier 28') });
    expect(byStyle.get('dragon-ice')?.source).toMatchObject({ kind: 'street-pass', label: expect.stringContaining('tier 15') });
  });

  it('maps supporter, quest, secret and faction sources', () => {
    const catalog = buildCollectionCatalog();
    const byKey = new Map(catalog.map((e) => [e.key, e]));
    expect(byKey.get('midnight-chrome')?.source.kind).toBe('supporter');
    expect(byKey.get('ghost-of-the-block')?.source.kind).toBe('quest');
    expect(byKey.get('blackwood-manor')?.source.kind).toBe('secret');
    expect(byKey.get('kings-friend')?.source.kind).toBe('faction');
  });

  it('covers every tab with sourced entries', () => {
    const catalog = buildCollectionCatalog();
    expect(entriesForTab(catalog, 'themes').length).toBeGreaterThan(0);
    expect(entriesForTab(catalog, 'titles').length).toBeGreaterThan(0);
    expect(entriesForTab(catalog, 'frames').length).toBeGreaterThan(0);
    expect(entriesForTab(catalog, 'items').length).toBeGreaterThan(0);
  });

  it('lists released non-hidden item looks with sources', () => {
    const looks = buildItemLooks();
    const styles = looks.map((look) => look.style);
    expect(styles).toContain('classic');
    expect(styles).toContain('urban-ghost');
    expect(styles).toContain('midnight-chrome');
    expect(styles).not.toContain('eight-bit');
    expect(styles).not.toContain('time-machine');
    expect(styles).not.toContain('blue-sky');
    expect(looks.find((look) => look.style === 'classic')?.source.kind).toBe('default');
    expect(looks.find((look) => look.style === 'midnight-chrome')?.source.kind).toBe('supporter');
    for (const look of looks) expect(look.source.label.trim().length).toBeGreaterThan(0);
  });
});
