import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { ProduceCrackResult, ProductsDto, ProductTypeDto } from '@streets/shared';
import { formatCents, formatCentsExact, formatNumber } from '@streets/shared';
import { actionsApi } from '../api/actions.js';
import { api } from '../api/client.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { TurnSpend } from '../components/TurnSpend.js';
import { WorkSupplyPanel, WorkSupplyStockRows } from '../components/WorkSupplyPanel.js';
import { HeatNotice } from '../components/HeatPanel.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { produceReceiptLines } from '../receipts/actionReceipts.js';
import { useSession } from '../stores/session.js';

type Profile = { key: ProductTypeDto; name: string; role: string };

/** What a round without a product economy cooks: crack, as it always has. */
const CRACK_ONLY: Profile[] = [{ key: 'CRACK', name: 'Product', role: 'The one product this round. Cheap to cook and in every job.' }];

/** 0.4.0-D. The catalog's cookable products, from the round's recipes. */
function recipeProfiles(data: ProductsDto | null): Profile[] {
  if (!data?.economy) return CRACK_ONLY;
  return data.products.filter((product) => product.recipe).map((product) => ({
    key: product.key,
    name: product.name,
    role: `${product.recipe!.perThugPerTurn} a thug a turn · ${formatCentsExact(product.recipe!.ingredientCentsPerUnit)} each${product.recipe!.heatPerUnit > 0 ? ' · draws Heat' : ''}`,
  }));
}

function ProduceMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'warn' | 'bad' | 'accent';
}) {
  return (
    <div className={`se-produce-metric${tone ? ` se-produce-metric--${tone}` : ''}`}>
      <span className="se-produce-metric__label">{label}</span>
      <strong className="se-produce-metric__value">{value}</strong>
      {detail ? <span className="se-produce-metric__detail">{detail}</span> : null}
    </div>
  );
}

export function ProducePage() {
  const me = useSession((s) => s.me);
  const action = useGameAction<ProduceCrackResult>();

  const [turns, setTurns] = useState<number | ''>(10);
  const [productType, setProductType] = useState<ProductTypeDto>('CRACK');
  const [catalog, setCatalog] = useState<ProductsDto | null>(null);

  useEffect(() => {
    api.get<ProductsDto>('/game/products').then(setCatalog).catch(() => setCatalog(null));
  }, []);

  const PRODUCT_PROFILES = recipeProfiles(catalog);

  if (!me) return <Navigate to="/join" replace />;

  const available = me.turns.turns;
  const hasFitThugs = me.resources.fitThugs > 0;
  const selectedProfile = PRODUCT_PROFILES.find((profile) => profile.key === productType) ?? PRODUCT_PROFILES[0]!;
  const selectedProduct = catalog?.products.find((product) => product.key === selectedProfile.key) ?? null;
  const recipe = selectedProduct?.recipe ?? null;
  const currentStock = selectedProduct?.quantity ?? me.resources.product;
  const chosenTurns = typeof turns === 'number' ? turns : 0;
  const remainingTurns = Math.max(0, available - chosenTurns);
  const producedName = action.result?.result.productName ?? selectedProfile.name;
  const supplyJobs = [{ job: 'PRODUCE', label: "Girls' shift" }, { job: 'COOK', label: 'Cooks' }];

  const canProduce =
    !action.busy &&
    hasFitThugs &&
    typeof turns === 'number' &&
    turns >= 1 &&
    turns <= available;

  const produceBlock = action.busy
    ? 'The last batch is still producing.'
    : !hasFitThugs
      ? 'Production takes a fit thug. Scout for more, buy some at Tommy\u2019s, or let the wounded recover.'
      : typeof turns !== 'number' || turns < 1
        ? 'Say how many turns to spend - at least one.'
        : turns > available
          ? `You only have ${formatNumber(available)} turns.`
          : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canProduce || typeof turns !== 'number') return;

    await action.run((actionId) => actionsApi.produceCrack({ turns, productType, actionId }));
  }

  return (
    <GameLayout>
      <div className="se-produce">
        <header className="se-produce-hero">
          <div className="se-produce-hero__copy">
            <span className="se-eyebrow">Production floor · {me.city.name}</span>
            <h1>Produce product</h1>
            <p>
              Put fit thugs on the batch, set the shift length, and check the crew and supply plan before you spend the turns.
            </p>
          </div>

          <div className="se-produce-hero__readout">
            <span>
              <small>Turns ready</small>
              <strong>{formatNumber(me.turns.turns)}</strong>
            </span>
            <span>
              <small>Fit cooks</small>
              <strong>{formatNumber(me.resources.fitThugs)}</strong>
            </span>
            <span>
              <small>Cash</small>
              <strong>{formatCents(me.resources.cashCents)}</strong>
            </span>
            <span>
              <small>Thug happiness</small>
              <strong>{me.happiness.thug}%</strong>
            </span>
          </div>
        </header>

        {action.error ? <Alert>{action.error}</Alert> : null}
        {!hasFitThugs ? (
          <Alert tone="info">
            You need at least one fit thug to produce. Scout for more, pick some up at
            Tek9 Tommy&rsquo;s, or let the wounded recover.
          </Alert>
        ) : null}

        {action.result ? (
          <section className="se-produce-result" aria-label="Latest production result">
            <div className="se-produce-sectionhead">
              <div>
                <span className="se-eyebrow">Batch complete</span>
                <h2>Latest production receipt</h2>
              </div>
              <span className="se-produce-sectionhead__meta">{producedName}</span>
            </div>
            <ActionResult
              title={`${producedName} Production Results`}
              onDismiss={action.clear}
              result={action.result}
              lines={produceReceiptLines(action.result, me)}
            />
          </section>
        ) : null}

        <form className="se-produce-plan" onSubmit={onSubmit}>
          <section className="se-produce-plan__main">
            <div className="se-produce-sectionhead">
              <div>
                <span className="se-eyebrow">Step 1</span>
                <h2>Choose the batch</h2>
              </div>
              <span className="se-produce-sectionhead__meta">{selectedProfile.name}</span>
            </div>

            <div className={`se-choices se-product-choices se-produce-choices${PRODUCT_PROFILES.length === 3 ? ' se-product-choices--3' : ''}`}>
              {PRODUCT_PROFILES.map((profile) => (
                <label
                  className={`se-choice${productType === profile.key ? ' se-choice--on' : ''}`}
                  key={profile.key}
                >
                  <input
                    type="radio"
                    name="productType"
                    className="se-choice__input"
                    checked={productType === profile.key}
                    disabled={action.busy || !hasFitThugs}
                    onChange={() => setProductType(profile.key)}
                  />
                  <span className="se-choice__body">
                    <span className="se-choice__name">{profile.name}</span>
                    <span className="se-choice__meta">{profile.role}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="se-produce-turns">
              <div className="se-produce-sectionhead">
                <div>
                  <span className="se-eyebrow">Step 2</span>
                  <h2>Set the shift</h2>
                </div>
                <span className="se-produce-sectionhead__meta">
                  {chosenTurns > 0 ? `${formatNumber(chosenTurns)} turns` : 'Choose turns'}
                </span>
              </div>

              <TurnSpend
                value={turns}
                onChange={setTurns}
                available={available}
                disabled={action.busy || !hasFitThugs}
                disabledReason={
                  action.busy
                    ? 'The last batch is still producing.'
                    : !hasFitThugs
                      ? 'Production takes a fit thug, and none of yours can work.'
                      : null
                }
              />
            </div>

            <div className="se-produce-launch">
              <div className="se-produce-launch__summary">
                <span className="se-produce-launch__label">Ready to cook</span>
                <strong>{selectedProfile.name} · {formatNumber(chosenTurns)} turn{chosenTurns === 1 ? '' : 's'}</strong>
                <span>
                  {chosenTurns > 0
                    ? `${formatNumber(remainingTurns)} turns remain after this shift.`
                    : `${formatNumber(available)} turns available.`}
                </span>
              </div>
              <Button className="se-btn se-btn--primary se-produce-launch__button" disabledReason={produceBlock}>
                {action.busy ? 'Producing...' : `Start ${selectedProfile.name} batch`}
              </Button>
            </div>
          </section>

          <aside className="se-produce-plan__read">
            <div className="se-produce-sectionhead">
              <div>
                <span className="se-eyebrow">Batch read</span>
                <h2>{selectedProfile.name}</h2>
              </div>
              <span className="se-produce-stock">{formatNumber(currentStock)} on hand</span>
            </div>

            <p className="se-produce-read__copy">
              {selectedProduct?.blurb ?? 'The current round uses a single product economy.'}
            </p>

            <div className="se-produce-metricgrid">
              <ProduceMetric
                label="Cooks"
                value={formatNumber(me.resources.fitThugs)}
                detail="fit thugs available"
                tone={hasFitThugs ? 'good' : 'bad'}
              />
              <ProduceMetric
                label="Shift"
                value={chosenTurns > 0 ? formatNumber(chosenTurns) : '—'}
                detail="turns selected"
                tone="accent"
              />
              <ProduceMetric
                label="Base recipe"
                value={recipe ? `${recipe.perThugPerTurn}/turn` : 'Legacy'}
                detail={recipe ? 'per thug' : 'single-product round'}
              />
              <ProduceMetric
                label="Ingredient"
                value={recipe ? formatCentsExact(recipe.ingredientCentsPerUnit) : 'Server priced'}
                detail="per unit produced"
              />
              <ProduceMetric
                label="Heat"
                value={recipe ? `+${recipe.heatPerUnit}` : 'By ruleset'}
                detail="per unit if applicable"
                tone={recipe && recipe.heatPerUnit > 0 ? 'warn' : undefined}
              />
              <ProduceMetric
                label="Thug happiness"
                value={`${me.happiness.thug}%`}
                detail="affects the cooks"
                tone={me.happiness.thug < 66 ? 'warn' : 'good'}
              />
            </div>

            <div className="se-produce-read__note">
              <strong>The receipt is authoritative.</strong>
              <span>
                Recipe numbers show the base inputs. Crew happiness, supply, upgrades, and other active rules can change the actual batch, cost, Heat, and side income.
              </span>
            </div>
          </aside>
        </form>

        <HeatNotice />

        <section className="se-produce-section">
          <div className="se-produce-sectionhead">
            <div>
              <span className="se-eyebrow">Before production</span>
              <h2>Floor readiness</h2>
            </div>
            <p>The cooks make the product while the girls still work a reduced street shift.</p>
          </div>

          <div className="se-produce-readygrid">
            <div className="se-produce-stack">
              <Panel title="Production crew" flush className="se-produce-panel">
                <div className="se-produce-metricgrid">
                  <ProduceMetric
                    label="Fit thugs"
                    value={formatNumber(me.resources.fitThugs)}
                    detail="available to cook"
                    tone={hasFitThugs ? 'good' : 'bad'}
                  />
                  <ProduceMetric
                    label="Whores"
                    value={formatNumber(me.resources.whores)}
                    detail="reduced street shift"
                  />
                  <ProduceMetric
                    label="Wounded"
                    value={formatNumber(me.resources.woundedThugs)}
                    detail="cannot work"
                    tone={me.resources.woundedThugs > 0 ? 'warn' : 'good'}
                  />
                  <ProduceMetric
                    label="Holding turf"
                    value={formatNumber(me.resources.postedThugs)}
                    detail="not available here"
                    tone={me.resources.postedThugs > 0 ? 'warn' : undefined}
                  />
                </div>

                <div className="se-rows">
                  <Row
                    label="Thugs / available"
                    value={`${formatNumber(me.resources.thugs)} / ${formatNumber(me.resources.fitThugs)}`}
                    strong
                    tooltip="Total thugs / fit thugs at home. Wounded and posted thugs cannot produce."
                  />
                  <Row label="They keep" value={`${me.payoutPercent}%`} />
                  <Row label="You keep" value={`${100 - me.payoutPercent}%`} strong />
                  <Row label="Whore happiness" value={`${me.happiness.whore}%`} />
                  <Row label="Thug happiness" value={`${me.happiness.thug}%`} />
                </div>
              </Panel>

              <Panel
                title="Stock & cash"
                aside={<Link to="/game/stores/corner">Corner Store</Link>}
                flush
                className="se-produce-panel"
              >
                <div className="se-produce-metricgrid">
                  <ProduceMetric label={selectedProfile.name} value={formatNumber(currentStock)} detail="current stock" tone="accent" />
                  <ProduceMetric label="Cash" value={formatCents(me.resources.cashCents)} detail="ingredients draw here" />
                  <ProduceMetric label="Condoms" value={formatNumber(me.resources.condoms)} />
                  <ProduceMetric label="Beer" value={formatNumber(me.resources.beer)} />
                </div>
                <div className="se-rows">
                  <Row label="Medicine" value={formatNumber(me.resources.medicine)} />
                  {me.products ? null : <Row label="Product" value={formatNumber(me.resources.product)} />}
                  <WorkSupplyStockRows jobs={supplyJobs} refreshKey={action.result} />
                </div>
              </Panel>
            </div>

            <div className="se-produce-stack">
              <WorkSupplyPanel
                jobs={supplyJobs}
                turns={turns}
                refreshKey={action.result}
                title="Shift product plan"
              />

              <Panel title="How production works" className="se-produce-panel">
                <div className="se-produce-rules">
                  <div>
                    <strong>Fit thugs cook</strong>
                    <span>Wounded and posted thugs are unavailable, so only the fit crew at home contributes to production.</span>
                  </div>
                  <div>
                    <strong>The girls still work</strong>
                    <span>Production also sends the girls out for a reduced street take, using the same payout and supply systems.</span>
                  </div>
                  <div>
                    <strong>Ingredients come out first</strong>
                    <span>The production receipt separates ingredient spending from the girls&rsquo; earnings so the cash movement stays readable.</span>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </section>
      </div>
    </GameLayout>
  );
}
