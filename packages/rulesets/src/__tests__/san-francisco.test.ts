import { describe, expect, it } from 'vitest';
import { classicOgV15E2 } from '../classic-og-v1.5-e2/index.js';
import { classicOgV15E3 } from '../classic-og-v1.5-e3/index.js';

describe('1.5.0-E3 San Francisco', () => {
  it('replaces Beverly Hills with San Francisco everywhere a city is keyed', () => {
    expect(classicOgV15E3.meta).toEqual({ id: 'classic-og-v1.5-e3', version: '1.5.0-E3', name: 'Classic OG - San Francisco' });
    expect(Object.keys(classicOgV15E3.cities)).toEqual(Object.keys(classicOgV15E2.cities).map((slug) => (slug === 'beverly-hills' ? 'san-francisco' : slug)));
    expect(JSON.stringify(classicOgV15E3)).not.toMatch(/beverly/i);
    for (const keyed of [
      classicOgV15E3.travel.trips.hotelPrice, classicOgV15E3.turf.locals.byCity, classicOgV15E3.business.signatures,
      classicOgV15E3.casino.venues, classicOgV15E3.law.cities,
    ]) {
      expect(Object.keys(keyed)).toContain('san-francisco');
    }
  });

  it('keeps Beverly Hills’ economy and runs I-5 through San Francisco', () => {
    const { name: _n, trait: _t, blurb: _b, talk: _k, districts: _d, ...sf } = classicOgV15E3.cities['san-francisco'];
    const { name: _bn, trait: _bt, blurb: _bb, talk: _bk, districts: _bd, ...bh } = classicOgV15E2.cities['beverly-hills'];
    expect(sf).toEqual(bh);
    const roads = classicOgV15E3.travel.roads.map((road) => `${road.from}>${road.to}:${road.driveHours}`);
    expect(roads).toContain('los-angeles>san-francisco:6');
    expect(roads).toContain('san-francisco>seattle:12');
    expect(roads).not.toContain('los-angeles>seattle:17');
    const { cities: _c, travel: _tr, turf: _tu, business: _bu, casino: _ca, law: _la, meta: _m, ...e3 } = classicOgV15E3;
    const { cities: _c2, travel: _tr2, turf: _tu2, business: _bu2, casino: _ca2, law: _la2, meta: _m2, ...e2 } = classicOgV15E2;
    expect(e3).toEqual(e2);
  });
});
