import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatNumber, type ProductStockDto, type ProductsDto } from '@streets/shared';
import { productAccessRows, type AccessState } from '../utils/recipes.js';
import { QuestLink } from './QuestLink.js';

/** Quest Recipe Unlocks D. "Buy: Open", "Cook: Locked": one permission to a badge. */
export function AccessBadge({ label, access }: { label: string; access: AccessState }) {
  const word = access.state === 'open' ? 'Open' : access.state === 'locked' ? 'Locked' : '—';
  return (
    <span className={`se-access-badge se-access-badge--${access.state}`} aria-label={`${label}: ${access.state === 'none' ? 'not available' : word.toLowerCase()}`}>
      {label} <strong>{word}</strong>
    </span>
  );
}

function AccessCell({ access, open, none }: { access: AccessState; open: ReactNode; none: string }) {
  if (access.state === 'open') return <span className="se-good">{open}</span>;
  if (access.state === 'none') return <span className="se-muted">{none}</span>;
  return (
    <span>
      <span className="se-warn">Locked</span>
      {access.step ? <span className="se-muted"> · step {formatNumber(access.step)}</span> : null}
      {access.quest ? <> · <QuestLink quest={access.quest} /></> : null}
    </span>
  );
}

/**
 * Quest Recipe Unlocks D. Every product with what you hold, whether Pip will sell it to you,
 * and whether you can cook it: two permissions, earned separately, side by side.
 */
export function ProductAccessTable({ catalog }: { catalog: ProductsDto | null }) {
  const rows = productAccessRows(catalog);
  if (!rows.length) return null;
  return (
    <section className="se-product-access" aria-label="Your product access">
      <div className="se-stores-sectionhead">
        <div>
          <span className="se-eyebrow">Your access</span>
          <h2>Stock, buying and cooking</h2>
        </div>
        <p>Buying from Pip and cooking a recipe are separate permissions. Each opens through its own job.</p>
      </div>
      <div className="se-tablewrap">
        <table className="se-table se-table--cards">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col" className="se-table__number">On hand</th>
              <th scope="col">Can buy</th>
              <th scope="col">Can produce</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" data-label="Product">{row.name}</th>
                <td data-label="On hand" className="se-table__number se-num">{formatNumber(row.quantity)}</td>
                <td data-label="Can buy"><AccessCell access={row.buy} open="Yes" none="Pip does not sell it" /></td>
                <td data-label="Can produce"><span><AccessCell access={row.cook} open="Yes" none="No recipe" />{row.cook.state === 'open' ? <> · <Link className="se-golink" to="/game/produce">Produce</Link></> : null}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Quest Recipe Unlocks D. On a product's shelf: whether you can cook it, apart from buying it. */
export function ProductRecipeNote({ product }: { product: ProductStockDto }) {
  if (!product.recipe) return <p className="se-hint">No recipe cooks {product.name}: buy it, order it, or take it.</p>;
  if (product.recipeAccess?.unlocked === false) {
    return (
      <p className="se-hint">
        {product.recipeAccess.unlockQuest
          ? <>Finish <QuestLink quest={product.recipeAccess.unlockQuest} /> to cook {product.name} yourself.</>
          : <>Earn the {product.recipeAccess.unlockName} through <Link className="se-golink" to="/game/quests">underworld contacts</Link> to cook it yourself.</>}
      </p>
    );
  }
  return <p className="se-hint">You can also cook {product.name} on <Link className="se-golink" to="/game/produce">Produce</Link>.</p>;
}
