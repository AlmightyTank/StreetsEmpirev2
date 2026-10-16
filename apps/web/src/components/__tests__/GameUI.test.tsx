import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Alert } from '../Alert.js';
import { Button } from '../Button.js';
import { Field } from '../Field.js';
import { GamePageHeader, GameTable, GameTabs, ProgressBar, StatusBadge } from '../GameUI.js';
import { Panel, Stat } from '../Panel.js';

describe('shared UI primitives', () => {
  it('keeps legacy class names while exposing typed button states', () => {
    const html = renderToStaticMarkup(<Button className="feature-action" variant="primary" size="sm" loading>Save</Button>);
    expect(html).toContain('se-btn se-btn--primary se-btn--sm feature-action');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled');
  });

  it('associates field messages and required state', () => {
    const html = renderToStaticMarkup(<Field id="crew-name" label="Crew name" required error="Required" />);
    expect(html).toContain('for="crew-name"');
    expect(html).toContain('aria-describedby="crew-name-error"');
    expect(html).toContain('aria-invalid="true"');
  });

  it('renders accessible panels, progress, tabs, tables, alerts, and status labels', () => {
    const html = renderToStaticMarkup(<>
      <GamePageHeader eyebrow="Test" title="Page" description="Description" />
      <Panel id="summary" title="Summary"><Stat label="Turns" value="4" meter={{ value: 4, max: 10 }} /></Panel>
      <GameTabs items={[{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }]} activeId="one" onChange={() => undefined} />
      <GameTable caption="Holdings" headers={['Name']}><tr><td>Warehouse</td></tr></GameTable>
      <ProgressBar label="Experience" value={3} max={5} />
      <StatusBadge tone="good">Ready</StatusBadge>
      <Alert tone="warning" title="Careful">Heat is high.</Alert>
    </>);
    expect(html).toContain('aria-labelledby="summary-title"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('<caption class="se-sr">Holdings</caption>');
    expect(html).toContain('Warning:');
    expect(html).toContain('se-status-badge--good');
  });
});
