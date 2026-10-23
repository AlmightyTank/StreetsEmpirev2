import { useState } from 'react';
import { formatNumber, type CraftingWorkshopDto } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { Button } from './Button.js';
import { ItemTile } from './ItemTile.js';
import { type ItemArtKey } from '../items/itemArt.js';

export function WorkshopPanel({ workshop, onChanged }: { workshop: CraftingWorkshopDto; onChanged: (value: CraftingWorkshopDto) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function craft(recipeKey: string) {
    setBusy(recipeKey);
    setError(null);
    try {
      const result = await hideoutApi.craft(recipeKey);
      onChanged({ ...workshop, skill: result.result.skill, skillXp: result.result.skillXp, availableComponents: result.result.availableComponents });
    } catch {
      setError('That craft could not be completed. Check ingredients, turns, power, and stash space.');
    } finally {
      setBusy(null);
    }
  }

  return <section className="se-hideout-section se-workshop-section">
    <div className="se-hideout-sectionhead">
      <span className="se-eyebrow">Hideout workshop</span>
      <div>
        <h2>Crafting bench</h2>
        <p>Review every input, turn cost, power requirement, and output before committing. Repeating one recipe trains more slowly.</p>
      </div>
    </div>
    <div className="se-panel se-workshop">
      <div className="se-stash__summary se-workshop__summary"><strong>Workshop skill {formatNumber(workshop.skill)}</strong><span>{formatNumber(workshop.skillXp)} XP · level {formatNumber(workshop.level)}</span></div>
      {error ? <p className="se-error" role="alert">{error}</p> : null}
      <div className="se-grid se-grid--2">
        {workshop.recipes.map((recipe) => {
          const missing = recipe.ingredients.filter((ingredient) => (workshop.availableComponents.find((item) => item.key === ingredient.key)?.quantity ?? 0) < ingredient.quantity);
          const canCraft = recipe.unlocked && missing.length === 0;
          return <article className="se-panel se-workshop__recipe" key={recipe.key}>
          <div className="se-workshop__recipe-head"><strong>{recipe.name}</strong><span className={canCraft ? 'is-ready' : undefined}>{!recipe.unlocked ? 'Locked' : canCraft ? 'Ready to craft' : 'Missing ingredients'}</span></div>
          <p className="se-muted">{recipe.purpose}</p>
          <div className="se-workshop__inputs"><strong>Inputs</strong><div>{recipe.ingredients.map((item) => { const available = workshop.availableComponents.find((entry) => entry.key === item.key)?.quantity ?? 0; return <span className={available >= item.quantity ? 'is-met' : 'is-missing'} key={item.key}><b>{item.name}</b><small>{available} available · {item.quantity} needed</small></span>; })}</div></div>
           <p><strong>Output:</strong> {recipe.output.quantity} {recipe.output.name} · {recipe.output.footprint.width}×{recipe.output.footprint.height} stash cell</p><ItemTile item={recipe.output.key as ItemArtKey} quantity={recipe.output.quantity} />
          <small>{recipe.turns} turns · {recipe.requiresPower ? 'requires powered generator' : 'no power required'} · Workshop {recipe.unlockLevel}+</small>
           <div className="se-stash__actions se-workshop__actions">
             <Button className="se-btn se-btn--primary se-btn--sm" disabled={busy !== null || !canCraft} onClick={() => void craft(recipe.key)}>
               {!recipe.unlocked ? 'Locked' : busy === recipe.key ? 'Crafting…' : canCraft ? 'Craft' : 'Need ingredients'}
             </Button>
           </div>
         </article>;
        })}
      </div>
    </div>
  </section>;
}
