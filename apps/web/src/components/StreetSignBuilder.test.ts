import { createElement as h } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_STREET_SIGN, type StreetSignDesign } from '@streets/shared';
import { StreetSignBuilder, streetSignContrastRatio } from './StreetSignBuilder.js';

function render(value: StreetSignDesign | null, savedValue: StreetSignDesign | null = null, crewName = 'Cedar') {
  return renderToStaticMarkup(h(StreetSignBuilder, { value, savedValue, crewName, onChange: () => undefined }));
}

describe('StreetSignBuilder accessibility and preview controls', () => {
  it('links the main sign lettering to the crew name and makes the lettering read-only', () => {
    const html = render({ ...DEFAULT_STREET_SIGN, streetName: 'Old Name' }, null, 'Syndicate');
    expect(html).toContain('Crew name on sign');
    expect(html).toContain('value="Syndicate"');
    expect(html).toContain('readOnly=""');
    expect(html).toContain('The sign lettering stays linked to your crew name.');
  });

  it('shows locked font pack milestones and keeps graffiti-only fonts out of street lettering', () => {
    const html = render({ ...DEFAULT_STREET_SIGN, streetName: 'Cedar' });
    expect(html).toContain('Sign Painter · level 10');
    expect(html).toContain('Graffiti Script · level 20');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Graffiti Pack includes Graffiti Script and Wildstyle.');
  });
  it('labels the new controls and keeps them reflected in the live preview', () => {
    const design = { ...DEFAULT_STREET_SIGN, streetName: 'Cedar', tag: 'NIGHT SHIFT', tagScale: 'large' as const, tagPlacement: 'lower-left' as const, trim: 'beveled' as const, shadow: 'strong' as const, treatment: 'weathered' as const };
    const html = render(design, design);

    expect(html).toContain('for="street-sign-tag-scale"');
    expect(html).toContain('for="street-sign-tag-placement"');
    expect(html).toContain('for="street-sign-trim"');
    expect(html).toContain('for="street-sign-shadow"');
    expect(html).toContain('for="street-sign-treatment"');
    expect(html).toContain('se-street-sign-preview__tag--large');
    expect(html).toContain('se-street-sign-preview__tag--lower-left');
    expect(html).toContain('se-street-sign-trim--beveled');
    expect(html).toContain('se-street-sign-shadow--strong');
    expect(html).toContain('se-street-sign-treatment--weathered');
    expect(html).toContain('Every finish keeps the sign as a metal street sign.');
  });

  it('offers a reset action and announces low-contrast lettering', () => {
    const design = { ...DEFAULT_STREET_SIGN, streetName: 'Cedar', backgroundColor: '#ffffff', textColor: '#ffffff' };
    const html = render(design, { ...design, streetName: 'Old Cedar' });
    expect(html).toContain('Reset to saved');
    expect(html).toContain('role="status"');
    expect(html).toContain('Lettering may be hard to read');
  });

  it('calculates WCAG contrast ratios for sign colors', () => {
    expect(streetSignContrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(streetSignContrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});
