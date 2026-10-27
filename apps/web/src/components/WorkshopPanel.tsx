import { useState } from 'react';
import { formatNumber, type CraftingRecipeDto, type CraftingWorkshopDto } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { Button } from './Button.js';
import { ItemTile } from './ItemTile.js';
import { type ItemArtKey } from '../items/itemArt.js';

export function WorkshopPanel({ workshop, onChanged, heading = true }: { workshop: CraftingWorkshopDto; onChanged: (value: CraftingWorkshopDto) => void; heading?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function craft(recipeKey: string) {
    setBusy(recipeKey);
    setError(null);
    try {
      const result = await hideoutApi.craft(recipeKey);
      onChanged({ ...workshop, skill: result.result.skill, skillXp: result.result.skillXp, availableComponents: result.result.availableComponents });
    } catch {
      setError('That craft could not be completed. Check parts, turns, power, and stash space.');
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
      {assembly.length ? <RecipeGroup title="Assembly" note="Turn scavenged parts into goods for the crew and the corner." recipes={assembly} busy={busy} level={workshop.level} components={workshop.availableComponents} onCraft={craft} /> : null}
      {breakdown.length ? <RecipeGroup title="Break down" note="Take apart a part you cannot use. The pieces are worth less than the part you spend." recipes={breakdown} busy={busy} level={workshop.level} components={workshop.availableComponents} onCraft={craft} /> : null}
    </div>
  </section>;
}

function RecipeGroup({ title, note, recipes, busy, level, components, onCraft }: {
  title: string;
  note: string;
  recipes: CraftingRecipeDto[];
  busy: string | null;
  level: number;
  components: CraftingWorkshopDto['availableComponents'];
  onCraft: (recipeKey: string) => void;
}) {
  return <div className="se-workshop__group">
    <h3 className="se-eyebrow">{title}</h3>
    <p className="se-muted">{note}</p>
    <div className="se-grid se-grid--2">
      {recipes.map((recipe) => <RecipeCard key={recipe.key} recipe={recipe} busy={busy} level={level} components={components} onCraft={onCraft} />)}
    </div>
  </div>;
}

function RecipeCard({ recipe, busy, level, components, onCraft }: {
  recipe: CraftingRecipeDto;
  busy: string | null;
  level: number;
  components: CraftingWorkshopDto['availableComponents'];
  onCraft: (recipeKey: string) => void;
}) {
  const breakdown = recipe.kind === 'DISASSEMBLE';
  const unlocked = recipe.unlocked && level >= recipe.unlockLevel;
  const missing = recipe.ingredients.filter((ingredient) => (components.find((item) => item.key === ingredient.key)?.quantity ?? 0) < ingredient.quantity);
  const canCraft = unlocked && missing.length === 0;
  const yields = recipe.partYields?.length ? recipe.partYields : [recipe.output];
  const status = !unlocked ? 'Locked' : canCraft ? (breakdown ? 'Ready to break down' : 'Ready to craft') : (breakdown ? 'Missing parts' : 'Missing ingredients');
  const label = !unlocked ? 'Locked' : busy === recipe.key ? (breakdown ? 'Breaking down…' : 'Crafting…') : canCraft ? (breakdown ? 'Break down' : 'Craft') : (breakdown ? 'Need parts' : 'Need ingredients');

  return <article className="se-panel se-workshop__recipe" key={recipe.key}>
    <div className="se-workshop__recipe-head"><strong>{recipe.name}</strong><span className={canCraft ? 'is-ready' : undefined}>{status}</span></div>
    <p className="se-muted">{recipe.purpose}</p>
    <div className="se-workshop__inputs"><strong>Inputs</strong><div>{recipe.ingredients.map((item) => { const available = components.find((entry) => entry.key === item.key)?.quantity ?? 0; return <span className={available >= item.quantity ? 'is-met' : 'is-missing'} key={item.key}><b>{item.name}</b><small>{available} available · {item.quantity} needed</small></span>; })}</div></div>
    {breakdown
      ? <div className="se-workshop__inputs"><strong>Parts</strong><div>{yields.map((item) => <span className="se-workshop__yield" key={item.key}><b>{item.quantity} {item.name}</b><ItemTile item={item.key as ItemArtKey} quantity={item.quantity} size="sm" /></span>)}</div></div>
      : <p><strong>Output:</strong> {recipe.output.quantity} {recipe.output.name} · {recipe.output.footprint.width}×{recipe.output.footprint.height} stash cell</p>}
    {breakdown ? null : <ItemTile item={recipe.output.key as ItemArtKey} quantity={recipe.output.quantity} />}
    <small>{recipe.turns} turns · {recipe.requiresPower ? 'requires powered generator' : 'no power required'} · Workshop {recipe.unlockLevel}+</small>
    <div className="se-stash__actions se-workshop__actions">
      <Button className="se-btn se-btn--primary se-btn--sm" disabled={busy !== null || !canCraft} onClick={() => onCraft(recipe.key)}>
        {label}
      </Button>
    </div>
  </article>;
}
