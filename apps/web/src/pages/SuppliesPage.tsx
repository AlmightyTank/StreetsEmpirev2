import { Link } from 'react-router-dom';
import { formatNumber } from '@streets/shared';
import { GamePageHeader } from '../components/GameUI.js';
import { ItemTile } from '../components/ItemTile.js';
import { Panel } from '../components/Panel.js';
import { useSession } from '../stores/session.js';
import { GameLayout } from '../layouts/GameLayout.js';
import '../styles/supplies.css';
import { hasItemArt, type ItemArtKey } from '../items/itemArt.js';
import { WorkSupplySettingsPanel } from '../components/WorkSupplyPanel.js';

interface SupplyCard {
  key: string;
  art: ItemArtKey;
  name: string;
  quantity: number;
  purpose: string;
  uses: string;
  link: string;
  linkLabel: string;
}

function SupplyCardView({ item }: { item: SupplyCard }) {
  const low = item.quantity <= 0;
  return (
    <article className={`se-supply-card${low ? ' se-supply-card--empty' : ''}`}>
      <div className="se-supply-card__top">
        <ItemTile item={item.art} size="md" label={false} />
        <div>
          <span className="se-eyebrow">Crew supply</span>
          <h3>{item.name}</h3>
          <strong className="se-supply-card__quantity">{formatNumber(item.quantity)}</strong>
          {low ? <span className="se-supply-card__warning">Out of stock</span> : null}
        </div>
      </div>
      <p>{item.purpose}</p>
      <div className="se-supply-card__uses"><strong>Used for</strong><span>{item.uses}</span></div>
      <Link className="se-btn se-btn--sm se-btn--ghost" to={item.link}>{item.linkLabel} <span aria-hidden="true">→</span></Link>
    </article>
  );
}

export function SuppliesPage() {
  const me = useSession((state) => state.me);
  if (!me) return null;
  const resources = me.resources;
  const supplies: SupplyCard[] = [
    {
      key: 'product', art: 'CRACK', name: me.products ? 'Product' : 'Drugs / product', quantity: resources.product,
      purpose: 'Keeps production moving and gives you leverage during special operations.',
      uses: 'Production, drug runs, lure operations, businesses and turf upkeep.', link: '/game/produce', linkLabel: 'Produce product',
    },
    {
      key: 'condoms', art: 'CONDOM', name: 'Condoms', quantity: resources.condoms,
      purpose: 'The everyday protection your girls need to keep working safely.',
      uses: 'Production, scouting, whore work and some combat outcomes.', link: '/game/stores/corner', linkLabel: 'Buy condoms',
    },
    {
      key: 'premium-condoms', art: 'PREMIUM_CONDOM', name: 'Premium condoms', quantity: resources.premiumCondoms ?? 0,
      purpose: 'Crafted protection; each pack covers up to three normal condom uses.',
      uses: 'Scout, production and other work when Premium is selected first.', link: '/game/hideout#workshop', linkLabel: 'Craft premium condoms',
    },
    {
      key: 'beer', art: 'BEER', name: 'Beer', quantity: resources.beer,
      purpose: 'Keeps the thugs loyal and the operation supplied.',
      uses: 'Production, lure operations, businesses and turf upkeep.', link: '/game/stores/corner', linkLabel: 'Buy beer',
    },
    {
      key: 'house-brew', art: 'HOUSE_BREW', name: 'House Brew', quantity: resources.houseBrew ?? 0,
      purpose: 'Crafted beer; each bottle covers up to three normal beer uses.',
      uses: 'Scout, production and other work when House Brew is selected first.', link: '/game/hideout#workshop', linkLabel: 'Craft House Brew',
    },
    {
      key: 'medicine', art: 'MEDICINE', name: 'Medicine', quantity: resources.medicine,
      purpose: 'Treatment stock for wounded thugs after fights and dangerous work.',
      uses: 'Crew recovery and treatment.', link: '/game/stores/corner', linkLabel: 'Buy medicine',
    },
    {
      key: 'field-first-aid', art: 'FIELD_FIRST_AID', name: 'Field first-aid kits', quantity: resources.fieldFirstAidKits ?? 0,
      purpose: 'Advanced treatment supplies that cover two treatment units each.',
      uses: 'Treating wounded thugs after combat.', link: '/game/hideout#workshop', linkLabel: 'Craft first-aid kits',
    },
    {
      key: 'rag-dressings', art: 'RAG_DRESSING', name: 'Rag dressings', quantity: resources.ragDressings ?? 0,
      purpose: 'Basic treatment supplies; two dressings cover one treatment unit.',
      uses: 'Treating wounded thugs after combat.', link: '/game/hideout#workshop', linkLabel: 'Craft rag dressings',
    },
  ];
  const productRows = me.products?.filter((product) => product.quantity > 0 && product.key !== 'CRACK') ?? [];

  return (
    <GameLayout>
      <main className="se-page se-supplies-page">
        <GamePageHeader
          eyebrow="Empire stock"
          title="Supplies"
          description="Your crew uses these automatically whenever an action needs them. Keep this page open when planning your next move."
          actions={<Link className="se-btn se-btn--primary" to="/game/stores">Restock at the stores</Link>}
          art={<ItemTile item="BEER" size="lg" label={false} />}
        />

        <Panel title="Crew supplies" subtitle="Every action reports what it consumed and what remains." className="se-supplies-panel">
          <div className="se-supplies-grid">
            {supplies.map((item) => <SupplyCardView key={item.key} item={item} />)}
          </div>
        </Panel>

        <WorkSupplySettingsPanel />

        {productRows.length ? (
          <Panel title="Product shelves" subtitle="Your catalog products are available to production and trade." className="se-supplies-panel">
            <div className="se-supplies-product-list">
              {productRows.map((product) => (
                <div className="se-supplies-product" key={product.key}>
                  <ItemTile item={hasItemArt(product.key) ? product.key as ItemArtKey : 'CRACK'} size="sm" label={false} />
                  <strong>{product.name}</strong>
                  <span>{formatNumber(product.quantity)} units</span>
                  <Link className="se-golink" to="/game/stores/pip">Trade at Pip’s</Link>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <p className="se-supplies-note">Workshop goods such as premium condoms and House Brew are managed in the <Link to="/game/hideout#workshop">Hideout workshop</Link> and are consumed automatically when an action can use them.</p>
      </main>
    </GameLayout>
  );
}
