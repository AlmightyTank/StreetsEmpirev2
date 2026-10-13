import { createElement, Fragment } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmpireAreaLegend, EmpireInspector, EmpireMetricStrip, EmpireRosterCard } from '../EmpireManagement.js';

describe('shared empire management patterns', () => {
  it('exposes selected roster targets as pressed controls', () => {
    const html = renderToStaticMarkup(createElement(EmpireRosterCard, { title: 'South Side', detail: '2 dealers', status: 'Working', statusTone: 'good', selected: true, onSelect: () => {}, selectLabel: 'Manage South Side' }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Manage South Side');
    expect(html).toContain('se-empire-status--good');
  });

  it('renders compact resource metrics and a labelled inspector', () => {
    const html = renderToStaticMarkup(createElement(Fragment, null,
      createElement(EmpireMetricStrip, { label: 'Resources', items: [{ key: 'crew', label: 'Crew', value: '4', detail: 'fit at home' }] }),
      createElement(EmpireInspector, { eyebrow: 'Selected corner', title: 'Casino', label: 'Casino controls', children: 'Actions' }),
    ));
    expect(html).toContain('aria-label="Resources"');
    expect(html).toContain('fit at home');
    expect(html).toContain('aria-label="Casino controls"');
  });

  it('uses the same area vocabulary for map legends', () => {
    const html = renderToStaticMarkup(createElement(EmpireAreaLegend, { label: 'District status', items: [{ key: 'mine', label: 'Your crew', tone: 'mine' }, { key: 'pressure', label: 'Conflict', tone: 'pressure' }] }));
    expect(html).toContain('District status');
    expect(html).toContain('se-empire-area-dot--mine');
    expect(html).toContain('se-empire-area-dot--pressure');
  });
});
