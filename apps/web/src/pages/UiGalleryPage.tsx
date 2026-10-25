import { useState } from 'react';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import {
  ActionFooter,
  EmptyState,
  FormControl,
  GameCard,
  GameDialog,
  GamePageHeader,
  GameTable,
  GameTabs,
  ProgressBar,
  SectionHeader,
  StatCard,
  StatusBadge,
} from '../components/GameUI.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';

const THEMES = ['none', 'casino-floor', 'federal-case', 'midnight-market'] as const;
const ACCENTS = ['default', 'gold', 'green', 'blue', 'purple', 'original-neon', 'asphalt-silver', 'burnt-copper', 'smog', 'electric-cyan', 'plum-smoke', 'porcelain'] as const;

export function UiGalleryPage() {
  const [theme, setTheme] = useState<(typeof THEMES)[number]>('none');
  const [accent, setAccent] = useState<(typeof ACCENTS)[number]>('default');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [tab, setTab] = useState('overview');
  const [dialog, setDialog] = useState(false);

  return (
    <Shell>
      <div className="se-ui-gallery">
        <GamePageHeader eyebrow="Developer only" title="UI contract gallery" description="Canonical tokens, primitives, states, themes, accents, density, and responsive behavior in one review surface." actions={<Button variant="primary" onClick={() => setDialog(true)}>Open dialog</Button>} />

        <Panel title="Preview controls" subtitle="These controls affect only the gallery preview below.">
          <div className="se-ui-gallery__controls">
            <FormControl label="Premium theme" id="gallery-theme">
              <select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}>{THEMES.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            </FormControl>
            <FormControl label="Player accent" id="gallery-accent">
              <select value={accent} onChange={(event) => setAccent(event.target.value as typeof accent)}>{ACCENTS.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            </FormControl>
            <FormControl label="Density" id="gallery-density">
              <select value={density} onChange={(event) => setDensity(event.target.value as typeof density)}><option value="comfortable">comfortable</option><option value="compact">compact</option></select>
            </FormControl>
          </div>
        </Panel>

        <div className={`se-ui-gallery__preview se-site-theme--${theme} se-site-accent--${accent} se-density--${density}`}>
          <SectionHeader title="Foundation tokens" description="Theme owns palette, accent owns interaction, route identity owns artwork." />
          <div className="se-ui-gallery__swatches" aria-label="Color tokens">
            {['bg', 'panel', 'panel-hi', 'line', 'text', 'text-dim', 'muted', 'accent', 'good', 'warn', 'bad'].map((token) => <div key={token}><span style={{ background: `var(--se-${token})` }} /><code>--se-{token}</code></div>)}
          </div>

          <GameTabs items={[{ id: 'overview', label: 'Overview' }, { id: 'inventory', label: 'Inventory' }, { id: 'locked', label: 'Locked', disabled: true }]} activeId={tab} onChange={setTab} />

          <section className="se-ui-gallery__section">
            <SectionHeader title="Actions and fields" />
            <div className="se-ui-gallery__actions">
              <Button>Default</Button><Button variant="primary">Primary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button><Button loading>Working</Button><Button disabledReason="Requires 5 turns">Disabled</Button>
            </div>
            <div className="se-ui-gallery__form">
              <Field label="Crew name" placeholder="The Night Shift" hint="Visible to other players." />
              <Field label="Required amount" type="number" min={0} required error="Enter an amount greater than zero." />
              <FormControl label="Message" hint="Textarea and select controls share the field contract."><textarea rows={3} defaultValue="Keep it concise." /></FormControl>
            </div>
          </section>

          <section className="se-ui-gallery__section">
            <SectionHeader title="Feedback and state" />
            <div className="se-ui-gallery__alerts"><Alert tone="info" title="Information">The market refreshes next turn.</Alert><Alert tone="success" title="Success">Shipment delivered.</Alert><Alert tone="warning" title="Warning">Heat is rising.</Alert><Alert title="Error">Not enough cash.</Alert></div>
            <div className="se-ui-gallery__badges"><StatusBadge>Neutral</StatusBadge><StatusBadge tone="accent">Active</StatusBadge><StatusBadge tone="good">Ready</StatusBadge><StatusBadge tone="warning">Pending</StatusBadge><StatusBadge tone="bad">Blocked</StatusBadge></div>
            <ProgressBar label="Experience progress" value={68} />
          </section>

          <section className="se-ui-gallery__section">
            <SectionHeader title="Cards and data" action={<Button size="sm">Manage</Button>} />
            <div className="se-ui-gallery__stats"><StatCard label="Cash" value="$24,500" detail="+$1,200 today" tone="good" /><StatCard label="Turns" value="18 / 30" /><StatCard label="Heat" value="72" detail="Bust risk" tone="bad" /></div>
            <Panel title="Legacy-compatible panel" aside="Shared chrome"><div className="se-rows"><Row label="Location" value="Motor City" /><Row label="Net worth" value="$118,440" strong /></div><div className="se-stats"><Stat label="Respect" value="840" meter={{ value: 84, max: 100 }} /><Stat label="Condition" value="42" meter={{ value: 42, max: 100 }} /></div></Panel>
            <GameTable caption="Sample holdings" headers={['Holding', 'Condition', 'Value']}><tr><td>Warehouse</td><td><StatusBadge tone="good">Stable</StatusBadge></td><td className="se-num">$42,000</td></tr><tr><td>Corner store</td><td><StatusBadge tone="warning">At risk</StatusBadge></td><td className="se-num">$8,500</td></tr></GameTable>
            <div className="se-ui-gallery__cards"><GameCard interactive><strong>Interactive game card</strong><p className="se-muted">Standard content surface using theme tokens.</p></GameCard><EmptyState title="Nothing here yet" description="Empty states explain what happened and offer one useful next action." action={<Button variant="primary">Get started</Button>} /></div>
          </section>

          <ActionFooter sticky><Button>Cancel</Button><Button variant="primary">Save changes</Button></ActionFooter>
        </div>
      </div>
      <GameDialog open={dialog} onClose={() => setDialog(false)} title="Shared game dialog" description="Escape, the close button, or the backdrop dismisses it." actions={<><Button onClick={() => setDialog(false)}>Cancel</Button><Button variant="primary" onClick={() => setDialog(false)}>Confirm</Button></>}><p className="se-muted">Dialogs use the named dialog layer and shared action footer.</p></GameDialog>
    </Shell>
  );
}
