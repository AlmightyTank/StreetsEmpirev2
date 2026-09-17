import { useEffect, useState } from 'react';
import type { ProductsDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

/** 0.4.0-A. Every product the round knows, with stock. Uses and prices arrive in later 0.4.0 stages. */
export function ProductsPage() {
  const me = useSession((s) => s.me);
  const [data, setData] = useState<ProductsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ProductsDto>('/game/products').then(setData).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your products.');
    });
  }, [me?.resources.crack]);

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Products</h1>
          <p className="se-eyebrow">What you are holding</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {!data && !error ? <Panel title="Loading"><p className="se-muted">Counting the stash...</p></Panel> : null}

      {data && !data.enabled ? (
        <Panel title="One product this round">
          <p className="se-muted">This round runs on a single Product. Separate products arrive with the 0.4.0 rulesets.</p>
        </Panel>
      ) : null}

      {data?.enabled ? (
        <>
          <Alert tone="info">
            Crack works exactly as before. The other products are on the books but cannot be bought, cooked or used yet:
            supply choices, effects and prices arrive in the next 0.4.0 stages.
          </Alert>
          <div className="se-grid se-grid--2">
            {data.products.map((product) => (
              <Panel key={product.key} title={product.name} aside={`${formatNumber(product.quantity)} held`}>
                <p className="se-dim">{product.blurb}</p>
                {product.key !== 'CRACK' ? <p className="se-hint">Not in play yet.</p> : null}
              </Panel>
            ))}
          </div>
        </>
      ) : null}
    </GameLayout>
  );
}
