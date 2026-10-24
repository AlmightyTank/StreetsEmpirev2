import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCents, formatNumber, type SalvageOfferDto, type SalvageTradeResult, type SalvageYardDto, type StoreDto } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { storesApi } from '../api/stores.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { type ItemArtKey } from '../items/itemArt.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { ItemTile } from './ItemTile.js';
import { StoreTabs } from './StoreTabs.js';

function priceLabel(offer: SalvageOfferDto, quantity = 1): string {
  if (offer.price.kind === 'CASH') return formatCents(offer.price.cents * quantity);
  return [
    ...offer.price.components.map((part) => `${formatNumber(part.quantity * quantity)} ${part.name.toLowerCase()}`),
    ...offer.price.goods.map((good) => `${formatNumber(good.quantity * quantity)} ${good.name.toLowerCase()}`),
  ].join(' + ');
}

function OfferCard({ offer, busy, onTrade }: { offer: SalvageOfferDto; busy: boolean; onTrade: (offer: SalvageOfferDto, quantity: number) => void }) {
  const barter = offer.price.kind === 'BARTER';
  const short = barter ? 'You do not have enough to trade.' : 'You do not have enough cash.';
  return (
    <article className="se-panel se-scavenge-component se-salvage-offer">
      <ItemTile item={offer.key as ItemArtKey} quantity={offer.owned} label={false} />
      <div className="se-scavenge-component__copy">
        <strong>{offer.name}</strong>
        <small>{offer.rarity.toLowerCase()} · {offer.purpose} · You have {formatNumber(offer.owned)}</small>
        <span className="se-salvage-offer__price">
          <span className="se-eyebrow">{barter ? 'Barter' : 'Cash'}</span> {priceLabel(offer)}
        </span>
        <div className="se-scavenge-cache__action">
          <Button className="se-btn se-btn--primary se-btn--sm" disabledReason={busy ? 'Your last trade is still going through.' : offer.maxQuantity < 1 ? short : null} onClick={() => onTrade(offer, 1)}>
            {barter ? 'Trade for 1' : 'Buy 1'}
          </Button>
          <Button className="se-btn se-btn--sm" disabledReason={busy ? 'Your last trade is still going through.' : offer.maxQuantity < 5 ? short : null} onClick={() => onTrade(offer, 5)}>
            {barter ? 'Trade for 5' : 'Buy 5'}
          </Button>
        </div>
      </div>
    </article>
  );
}

/** The Salvage Yard shop tab: hideout parts for cash, scarce ones for barter. */
export function SalvageYard() {
  const me = useSession((s) => s.me);
  const [yard, setYard] = useState<SalvageYardDto | null>(null);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<SalvageTradeResult | null>(null);

  useEffect(() => {
    let active = true;
    storesApi.salvage()
      .then((data) => { if (active) setYard(data); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load the Salvage Yard.'); });
    storesApi.catalog().then((data) => { if (active) setStores(data.stores); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function trade(offer: SalvageOfferDto, quantity: number) {
    setBusy(true);
    setError(null);
    try {
      const result = await storesApi.salvageTrade({ key: offer.key, quantity });
      setYard(result.yard);
      setReceipt(result);
      // Cash or goods moved: refresh the session so the top bar and hideout gates follow.
      void useSession.getState().refreshSnapshot({ background: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The yard could not fill that order. Refresh and try again.');
    } finally {
      setBusy(false);
    }
  }

  const cashOffers = yard?.offers.filter((offer) => offer.price.kind === 'CASH') ?? [];
  const barterOffers = yard?.offers.filter((offer) => offer.price.kind === 'BARTER') ?? [];

  return (
    <GameLayout>
      <div className="se-stores">
        <header className="se-stores-hero se-stores-hero--salvage">
          <div className="se-stores-hero__copy">
            <span className="se-eyebrow">Building materials{me ? ` · ${me.city.name}` : ''}</span>
            <h1>Salvage Yard</h1>
            <p>Parts for hideout upgrades and the crafting bench. Everyday parts are cash. The scarce ones the yard only trades for: bring parts and store goods.</p>
          </div>
          {yard ? (
            <div className="se-stores-hero__side">
              <div className="se-stores-hero__readout">
                {(['beer', 'medicine', 'condoms', 'ammo'] as const).map((good) => (
                  <span key={good}>
                    <small>{good}</small>
                    <strong>{formatNumber(yard.goods[good])}</strong>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </header>

        <StoreTabs stores={stores} slug="salvage" />

        {error ? <Alert>{error}</Alert> : null}
        {receipt ? (
          <p className="se-salvage-receipt" role="status">
            Got {formatNumber(receipt.received.quantity)} × {receipt.received.name}
            {receipt.spentCents > 0 ? ` for ${formatCents(receipt.spentCents)}` : ''}
            {receipt.gave.length ? ` for ${receipt.gave.map((item) => `${formatNumber(item.quantity)} ${item.name.toLowerCase()}`).join(', ')}` : ''}.{' '}
            <Link to="/game/hideout#hideout-upgrades">Back to the Hideout</Link>
          </p>
        ) : null}
        {!yard && !error ? <div className="se-stores-loading" role="status">Loading the yard...</div> : null}

        {yard ? (
          <>
            <section className="se-hideout-section">
              <div className="se-stores-sectionhead">
                <div><span className="se-eyebrow">Cash</span><h2>Everyday parts</h2></div>
                <p>Common and uncommon parts, straight off the pile.</p>
              </div>
              <div className="se-grid se-grid--3">
                {cashOffers.map((offer) => <OfferCard key={offer.key} offer={offer} busy={busy} onTrade={(o, q) => void trade(o, q)} />)}
              </div>
            </section>
            <section className="se-hideout-section">
              <div className="se-stores-sectionhead">
                <div><span className="se-eyebrow">Barter</span><h2>Scarce parts</h2></div>
                <p>The yard will not sell these for money. Trade parts and goods for them; everything it asks for can be bought.</p>
              </div>
              <div className="se-grid se-grid--3">
                {barterOffers.map((offer) => <OfferCard key={offer.key} offer={offer} busy={busy} onTrade={(o, q) => void trade(o, q)} />)}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
