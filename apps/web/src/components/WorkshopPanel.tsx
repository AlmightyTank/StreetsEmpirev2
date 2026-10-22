import { useState } from 'react';
import { formatNumber, type CraftingWorkshopDto } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { Button } from './Button.js';

export function WorkshopPanel({ workshop, onChanged }: { workshop: CraftingWorkshopDto; onChanged: (value: CraftingWorkshopDto) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function craft(recipeKey: string) {
    setBusy(recipeKey);
    setError(null);
    try {
      const result = await hideoutApi.craft(recipeKey);
      onChanged({ ...workshop, skill: result.result.skill, skillXp: result.result.skillXp });
    } catch {
      setError('That craft could not be completed. Check ingredients, turns, power, and stash space.');
    } finally {
      setBusy(null);
    }
  }

  return <section className="se-hideout-section">
    <div className="se-hideout-sectionhead">
      <span className="se-eyebrow">Hideout workshop</span>
      <div>
        <h2>Crafting bench</h2>
        <p>Review every input, turn cost, power requirement, and output before committing. Repeating one recipe trains more slowly.</p>
      </div>
    </div>
    <div className="se-panel">
      <div className="se-stash__summary"><strong>Workshop skill {formatNumber(workshop.skill)}</strong><span>{formatNumber(workshop.skillXp)} XP · level {formatNumber(workshop.level)}</span></div>
      {error ? <p className="se-error" role="alert">{error}</p> : null}
      <div className="se-grid se-grid--2">
        {workshop.recipes.map((recipe) => <article className="se-panel" key={recipe.key}>
          <strong>{recipe.name}</strong>
          <p className="se-muted">{recipe.purpose}</p>
          <p><strong>Inputs:</strong> {recipe.ingredients.map((item) => `${item.quantity} ${item.name}`).join(' · ')}</p>
           <p><strong>Output:</strong> {recipe.output.quantity} {recipe.output.name} · {recipe.output.footprint.width}×{recipe.output.footprint.height} stash cell</p>
          <small>{recipe.turns} turns · {recipe.requiresPower ? 'requires powered generator' : 'no power required'} · Workshop {recipe.unlockLevel}+</small>
          <div className="se-stash__actions">
            <Button className="se-btn se-btn--primary se-btn--sm" disabled={busy !== null || !recipe.unlocked} onClick={() => void craft(recipe.key)}>
              {!recipe.unlocked ? 'Locked' : busy === recipe.key ? 'Crafting…' : 'Craft'}
            </Button>
          </div>
        </article>)}
      </div>
    </div>
  </section>;
}
