import { useEffect, useMemo, useState } from 'react';
import { collectionCovers, formatCents } from '@streets/shared';
import type { ArmoryBulkActionResult, ArmoryFeatureItemResult, ArmoryGunModel, ArmoryLookActionResult, ArmoryModActionInput, ArmoryModActionResult, IndividualArmoryItemDto, IndividualInventoryDto, IndividualVehicleItemDto } from '@streets/shared';
import { armoryApi } from '../api/armory.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { ItemTile } from '../components/ItemTile.js';
import './armory.css';

type View = 'GUN' | 'VEHICLE';
type InventoryItem = (IndividualArmoryItemDto & { kind: 'GUN' }) | (IndividualVehicleItemDto & { kind: 'VEHICLE' });
type ItemKey = `${View}:${string}`;
const GUN_ORDER: Record<ArmoryGunModel, number> = { PISTOL: 1, SHOTGUN: 2, TEK9: 3, AK47: 4 };
const GUN_LABEL: Record<ArmoryGunModel, string> = { PISTOL: 'Pistol', SHOTGUN: 'Shotgun', TEK9: 'TEC-9', AK47: 'AK-47' };
const VEHICLE_LABEL: Record<'SEDAN' | 'LOW_RIDER' | 'VAN', string> = { SEDAN: 'Sedan', LOW_RIDER: 'Low-Rider', VAN: 'Van' };

function labelFor(item: InventoryItem): string {
  return item.kind === 'GUN' ? GUN_LABEL[item.model] : VEHICLE_LABEL[item.model];
}

function originFor(item: InventoryItem): string {
  const kind = item.origin.kind;
  return typeof kind === 'string' ? kind.replaceAll('_', ' ').toLowerCase() : 'Inventory';
}

function itemKey(item: InventoryItem): ItemKey { return `${item.kind}:${item.id}`; }

function conditionBand(condition: number): string {
  if (condition < 20) return '0–19';
  if (condition < 40) return '20–39';
  if (condition < 60) return '40–59';
  if (condition < 80) return '60–79';
  return '80–100';
}

function ItemCard({ item, selected, onSelect, looks, onLook, onFeature, featured }: { item: InventoryItem; selected: boolean; onSelect: () => void; looks: IndividualInventoryDto['looks']; onLook: (item: InventoryItem, lookKey: string | null) => void; onFeature: (item: InventoryItem) => void; featured: boolean }) {
  const label = labelFor(item);
  const flags = item.kind === 'GUN' ? item : null;
  return (
    <article className={`se-armory-card${selected ? ' is-selected' : ''}`}>
      <div className="se-armory-card__top">
        <ItemTile item={item.model} size="sm" label={false} cosmeticStyle={(item.lookKey ?? 'classic') as import('@streets/shared').ItemCosmeticStyleKey} />
        <label className="se-armory-check">
          <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${item.name ?? label}`} />
          <span className="se-sr">Select item</span>
        </label>
        <div className="se-armory-card__title">
          <span className="se-eyebrow">{label}{item.quantity > 1 ? ` · stack of ${item.quantity}` : ''}</span>
          <h3>{item.name || `Unmarked ${label}`}</h3>
          {item.kind === 'VEHICLE' && item.plate ? <span className="se-muted">Plate {item.plate}</span> : null}
        </div>
        <span className={`se-armory-status se-armory-status--${item.status.toLowerCase().replaceAll('_', '-')}`}>{item.status.replaceAll('_', ' ')}</span>
      </div>
      <div className="se-armory-condition">
        <div><span>Condition</span><strong>{item.condition}%</strong></div>
        <div className="se-armory-meter" role="meter" aria-label={`${label} condition`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.condition}>
          <span style={{ width: `${item.condition}%` }} />
        </div>
      </div>
      <div className="se-armory-card__details">
        <span>{originFor(item)}</span>
        {item.mods.length ? <span>{item.mods.map((mod) => `${mod.key.replaceAll('_', ' ')} ${mod.tier}`).join(' · ')}</span> : <span className="se-muted">Stock setup</span>}
      </div>
      <label className="se-armory-look">Look
        <select value={item.lookKey ?? ''} disabled={item.status !== 'READY' || item.quantity !== 1} onChange={(event) => onLook(item, event.target.value || null)}>
          <option value="">Stock look</option>
          {looks.filter((look) => collectionCovers(look.key, item.model)).map((look) => <option key={look.key} value={look.key}>{look.title}</option>)}
        </select>
      </label>
      {item.history.length ? <details className="se-armory-history"><summary>Item history · {item.history.length}</summary><ol>
        {[...item.history].reverse().slice(0, 8).map((event, index) => <li key={`${event.at}-${index}`}><time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time><span>{event.summary}{event.city ? ` · ${event.city}` : ''}{event.otherPlayer ? ` · ${event.otherPlayer}` : ''}</span></li>)}
      </ol></details> : null}
      <button type="button" className={`se-btn se-btn--sm ${featured ? 'se-btn--primary' : 'se-btn--ghost'}`} disabled={item.status !== 'READY' || item.quantity !== 1} onClick={() => onFeature(item)}>{featured ? 'Featured on profile' : 'Feature on profile'}</button>
      {flags ? (
        <div className="se-armory-flags">
          {flags.favorite ? <span className="se-armory-flag">Favourite</span> : null}
          {flags.reserve ? <span className="se-armory-flag">Reserve</span> : null}
        </div>
      ) : null}
    </article>
  );
}

export function ArmoryPage() {
  const [data, setData] = useState<IndividualInventoryDto | null>(null);
  const [view, setView] = useState<View>('GUN');
  const [search, setSearch] = useState('');
  const [model, setModel] = useState('ALL');
  const [condition, setCondition] = useState('ALL');
  const [mods, setMods] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [origin, setOrigin] = useState('ALL');
  const [sort, setSort] = useState('POWER');
  const [selected, setSelected] = useState<Set<ItemKey>>(new Set());
  const [modScope, setModScope] = useState<'ONE' | 'STACK'>('ONE');
  const [name, setName] = useState('');
  const [buildName, setBuildName] = useState('');
  const [modKey, setModKey] = useState('');
  const [modTier, setModTier] = useState(1);
  const [removeModKey, setRemoveModKey] = useState('');
  const [buildId, setBuildId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const action = useGameAction<ArmoryBulkActionResult>();
  const modAction = useGameAction<ArmoryModActionResult>();
  const lookAction = useGameAction<ArmoryLookActionResult>();
  const featureAction = useGameAction<ArmoryFeatureItemResult>();

  useEffect(() => {
    let active = true;
    armoryApi.catalog().then((result) => { if (active) { setData(result); setLoadError(null); } })
      .catch((caught: unknown) => { if (active) setLoadError(caught instanceof ApiError ? caught.message : 'Could not load your inventory.'); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (action.result) {
      setSelected(new Set());
      setReload((value) => value + 1);
    }
  }, [action.result]);

  useEffect(() => {
    if (modAction.result) {
      setSelected(new Set());
      setReload((value) => value + 1);
    }
  }, [modAction.result]);

  useEffect(() => {
    if (lookAction.result) setReload((value) => value + 1);
  }, [lookAction.result]);

  useEffect(() => {
    if (featureAction.result) setReload((value) => value + 1);
  }, [featureAction.result]);

  const allItems = useMemo<InventoryItem[]>(() => [
    ...(data?.guns ?? []).map((item) => ({ ...item, kind: 'GUN' as const })),
    ...(data?.vehicles ?? []).map((item) => ({ ...item, kind: 'VEHICLE' as const })),
  ], [data]);
  const origins = useMemo(() => [...new Set(allItems.filter((item) => item.kind === view).map(originFor))].sort((a, b) => a.localeCompare(b)), [allItems, view]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allItems.filter((item) => {
      if (item.kind !== view) return false;
      if (model !== 'ALL' && item.model !== model) return false;
      if (condition !== 'ALL' && conditionBand(item.condition) !== condition) return false;
      if (mods === 'MODDED' && !item.mods.length) return false;
      if (mods === 'STOCK' && item.mods.length) return false;
      if (status !== 'ALL' && item.status !== status) return false;
      if (origin !== 'ALL' && originFor(item) !== origin) return false;
      if (query && ![item.name, labelFor(item), item.kind === 'VEHICLE' ? item.plate : null, originFor(item)].some((value) => value?.toLowerCase().includes(query))) return false;
      return true;
    }).sort((a, b) => {
      if (sort === 'CONDITION') return b.condition - a.condition || labelFor(a).localeCompare(labelFor(b));
      if (sort === 'CONDITION_LOW') return a.condition - b.condition || labelFor(a).localeCompare(labelFor(b));
      if (sort === 'NAME') return (a.name ?? labelFor(a)).localeCompare(b.name ?? labelFor(b));
      if (sort === 'QUANTITY') return b.quantity - a.quantity;
      if (sort === 'MODS') return b.mods.length - a.mods.length || labelFor(a).localeCompare(labelFor(b));
      if (sort === 'ORIGIN') return originFor(a).localeCompare(originFor(b)) || labelFor(a).localeCompare(labelFor(b));
      const aRank = a.kind === 'GUN' ? GUN_ORDER[a.model] : ({ VAN: 3, LOW_RIDER: 2, SEDAN: 1 } as const)[a.model];
      const bRank = b.kind === 'GUN' ? GUN_ORDER[b.model] : ({ VAN: 3, LOW_RIDER: 2, SEDAN: 1 } as const)[b.model];
      return bRank - aRank || b.condition - a.condition;
    });
  }, [allItems, view, search, model, condition, mods, status, origin, sort]);

  function toggle(item: InventoryItem) {
    const key = itemKey(item);
    setSelected((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }

  function selectVisible() {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = visible.length > 0 && visible.every((item) => next.has(itemKey(item)));
      for (const item of visible) allSelected ? next.delete(itemKey(item)) : next.add(itemKey(item));
      return next;
    });
  }

  function apply(actionName: 'FAVORITE' | 'RESERVE' | 'CLEAR_FLAGS' | 'RENAME') {
    const items = allItems.filter((item) => selected.has(itemKey(item))).map(({ id, kind }) => ({ id, kind }));
    if (!items.length) return;
    action.clear();
    void action.run((actionId) => armoryApi.update({ actionId, items, action: actionName, ...(actionName === 'RENAME' ? { name } : {}) }));
  }

  const selectedItems = allItems.filter((item) => selected.has(itemKey(item)));
  const selectedGunsOnly = selectedItems.length > 0 && selectedItems.every((item) => item.kind === 'GUN');
  const selectedCount = selectedItems.length;
  const firstSelected = selectedItems[0];
  const oneModelSelection = Boolean(firstSelected && selectedItems.every((item) => item.kind === firstSelected.kind && item.model === firstSelected.model));
  const selectedModRule = oneModelSelection && firstSelected
    ? firstSelected.kind === 'GUN' ? data?.modCatalog.guns[firstSelected.model] : data?.modCatalog.vehicles[firstSelected.model]
    : undefined;
  const modOptions = selectedModRule?.mods ?? [];
  const selectedMod = modOptions.find((mod) => mod.key === modKey) ?? modOptions[0];
  const selectedUnits = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const selectedModCost = selectedModRule && data ? data.modCatalog.costs[selectedModRule.size][modTier as 1 | 2 | 3] : null;
  const installedMods = [...new Set(selectedItems.flatMap((item) => item.mods.map((mod) => mod.key)))].sort();
  const compatibleBuilds = oneModelSelection && firstSelected
    ? (data?.builds ?? []).filter((build) => build.kind === firstSelected.kind && build.model === firstSelected.model)
    : [];

  function applyModAction(input: Omit<ArmoryModActionInput, 'actionId'>) {
    modAction.clear();
    void modAction.run((actionId) => armoryApi.customize({ ...input, actionId }));
  }

  function applyLook(item: InventoryItem, lookKey: string | null) {
    lookAction.clear();
    void lookAction.run((actionId) => armoryApi.setLook({ actionId, items: [{ id: item.id, kind: item.kind }], lookKey }));
  }

  function featureItem(item: InventoryItem) {
    featureAction.clear();
    void featureAction.run((actionId) => armoryApi.feature({ actionId, item: { id: item.id, kind: item.kind } }));
  }

  return (
    <GameLayout>
      <main className="se-page se-armory-page">
        <header className="se-page__head">
          <div><span className="se-eyebrow">Your equipment</span><h1>Armory &amp; Garage</h1><p>Manage the guns and vehicles your crew owns this round.</p></div>
        </header>
        {loadError ? <Alert tone="error">{loadError}</Alert> : null}
        {!data ? <Panel title="Loading inventory" loading><p>Loading the guns and vehicles in this round.</p></Panel> : !data.enabled ? (
          <Panel title="Item inventory unavailable"><p>This round still uses the classic count-based inventory.</p></Panel>
        ) : (
          <>
            <section className="se-armory-summary" aria-label="Inventory summary">
              <div><span>Guns</span><strong>{data.summary.gunCount.toLocaleString()}</strong><small>of {data.maxGuns.toLocaleString()}</small></div>
              <div><span>Vehicles</span><strong>{data.summary.vehicleCount.toLocaleString()}</strong><small>of {data.maxVehicles.toLocaleString()}</small></div>
              {view === 'GUN' ? Object.entries(data.summary.gunsByModel).map(([key, count]) => <div key={key}><span>{GUN_LABEL[key as ArmoryGunModel]}</span><strong>{count.toLocaleString()}</strong></div>) : Object.entries(data.summary.vehiclesByModel).map(([key, count]) => <div key={key}><span>{VEHICLE_LABEL[key as keyof typeof VEHICLE_LABEL]}</span><strong>{count.toLocaleString()}</strong></div>)}
            </section>

            <div className="se-armory-tabs" role="tablist" aria-label="Inventory type">
              <button type="button" role="tab" aria-selected={view === 'GUN'} className={view === 'GUN' ? 'is-active' : ''} onClick={() => { setView('GUN'); setModel('ALL'); setSelected(new Set()); }}>Armory <span>{data.summary.gunCount}</span></button>
              <button type="button" role="tab" aria-selected={view === 'VEHICLE'} className={view === 'VEHICLE' ? 'is-active' : ''} onClick={() => { setView('VEHICLE'); setModel('ALL'); setSelected(new Set()); }}>Garage <span>{data.summary.vehicleCount}</span></button>
            </div>

            <Panel title={view === 'GUN' ? 'Weapons' : 'Vehicles'} aside={`${visible.length} ${visible.length === 1 ? 'stack' : 'stacks'}`}>
              <div className="se-armory-filters">
                <label className="se-armory-search">Search<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or model" /></label>
                <label>Model<select value={model} onChange={(event) => setModel(event.target.value)}><option value="ALL">All models</option>{(view === 'GUN' ? Object.keys(GUN_LABEL) : Object.keys(VEHICLE_LABEL)).map((key) => <option key={key} value={key}>{view === 'GUN' ? GUN_LABEL[key as ArmoryGunModel] : VEHICLE_LABEL[key as keyof typeof VEHICLE_LABEL]}</option>)}</select></label>
                <label>Condition<select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="ALL">Any condition</option>{['80–100', '60–79', '40–59', '20–39', '0–19'].map((band) => <option key={band} value={band}>{band}%</option>)}</select></label>
                <label>Mods<select value={mods} onChange={(event) => setMods(event.target.value)}><option value="ALL">Any setup</option><option value="MODDED">Modified</option><option value="STOCK">Stock</option></select></label>
                <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option>{['READY', 'BROKEN', 'LOCKED', 'DAMAGED', 'DISABLED', 'ON_RUN'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
                <label>Origin<select value={origin} onChange={(event) => setOrigin(event.target.value)}><option value="ALL">Any origin</option>{origins.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="POWER">Best first</option><option value="CONDITION">Condition · high</option><option value="CONDITION_LOW">Condition · low</option><option value="MODS">Mods</option><option value="NAME">Name</option><option value="ORIGIN">Origin</option><option value="QUANTITY">Stack size</option></select></label>
              </div>
              <div className="se-armory-select-row"><label><input type="checkbox" checked={visible.length > 0 && visible.every((item) => selected.has(itemKey(item)))} onChange={selectVisible} /> Select visible</label><Button size="sm" variant="ghost" disabled={!selected.size} onClick={() => setSelected(new Set())}>Clear selection</Button></div>
              {selected.size ? (
                <div className="se-armory-bulk" aria-label="Bulk actions">
                  <strong>{selectedCount} {selectedCount === 1 ? 'stack' : 'stacks'} selected</strong>
                  <div className="se-armory-bulk__buttons">
                    <input aria-label="Name or name prefix" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="Name / prefix" />
                    <Button size="sm" variant="primary" disabled={!name.trim() || action.busy} onClick={() => apply('RENAME')}>Name</Button>
                    {selectedGunsOnly ? <>
                      <Button size="sm" disabled={action.busy} onClick={() => apply('FAVORITE')}>Favourite</Button>
                      <Button size="sm" disabled={action.busy} onClick={() => apply('RESERVE')}>Reserve</Button>
                      <Button size="sm" variant="ghost" disabled={action.busy} onClick={() => apply('CLEAR_FLAGS')}>Clear flags</Button>
                    </> : null}
                  </div>
                  <small>Naming or flagging takes one copy from each selected stack. Naming several adds a number to each name.</small>
                </div>
              ) : null}
              {action.error ? <Alert tone="error">{action.error}</Alert> : null}
              {action.result ? <Alert tone="success">Updated {action.result.result.updated} selected {action.result.result.updated === 1 ? 'item' : 'items'}.</Alert> : null}
              {modAction.error ? <Alert tone="error">{modAction.error}</Alert> : null}
              {modAction.result ? (() => {
                const receipt = modAction.result!.result;
                if (receipt.action === 'SAVE_BUILD') return <Alert tone="success">Saved “{receipt.build?.name}”.</Alert>;
                if (receipt.action === 'DELETE_BUILD') return <Alert tone="success">Deleted “{receipt.build?.name}”.</Alert>;
                const cost = [receipt.cashSpentCents ? `${formatCents(receipt.cashSpentCents)} cash` : '', receipt.partsSpent ? `${receipt.partsSpent.toLocaleString()} parts` : ''].filter(Boolean).join(' + ');
                const refund = receipt.partsRefunded ? ` · ${receipt.partsRefunded.toLocaleString()} parts returned` : '';
                return <Alert tone="success">Updated {receipt.affectedItems.toLocaleString()} {receipt.affectedItems === 1 ? 'item' : 'items'}{cost ? ` · spent ${cost}` : ''}{refund}.</Alert>;
              })() : null}
              {selected.size ? (
                <div className="se-armory-customize" aria-label="Modifications and saved builds">
                  <strong>Mods &amp; builds</strong>
                  {oneModelSelection && firstSelected && selectedModRule ? <>
                    <div className="se-armory-customize__grid">
                      <label>Modification<select value={selectedMod?.key ?? ''} onChange={(event) => setModKey(event.target.value)}>{modOptions.map((mod) => <option key={mod.key} value={mod.key}>{mod.key.replaceAll('_', ' ')}</option>)}</select></label>
                      <label>Tier<select value={modTier} onChange={(event) => setModTier(Number(event.target.value))}>{selectedMod?.tiers.map(({ tier, effectPercent }) => <option key={tier} value={tier}>Tier {tier} · {effectPercent}%</option>)}</select></label>
                       <Button size="sm" variant="primary" disabled={!selectedMod || modAction.busy} onClick={() => applyModAction({ action: 'INSTALL_MOD', scope: modScope, items: selectedItems.map(({ id, kind }) => ({ id, kind })), modKey: selectedMod!.key, tier: modTier })}>Install / replace</Button>
                      <label>Remove<select value={removeModKey} onChange={(event) => setRemoveModKey(event.target.value)}><option value="">Choose installed mod</option>{installedMods.map((key) => <option key={key} value={key}>{key.replaceAll('_', ' ')}</option>)}</select></label>
                       <Button size="sm" variant="ghost" disabled={!removeModKey || modAction.busy} onClick={() => applyModAction({ action: 'REMOVE_MOD', scope: modScope, items: selectedItems.map(({ id, kind }) => ({ id, kind })), modKey: removeModKey })}>Remove mod</Button>
                    </div>
                    {selectedModCost ? <small>Base install: {formatCents(selectedModCost.cashCents)} + {selectedModCost.parts} parts per item · {selectedUnits.toLocaleString()} selected. Replacements return half the old mod’s parts; the receipt shows the exact total.</small> : null}
                     <label>Apply to<select value={modScope} onChange={(event) => setModScope(event.target.value as 'ONE' | 'STACK')}><option value="ONE">One item from each selected stack</option><option value="STACK">Every item in each selected stack</option></select></label>
                     <small>Customization defaults to one item from each selected stack. Costs are charged only for the items changed; removing a mod returns half its parts.</small>
                    <div className="se-armory-customize__grid">
                      <label>Save current setup<input value={buildName} onChange={(event) => setBuildName(event.target.value)} maxLength={40} placeholder="Build name" /></label>
                      <Button size="sm" disabled={selectedItems.length !== 1 || !buildName.trim() || modAction.busy} onClick={() => applyModAction({ action: 'SAVE_BUILD', items: [{ id: firstSelected.id, kind: firstSelected.kind }], name: buildName })}>Save build</Button>
                      <label>Saved builds<select value={buildId} onChange={(event) => setBuildId(event.target.value)}><option value="">Choose a build</option>{compatibleBuilds.map((build) => <option key={build.id} value={build.id}>{build.name}</option>)}</select></label>
                       <Button size="sm" variant="primary" disabled={!buildId || modAction.busy} onClick={() => applyModAction({ action: 'APPLY_BUILD', scope: modScope, items: selectedItems.map(({ id, kind }) => ({ id, kind })), buildId })}>Apply to selected</Button>
                      <Button size="sm" variant="ghost" disabled={!buildId || modAction.busy} onClick={() => applyModAction({ action: 'DELETE_BUILD', buildId })}>Delete build</Button>
                    </div>
                     <small>Saved builds belong to this equipment model. Applying one follows the scope above and charges only for changed items.</small>
                    <small>Cash: {formatCents(data.resources.cashCents)} · Parts: {data.resources.vehicleParts.toLocaleString()}</small>
                  </> : <small>Select items of one model to install mods, remove mods, or use builds.</small>}
                </div>
              ) : null}
              {lookAction.error ? <Alert tone="error">{lookAction.error}</Alert> : null}
              {featureAction.error ? <Alert tone="error">{featureAction.error}</Alert> : null}
              {data.featuredItem ? <div className="se-armory-featured"><strong>Profile feature:</strong> {data.featuredItem.name || `Unmarked ${data.featuredItem.model}`} · {data.featuredItem.roundName}<button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => { featureAction.clear(); void featureAction.run((actionId) => armoryApi.feature({ actionId, item: null })); }}>Remove</button></div> : null}
              {visible.length ? <div className="se-armory-list">{visible.map((item) => <ItemCard key={itemKey(item)} item={item} selected={selected.has(itemKey(item))} onSelect={() => toggle(item)} looks={data.looks} onLook={applyLook} onFeature={featureItem} featured={data.featuredItem?.id === item.id} />)}</div> : <p className="se-muted se-armory-empty">No items match these filters.</p>}
            </Panel>
          </>
        )}
      </main>
    </GameLayout>
  );
}
