import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionDock, type ResultChip } from '../ActionDock.js';
import { ActionReadiness, OperationDetails } from '../ActionReadiness.js';

const chips: ResultChip[] = ['Cash', 'Product', 'Turns', 'Heat', 'Rank'].map((label, index) => ({
  key: label,
  label,
  text: String(index + 1),
  tone: 'muted',
}));

describe('shared action controls', () => {
  it('shows only three result changes by default, with the full receipt available', () => {
    const html = renderToStaticMarkup(
      <ActionDock label="Scout" onSubmit={() => {}} outcome={{
        id: 'one',
        title: 'Scout finished',
        chips,
        receipt: <div>Private detailed ledger</div>,
        onDismiss: () => {},
      }}>
        <button type="submit">Scout</button>
      </ActionDock>,
    );
    expect(html).toContain('Cash');
    expect(html).toContain('Product');
    expect(html).toContain('Turns');
    expect(html).not.toContain('Heat</span>');
    expect(html).not.toContain('Rank</span>');
    expect(html).toContain('+2 more');
    expect(html).toContain('Receipt');
    expect(html).not.toContain('Private detailed ledger');
  });

  it('keeps the empty-results state readable', () => {
    const html = renderToStaticMarkup(
      <ActionDock label="Produce" onSubmit={() => {}} outcome={{
        id: 'two', title: 'Nothing changed', chips: [], receipt: null, onDismiss: () => {},
      }}>
        <button type="submit">Cook</button>
      </ActionDock>,
    );
    expect(html).toContain('Nothing moved');
    expect(html).not.toContain('+');
  });

  it('shows why an operation is blocked without hiding resource status', () => {
    const html = renderToStaticMarkup(
      <ActionReadiness title="Street readiness" status="Needs attention"
        blockedReason="Finish Green Thumb to enter this district."
        items={[
          { key: 'turns', label: 'Turns available', value: '8' },
          { key: 'crew', label: 'Fit thugs', value: '0', tone: 'bad' },
        ]} />,
    );
    expect(html).toContain('8');
    expect(html).toContain('Fit thugs');
    expect(html).toContain('Finish Green Thumb');
    expect(html).toContain('role="status"');
  });

  it('puts optional information behind an accessible disclosure', () => {
    const html = renderToStaticMarkup(
      <OperationDetails title="Crew information" summary="Loadout and notes">
        <div>Weapons and supply</div>
      </OperationDetails>,
    );
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('Crew information');
    expect(html).not.toContain('<details open');
  });
});
