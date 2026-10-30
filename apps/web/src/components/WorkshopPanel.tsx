import { useState } from 'react';
import { formatNumber, maxCraftBatches, MAX_CRAFT_BATCH, type CraftingRecipeDto, type CraftingWorkshopDto } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { hideoutApi } from '../api/hideout.js';
import { Button } from './Button.js';
import { ItemTile } from './ItemTile.js';
import { type ItemArtKey } from '../items/itemArt.js';

export function WorkshopPanel({ workshop, onChanged, heading = true }: { workshop: CraftingWorkshopDto; onChanged: (value: CraftingWorkshopDto) => void; heading?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function craft(recipeKey: string, quantity: number) {
    setBusy(recipeKey);
    setError(null);
    try {
      const result = await hideoutApi.craft(recipeKey, quantity);
      onChanged({
        ...workshop,
        skill: result.result.skill,
        skillXp: result.result.skillXp,
        availableComponents: result.result.availableComponents,
        waterFilters: result.result.waterFilters,
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That craft could not be completed. Check parts, turns, power, the water filter, and stash space.');
    } finally {
      setBusy(null);
    }
  }

  const assembly = workshop.recipes.filter((recipe) => recipe.kind !== 'DISASSEMBLE');
  const breakdown = workshop.recipes.filter((recipe) => recipe.kind === 'DISASSEMBLE');

  return <section className="se-hideout-section se-workshop-section">
    {heading ? <div className="se-hideout-sectionhead">
      <span className="se-eyebrow">Hideout workshop</span>
      <div>
        <h2>Crafting bench</h2>
        <p>Assembly spends parts on goods. Break down spends a part you cannot use and gives back cheaper pieces. Repeating one recipe trains more slowly.</p>
      </div>
    </div> : <p className="se-hideout-inline-note">Assembly spends parts on goods. Break down spends a part you cannot use and gives back cheaper pieces. Repeating one recipe trains more slowly.</p>}
    <div className="se-panel se-workshop">
      <div className="se-stash__summary se-workshop__summary"><strong>Workshop skill {formatNumber(workshop.skill)}</strong><span>{formatNumber(workshop.skillXp)} XP · level {formatNumber(workshop.level)}</span></div>
      {error ? <p className="se-error" role="alert">{error}</p> : null}
      {assembly.length ? <RecipeGroup title="Assembly" note="Turn scavenged parts into goods for the crew and the corner. Choose how many to make. One takes the listed time, and each extra one adds that time again. Brewing also wears one water filter." recipes={assembly} busy={busy} level={workshop.level} components={workshop.availableComponents} filters={workshop.waterFilters ?? []} onCraft={craft} /> : null}
      {breakdown.length ? <RecipeGroup title="Break down" note="Take apart a part you cannot use. The pieces are worth less than the part you spend. Breaking down more takes longer." recipes={breakdown} busy={busy} level={workshop.level} components={workshop.availableComponents} filters={workshop.waterFilters ?? []} onCraft={craft} /> : null}
    </div>
  </section>;
}

function RecipeGroup({ title, note, recipes, busy, level, components, filters, onCraft }: {
  title: string;
  note: string;
  recipes: CraftingRecipeDto[];
  busy: string | null;
  level: number;
  components: CraftingWorkshopDto['availableComponents'];
  filters: number[];
  onCraft: (recipeKey: string, quantity: number) => void;
}) {
  return <div className="se-workshop__group">
    <h3 className="se-eyebrow">{title}</h3>
    <p className="se-muted">{note}</p>
    <div className="se-grid se-grid--2">
      {recipes.map((recipe) => <RecipeCard key={recipe.key} recipe={recipe} busy={busy} level={level} components={components} filters={filters} onCraft={onCraft} />)}
    </div>
  </div>;
}

function filterReadiness(recipe: CraftingRecipeDto, filters: number[], batches: number) {
  if (!recipe.filter) return null;
  const percent = recipe.filter.percent * batches;
  const usable = filters.reduce((best, load) => Math.max(best, load), 0);
  return { name: recipe.filter.name, percent, usable, count: filters.length, ready: usable >= percent && percent <= 100 };
}

function RecipeCard({ recipe, busy, level, components, filters, onCraft }: {
  recipe: CraftingRecipeDto;
  busy: string | null;
  level: number;
  components: CraftingWorkshopDto['availableComponents'];
  filters: number[];
  onCraft: (recipeKey: string, quantity: number) => void;
}) {
  const [batch, setBatch] = useState(1);
  const breakdown = recipe.kind === 'DISASSEMBLE';
  const unlocked = recipe.unlocked && level >= recipe.unlockLevel;
  const affordable = maxCraftBatches(recipe, components, filters);
  const selected = affordable > 0 ? Math.min(Math.max(1, batch), affordable) : 1;
  const missing = recipe.ingredients.filter((ingredient) => (components.find((item) => item.key === ingredient.key)?.quantity ?? 0) < ingredient.quantity * selected);
  const filter = filterReadiness(recipe, filters, selected);
  const filterShort = filter !== null && !filter.ready;
  const canCraft = unlocked && missing.length === 0 && !filterShort && affordable >= selected;
  const yields = (recipe.partYields?.length ? recipe.partYields : [recipe.output]).map((item) => ({ ...item, quantity: item.quantity * selected }));
  const status = !unlocked ? 'Locked' : canCraft ? (breakdown ? 'Ready to break down' : 'Ready to craft') : filterShort && missing.length === 0 ? 'Filter too worn' : (breakdown ? 'Missing parts' : 'Missing ingredients');
  const action = breakdown ? 'Break down' : 'Craft';
  const label = !unlocked ? 'Locked' : busy === recipe.key ? (breakdown ? 'Breaking down…' : 'Crafting…') : canCraft ? (selected > 1 ? `${action} ${formatNumber(selected)}` : action) : filterShort && missing.length === 0 ? 'Need filter' : (breakdown ? 'Need parts' : 'Need ingredients');
  const totalTurns = recipe.turns * selected;

  function choose(next: number) {
    const whole = Number.isFinite(next) ? Math.floor(next) : 1;
    setBatch(Math.min(MAX_CRAFT_BATCH, Math.max(1, whole)));
  }

  return <article className="se-panel se-workshop__recipe" key={recipe.key}>
    <div className="se-workshop__recipe-head"><strong>{recipe.name}</strong><span className={canCraft ? 'is-ready' : undefined}>{status}</span></div>
    <p className="se-muted">{recipe.purpose}</p>
    <div className="se-workshop__inputs"><strong>Inputs</strong><div>{recipe.ingredients.map((item) => { const available = components.find((entry) => entry.key === item.key)?.quantity ?? 0; const needed = item.quantity * selected; return <span className={available >= needed ? 'is-met' : 'is-missing'} key={item.key}><b>{item.name}</b><small>{available} available · {needed} needed</small></span>; })}</div></div>
    {filter ? <div className="se-workshop__inputs"><strong>Water filter</strong><div><div className={`se-workshop__filter-row ${filter.ready ? 'is-met' : 'is-missing'}`}><span><b>{filter.name}</b><small>{filter.usable}% usable · {filter.percent}% of one filter · {filter.count} held</small></span><div className="se-workshop__filter-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, filter.usable)}%` }} /></div></div></div></div> : null}
    {breakdown
      ? <div className="se-workshop__inputs"><strong>Parts</strong><div>{yields.map((item) => <span className="se-workshop__yield" key={item.key}><b>{item.quantity} {item.name}</b><ItemTile item={item.key as ItemArtKey} quantity={item.quantity} size="sm" /></span>)}</div></div>
      : <p><strong>Output:</strong> {recipe.output.quantity * selected} {recipe.output.name} · {recipe.output.footprint.width}×{recipe.output.footprint.height} stash cell</p>}
    {breakdown ? null : <ItemTile item={recipe.output.key as ItemArtKey} quantity={recipe.output.quantity * selected} />}
    <div className="se-workshop__batch">
      <label htmlFor={`craft-qty-${recipe.key}`}>How many</label>
      <button type="button" className="se-btn se-btn--sm" aria-label={`Make fewer ${recipe.name}`} disabled={busy !== null || selected <= 1} onClick={() => choose(selected - 1)}>−</button>
      <input id={`craft-qty-${recipe.key}`} className="se-input" type="number" inputMode="numeric" min={1} max={Math.max(1, affordable)} value={selected} aria-label={`How many ${recipe.name} to make`} disabled={busy !== null || !unlocked} onChange={(event) => choose(Number(event.target.value))} />
      <button type="button" className="se-btn se-btn--sm" aria-label={`Make more ${recipe.name}`} disabled={busy !== null || !unlocked || selected >= Math.max(1, affordable)} onClick={() => choose(selected + 1)}>+</button>
    </div>
    <small>{filter ? `Takes ${formatNumber(totalTurns)} turns for ${formatNumber(selected)} · ${formatNumber(recipe.turns)} each · burns ${formatNumber(filter.percent)}% of one water filter · ` : `Takes ${formatNumber(totalTurns)} turns for ${formatNumber(selected)} · ${formatNumber(recipe.turns)} each · `}{recipe.requiresPower ? 'requires powered generator' : 'no power required'} · Workshop {recipe.unlockLevel}+</small>
    <div className="se-stash__actions se-workshop__actions">
      <Button className="se-btn se-btn--primary se-btn--sm" disabled={busy !== null || !canCraft} onClick={() => onCraft(recipe.key, selected)}>
        {label}
      </Button>
    </div>
  </article>;
}
